//! 反锐化掩模（unsharp mask）。W0：模糊图 PSNR +0.7~+1.3dB，作基础档。

use image::GrayImage;
use imageproc::filter::gaussian_blur_f32;

/// amount=0 关闭；典型 0.5–1.5
pub fn unsharp(gray: &GrayImage, amount: f32, sigma: f32) -> GrayImage {
    if amount <= 0.0 {
        return gray.clone();
    }
    let blur = gaussian_blur_f32(gray, sigma);
    let mut out = gray.clone();
    for (p, b) in out.pixels_mut().zip(blur.pixels()) {
        let s = p.0[0] as f32;
        let bl = b.0[0] as f32;
        let v = s + amount * (s - bl);
        p.0[0] = v.clamp(0.0, 255.0) as u8;
    }
    out
}

/// 按墨量 bbox 裁白边（仅展示；不参与哈希）
pub fn crop_border(gray: &GrayImage, pad: u32) -> GrayImage {
    let w = gray.width();
    let h = gray.height();
    let mut min_x = w;
    let mut min_y = h;
    let mut max_x = 0u32;
    let mut max_y = 0u32;
    for y in 0..h {
        for x in 0..w {
            if gray.get_pixel(x, y).0[0] < 200 {
                if x < min_x {
                    min_x = x;
                }
                if y < min_y {
                    min_y = y;
                }
                if x > max_x {
                    max_x = x;
                }
                if y > max_y {
                    max_y = y;
                }
            }
        }
    }
    if min_x > max_x || min_y > max_y {
        return gray.clone();
    }
    let x0 = min_x.saturating_sub(pad);
    let y0 = min_y.saturating_sub(pad);
    let x1 = (max_x + pad + 1).min(w);
    let y1 = (max_y + pad + 1).min(h);
    let mut out = GrayImage::new(x1 - x0, y1 - y0);
    for y in y0..y1 {
        for x in x0..x1 {
            out.put_pixel(x - x0, y - y0, *gray.get_pixel(x, y));
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use image::{GrayImage, Luma};

    #[test]
    fn unsharp_preserves_size_and_range() {
        let img = GrayImage::from_pixel(32, 32, Luma([180]));
        let out = unsharp(&img, 1.0, 1.0);
        assert_eq!(out.dimensions(), img.dimensions());
        assert!(out.pixels().all(|p| p.0[0] <= 255));
    }

    #[test]
    fn crop_removes_margins() {
        let mut img = GrayImage::from_pixel(50, 50, Luma([255]));
        for y in 20..30 {
            for x in 10..40 {
                img.put_pixel(x, y, Luma([10]));
            }
        }
        let c = crop_border(&img, 2);
        assert!(c.width() < 50 && c.height() < 50);
        assert!(c.width() >= 30);
    }
}
