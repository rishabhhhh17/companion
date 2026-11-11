//! Secrets on the screen are blacked out on this Mac before anything is sent. Text found on the screenshot (by the
//! Mac's own text reader) is checked for card numbers, bank numbers, keys and tokens, and their boxes are covered.
//! Strict wins: covering something harmless costs little, sending a key costs a lot.
use crate::coords::R;
use crate::snap::OcrBox;

fn luhn(digits: &[u32]) -> bool {
    let mut sum = 0; let mut alt = false;
    for d in digits.iter().rev() { let mut v = *d; if alt { v *= 2; if v > 9 { v -= 9; } } sum += v; alt = !alt; }
    sum % 10 == 0
}

fn card_number(text: &str) -> bool {
    // Runs of digits that may be split by single spaces or dashes: 13 to 19 digits that pass the check sum.
    let mut run: Vec<u32> = Vec::new();
    let flush = |run: &mut Vec<u32>| -> bool { let ok = (13..=19).contains(&run.len()) && luhn(run); run.clear(); ok };
    let chars: Vec<char> = text.chars().collect();
    let mut i = 0;
    while i < chars.len() {
        let c = chars[i];
        if let Some(d) = c.to_digit(10) { run.push(d); }
        else if (c == ' ' || c == '-') && !run.is_empty() && chars.get(i + 1).is_some_and(|n| n.is_ascii_digit()) { /* inside a number */ }
        else if flush(&mut run) { return true; }
        i += 1;
    }
    flush(&mut run)
}

fn iban(text: &str) -> bool {
    // Spaces are dropped first, because bank numbers are written in groups.
    let c: Vec<char> = text.chars().filter(|c| c.is_ascii_alphanumeric()).map(|c| c.to_ascii_uppercase()).collect();
    for i in 0..c.len().saturating_sub(14) {
        if !(c[i].is_ascii_uppercase() && c[i + 1].is_ascii_uppercase() && c[i + 2].is_ascii_digit() && c[i + 3].is_ascii_digit()) { continue; }
        for len in 15..=34usize {
            if i + len > c.len() { break; }
            let w = &c[i..i + len];
            let mut rem: u64 = 0;
            for ch in w[4..].iter().chain(w[..4].iter()) {
                let v = if ch.is_ascii_digit() { ch.to_digit(10).unwrap() as u64 } else { (*ch as u64) - ('A' as u64) + 10 };
                rem = if v >= 10 { (rem * 100 + v) % 97 } else { (rem * 10 + v) % 97 };
            }
            if rem == 1 { return true; }
        }
    }
    false
}

const GLUED: &[&str] = &["sk-ant-", "ghp_", "gho_", "ghu_", "ghs_", "github_pat_", "xoxb-", "xoxp-", "xoxa-", "whsec_", "sk_live_", "sk_test_", "rk_live_"];

fn token(text: &str) -> bool {
    const PREFIXES: &[&str] = &["sk-", "sk_live_", "sk_test_", "rk_live_", "ghp_", "gho_", "ghu_", "ghs_", "github_pat_", "AKIA", "xoxb-", "xoxp-", "xoxa-", "AIza", "npm_", "whsec_", "SG."];
    for w in text.split(|c: char| c.is_whitespace() || "\"'`=:,;()[]{}<>".contains(c)) {
        let w = w.trim_matches(|c: char| c == '.' || c == ',');
        if w.len() < 10 { continue; }
        if PREFIXES.iter().any(|p| w.starts_with(p)) && w.len() >= 16 { return true; }
        // Text read from a picture can run a key into the word before it ("tokensk-ant-..."): these prefixes are
        // specific enough to count anywhere in a word.
        if GLUED.iter().any(|p| w.find(p).is_some_and(|i| w[i..].len() >= 20)) { return true; }
        if w.starts_with("eyJ") && w.matches('.').count() == 2 && w.len() >= 30 { return true; }
        let all_hex = w.len() >= 32 && w.chars().all(|c| c.is_ascii_hexdigit());
        if all_hex { return true; }
        let mixed = w.len() >= 40 && w.chars().all(|c| c.is_ascii_alphanumeric() || "+/_-=".contains(c)) && w.chars().any(|c| c.is_ascii_digit()) && w.chars().any(|c| c.is_ascii_uppercase()) && w.chars().any(|c| c.is_ascii_lowercase());
        if mixed { return true; }
    }
    false
}

/// A label that says what follows is a secret, even if the value itself looks harmless.
fn labelled_secret(text: &str) -> bool {
    let t = text.to_lowercase();
    ["password", "passwd", "secret", "api key", "api_key", "apikey", "private key", "token", "recovery code", "security code", "cvv", "cvc", "pin:", "ssn"].iter().any(|k| t.contains(k)) && (t.contains(':') || t.contains('=') || t.chars().any(|c| c.is_ascii_digit())) && t.chars().filter(|c| c.is_alphanumeric()).count() > 12
}

pub fn is_sensitive(text: &str) -> bool { card_number(text) || iban(text) || token(text) || labelled_secret(text) }

/// The rectangles (in the same space as the boxes) to cover, each a little larger than the text.
pub fn plan_blackouts(boxes: &[OcrBox]) -> Vec<R> {
    boxes.iter().filter(|b| is_sensitive(&b.text)).map(|b| R { x: b.rect.x - 4.0, y: b.rect.y - 3.0, w: b.rect.w + 8.0, h: b.rect.h + 6.0 }).collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    fn b(t: &str) -> OcrBox { OcrBox { id: "x".into(), text: t.into(), rect: R { x: 10.0, y: 10.0, w: 100.0, h: 14.0 } } }

    #[test]
    fn card_numbers_that_pass_the_check_are_found_with_spaces_dashes_or_none() {
        for t in ["4242 4242 4242 4242", "4242-4242-4242-4242", "4242424242424242", "Card: 5555 5555 5555 4444 exp 12/29", "3782 822463 10005"] { assert!(is_sensitive(t), "{t}"); }
    }
    #[test]
    fn ordinary_numbers_are_left_alone() {
        for t in ["Order 123456", "Total $1,299.00", "Call 415 555 0134", "Version 2026.10.9", "1234 5678 9012 3456", "Port 3000"] { assert!(!is_sensitive(t), "{t}"); }
    }
    #[test]
    fn bank_numbers_are_found() {
        for t in ["GB82 WEST 1234 5698 7654 32", "DE89370400440532013000"] { assert!(is_sensitive(t), "{t}"); }
        assert!(!is_sensitive("GB00 WEST 1234 5698 7654 32"));
    }
    #[test]
    fn keys_and_tokens_are_found() {
        for t in ["sk_live_abcdefghijklmnop1234", "sk-ant-api03-AbCdEf1234567890abcdef", "ghp_abcdefghijklmnopqrstuvwxyz0123456789", "AKIAIOSFODNN7EXAMPLE", "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0In0.abcDEF123456", "d41d8cd98f00b204e9800998ecf8427e", "Token: xoxb-1234567890-abcdefghij", "AIzaSyA1234567890abcdefghijklmnopqrstuv"] { assert!(is_sensitive(t), "{t}"); }
    }
    #[test]
    fn labelled_secrets_are_covered_even_when_the_value_looks_plain() {
        for t in ["Password: correct horse battery", "Your recovery code is 8f3a-91bc", "API key: hunter2hunter2"] { assert!(is_sensitive(t), "{t}"); }
        assert!(!is_sensitive("Token")); assert!(!is_sensitive("Reset password"));
    }
    #[test]
    fn ordinary_screen_text_is_left_alone() {
        for t in ["Deploy to production", "Settings", "Make it live", "https://vercel.com/dashboard", "Project overview and usage for the last 30 days"] { assert!(!is_sensitive(t), "{t}"); }
    }
    #[test]
    fn the_covers_are_a_little_larger_than_the_text_and_only_for_sensitive_boxes() {
        let r = plan_blackouts(&[b("Settings"), b("sk_live_abcdefghijklmnop1234")]);
        assert_eq!(r.len(), 1); assert_eq!(r[0], R { x: 6.0, y: 7.0, w: 108.0, h: 20.0 });
    }
}
