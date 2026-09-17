//! 去噪：默认仅 median3。
//!
//! W0：开运算吃 15–42% 音符墨量；连通域 ≥100px 会删掉八度点（约 78px）。
//! 故开运算/连通域过滤不在默认路径，连通域阈值上限锁定 50px。

use image::GrayImage;
use imageproc::filter::median_filter;

/// 中值滤波。`size` 为窗口边长（奇数）；W0 默认 3 → 半径 1。
pub fn median(gray: &GrayImage, size: u32) -> GrayImage {
    if size < 3 || size % 2 == 0 {
        return gray.clone();
    }
    let radius = size / 2;
    median_filter(gray, radius, radius)
}

#[cfg(test)]
mod tests {
    use super::*;
    use image::{GrayImage, Luma};

    #[test]
    fn median3_preserves_large_ink() {
        let mut img = GrayImage::from_pixel(32, 32, Luma([255]));
        for y in 8..24 {
            for x in 8..24 {
                img.put_pixel(x, y, Luma([0]));
            }
        }
        let out = median(&img, 3);
        assert_eq!(out.get_pixel(16, 16).0[0], 0);
        assert_eq!(out.get_pixel(0, 0).0[0], 255);
    }

    #[test]
    fn even_size_is_noop() {
        let img = GrayImage::from_pixel(8, 8, Luma([128]));
        let out = median(&img, 4);
        assert_eq!(out, img);
    }
}
