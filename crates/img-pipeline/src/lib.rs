//! JianpuBook 图片清晰化与去重管线。
//!
//! 工程红线（W0）：全管线二值图极性统一为 **墨=0 / 背景=255**。
//! 任何阈值函数（含 imageproc 形态学，其约定是 0=背景）出口立即对齐。

pub mod binarize;
pub mod dedup;
pub mod deskew;
pub mod denoise;
pub mod enhance;
pub mod io;
pub mod types;

pub use dedup::{classify, hamming, perceptual_hash, DupClass, DUP_MAX, NEAR_MAX};
pub use enhance::{enhance_gray, EnhanceParams, EnhancePreset};
pub use io::{hash_file, load_gray, parse_hash_hex, write_thumbnail};
pub use types::{BinaryImage, PipelineError};
