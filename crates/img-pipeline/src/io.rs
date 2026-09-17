//! 文件级 IO：读图 → 灰度 → pHash / 缩略图。

use image::{DynamicImage, GrayImage, ImageFormat};
use std::path::Path;

use crate::dedup::{fit_thumbnail, perceptual_hash};
use crate::types::PipelineError;

/// 读入任意支持格式并转灰度
pub fn load_gray(path: &Path) -> Result<GrayImage, PipelineError> {
    let img = image::open(path)?;
    Ok(img.to_luma8())
}

/// 计算文件的 pHash（hex 16 字符）
pub fn hash_file(path: &Path) -> Result<String, PipelineError> {
    let gray = load_gray(path)?;
    let h = perceptual_hash(&gray);
    Ok(format!("{h:016x}"))
}

/// 生成缩略图并保存为 PNG。返回写入路径。
pub fn write_thumbnail(
    src: &Path,
    dest: &Path,
    max_w: u32,
    max_h: u32,
) -> Result<(), PipelineError> {
    let gray = load_gray(src)?;
    let thumb = fit_thumbnail(&gray, max_w, max_h);
    if let Some(parent) = dest.parent() {
        std::fs::create_dir_all(parent)?;
    }
    DynamicImage::ImageLuma8(thumb).save_with_format(dest, ImageFormat::Png)?;
    Ok(())
}

/// 解析 hex 哈希为 u64
pub fn parse_hash_hex(hex: &str) -> Option<u64> {
    u64::from_str_radix(hex.trim(), 16).ok()
}

pub fn hash_hex(v: u64) -> String {
    format!("{v:016x}")
}

#[cfg(test)]
mod tests {
    use super::*;
    use image::{GrayImage, Luma};
    use std::path::PathBuf;

    fn scratch() -> PathBuf {
        let d = std::env::temp_dir().join(format!("jp-io-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&d);
        std::fs::create_dir_all(&d).unwrap();
        d
    }

    #[test]
    fn hash_and_thumb_roundtrip() {
        let dir = scratch();
        let src = dir.join("a.png");
        let mut img = GrayImage::from_pixel(200, 280, Luma([240]));
        for y in 40..240 {
            for x in 30..170 {
                if y % 20 < 3 {
                    img.put_pixel(x, y, Luma([20]));
                }
            }
        }
        img.save(&src).unwrap();

        let h = hash_file(&src).unwrap();
        assert_eq!(h.len(), 16);

        let thumb = dir.join("thumbs/a.png");
        write_thumbnail(&src, &thumb, 128, 160).unwrap();
        assert!(thumb.exists());
        let t = image::open(&thumb).unwrap();
        assert!(t.width() <= 128 && t.height() <= 160);

        let _ = std::fs::remove_dir_all(&dir);
    }
}
