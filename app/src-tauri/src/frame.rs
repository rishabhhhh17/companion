//! A screenshot held in memory only. It is never written to disk by Companion: it is covered, shrunk, turned into a
//! compressed picture in memory, sent, and dropped.
use crate::coords::R;

#[derive(Clone, Debug)]
pub struct Frame { pub w: u32, pub h: u32, pub rgba: Vec<u8> }

impl Frame {
    pub fn new(w: u32, h: u32, rgba: Vec<u8>) -> Option<Frame> {
        if w == 0 || h == 0 || rgba.len() != (w as usize) * (h as usize) * 4 { return None; }
        Some(Frame { w, h, rgba })
    }

    /// Cover a rectangle (picture pixels) with solid black. Parts outside the picture are ignored.
    pub fn black_out(&mut self, r: R) {
        let x0 = r.x.floor().max(0.0) as i64; let y0 = r.y.floor().max(0.0) as i64;
        let x1 = ((r.x + r.w).ceil() as i64).min(self.w as i64); let y1 = ((r.y + r.h).ceil() as i64).min(self.h as i64);
        if x1 <= x0 || y1 <= y0 { return; }
        for y in y0..y1 { for x in x0..x1 {
            let i = ((y as usize) * (self.w as usize) + x as usize) * 4;
            self.rgba[i] = 0; self.rgba[i + 1] = 0; self.rgba[i + 2] = 0; self.rgba[i + 3] = 255;
        } }
    }

    /// Shrink so the long side is at most `max_edge`, averaging the pixels under each new pixel (so text stays readable).
    pub fn shrink_to(&self, max_edge: u32) -> Frame {
        let (nw, nh) = crate::coords::fit(self.w, self.h, max_edge);
        if (nw, nh) == (self.w, self.h) { return self.clone(); }
        let mut out = vec![0u8; (nw as usize) * (nh as usize) * 4];
        for ny in 0..nh {
            let y0 = (ny as u64 * self.h as u64 / nh as u64) as u32;
            let y1 = (((ny as u64 + 1) * self.h as u64).div_ceil(nh as u64) as u32).clamp(y0 + 1, self.h);
            for nx in 0..nw {
                let x0 = (nx as u64 * self.w as u64 / nw as u64) as u32;
                let x1 = (((nx as u64 + 1) * self.w as u64).div_ceil(nw as u64) as u32).clamp(x0 + 1, self.w);
                let mut acc = [0u64; 4]; let mut n = 0u64;
                for y in y0..y1 { for x in x0..x1 {
                    let i = ((y as usize) * (self.w as usize) + x as usize) * 4;
                    for c in 0..4 { acc[c] += self.rgba[i + c] as u64; }
                    n += 1;
                } }
                let o = ((ny as usize) * (nw as usize) + nx as usize) * 4;
                for c in 0..4 { out[o + c] = (acc[c] / n) as u8; }
            }
        }
        Frame { w: nw, h: nh, rgba: out }
    }

    /// A compressed picture, in memory.
    pub fn to_jpeg(&self, quality: u8) -> Result<Vec<u8>, String> {
        let mut rgb = Vec::with_capacity((self.w as usize) * (self.h as usize) * 3);
        for px in self.rgba.chunks_exact(4) { rgb.extend_from_slice(&px[..3]); }
        let mut out = Vec::new();
        let enc = jpeg_encoder::Encoder::new(&mut out, quality.clamp(30, 95));
        enc.encode(&rgb, self.w.min(65535) as u16, self.h.min(65535) as u16, jpeg_encoder::ColorType::Rgb).map_err(|e| e.to_string())?;
        Ok(out)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn solid(w: u32, h: u32, c: [u8; 4]) -> Frame { Frame::new(w, h, c.iter().cycle().take((w * h * 4) as usize).cloned().collect()).unwrap() }
    fn px(f: &Frame, x: u32, y: u32) -> [u8; 4] { let i = ((y * f.w + x) * 4) as usize; [f.rgba[i], f.rgba[i + 1], f.rgba[i + 2], f.rgba[i + 3]] }

    #[test]
    fn a_frame_needs_matching_data() { assert!(Frame::new(2, 2, vec![0; 15]).is_none()); assert!(Frame::new(0, 2, vec![]).is_none()); assert!(Frame::new(2, 2, vec![0; 16]).is_some()); }
    #[test]
    fn covering_a_rectangle_blacks_only_that_area_and_clips_to_the_picture() {
        let mut f = solid(10, 10, [200, 200, 200, 255]);
        f.black_out(R { x: 2.0, y: 2.0, w: 3.0, h: 3.0 });
        assert_eq!(px(&f, 3, 3), [0, 0, 0, 255]); assert_eq!(px(&f, 5, 5), [200, 200, 200, 255]); assert_eq!(px(&f, 1, 3), [200, 200, 200, 255]);
        f.black_out(R { x: -5.0, y: 8.0, w: 100.0, h: 100.0 });
        assert_eq!(px(&f, 0, 9), [0, 0, 0, 255]); assert_eq!(px(&f, 9, 8), [0, 0, 0, 255]);
        f.black_out(R { x: 50.0, y: 50.0, w: 5.0, h: 5.0 });   // wholly outside: no crash, no change
    }
    #[test]
    fn covering_happens_before_shrinking_so_the_secret_cannot_survive_the_resize() {
        let mut f = solid(100, 100, [255, 255, 255, 255]);
        f.black_out(R { x: 0.0, y: 0.0, w: 100.0, h: 50.0 });
        let s = f.shrink_to(20);
        assert_eq!(px(&s, 10, 2), [0, 0, 0, 255]); assert_eq!(px(&s, 10, 15), [255, 255, 255, 255]);
    }
    #[test]
    fn shrinking_keeps_the_shape_and_averages_colours() {
        let s = solid(2880, 1800, [10, 20, 30, 255]).shrink_to(1280);
        assert_eq!((s.w, s.h), (1280, 800)); assert_eq!(px(&s, 640, 400), [10, 20, 30, 255]);
        let mut half = solid(4, 2, [0, 0, 0, 255]);
        for x in 2..4 { for y in 0..2 { let i = ((y * 4 + x) * 4) as usize; half.rgba[i] = 255; half.rgba[i + 1] = 255; half.rgba[i + 2] = 255; } }
        let one = half.shrink_to(1).rgba; assert!(one[0] > 100 && one[0] < 155);
    }
    #[test]
    fn a_small_picture_is_not_enlarged() { let s = solid(300, 200, [1, 2, 3, 255]).shrink_to(1280); assert_eq!((s.w, s.h), (300, 200)); }
    #[test]
    fn the_compressed_picture_is_a_real_jpeg_and_smaller_than_the_raw_data() {
        let j = solid(400, 300, [90, 120, 200, 255]).to_jpeg(80).unwrap();
        assert_eq!(&j[..2], &[0xFF, 0xD8]); assert_eq!(&j[j.len() - 2..], &[0xFF, 0xD9]); assert!(j.len() < 400 * 300 * 3 / 5);
    }
}
