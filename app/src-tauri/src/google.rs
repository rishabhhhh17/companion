//! Google (M21, the founder: "both": sign in with Google, and connect Gmail, Calendar and Drive). The shell runs Google's
//! sign in the way T15 says: PKCE with a loopback redirect. The person's own browser opens Google's page (never inside
//! Squibby, rule 2), Google sends the code back to a one time listener on 127.0.0.1, and the shell trades it for tokens.
//! The refresh token is kept in the Keychain, one item per account; the engine only ever gets a short lived access token,
//! pushed by the shell and refreshed before it runs out. Disconnecting asks Google to revoke the token and deletes the item.
//!
//! The parts that decide things are plain code here, tested without a network: the PKCE pair, the sign in address, the
//! scopes for each app, reading the loopback answer (the state must match), reading the token answer and the ID token's
//! name and email, and what is kept. The network goes through the Mac's own curl with the secrets on its standard input,
//! never on its command line (a command line can be read by any program on the Mac), and curl reads no settings file and
//! none of the app's environment (`post_form_with`).

use base64::Engine;
use serde_json::{json, Value};
use sha2::{Digest, Sha256};

/// Google's addresses.
pub const AUTH_URL: &str = "https://accounts.google.com/o/oauth2/v2/auth";
pub const TOKEN_URL: &str = "https://oauth2.googleapis.com/token";
pub const REVOKE_URL: &str = "https://oauth2.googleapis.com/revoke";
/// The Keychain service the Google items live under (one item per account, the account being `google:<sub>`).
pub const SERVICE: &str = "companion-google";
/// How long the sign in may take in the browser before the listener gives up (seconds).
pub const WAIT_SECS: u64 = 300;

/// What a Google account is connected for. Signing in alone asks only for who you are.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum App { Gmail, Calendar, Drive }
impl App {
    pub fn word(self) -> &'static str { match self { App::Gmail => "gmail", App::Calendar => "calendar", App::Drive => "drive" } }
    pub fn from_word(w: &str) -> Option<App> { match w { "gmail" => Some(App::Gmail), "calendar" => Some(App::Calendar), "drive" => Some(App::Drive), _ => None } }
    /// Google's permissions for each app, the fewest that do the job: Gmail reads and makes drafts (no send scope), Calendar
    /// reads and writes events, Drive reads only the files the person opens or picks with Squibby (the per file scope).
    pub fn scopes(self) -> &'static [&'static str] {
        match self {
            App::Gmail => &["https://www.googleapis.com/auth/gmail.readonly", "https://www.googleapis.com/auth/gmail.compose"],
            App::Calendar => &["https://www.googleapis.com/auth/calendar.events"],
            App::Drive => &["https://www.googleapis.com/auth/drive.file"],
        }
    }
}
/// Who you are: always asked, for every sign in and every connection.
pub const IDENTITY: [&str; 3] = ["openid", "email", "profile"];

/// The scopes to ask for: who you are, then each app's, each once.
pub fn scopes_for(apps: &[App]) -> Vec<&'static str> {
    let mut out: Vec<&'static str> = IDENTITY.to_vec();
    for a in apps { for s in a.scopes() { if !out.contains(s) { out.push(s); } } }
    out
}

/// base64url without padding, as PKCE and JWTs use it.
pub fn b64url(bytes: &[u8]) -> String { base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(bytes) }

/// A PKCE pair from 32 random bytes: the verifier (43 characters) and its S256 challenge.
pub fn pkce(random: [u8; 32]) -> (String, String) {
    let verifier = b64url(&random);
    let challenge = b64url(&Sha256::digest(verifier.as_bytes()));
    (verifier, challenge)
}

/// 32 random bytes from the system (arc4random, the Mac's own source).
pub fn random32() -> [u8; 32] {
    let mut b = [0u8; 32];
    unsafe { libc::arc4random_buf(b.as_mut_ptr() as *mut libc::c_void, b.len()) };
    b
}

fn enc(s: &str) -> String {
    s.bytes().map(|c| match c { b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => (c as char).to_string(), _ => format!("%{c:02X}") }).collect()
}

/// The address of Google's sign in page in the person's browser. `offline` and `consent` so Google gives a refresh token;
/// the scopes granted before are kept (`include_granted_scopes`).
pub fn auth_url(client_id: &str, port: u16, scopes: &[&str], challenge: &str, state: &str, hint: Option<&str>) -> String {
    let mut q = vec![
        ("client_id", client_id.to_string()), ("redirect_uri", redirect(port)), ("response_type", "code".into()),
        ("scope", scopes.join(" ")), ("code_challenge", challenge.into()), ("code_challenge_method", "S256".into()),
        ("state", state.into()), ("access_type", "offline".into()), ("prompt", "consent".into()), ("include_granted_scopes", "true".into()),
    ];
    if let Some(h) = hint { q.push(("login_hint", h.to_string())); }
    format!("{AUTH_URL}?{}", q.iter().map(|(k, v)| format!("{k}={}", enc(v))).collect::<Vec<_>>().join("&"))
}
pub fn redirect(port: u16) -> String { format!("http://127.0.0.1:{port}") }

/// What came back to the loopback listener.
#[derive(Debug, PartialEq, Eq)]
pub enum Back { Code(String), Refused(String), NotOurs }

fn dec(s: &str) -> String {
    let b = s.as_bytes();
    let mut out = Vec::with_capacity(b.len());
    let mut i = 0;
    while i < b.len() {
        match b[i] {
            b'+' => { out.push(b' '); i += 1; }
            b'%' if i + 2 < b.len() => {
                match u8::from_str_radix(std::str::from_utf8(&b[i + 1..i + 3]).unwrap_or("zz"), 16) { Ok(v) => { out.push(v); i += 3; } Err(_) => { out.push(b'%'); i += 1; } }
            }
            c => { out.push(c); i += 1; }
        }
    }
    String::from_utf8_lossy(&out).into_owned()
}

/// Reads the first line of what the browser sent to the loopback ("GET /?state=..&code=.. HTTP/1.1"). Only an answer
/// carrying our own state counts; anything else (a stray request, a favicon, someone else's state) is not ours.
pub fn read_back(request: &str, state: &str) -> Back {
    let line = request.lines().next().unwrap_or("");
    let mut parts = line.split(' ');
    if parts.next() != Some("GET") { return Back::NotOurs; }
    let target = parts.next().unwrap_or("");
    let Some(query) = target.strip_prefix("/?") else { return Back::NotOurs };
    let mut got_state = None; let mut code = None; let mut error = None;
    for kv in query.split('&') {
        let (k, v) = kv.split_once('=').unwrap_or((kv, ""));
        match k { "state" => got_state = Some(dec(v)), "code" => code = Some(dec(v)), "error" => error = Some(dec(v)), _ => {} }
    }
    if got_state.as_deref() != Some(state) { return Back::NotOurs; }
    if let Some(e) = error { return Back::Refused(e); }
    match code { Some(c) if !c.is_empty() => Back::Code(c), _ => Back::NotOurs }
}

/// The small page the browser shows after the answer: plain words, nothing from Google repeated back.
pub fn done_page(ok: bool, product: &str) -> String {
    let (title, line) = if ok { ("You're connected", format!("You can close this tab and go back to {product}.")) } else { ("Not connected", format!("Nothing was connected. You can close this tab and try again from {product}.")) };
    let body = format!("<!doctype html><meta charset=utf-8><title>{title}</title><body style=\"margin:0;display:grid;place-items:center;height:100vh;background:#000;color:#fff;font:600 18px -apple-system,sans-serif\"><div style=\"text-align:center\"><div style=\"font-size:28px;font-weight:800;margin-bottom:8px\">{title}</div><div style=\"color:#a1a1a6\">{line}</div></div></body>");
    format!("HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}", body.len())
}

/// The form a token request sends (on curl's standard input, never its command line).
pub fn exchange_form(client_id: &str, client_secret: &str, code: &str, verifier: &str, port: u16) -> String {
    let mut f = vec![("client_id", client_id), ("code", code), ("code_verifier", verifier), ("grant_type", "authorization_code")];
    let r = redirect(port);
    f.push(("redirect_uri", r.as_str()));
    if !client_secret.is_empty() { f.push(("client_secret", client_secret)); }
    f.iter().map(|(k, v)| format!("{k}={}", enc(v))).collect::<Vec<_>>().join("&")
}
pub fn refresh_form(client_id: &str, client_secret: &str, refresh: &str) -> String {
    let mut f = vec![("client_id", client_id), ("refresh_token", refresh), ("grant_type", "refresh_token")];
    if !client_secret.is_empty() { f.push(("client_secret", client_secret)); }
    f.iter().map(|(k, v)| format!("{k}={}", enc(v))).collect::<Vec<_>>().join("&")
}

/// The form that asks Google to revoke a token (on curl's standard input).
pub fn revoke_form(token: &str) -> String { format!("token={}", enc(token)) }

/// Every Google connection gone, for Delete everything (wipe.rs): `index` is the list of kept accounts, `read` gives an
/// account's Keychain item, `revoke` asks Google to revoke a refresh token (best effort: no answer from Google, no
/// network, still goes on), and `delete` removes an item (true when it is gone). Each account's item goes first and the
/// list last, so an account whose item could not be removed is still listed for the next try. True when all went.
pub fn forget_all(index: &[String], read: &dyn Fn(&str) -> Option<String>, revoke: &dyn Fn(&str), delete: &dyn Fn(&str) -> bool) -> bool {
    let mut all = true;
    for sub in index {
        let account = keychain_account(sub);
        if let Some(k) = read(&account).as_deref().and_then(kept_from) { if !k.refresh.is_empty() { revoke(&k.refresh); } }
        all &= delete(&account);
    }
    all && delete("index")
}

/// Google's token answer, read: an access token and how long it lasts, a refresh token (only on the first sign in), the ID
/// token's person, and the scopes Google really granted (the person may untick some).
#[derive(Debug, PartialEq)]
pub struct Tokens { pub access: String, pub expires_in: u64, pub refresh: Option<String>, pub person: Option<Person>, pub granted: Vec<String> }
#[derive(Clone, Debug, PartialEq)]
pub struct Person { pub sub: String, pub email: String, pub name: String, pub picture: String }

pub fn read_tokens(body: &str) -> Result<Tokens, String> {
    let v: Value = serde_json::from_str(body).map_err(|_| "Google gave an answer Squibby could not read.".to_string())?;
    if let Some(e) = v.get("error").and_then(Value::as_str) {
        return Err(match e { "invalid_grant" => "Google said the sign in has expired. Try again.".into(), "access_denied" => "Google said no to the sign in.".into(), _ => format!("Google said no ({e}).") });
    }
    let access = v.get("access_token").and_then(Value::as_str).filter(|s| !s.is_empty()).ok_or("Google gave no access token.")?.to_string();
    let person = v.get("id_token").and_then(Value::as_str).and_then(person_of);
    Ok(Tokens {
        access, expires_in: v.get("expires_in").and_then(Value::as_u64).unwrap_or(3600),
        refresh: v.get("refresh_token").and_then(Value::as_str).map(str::to_string),
        person, granted: v.get("scope").and_then(Value::as_str).map(|s| s.split(' ').map(str::to_string).collect()).unwrap_or_default(),
    })
}

/// The person in an ID token Google's token endpoint just gave the shell over TLS (OpenID Connect lets the client take it
/// without checking the signature in that case). Only who it is; an email Google has not verified is not taken.
pub fn person_of(id_token: &str) -> Option<Person> {
    let payload = id_token.split('.').nth(1)?;
    let bytes = base64::engine::general_purpose::URL_SAFE_NO_PAD.decode(payload.trim_end_matches('=')).ok()?;
    let v: Value = serde_json::from_slice(&bytes).ok()?;
    if v.get("email_verified").and_then(Value::as_bool) != Some(true) { return None; }
    let s = |k: &str| v.get(k).and_then(Value::as_str).unwrap_or("").to_string();
    let sub = s("sub");
    if sub.is_empty() { return None; }
    Some(Person { sub, email: s("email"), name: s("name"), picture: s("picture") })
}

/// Which apps the granted scopes allow.
pub fn apps_granted(granted: &[String]) -> Vec<App> {
    [App::Gmail, App::Calendar, App::Drive].into_iter().filter(|a| a.scopes().iter().all(|s| granted.iter().any(|g| g == s))).collect()
}

/// One account as the Keychain keeps it (the refresh token is the secret; the rest is shown). `signin`: the account the
/// person signed into Squibby with; a connection may be the same account or another one.
#[derive(Clone, Debug, PartialEq)]
pub struct Kept { pub person: Person, pub refresh: String, pub label: String, pub apps: Vec<App>, pub signin: bool }

pub fn keychain_account(sub: &str) -> String { format!("google:{sub}") }

pub fn kept_json(k: &Kept) -> String {
    json!({ "sub": k.person.sub, "email": k.person.email, "name": k.person.name, "picture": k.person.picture, "refresh": k.refresh, "label": k.label,
        "apps": k.apps.iter().map(|a| a.word()).collect::<Vec<_>>(), "signin": k.signin }).to_string()
}
pub fn kept_from(s: &str) -> Option<Kept> {
    let v: Value = serde_json::from_str(s).ok()?;
    let t = |k: &str| v.get(k).and_then(Value::as_str).unwrap_or("").to_string();
    let refresh = t("refresh");
    if refresh.is_empty() || t("sub").is_empty() { return None; }
    Some(Kept {
        person: Person { sub: t("sub"), email: t("email"), name: t("name"), picture: t("picture") }, refresh, label: t("label"),
        apps: v.get("apps").and_then(Value::as_array).map(|a| a.iter().filter_map(|x| x.as_str().and_then(App::from_word)).collect()).unwrap_or_default(),
        signin: v.get("signin").and_then(Value::as_bool).unwrap_or(false),
    })
}
/// What a page may see of an account: never the refresh token.
pub fn shown(k: &Kept) -> Value {
    json!({ "id": keychain_account(&k.person.sub), "email": k.person.email, "name": k.person.name, "picture": k.person.picture, "label": k.label,
        "apps": k.apps.iter().map(|a| a.word()).collect::<Vec<_>>(), "signin": k.signin })
}

/// A label for a new connection: the one given (cut to 24 characters), else "Personal" for a gmail.com address and "Work"
/// for any other, as HeyClicky does.
pub fn label_for(given: &str, email: &str) -> String {
    let g: String = given.trim().chars().take(24).collect();
    if !g.is_empty() { return g; }
    if email.ends_with("@gmail.com") || email.ends_with("@googlemail.com") { "Personal".into() } else { "Work".into() }
}

/// The client id and secret from `app/google.json` (the founder makes them in Google's console; for a desktop app using
/// PKCE the id is not a secret and Google treats the "secret" as public too). Empty means Google is not set up yet.
pub fn client(config: &str) -> Option<(String, String)> {
    let v: Value = serde_json::from_str(config).ok()?;
    let id = v.get("clientId").and_then(Value::as_str).unwrap_or("").trim().to_string();
    if id.is_empty() || !id.ends_with(".apps.googleusercontent.com") { return None; }
    Some((id, v.get("clientSecret").and_then(Value::as_str).unwrap_or("").trim().to_string()))
}

/// Posts a form to Google through the Mac's curl, the form on its standard input. Gives back the body Google answered.
pub fn post_form(url: &str, form: &str) -> Result<String, String> { post_form_with("/usr/bin/curl", url, form) }

/// curl's arguments for one form post: fixed flags and the address only, never a secret.
pub fn curl_args(url: &str) -> Vec<String> {
    ["-q", "-sS", "--proto", "=https", "--max-time", "20", "-X", "POST", "-H", "Content-Type: application/x-www-form-urlencoded", "--data-binary", "@-", url].iter().map(|s| s.to_string()).collect()
}

/// `post_form` with the program named (tests give a stand in that prints what it was given).
pub fn post_form_with(program: &str, url: &str, form: &str) -> Result<String, String> {
    use std::io::Write;
    // -q (first) stops curl reading any settings file, and a cleared environment keeps the app's HOME, CURL_HOME,
    // XDG_CONFIG_HOME and proxy variables away from it: what the person or another program set there never sees these forms.
    let mut child = std::process::Command::new(program)
        .args(curl_args(url)).env_clear().env("PATH", "/usr/bin:/bin")
        .stdin(std::process::Stdio::piped()).stdout(std::process::Stdio::piped()).stderr(std::process::Stdio::null())
        .spawn().map_err(|_| "Could not reach Google.".to_string())?;
    child.stdin.take().ok_or("Could not reach Google.")?.write_all(form.as_bytes()).map_err(|_| "Could not reach Google.".to_string())?;
    let out = child.wait_with_output().map_err(|_| "Could not reach Google.".to_string())?;
    if !out.status.success() && out.stdout.is_empty() { return Err("Could not reach Google. Check the internet connection.".into()); }
    Ok(String::from_utf8_lossy(&out.stdout).into_owned())
}

/// Waits for the browser's one answer on `listener` (already bound to 127.0.0.1 on a free port), up to `WAIT_SECS`.
/// Answers anything that is not ours with a 404 and keeps waiting; the first answer with our state ends it.
pub fn wait_for_code(listener: std::net::TcpListener, state: &str, product: &str) -> Result<String, String> {
    use std::io::{Read, Write};
    listener.set_nonblocking(true).map_err(|_| "Could not start the sign in.".to_string())?;
    let until = std::time::Instant::now() + std::time::Duration::from_secs(WAIT_SECS);
    while std::time::Instant::now() < until {
        match listener.accept() {
            Ok((mut s, _)) => {
                let _ = s.set_nonblocking(false);
                let _ = s.set_read_timeout(Some(std::time::Duration::from_secs(5)));
                let mut buf = [0u8; 8192];
                let n = s.read(&mut buf).unwrap_or(0);
                let req = String::from_utf8_lossy(&buf[..n]).into_owned();
                match read_back(&req, state) {
                    Back::Code(c) => { let _ = s.write_all(done_page(true, product).as_bytes()); return Ok(c); }
                    Back::Refused(_) => { let _ = s.write_all(done_page(false, product).as_bytes()); return Err("Google sign in was cancelled.".into()); }
                    Back::NotOurs => { let _ = s.write_all(b"HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\nConnection: close\r\n\r\n"); }
                }
            }
            Err(e) if e.kind() == std::io::ErrorKind::WouldBlock => std::thread::sleep(std::time::Duration::from_millis(100)),
            Err(_) => return Err("The sign in stopped. Try again.".into()),
        }
    }
    Err("The sign in took too long. Try again.".into())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn delete_everything_revokes_every_google_connection_and_removes_its_keychain_items() {
        use std::cell::RefCell;
        let item = |sub: &str, refresh: &str| kept_json(&Kept { person: Person { sub: sub.into(), email: format!("{sub}@example.com"), name: "n".into(), picture: "".into() }, refresh: refresh.into(), label: "Work".into(), apps: vec![App::Drive], signin: false });
        let store = RefCell::new(std::collections::BTreeMap::from([
            ("index".to_string(), r#"["a","b"]"#.to_string()), ("google:a".to_string(), item("a", "1//refresh-a")), ("google:b".to_string(), item("b", "1//refresh-b")),
        ]));
        let (revoked, order) = (RefCell::new(Vec::<String>::new()), RefCell::new(Vec::<String>::new()));
        let ok = forget_all(&["a".into(), "b".into()], &|a| store.borrow().get(a).cloned(), &|t| revoked.borrow_mut().push(t.into()),
            &|a| { order.borrow_mut().push(a.into()); store.borrow_mut().remove(a); true });
        assert!(ok);
        assert_eq!(*revoked.borrow(), vec!["1//refresh-a", "1//refresh-b"], "each refresh token is revoked at Google");
        assert_eq!(*order.borrow(), vec!["google:a", "google:b", "index"], "the list goes last");
        assert!(store.borrow().is_empty(), "nothing of Google is left in the Keychain");
        assert_eq!(revoke_form("1//a+b"), "token=1%2F%2Fa%2Bb");
        // An item that cannot be removed: reported, and the list stays so the next try still finds it.
        let order = RefCell::new(Vec::<String>::new());
        let ok = forget_all(&["a".into()], &|_| Some(item("a", "r")), &|_| {}, &|a| { order.borrow_mut().push(a.into()); a != "google:a" });
        assert!(!ok);
        assert_eq!(*order.borrow(), vec!["google:a"], "the list is kept");
        // A damaged item (no token to revoke) is still removed; and with nothing kept, only the list is cleared.
        let order = RefCell::new(Vec::<String>::new());
        assert!(forget_all(&["c".into()], &|_| Some("not json".into()), &|_| panic!("nothing to revoke"), &|a| { order.borrow_mut().push(a.into()); true }));
        assert_eq!(*order.borrow(), vec!["google:c", "index"]);
        let order = RefCell::new(Vec::<String>::new());
        assert!(forget_all(&[], &|_| None, &|_| {}, &|a| { order.borrow_mut().push(a.into()); true }));
        assert_eq!(*order.borrow(), vec!["index"]);
    }

    #[test]
    fn google_requests_never_read_a_curl_settings_file_or_the_apps_environment() {
        // The forms carry the refresh token and the sign in code. A ~/.curlrc (or CURL_HOME, XDG_CONFIG_HOME, a proxy
        // variable) could send them to a trace file or another server, so curl is told to read no settings file (-q,
        // which works only as the first argument) and is started with nothing of the app's environment but a plain PATH.
        let args = curl_args(TOKEN_URL);
        assert_eq!(args[0], "-q", "{args:?}");
        assert!(args.windows(2).any(|w| w[0] == "--proto" && w[1] == "=https"), "https only: {args:?}");
        assert_eq!(args.last().map(String::as_str), Some(TOKEN_URL));
        assert!(!args.iter().any(|a| a.contains("refresh_token") || a.contains("code_verifier")), "no secret on the command line");
        // A stand in for curl that prints what it was given: its arguments, then its whole environment.
        let dir = std::env::temp_dir().join(format!("google-curl-{}", std::process::id())); let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let fake = dir.join("curl");
        std::fs::write(&fake, "#!/bin/sh\ncat >/dev/null\nfor a in \"$@\"; do echo \"arg:$a\"; done\n/usr/bin/env\n").unwrap();
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(&fake, std::fs::Permissions::from_mode(0o700)).unwrap();
        assert!(std::env::var_os("HOME").is_some(), "the test itself has a home folder to leak");
        let out = post_form_with(fake.to_str().unwrap(), TOKEN_URL, "refresh_token=DUMMY&client_id=x").unwrap();
        assert!(out.lines().next() == Some("arg:-q"), "{out}");
        let env: Vec<&str> = out.lines().filter(|l| !l.starts_with("arg:")).collect();
        // Failure messages name the variables only, never their values (the test's own environment can hold secrets).
        let names: Vec<&str> = env.iter().map(|l| l.split('=').next().unwrap_or("")).collect();
        assert!(env.contains(&"PATH=/usr/bin:/bin"), "{names:?}");
        for k in ["HOME", "CURL_HOME", "XDG_CONFIG_HOME", "HTTPS_PROXY", "https_proxy", "ALL_PROXY", "SSL_CERT_FILE"] {
            assert!(!names.contains(&k), "{k} reached curl: {names:?}");
        }
        // Only what the shell running the stand in adds itself may be there besides PATH.
        assert!(names.iter().all(|n| ["PATH", "PWD", "SHLVL", "_"].contains(n)), "{names:?}");
        let _ = std::fs::remove_dir_all(&dir);
    }

    fn token_with(payload: Value) -> String { format!("x.{}.y", b64url(payload.to_string().as_bytes())) }

    #[test]
    fn the_pkce_pair_is_s256_of_a_43_character_verifier() {
        let (v, c) = pkce([7u8; 32]);
        assert_eq!(v.len(), 43);
        assert!(v.chars().all(|ch| ch.is_ascii_alphanumeric() || ch == '-' || ch == '_'));
        assert_eq!(c, b64url(&Sha256::digest(v.as_bytes())));
        assert_ne!(pkce(random32()).0, pkce(random32()).0, "each sign in has its own");
    }

    #[test]
    fn the_scopes_are_who_you_are_plus_each_apps_fewest() {
        assert_eq!(scopes_for(&[]), vec!["openid", "email", "profile"]);
        let all = scopes_for(&[App::Gmail, App::Calendar, App::Drive, App::Gmail]);
        assert_eq!(all.len(), 3 + 2 + 1 + 1, "no repeats");
        assert!(!all.iter().any(|s| s.ends_with("gmail.send") || s.ends_with("/auth/drive") || s.ends_with("mail.google.com/")), "never send, never all of Drive");
    }

    #[test]
    fn the_sign_in_address_asks_google_for_a_refresh_token_with_our_challenge_and_state() {
        let u = auth_url("id.apps.googleusercontent.com", 50123, &scopes_for(&[App::Calendar]), "CH", "ST", Some("a@b.com"));
        assert!(u.starts_with("https://accounts.google.com/o/oauth2/v2/auth?client_id=id.apps.googleusercontent.com"));
        for part in ["redirect_uri=http%3A%2F%2F127.0.0.1%3A50123", "response_type=code", "code_challenge=CH", "code_challenge_method=S256", "state=ST", "access_type=offline", "prompt=consent", "login_hint=a%40b.com", "scope=openid%20email%20profile%20https%3A%2F%2Fwww.googleapis.com%2Fauth%2Fcalendar.events"] {
            assert!(u.contains(part), "{part} in {u}");
        }
    }

    #[test]
    fn only_an_answer_with_our_state_counts() {
        assert_eq!(read_back("GET /?state=ST&code=4%2F0Ab HTTP/1.1\r\nHost: x", "ST"), Back::Code("4/0Ab".into()));
        assert_eq!(read_back("GET /?code=4%2F0Ab&state=OTHER HTTP/1.1", "ST"), Back::NotOurs);
        assert_eq!(read_back("GET /favicon.ico HTTP/1.1", "ST"), Back::NotOurs);
        assert_eq!(read_back("POST /?state=ST&code=c HTTP/1.1", "ST"), Back::NotOurs);
        assert_eq!(read_back("GET /?state=ST&error=access_denied HTTP/1.1", "ST"), Back::Refused("access_denied".into()));
        assert_eq!(read_back("GET /?state=ST&code= HTTP/1.1", "ST"), Back::NotOurs);
        assert_eq!(read_back("", "ST"), Back::NotOurs);
    }

    #[test]
    fn the_token_forms_carry_the_verifier_and_never_go_on_a_command_line() {
        let f = exchange_form("id", "", "c/1", "VER", 5000);
        assert!(f.contains("code=c%2F1") && f.contains("code_verifier=VER") && f.contains("grant_type=authorization_code") && f.contains("redirect_uri=http%3A%2F%2F127.0.0.1%3A5000"));
        assert!(!f.contains("client_secret"), "no secret when there is none");
        assert!(refresh_form("id", "s", "R").contains("grant_type=refresh_token"));
        let src = include_str!("google.rs");
        let post = &src[src.find("pub fn post_form(").unwrap()..];
        let post = &post[..post.find("\n}\n").unwrap()];
        assert!(post.contains("\"--data-binary\", \"@-\""), "the form goes on standard input");
        assert!(!post.contains("format!(\"--data"), "never on the command line");
    }

    #[test]
    fn a_token_answer_is_read_with_the_person_and_the_scopes_granted() {
        let id = token_with(json!({ "sub": "123", "email": "a@gmail.com", "email_verified": true, "name": "Ann", "picture": "https://p" }));
        let body = json!({ "access_token": "ya29", "expires_in": 3599, "refresh_token": "1//r", "id_token": id, "scope": "openid https://www.googleapis.com/auth/calendar.events" }).to_string();
        let t = read_tokens(&body).unwrap();
        assert_eq!((t.access.as_str(), t.expires_in, t.refresh.as_deref()), ("ya29", 3599, Some("1//r")));
        assert_eq!(t.person.unwrap(), Person { sub: "123".into(), email: "a@gmail.com".into(), name: "Ann".into(), picture: "https://p".into() });
        assert_eq!(apps_granted(&t.granted), vec![App::Calendar]);
        assert!(read_tokens(r#"{"error":"invalid_grant"}"#).unwrap_err().contains("expired"));
        assert!(read_tokens("not json").is_err());
        assert!(person_of(&token_with(json!({ "sub": "1", "email": "x@y", "email_verified": false }))).is_none(), "an unverified email is not taken");
    }

    #[test]
    fn an_app_counts_only_when_all_its_scopes_were_granted() {
        let g = vec!["https://www.googleapis.com/auth/gmail.readonly".to_string()];
        assert!(apps_granted(&g).is_empty(), "gmail needs read and compose");
    }

    #[test]
    fn what_is_kept_round_trips_and_a_page_never_sees_the_refresh_token() {
        let k = Kept { person: Person { sub: "9".into(), email: "w@co.com".into(), name: "W".into(), picture: "".into() }, refresh: "SECRET".into(), label: "Work".into(), apps: vec![App::Gmail, App::Drive], signin: true };
        assert_eq!(kept_from(&kept_json(&k)).unwrap(), k);
        let s = shown(&k).to_string();
        assert!(!s.contains("SECRET"));
        assert!(s.contains("\"id\":\"google:9\""));
        assert!(kept_from(r#"{"sub":"1","refresh":""}"#).is_none());
    }

    #[test]
    fn labels_are_the_persons_or_work_and_personal() {
        assert_eq!(label_for("  Side project  ", "a@gmail.com"), "Side project");
        assert_eq!(label_for("", "a@gmail.com"), "Personal");
        assert_eq!(label_for("", "a@acme.com"), "Work");
        assert_eq!(label_for(&"x".repeat(40), "a@b.c").len(), 24);
    }

    #[test]
    fn google_is_set_up_only_with_a_real_client_id() {
        assert_eq!(client(r#"{"clientId":"","clientSecret":""}"#), None);
        assert_eq!(client(r#"{"clientId":"something"}"#), None);
        assert_eq!(client(r#"{"clientId":"1-a.apps.googleusercontent.com","clientSecret":"GOCSPX-x"}"#), Some(("1-a.apps.googleusercontent.com".into(), "GOCSPX-x".into())));
        assert_eq!(client(include_str!("../../google.json")), None, "the repo carries no client id: the founder adds it");
    }

    #[test]
    fn the_page_after_the_answer_says_only_whether_it_worked() {
        let p = done_page(true, "Squibby");
        assert!(p.starts_with("HTTP/1.1 200 OK"));
        assert!(p.contains("You're connected") && p.contains("go back to Squibby"));
        assert!(done_page(false, "Squibby").contains("Nothing was connected"));
    }

    #[test]
    fn the_loopback_takes_the_first_answer_with_our_state_and_ignores_others() {
        use std::io::{Read, Write};
        let l = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let port = l.local_addr().unwrap().port();
        let h = std::thread::spawn(move || wait_for_code(l, "ST", "Squibby"));
        let send = |line: &str| { let mut s = std::net::TcpStream::connect(("127.0.0.1", port)).unwrap(); s.write_all(format!("{line}\r\nHost: x\r\n\r\n").as_bytes()).unwrap(); let mut r = String::new(); let _ = s.read_to_string(&mut r); r };
        assert!(send("GET /favicon.ico HTTP/1.1").starts_with("HTTP/1.1 404"));
        assert!(send("GET /?state=ST&code=abc HTTP/1.1").contains("You're connected"));
        assert_eq!(h.join().unwrap(), Ok("abc".into()));
    }
}
