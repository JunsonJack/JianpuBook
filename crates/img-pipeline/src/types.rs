use image::GrayImage;

pub use crate::enhance::{EnhanceParams, EnhancePreset};

/// 二值图：墨=0，背景=255（全管线统一约定）
#[derive(Clone, Debug)]
pub struct BinaryImage {
    pub img: GrayImage,
}

impl BinaryImage {
    pub fn new(img: GrayImage) -> Self {
        Self { img }
    }

    /// 墨量占比（像素值 < 128 视为墨）
    pub fn ink_ratio(&self) -> f64 {
        let total = (self.img.width() as u64) * (self.img.height() as u64);
        if total == 0 {
            return 0.0;
        }
        let ink = self
            .img
            .pixels()
            .filter(|p| p.0[0] < 128)
            .count() as u64;
        ink as f64 / total as f64
    }
}

#[derive(Debug, thiserror::Error)]
pub enum PipelineError {
    #[error("image error: {0}")]
    Image(#[from] image::ImageError),
    #[error("io error: {0}")]
    Io(#[from] std::io::Error),
    #[error("{0}")]
    Other(String),
}
