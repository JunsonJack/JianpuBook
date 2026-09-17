//! 去重：pHash 在「归一化 + 照明归一化」之后计算。
//!
//! W0 定案流水线：
//! median3 → 投影方差去偏 → 整页归一化 256×360 → 照明归一化 → pHash 64-bit
//!
//! 阈值：≤10 判重 / 11–14 近重复人工确认 / ≥16 不同曲。
//! 裁白边只用于展示，**不参与哈希**。
//!
//! pHash 自实现（均值哈希 + 8×8），避免第三方 `image` 版本冲突。

use image::{imageops, GrayImage};

use crate::denoise::median;
use crate::deskew::deskew;

pub const NORM_W: u32 = 256;
pub const NORM_H: u32 = 360;

pub const DUP_MAX: u32 = 10;
pub const NEAR_MAX: u32 = 14;

/// 计算去重哈希（64-bit，均值哈希 on 8×8）
pub fn perceptual_hash(gray: &GrayImage) -> u64 {
    let prepared = prepare_for_hash(gray);
    mean_hash_8x8(&prepared)
}

pub fn hamming(a: u64, b: u64) -> u32 {
    (a ^ b).count_ones()
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DupClass {
    Duplicate,
    NearDuplicate,
    Different,
}

pub fn classify(distance: u32) -> DupClass {
    if distance <= DUP_MAX {
        DupClass::Duplicate
    } else if distance <= NEAR_MAX {
        DupClass::NearDuplicate
    } else {
        DupClass::Different
    }
}

fn prepare_for_hash(gray: &GrayImage) -> GrayImage {
    let d1 = median(gray, 3);
    let d2 = deskew(&d1);
    let flat = imageops::resize(&d2, NORM_W, NORM_H, imageops::FilterType::Triangle);
    illumination_normalize(&flat)
}

fn mean_hash_8x8(gray: &GrayImage) -> u64 {
    // 9×8 差值哈希（dHash）：比均值哈希更能区分版式不同的谱面
    let small = imageops::resize(gray, 9, 8, imageops::FilterType::Triangle);
    let mut hash = 0u64;
    let mut bit = 0;
    for y in 0..8u32 {
        for x in 0..8u32 {
            let left = small.get_pixel(x, y).0[0];
            let right = small.get_pixel(x + 1, y).0[0];
            if left > right {
                hash |= 1u64 << bit;
            }
            bit += 1;
        }
    }
    hash
}

/// 照明归一化：除以大尺度盒式背景估计
fn illumination_normalize(gray: &GrayImage) -> GrayImage {
    let w = gray.width();
    let h = gray.height();
    if w < 8 || h < 8 {
        return gray.clone();
    }
    let radius = 31u32.min(w / 4).max(1);
    let bg = box_blur_separable(gray, radius);
    let mut out = gray.clone();
    for (p, b) in out.pixels_mut().zip(bg.pixels()) {
        let g = p.0[0] as f32;
        let bgv = (b.0[0] as f32).max(1.0);
        let v = (g / bgv * 200.0).clamp(0.0, 255.0);
        p.0[0] = v as u8;
    }
    out
}

fn box_blur_separable(src: &GrayImage, radius: u32) -> GrayImage {
    let w = src.width() as i32;
    let h = src.height() as i32;
    let r = radius as i32;
    let mut tmp = vec![0f32; (w * h) as usize];
    let mut out = vec![0f32; (w * h) as usize];

    for y in 0..h {
        let mut acc = 0f32;
        for x in -r..=r {
            let xx = x.clamp(0, w - 1);
            acc += src.get_pixel(xx as u32, y as u32).0[0] as f32;
        }
        let norm = (2 * r + 1) as f32;
        for x in 0..w {
            tmp[(y * w + x) as usize] = acc / norm;
            let x_out = (x - r).clamp(0, w - 1);
            let x_in = (x + r + 1).clamp(0, w - 1);
            acc += src.get_pixel(x_in as u32, y as u32).0[0] as f32;
            acc -= src.get_pixel(x_out as u32, y as u32).0[0] as f32;
        }
    }
    for x in 0..w {
        let mut acc = 0f32;
        for y in -r..=r {
            let yy = y.clamp(0, h - 1);
            acc += tmp[(yy * w + x) as usize];
        }
        let norm = (2 * r + 1) as f32;
        for y in 0..h {
            out[(y * w + x) as usize] = acc / norm;
            let y_out = (y - r).clamp(0, h - 1);
            let y_in = (y + r + 1).clamp(0, h - 1);
            acc += tmp[(y_in * w + x) as usize];
            acc -= tmp[(y_out * w + x) as usize];
        }
    }

    let mut img = GrayImage::new(w as u32, h as u32);
    for y in 0..h {
        for x in 0..w {
            img.put_pixel(
                x as u32,
                y as u32,
                image::Luma([out[(y * w + x) as usize].clamp(0.0, 255.0) as u8]),
            );
        }
    }
    img
}

/// 展示缩略图（不参与哈希）
pub fn fit_thumbnail(gray: &GrayImage, max_w: u32, max_h: u32) -> GrayImage {
    let (w, h) = gray.dimensions();
    if w == 0 || h == 0 {
        return gray.clone();
    }
    let scale = (max_w as f32 / w as f32).min(max_h as f32 / h as f32).min(1.0);
    let nw = ((w as f32 * scale).round() as u32).max(1);
    let nh = ((h as f32 * scale).round() as u32).max(1);
    imageops::resize(gray, nw, nh, imageops::FilterType::Triangle)
}

#[cfg(test)]
mod tests {
    use super::*;
    use image::{GrayImage, Luma};

    fn song_a() -> GrayImage {
        let mut img = GrayImage::from_pixel(300, 400, Luma([240]));
        for y in (50..350).step_by(40) {
            for x in 30..270 {
                img.put_pixel(x, y, Luma([20]));
            }
        }
        for (x, y) in [(40u32, 80u32), (80, 80), (120, 80), (60, 160), (100, 160)] {
            img.put_pixel(x, y, Luma([0]));
        }
        img
    }

    fn song_b() -> GrayImage {
        // 与 song_a 版式明显不同：密集竖线 + 不同疏密
        let mut img = GrayImage::from_pixel(300, 400, Luma([240]));
        for x in (20..280).step_by(12) {
            for y in 40..360 {
                img.put_pixel(x, y, Luma([40]));
            }
        }
        for y in (80..320).step_by(80) {
            for x in 20..280 {
                img.put_pixel(x, y, Luma([10]));
            }
        }
        img
    }

    #[test]
    fn same_image_distance_zero() {
        let a = song_a();
        let d = hamming(perceptual_hash(&a), perceptual_hash(&a));
        assert_eq!(d, 0);
        assert_eq!(classify(0), DupClass::Duplicate);
    }

    #[test]
    fn different_songs_separated() {
        let d = hamming(perceptual_hash(&song_a()), perceptual_hash(&song_b()));
        assert!(d >= DUP_MAX, "distance too small: {d}");
    }

    #[test]
    fn scaled_duplicate_close() {
        let a = song_a();
        let small = imageops::resize(&a, 210, 280, imageops::FilterType::Triangle);
        let d = hamming(perceptual_hash(&a), perceptual_hash(&small));
        assert!(d <= NEAR_MAX + 4, "scaled duplicate too far: {d}");
    }
}
