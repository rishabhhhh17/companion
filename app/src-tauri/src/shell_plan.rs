// ---------- Pro: the license key and the trial (license.rs, trial.rs, T17, payments spec) ----------
//
// Payments off (billing.*.json): every command below answers "paymentsOff" before it reads the Keychain or reaches the
// network, the status says "off", no timer runs, and the engine is told paymentsOn false (nothing gated). The pages never
// see the key: only its last 4 characters. Errors are short reason words (license::REASONS) the page puts in words.

fn secs() -> u64 { SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0) }
/// One change to the Pro items at a time: the timer's check and a press must not both write.
static PRO_LOCK: Mutex<()> = Mutex::new(());
fn pro_lock() -> std::sync::MutexGuard<'static, ()> { PRO_LOCK.lock().unwrap_or_else(|e| e.into_inner()) }
static PRO_TIMER: AtomicBool = AtomicBool::new(false);
fn pro_held<T>(m: &'static Mutex<T>) -> std::sync::MutexGuard<'static, T> { m.lock().unwrap_or_else(|e| e.into_inner()) }

/// The steady clock's anchor (license::steady_now): what Pro is judged by never runs backwards while the app runs.
static PRO_ANCHOR: Mutex<Option<(u64, u64)>> = Mutex::new(None);
/// The last status and plan decided from a Keychain that could be read (license::plan_from).
static PRO_LAST: Mutex<Option<(Value, license::Decision)>> = Mutex::new(None);
/// Seconds on a clock that goes on through sleep and never goes back (CLOCK_MONOTONIC on macOS counts sleep).
fn mono_secs() -> u64 {
    let mut ts = libc::timespec { tv_sec: 0, tv_nsec: 0 };
    if unsafe { libc::clock_gettime(libc::CLOCK_MONOTONIC, &mut ts) } == 0 { ts.tv_sec.max(0) as u64 } else { 0 }
}
/// The Pro items read once, judged by the steady clock. Err: the Keychain could not be read.
fn pro_read() -> Result<license::Read, ()> { license::read(&license::Keychain::new(), secs(), mono_secs(), &mut pro_held(&PRO_ANCHOR)) }
/// The steady time for a press (activate, check, trial).
fn pro_secs() -> u64 { license::steady_now(&mut pro_held(&PRO_ANCHOR), secs(), 0, mono_secs()) }

/// The status for the Plan card and the plan for new tasks (None: keep the plan the engine has, the Keychain could not be
/// read). Payments off: nothing is read.
fn plan_now() -> (Value, Option<license::Decision>) {
    let b = license::billing();
    if !b.payments_on() { return (license::off_status(), Some(license::decide(false, None, None, 0))); }
    let r = pro_read();
    license::plan_from(b, r.as_ref().map_err(|_| ()), &mut pro_held(&PRO_LAST))
}

/// Tells the engine the plan (plan.state; `force` when it has just said hello) and, with payments on, the pages the status
/// ("plan-status"). Off the calling thread: the Keychain may be slow. The plan is worked out and sent under PRO_LOCK, so
/// pushes go out in the order they were decided and an older plan can never be the last one heard.
fn plan_push(app: &AppHandle, force: bool) {
    let a = app.clone();
    std::thread::spawn(move || {
        let _one = pro_lock();
        let (status, d) = plan_now();
        let on = license::billing().payments_on();
        if let (Some(d), Some(r)) = (d, a.try_state::<runner::Runner>()) { let _ = r.push_plan(runner::plan_state_line(&d, on, &format!("plan-{}", now())), force); }
        if on { let _ = a.emit("plan-status", status); }
    });
}

/// The key check: 10 seconds after launch, then every 12 hours (moved by up to half an hour), an inactive key once a day
/// for 30 days. It runs only while payments are on and there is a key (or a trial whose end the engine is told about);
/// it reaches Dodo only for a key. It looks at the wall clock every 15 minutes (and just after a running trial ends), so a
/// Mac that slept still checks on time. A Keychain that cannot be read waits and looks again; it never stops the timer.
fn start_plan_timer(app: &AppHandle) {
    use std::sync::atomic::Ordering::SeqCst;
    if !license::billing().payments_on() || PRO_TIMER.swap(true, SeqCst) { return; }
    let a = app.clone();
    std::thread::spawn(move || {
        std::thread::sleep(Duration::from_secs(license::FIRST_CHECK_SECS));
        let mut next_at = 0u64;
        loop {
            let (step, nap) = { let _one = pro_lock(); let r = pro_read(); (license::tick_after(license::billing().payments_on(), &r, next_at), license::sleep_for(&r)) };
            match step {
                license::Tick::Stop => {
                    // The last word: the trial's end (or a key no longer checked) reaches the pages and the engine.
                    plan_push(&a, false);
                    PRO_TIMER.store(false, SeqCst);
                    // A key or a trial saved between the look and here found the timer still running, so it did not start
                    // another: look once more, and carry on if there is now something to check.
                    let again = { let _one = pro_lock(); license::tick_after(license::billing().payments_on(), &pro_read(), next_at) } != license::Tick::Stop;
                    if !again || PRO_TIMER.swap(true, SeqCst) { return; }
                }
                license::Tick::Check => {
                    let now = pro_secs();
                    let r = { let _one = pro_lock(); license::check(license::billing(), &license::Curl, &license::Keychain::new(), now) };
                    log("pro_checked", json!({ "check": r.as_ref().map(|s| license::key_check(s, now).word()).unwrap_or("none") }));
                    next_at = license::next_check_at(now, u32::from_le_bytes(license::random4()));
                }
                license::Tick::Wait => {}
            }
            plan_push(&a, false);
            std::thread::sleep(Duration::from_secs(nap));
        }
    });
}

/// The Plan card's status (payments spec 9a). Any window may ask (a Pro tag shows only with payments on).
#[tauri::command]
async fn license_status() -> Value {
    tauri::async_runtime::spawn_blocking(|| { let _one = pro_lock(); plan_now().0 }).await.unwrap_or_else(|_| license::off_status())
}

/// Turn on Pro with the key the person pasted (only from Home). The key goes to Dodo on curl's standard input and into the
/// Keychain, nowhere else. The answer is the new status, with `activatedFor` (the email, shown once).
#[tauri::command]
async fn license_activate(app: AppHandle, window: tauri::WebviewWindow, key: String) -> Result<Value, String> {
    if settings::only_card(window.label()).is_err() { return Err("notCard".into()); }
    let r = tauri::async_runtime::spawn_blocking(move || {
        let _one = pro_lock();
        let s = license::activate(license::billing(), &license::Curl, &license::Keychain::new(), &key, &license::instance_name(license::random4()), pro_secs())?;
        let mut st = plan_now().0;
        st["activatedFor"] = json!(s.email);
        Ok::<Value, &'static str>(st)
    }).await.unwrap_or(Err("unreachable"));
    log("pro_activate", json!({ "ok": r.is_ok(), "why": r.as_ref().err() }));
    if r.is_ok() { plan_push(&app, false); start_plan_timer(&app); }
    r.map_err(String::from)
}

/// Check again: asks Dodo about the saved key now (only from Home).
#[tauri::command]
async fn license_check_now(app: AppHandle, window: tauri::WebviewWindow) -> Result<Value, String> {
    if settings::only_card(window.label()).is_err() { return Err("notCard".into()); }
    let r = tauri::async_runtime::spawn_blocking(|| { let _one = pro_lock(); license::check(license::billing(), &license::Curl, &license::Keychain::new(), pro_secs()).map(|_| plan_now().0) }).await.unwrap_or(Err("unreachable"));
    log("pro_check_now", json!({ "ok": r.is_ok(), "why": r.as_ref().err() }));
    // Also after a refusal (payments on only): a Keychain readable again, or a key gone, changes what the card should say.
    if license::billing().payments_on() { plan_push(&app, false); }
    r.map_err(String::from)
}

/// Use Pro on another Mac: lets this Mac's activation go at Dodo, deletes the key here, and this Mac is Free again.
#[tauri::command]
async fn license_deactivate(app: AppHandle, window: tauri::WebviewWindow) -> Result<Value, String> {
    if settings::only_card(window.label()).is_err() { return Err("notCard".into()); }
    let r = tauri::async_runtime::spawn_blocking(|| { let _one = pro_lock(); license::deactivate(license::billing(), &license::Curl, &license::Keychain::new()).map(|_| plan_now().0) }).await.unwrap_or(Err("unreachable"));
    log("pro_deactivate", json!({ "ok": r.is_ok(), "why": r.as_ref().err() }));
    if r.is_ok() { plan_push(&app, false); }
    r.map_err(String::from)
}

/// Opens Dodo's checkout for "yearly" or "monthly" in the person's own browser (never a webview, rule 2). "notReady" while
/// the product or the checkout host is not filled in: the page says checkout is not ready yet.
#[tauri::command]
fn plan_open_checkout(window: tauri::WebviewWindow, term: String) -> Result<(), String> {
    if settings::only_card(window.label()).is_err() { return Err("notCard".into()); }
    let url = license::checkout_url(license::billing(), license::Term::from_word(&term).ok_or("notReady")?)?;
    open_in_browser(&url)
}

/// Opens Dodo's customer portal (Manage billing) in the person's own browser.
#[tauri::command]
fn plan_open_portal(window: tauri::WebviewWindow) -> Result<(), String> {
    if settings::only_card(window.label()).is_err() { return Err("notCard".into()); }
    // Its own word while the portal is not filled in: "checkout is not ready" would be wrong for a paying person.
    open_in_browser(&license::portal_url(license::billing()).map_err(|w| if w == "notReady" { "portalNotReady" } else { w })?)
}

/// M79: whether the plan includes the report (Pro or its trial), and whether a report key covers the open project. A
/// Keychain that cannot be read, or no plan decided yet, never blocks: both read as yes then.
fn report_inputs() -> (bool, bool) {
    if !license::billing().payments_on() { return (true, true); }
    let plan = { let _one = pro_lock(); plan_now().1 };
    let includes = plan.is_none_or(|d| d.plan != license::Plan::Free && reportkey::PRO_INCLUDES_REPORT);
    let covered = reportkey::covered(&license::Keychain::new(), &current_project()).unwrap_or(true);
    (includes, covered)
}
/// M79: what the Share report panel shows about buying the report. With payments off, only that they are off.
#[tauri::command]
async fn report_status(window: tauri::WebviewWindow) -> Result<Value, String> {
    if settings::only_card(window.label()).is_err() { return Err("notCard".into()); }
    Ok(tauri::async_runtime::spawn_blocking(|| { let (i, c) = report_inputs(); reportkey::status_json(license::billing(), i, c) }).await.unwrap_or_else(|_| json!({ "paymentsOn": false, "needed": false, "checkout": false })))
}
/// M79: turn on a pasted report key for the open project (only from Home). The key goes to Dodo on curl's standard input
/// and into the Keychain, nowhere else; the project never leaves the Mac.
#[tauri::command]
async fn report_activate(window: tauri::WebviewWindow, key: String) -> Result<Value, String> {
    if settings::only_card(window.label()).is_err() { return Err("notCard".into()); }
    let r = tauri::async_runtime::spawn_blocking(move || {
        reportkey::activate(license::billing(), &license::Curl, &license::Keychain::new(), &key, &current_project(), &license::instance_name(license::random4()), pro_secs())?;
        let (i, c) = report_inputs();
        Ok::<Value, &'static str>(reportkey::status_json(license::billing(), i, c))
    }).await.unwrap_or(Err("unreachable"));
    log("report_activate", json!({ "ok": r.is_ok(), "why": r.as_ref().err() }));
    r.map_err(String::from)
}

fn open_in_browser(url: &str) -> Result<(), String> {
    if license::https_host(url).is_none() { return Err("notReady".into()); }
    let ok = std::process::Command::new("/usr/bin/open").arg(url).stdin(std::process::Stdio::null()).stdout(std::process::Stdio::null()).stderr(std::process::Stdio::null()).status().is_ok_and(|s| s.success());
    log("pro_page_opened", json!({ "ok": ok }));
    if ok { Ok(()) } else { Err("browser".into()) }
}

/// Try Pro free for 14 days (only from Home; the page offers it only after the first proven fix, or on a limit or Pro tag
/// card). Once per Mac.
#[tauri::command]
async fn trial_start(app: AppHandle, window: tauri::WebviewWindow) -> Result<Value, String> {
    if settings::only_card(window.label()).is_err() { return Err("notCard".into()); }
    let r = tauri::async_runtime::spawn_blocking(|| {
        let _one = pro_lock();
        let (on, now) = (license::billing().payments_on(), pro_secs());
        let key = if on { license::load(&license::Keychain::new()).map_err(|_| "keychain")? } else { None };
        let pro = license::decide(on, key.as_ref(), None, now).plan == license::Plan::Pro;
        trial::start(&license::Keychain::new(), on, pro, now)?;
        Ok::<Value, &'static str>(plan_now().0)
    }).await.unwrap_or(Err("keychain"));
    log("pro_trial_start", json!({ "ok": r.is_ok(), "why": r.as_ref().err() }));
    if r.is_ok() { plan_push(&app, false); start_plan_timer(&app); }
    r.map_err(String::from)
}

