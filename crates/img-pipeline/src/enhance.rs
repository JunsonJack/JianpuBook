//! 增强编排：非破坏性参数 → 输出增强后的图（不改原图）。

use image::GrayImage;
use serde::{Deserialize, Serialize};

use crate::binarize::binarize;
use crate::denoise::median;
use crate::deskew::deskew;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub enum EnhancePreset {
    Light,
    Standard,
    Strong,
}

/// 非破坏性增强参数
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct EnhanceParams {
    pub deskew: bool,
    /// median 窗口边长（奇数）；0 关闭。W0 默认 3
    pub median: u32,
    pub binarize: bool,
    pub sauvola_window: u32,
    pub sauvola_k: f64,
    pub ink_fallback: f64,
    pub crop_border: bool,
}

impl Default for EnhanceParams {
    fn default() -> Self {
        Self {
            deskew: true,
            median: 3,
            binarize: true,
            sauvola_window: 51,
            sauvola_k: 0.5,
            ink_fallback: 0.15,
            crop_border: false,
        }
    }
}

impl EnhancePreset {
    pub fn params(self) -> EnhanceParams {
        match self {
            EnhancePreset::Light => EnhanceParams {
                deskew: true,
                median: 3,
                binarize: true,
                ..EnhanceParams::default()
            },
            EnhancePreset::Standard => EnhanceParams::default(),
            EnhancePreset::Strong => EnhanceParams {
                median: 5,
                ink_fallback: 0.12,
                crop_border: true,
                ..EnhanceParams::default()
            },
        }
    }
}

/// 对灰度图按参数增强。原图不被修改。
pub fn enhance_gray(input: &GrayImage, params: &EnhanceParams) -> GrayImage {
    let mut img = input.clone();
    if params.median >= 3 {
        img = median(&img, params.median);
    }
    if params.deskew {
        img = deskew(&img);
    }
    if params.binarize {
        img = binarize(&img, params.sauvola_window, params.sauvola_k, params.ink_fallback).img;
    }
    img
}

#[cfg(test)]
mod tests {
    use super::*;
    use image::{GrayImage, Luma};
    use std::thread;

    fn run_on_big_stack<F: FnOnce() + Send + 'static>(f: F) {
        thread::Builder::new()
            .stack_size(8 * 1024 * 1024)
            .spawn(f)
            .expect("spawn")
            .join()
            .expect("join");
    }

    #[test]
    fn enhance_does_not_mutate_input() {
        run_on_big_stack(|| {
            let src = GrayImage::from_pixel(64, 64, Luma([180]));
            let copy = src.clone();
            let _ = enhance_gray(&src, &EnhanceParams::default());
            assert_eq!(src, copy);
        });
    }

    #[test]
    fn presets_produce_binary() {
        run_on_big_stack(|| {
            let mut src = GrayImage::from_pixel(80, 80, Luma([255]));
            for y in 30..50 {
                for x in 10..70 {
                    src.put_pixel(x, y, Luma([30]));
                }
            }
            for p in [
                EnhancePreset::Light,
                EnhancePreset::Standard,
                EnhancePreset::Strong,
            ] {
                let out = enhance_gray(&src, &p.params());
                let vals: Vec<u8> = out.pixels().map(|p| p.0[0]).collect();
                assert!(vals.iter().all(|&v| v == 0 || v == 255), "{p:?}");
            }
        });
    }
}
