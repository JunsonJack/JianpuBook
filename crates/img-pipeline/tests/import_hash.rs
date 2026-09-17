//! 批量导入：pHash 去重集成测试（用合成图，不依赖 UI）

use img_pipeline::{classify, hamming, hash_file, load_gray, perceptual_hash, DupClass};
use image::{GrayImage, Luma};
use std::path::PathBuf;

fn write_pattern(path: &PathBuf, style: u8) {
    let mut img = GrayImage::from_pixel(300, 400, Luma([245]));
    match style {
        0 => {
            for y in (50..350).step_by(40) {
                for x in 40..260 {
                    img.put_pixel(x, y, Luma([15]));
                }
            }
            for (x, y) in [(60u32, 90u32), (100, 90), (140, 90)] {
                img.put_pixel(x, y, Luma([0]));
            }
        }
        1 => {
            // 与 0 几乎相同（缩放版）
            for y in (60..340).step_by(40) {
                for x in 50..250 {
                    img.put_pixel(x, y, Luma([18]));
                }
            }
        }
        _ => {
            // 对角斜线，与水平线谱面明显不同
            for y in 40..360u32 {
                for x in 30..270u32 {
                    if (x + y) % 18 < 4 {
                        img.put_pixel(x, y, Luma([35]));
                    }
                }
            }
            // 中心大块
            for y in 160..240u32 {
                for x in 100..200u32 {
                    img.put_pixel(x, y, Luma([10]));
                }
            }
        }
    }
    img.save(path).unwrap();
}

#[test]
fn duplicate_and_different_classification() {
    let dir = std::env::temp_dir().join(format!("jp-import-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(&dir).unwrap();

    let a = dir.join("a.png");
    let a2 = dir.join("a2.png");
    let b = dir.join("b.png");
    write_pattern(&a, 0);
    write_pattern(&a2, 1);
    write_pattern(&b, 2);

    let ha = hash_file(&a).unwrap();
    let ha2 = hash_file(&a2).unwrap();
    let hb = hash_file(&b).unwrap();

    let va = u64::from_str_radix(&ha, 16).unwrap();
    let va2 = u64::from_str_radix(&ha2, 16).unwrap();
    let vb = u64::from_str_radix(&hb, 16).unwrap();

    let d_aa2 = hamming(va, va2);
    let d_ab = hamming(va, vb);

    assert!(
        matches!(classify(d_aa2), DupClass::Duplicate | DupClass::NearDuplicate),
        "near-dup distance {d_aa2}"
    );
    assert_eq!(classify(d_ab), DupClass::Different, "diff distance {d_ab}");

    // load_gray 与 perceptual_hash 可用
    let _ = perceptual_hash(&load_gray(&a).unwrap());

    let _ = std::fs::remove_dir_all(&dir);
}
