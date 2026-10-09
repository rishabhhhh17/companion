//! The model's pointer is approximate. Before drawing, the answer is "snapped" to something real on the screen:
//! the text box it named, the button the Mac says is there, or a close text match. Only if none of those fit does the
//! pointer fall back to the raw point, drawn as a wide "around here" ring so it never pretends to be exact.
use crate::coords::{Pt, R};

#[derive(Clone, Debug, PartialEq)]
pub struct OcrBox { pub id: String, pub text: String, pub rect: R }

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum How { OcrId, Accessibility, FuzzyText, Raw }

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Snapped { pub rect: R, pub how: How, pub exact: bool }

pub struct Ask<'a> {
    /// The model's point, already in global top-left points.
    pub point: Pt,
    pub ocr_id: Option<&'a str>,
    pub target_text: &'a str,
    pub ocr: &'a [OcrBox],
    /// The nearest clickable element the Mac reports at that point (button, link, tab, menu item, field), if any.
    pub ax: Option<R>,
    pub display: R,
}

const OCR_ID_REACH: f64 = 300.0;   // a named text box far from the point is a mix up, not a hit
const FUZZY_REACH: f64 = 80.0;
const FUZZY_MIN: f64 = 0.6;
const RING: f64 = 120.0;

fn dist_to(r: &R, p: Pt) -> f64 {
    let dx = (r.x - p.x).max(0.0).max(p.x - (r.x + r.w));
    let dy = (r.y - p.y).max(0.0).max(p.y - (r.y + r.h));
    dx.hypot(dy)
}

fn sane_element(r: &R, p: Pt, display: &R) -> bool {
    r.w >= 8.0 && r.h >= 8.0 && r.w <= display.w * 0.5 && r.h <= display.h * 0.5 && r.contains(p)
}

fn norm(s: &str) -> Vec<char> { s.chars().filter(|c| c.is_alphanumeric()).flat_map(|c| c.to_lowercase()).collect() }

/// 1.0 is identical, 0.0 shares nothing. Based on the edit distance.
pub fn similarity(a: &str, b: &str) -> f64 {
    let (a, b) = (norm(a), norm(b));
    if a.is_empty() || b.is_empty() { return 0.0; }
    let mut prev: Vec<usize> = (0..=b.len()).collect();
    for i in 1..=a.len() {
        let mut cur = vec![i];
        for j in 1..=b.len() {
            let cost = if a[i - 1] == b[j - 1] { 0 } else { 1 };
            cur.push((prev[j] + 1).min(cur[j - 1] + 1).min(prev[j - 1] + cost));
        }
        prev = cur;
    }
    1.0 - prev[b.len()] as f64 / a.len().max(b.len()) as f64
}

pub fn snap(a: &Ask) -> Snapped {
    if let Some(id) = a.ocr_id {
        if let Some(b) = a.ocr.iter().find(|b| b.id == id) {
            if dist_to(&b.rect, a.point) <= OCR_ID_REACH { return Snapped { rect: b.rect, how: How::OcrId, exact: true }; }
        }
    }
    if let Some(r) = a.ax {
        if sane_element(&r, a.point, &a.display) { return Snapped { rect: r, how: How::Accessibility, exact: true }; }
    }
    let mut best: Option<(&OcrBox, f64, f64)> = None;
    for b in a.ocr {
        let d = dist_to(&b.rect, a.point);
        if d > FUZZY_REACH { continue; }
        let sim = similarity(&b.text, a.target_text);
        if sim < FUZZY_MIN { continue; }
        if best.map_or(true, |(_, s, bd)| sim > s || (sim == s && d < bd)) { best = Some((b, sim, d)); }
    }
    if let Some((b, _, _)) = best { return Snapped { rect: b.rect, how: How::FuzzyText, exact: true }; }
    // Nothing real to hold on to: a wide ring, kept inside the display.
    let x = (a.point.x - RING / 2.0).clamp(a.display.x, (a.display.x + a.display.w - RING).max(a.display.x));
    let y = (a.point.y - RING / 2.0).clamp(a.display.y, (a.display.y + a.display.h - RING).max(a.display.y));
    Snapped { rect: R { x, y, w: RING, h: RING }, how: How::Raw, exact: false }
}

#[cfg(test)]
mod tests {
    use super::*;
    const D: R = R { x: 0.0, y: 0.0, w: 1500.0, h: 900.0 };
    fn ocr(id: &str, text: &str, x: f64, y: f64) -> OcrBox { OcrBox { id: id.into(), text: text.into(), rect: R { x, y, w: 80.0, h: 20.0 } } }
    fn ask<'a>(p: Pt, id: Option<&'a str>, text: &'a str, ocr: &'a [OcrBox], ax: Option<R>) -> Ask<'a> { Ask { point: p, ocr_id: id, target_text: text, ocr, ax, display: D } }

    #[test]
    fn the_named_text_box_wins() {
        let o = [ocr("t1", "Deploy", 500.0, 400.0), ocr("t2", "Cancel", 700.0, 400.0)];
        let s = snap(&ask(Pt { x: 520.0, y: 405.0 }, Some("t1"), "Deploy", &o, Some(R { x: 100.0, y: 100.0, w: 50.0, h: 20.0 })));
        assert_eq!(s.how, How::OcrId); assert_eq!(s.rect, o[0].rect); assert!(s.exact);
    }
    #[test]
    fn a_named_text_box_far_from_the_point_is_a_mix_up_and_is_ignored() {
        let o = [ocr("t1", "Deploy", 1200.0, 800.0)];
        let s = snap(&ask(Pt { x: 100.0, y: 100.0 }, Some("t1"), "Deploy", &o, None));
        assert_eq!(s.how, How::Raw);
    }
    #[test]
    fn otherwise_the_button_the_mac_reports_is_used() {
        let btn = R { x: 300.0, y: 300.0, w: 120.0, h: 32.0 };
        let s = snap(&ask(Pt { x: 350.0, y: 310.0 }, None, "Save", &[], Some(btn)));
        assert_eq!(s.how, How::Accessibility); assert_eq!(s.rect, btn);
    }
    #[test]
    fn a_whole_window_or_a_speck_or_a_frame_that_misses_the_point_is_not_a_button() {
        for r in [R { x: 0.0, y: 0.0, w: 1400.0, h: 850.0 }, R { x: 300.0, y: 300.0, w: 3.0, h: 3.0 }, R { x: 600.0, y: 600.0, w: 100.0, h: 30.0 }] {
            assert_eq!(snap(&ask(Pt { x: 301.0, y: 301.0 }, None, "Save", &[], Some(r))).how, How::Raw, "{r:?}");
        }
    }
    #[test]
    fn a_close_spelling_of_the_target_near_the_point_is_found_even_when_ocr_misread_a_letter() {
        let o = [ocr("a", "Deplov", 400.0, 300.0), ocr("b", "Settings", 420.0, 300.0)];
        let s = snap(&ask(Pt { x: 430.0, y: 310.0 }, None, "Deploy", &o, None));
        assert_eq!(s.how, How::FuzzyText); assert_eq!(s.rect, o[0].rect);
    }
    #[test]
    fn matching_text_that_is_far_away_is_not_used() {
        let o = [ocr("a", "Deploy", 1000.0, 800.0)];
        assert_eq!(snap(&ask(Pt { x: 100.0, y: 100.0 }, None, "Deploy", &o, None)).how, How::Raw);
    }
    #[test]
    fn the_fallback_is_a_wide_ring_that_says_it_is_not_exact_and_stays_on_the_display() {
        let s = snap(&ask(Pt { x: 5.0, y: 895.0 }, None, "x", &[], None));
        assert!(!s.exact && s.how == How::Raw && s.rect.w >= 100.0);
        assert!(s.rect.x >= 0.0 && s.rect.y >= 0.0 && s.rect.x + s.rect.w <= 1500.0 && s.rect.y + s.rect.h <= 900.0);
    }
    #[test]
    fn similarity_ignores_case_and_punctuation_and_is_zero_for_nothing_in_common() {
        assert!(similarity("Make it live!", "make it live") > 0.99);
        assert!(similarity("abc", "xyz") < 0.01 && similarity("", "abc") == 0.0);
        assert!(similarity("Deploy", "Deploy now") > 0.5);
    }
}
