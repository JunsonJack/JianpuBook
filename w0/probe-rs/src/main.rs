// W0 probe: validate image/imageproc on the target Rust stack.
// Measures decode/Otsu/morphological-open timings and ink loss; hand-rolled pHash.
use image::{DynamicImage, GenericImageView, GrayImage, Luma};
use imageproc::contrast::{otsu_level, threshold, ThresholdType};
use imageproc::morphology::open;
use std::path::{Path, PathBuf};
use std::time::Instant;

fn gray(path: &Path) -> (DynamicImage, u128) {
    let t = Instant::now();
    let img = image::open(path).expect("open");
    let ms = t.elapsed().as_millis();
    (img, ms)
}

fn ink_count(img: &GrayImage) -> usize {
    img.pixels().filter(|p| p.0[0] < 128).count()
}

// manual DCT-II on a 32x32 grayscale buffer (pHash)
fn dct_hash(g: &GrayImage) -> u64 {
    let mut buf = [[0.0f64; 32]; 32];
    for (y, row) in g.rows().enumerate() {
        for (x, p) in row.enumerate() {
            buf[y][x] = p.0[0] as f64;
        }
    }
    let mut dct = [[0.0f64; 32]; 32];
    let n = 32usize;
    for u in 0..n {
        for v in 0..n {
            let mut s = 0.0;
            for i in 0..n {
                for j in 0..n {
                    s += buf[i][j]
                        * (std::f64::consts::PI * (2 * i + 1) as f64 * u as f64 / (2 * n) as f64)
                            .cos()
                        * (std::f64::consts::PI * (2 * j + 1) as f64 * v as f64 / (2 * n) as f64)
                            .cos();
                }
            }
            let cu = if u == 0 { 1.0 / 2f64.sqrt() } else { 1.0 };
            let cv = if v == 0 { 1.0 / 2f64.sqrt() } else { 1.0 };
            dct[u][v] = 0.25 * cu * cv * s;
        }
    }
    let mut vals = Vec::with_capacity(64);
    for u in 0..8 {
        for v in 0..8 {
            if u == 0 && v == 0 {
                continue;
            }
            vals.push(dct[u][v]);
        }
    }
    // median of 63 values
    let mut sorted = vals.clone();
    sorted.sort_by(|a, b| a.partial_cmp(b).unwrap());
    let med = sorted[sorted.len() / 2];
    let mut hash: u64 = 0;
    let mut bit = 0;
    for u in 0..8 {
        for v in 0..8 {
            if u == 0 && v == 0 {
                continue;
            }
            if dct[u][v] > med {
                hash |= 1 << bit;
            }
            bit += 1;
        }
    }
    hash
}

fn hamming(a: u64, b: u64) -> u32 {
    (a ^ b).count_ones()
}

fn main() {
    let dir = std::env::args().nth(1).expect("usage: probe-rs <image-dir>");
    let mut files: Vec<PathBuf> = std::fs::read_dir(&dir)
        .expect("read dir")
        .filter_map(|e| e.ok().map(|e| e.path()))
        .filter(|p| {
            p.extension()
                .map(|e| e.to_ascii_lowercase() == "png" || e == "jpg" || e == "jpeg")
                .unwrap_or(false)
        })
        .collect();
    files.sort();

    let mut hashes: Vec<(String, u64)> = Vec::new();
    println!("file,w,h,decode_ms,otsu_ms,open_ms,ink_before,ink_after,ink_loss_pct");
    for f in &files {
        let (img, decode_ms) = gray(f);
        let (w, h) = img.dimensions();
        let g = img.to_luma8();
        let t = Instant::now();
        let level = otsu_level(&g);
        let bin = threshold(&g, level, ThresholdType::Binary);
        let otsu_ms = t.elapsed().as_millis();
        let ink_before = ink_count(&bin);
        // imageproc 形态学把 0 当背景：先反转（墨=255）再开运算，再反转回来
        let (iw, ih) = bin.dimensions();
        let inv = GrayImage::from_raw(
            iw, ih,
            bin.pixels().map(|p| 255u8 - p.0[0]).collect::<Vec<u8>>(),
        )
        .expect("from_raw");
        let t = Instant::now();
        let opened_inv = open(&inv, imageproc::distance_transform::Norm::L1, 1);
        let open_ms = t.elapsed().as_millis();
        let opened = GrayImage::from_raw(
            iw, ih,
            opened_inv.pixels().map(|p| 255u8 - p.0[0]).collect::<Vec<u8>>(),
        )
        .expect("from_raw");
        let ink_after = ink_count(&opened);
        let loss = if ink_before > 0 {
            (ink_before - ink_after) as f64 / ink_before as f64 * 100.0
        } else {
            0.0
        };
        let small = image::imageops::resize(&g, 32, 32, image::imageops::FilterType::Lanczos3);
        hashes.push((
            f.file_name().unwrap().to_string_lossy().to_string(),
            dct_hash(&small),
        ));
        println!(
            "{},{},{},{},{},{},{},{},{:.2}",
            f.file_name().unwrap().to_string_lossy(),
            w,
            h,
            decode_ms,
            otsu_ms,
            open_ms,
            ink_before,
            ink_after,
            loss
        );
    }
    if hashes.len() >= 2 {
        println!("\nhamming distances (pHash, 63-bit):");
        for i in 0..hashes.len() {
            for j in (i + 1)..hashes.len() {
                println!("  {} <-> {} = {}", hashes[i].0, hashes[j].0, hamming(hashes[i].1, hashes[j].1));
            }
        }
    }
}
