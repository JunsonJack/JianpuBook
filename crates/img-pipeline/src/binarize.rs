//! 二值化：Otsu 默认；墨量占比 > 阈值自动回退 Sauvola(w=51, k=0.5)。
//!
//! W0：均匀照明 Otsu F1≈99.7；发黄+暗角图 Otsu 崩到 F1=14.1，Sauvola 拉回 99.5。
//!
//! 极性约定：输出 **墨=0 / 背景=255**。

use image::GrayImage;
use imageproc::contrast::otsu_level;

use crate::types::BinaryImage;

/// 将灰度图二值化为 墨=0 / 背景=255。
pub fn binarize(
    gray: &GrayImage,
    sauvola_window: u32,
    sauvola_k: f64,
    ink_fallback: f64,
) -> BinaryImage {
    let otsu = otsu_level(gray);
    let mut out = gray.clone();
    for p in out.pixels_mut() {
        p.0[0] = if p.0[0] <= otsu { 0 } else { 255 };
    }
    let candidate = BinaryImage::new(out);
    if candidate.ink_ratio() <= ink_fallback {
        return candidate;
    }
    BinaryImage::new(sauvola(gray, sauvola_window, sauvola_k))
}

/// Sauvola 局部阈值二值化（积分图加速）。
/// threshold = mean * (1 + k * (std/R - 1))，R=128。
/// 输出：墨=0，背景=255。
pub fn sauvola(gray: &GrayImage, window: u32, k: f64) -> GrayImage {
    let w = gray.width() as usize;
    let h = gray.height() as usize;
    if w == 0 || h == 0 {
        return gray.clone();
    }
    let win = if window % 2 == 0 { window + 1 } else { window };
    let r = (win as usize / 2).max(1);
    let stride = w + 1;

    let mut integral = vec![0f64; stride * (h + 1)];
    let mut sq = vec![0f64; stride * (h + 1)];
    for y in 0..h {
        let mut row_sum = 0f64;
        let mut row_sq = 0f64;
        for x in 0..w {
            let v = gray.get_pixel(x as u32, y as u32).0[0] as f64;
            row_sum += v;
            row_sq += v * v;
            let idx = (y + 1) * stride + (x + 1);
            integral[idx] = integral[y * stride + (x + 1)] + row_sum;
            sq[idx] = sq[y * stride + (x + 1)] + row_sq;
        }
    }

    let rect = |img: &[f64], x0: usize, y0: usize, x1: usize, y1: usize| -> f64 {
        img[(y1 + 1) * stride + (x1 + 1)]
            - img[y0 * stride + (x1 + 1)]
            - img[(y1 + 1) * stride + x0]
            + img[y0 * stride + x0]
    };

    let mut out = GrayImage::new(w as u32, h as u32);
    const R: f64 = 128.0;
    for y in 0..h {
        for x in 0..w {
            let x0 = x.saturating_sub(r);
            let y0 = y.saturating_sub(r);
            let x1 = (x + r).min(w - 1);
            let y1 = (y + r).min(h - 1);
            let n = ((x1 - x0 + 1) * (y1 - y0 + 1)) as f64;
            let sum = rect(&integral, x0, y0, x1, y1);
            let sqs = rect(&sq, x0, y0, x1, y1);
            let mean = sum / n;
            let var = (sqs / n - mean * mean).max(0.0);
            let std = var.sqrt();
            let thresh = mean * (1.0 + k * (std / R - 1.0));
            let v = gray.get_pixel(x as u32, y as u32).0[0] as f64;
            out.put_pixel(
                x as u32,
                y as u32,
                image::Luma([if v <= thresh { 0 } else { 255 }]),
            );
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use image::{GrayImage, Luma};

    #[test]
    fn otsu_on_clean_split() {
        let mut img = GrayImage::from_pixel(100, 100, Luma([255]));
        for y in 40..60 {
            for x in 20..80 {
                img.put_pixel(x, y, Luma([0]));
            }
        }
        let bin = binarize(&img, 51, 0.5, 0.15);
        let ink = bin.ink_ratio();
        assert!(ink > 0.05 && ink < 0.5, "ink_ratio={ink}");
        assert_eq!(bin.img.get_pixel(0, 0).0[0], 255);
    }

    #[test]
    fn polarity_is_ink_zero() {
        let mut img = GrayImage::from_pixel(20, 20, Luma([200]));
        img.put_pixel(10, 10, Luma([10]));
        let bin = binarize(&img, 11, 0.5, 0.5);
        assert_eq!(bin.img.get_pixel(10, 10).0[0], 0);
        assert_eq!(bin.img.get_pixel(0, 0).0[0], 255);
    }

    #[test]
    fn sauvola_handles_vignette() {
        let mut img = GrayImage::from_pixel(80, 80, Luma([200]));
        for y in 35..45 {
            for x in 35..45 {
                img.put_pixel(x, y, Luma([30]));
            }
        }
        for y in 0..80u32 {
            for x in 0..80u32 {
                let dx = (x as i32 - 40) as f64 / 40.0;
                let dy = (y as i32 - 40) as f64 / 40.0;
                let d = (dx * dx + dy * dy).sqrt().min(1.0);
                let p = img.get_pixel_mut(x, y);
                let v = (p.0[0] as f64 * (1.0 - 0.5 * d)) as u8;
                p.0[0] = v;
            }
        }
        let bin = sauvola(&img, 21, 0.5);
        assert_eq!(bin.get_pixel(40, 40).0[0], 0);
    }
}
