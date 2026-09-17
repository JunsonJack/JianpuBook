//! Tauri IPC 命令。

use crate::library::{ImportResult, LibraryState, SongDto};
use img_pipeline::{
    classify, enhance_gray, hamming, hash_file, load_gray, parse_hash_hex, write_thumbnail,
    DupClass, EnhanceParams, EnhancePreset,
};
use image::DynamicImage;
use std::path::{Path, PathBuf};
use tauri::State;

fn map_err(e: impl std::fmt::Display) -> String {
    e.to_string()
}

#[tauri::command]
pub fn list_songs(state: State<'_, LibraryState>) -> Result<Vec<SongDto>, String> {
    let lib = state.library.lock().map_err(map_err)?;
    lib.list_songs().map_err(map_err)
}

#[tauri::command]
pub fn import_text_song(
    state: State<'_, LibraryState>,
    title: String,
    key: Option<String>,
    meter: Option<String>,
    jianpu_text: String,
) -> Result<i64, String> {
    let lib = state.library.lock().map_err(map_err)?;
    lib.insert_text_song(&title, key.as_deref(), meter.as_deref(), &jianpu_text)
        .map_err(map_err)
}

fn title_from_path(path: &Path) -> String {
    path.file_stem()
        .and_then(|s| s.to_str())
        .map(str::to_string)
        .unwrap_or_else(|| "未命名".into())
}

fn is_image_ext(path: &Path) -> bool {
    matches!(
        path.extension()
            .and_then(|s| s.to_str())
            .map(|s| s.to_ascii_lowercase())
            .as_deref(),
        Some("jpg" | "jpeg" | "png" | "webp" | "bmp" | "gif")
    )
}

fn find_near(hashes: &[(i64, u64)], candidate: u64) -> (Option<i64>, Option<i64>, u32) {
    let mut best_dup: Option<i64> = None;
    let mut best_near: Option<i64> = None;
    let mut min_d = u32::MAX;
    for (id, h) in hashes {
        let d = hamming(candidate, *h);
        if d < min_d {
            min_d = d;
        }
        match classify(d) {
            DupClass::Duplicate => {
                if best_dup.is_none() {
                    best_dup = Some(*id);
                }
            }
            DupClass::NearDuplicate => {
                if best_near.is_none() {
                    best_near = Some(*id);
                }
            }
            DupClass::Different => {}
        }
    }
    (best_dup, best_near, if min_d == u32::MAX { 0 } else { min_d })
}

fn import_one(state: &State<'_, LibraryState>, path: &Path) -> Result<ImportResult, String> {
    let path_str = path.to_string_lossy().to_string();
    let title = title_from_path(path);

    if !path.is_file() {
        return Ok(ImportResult {
            song_id: 0,
            title,
            path: path_str,
            phash: None,
            duplicate_of: None,
            status: "error".into(),
            message: Some("文件不存在".into()),
            thumb_path: None,
        });
    }

    let hash = match hash_file(path) {
        Ok(h) => h,
        Err(e) => {
            return Ok(ImportResult {
                song_id: 0,
                title,
                path: path_str,
                phash: None,
                duplicate_of: None,
                status: "error".into(),
                message: Some(format!("读图/哈希失败: {e}")),
                thumb_path: None,
            });
        }
    };

    let lib = state.library.lock().map_err(map_err)?;
    let hashes = lib.all_hashes().map_err(map_err)?;
    let candidate = parse_hash_hex(&hash).unwrap_or(0);
    let (dup, near, min_d) = find_near(&hashes, candidate);

    if let Some(id) = dup {
        return Ok(ImportResult {
            song_id: id,
            title,
            path: path_str,
            phash: Some(hash),
            duplicate_of: Some(id),
            status: "duplicate".into(),
            message: Some(format!("与曲目 #{id} 重复（距离 {min_d} ≤10）")),
            thumb_path: None,
        });
    }

    // 先写缩略图（用临时 id 文件名，入库后不改名——直接用路径 hash 文件名）
    let thumb_name = format!("{hash}.png");
    let thumb_path = state.paths.thumbs_dir().join(&thumb_name);
    let thumb_str = thumb_path.to_string_lossy().to_string();
    let thumb_written = write_thumbnail(path, &thumb_path, 240, 320).is_ok();
    let thumb_opt = if thumb_written {
        Some(thumb_str.as_str())
    } else {
        None
    };

    let song_id = lib
        .insert_image_song(&title, &path_str, Some(&hash), thumb_opt)
        .map_err(map_err)?;

    let status = if near.is_some() { "near" } else { "new" };
    let message = near.map(|nid| {
        format!("与曲目 #{nid} 近重复（距离 {min_d}，11–14），请人工确认")
    });

    Ok(ImportResult {
        song_id,
        title,
        path: path_str,
        phash: Some(hash),
        duplicate_of: near,
        status: status.into(),
        message,
        thumb_path: if thumb_written { Some(thumb_str) } else { None },
    })
}

/// 批量导入图片（绝对路径或目录）。
#[tauri::command]
pub fn import_images(
    state: State<'_, LibraryState>,
    paths: Vec<String>,
) -> Result<Vec<ImportResult>, String> {
    let mut out = Vec::new();
    for p in paths {
        let path = PathBuf::from(&p);
        if path.is_dir() {
            let entries = std::fs::read_dir(&path).map_err(map_err)?;
            let mut files: Vec<PathBuf> = entries
                .filter_map(|e| e.ok())
                .map(|e| e.path())
                .filter(|p| p.is_file() && is_image_ext(p))
                .collect();
            files.sort();
            for f in files {
                out.push(import_one(&state, &f)?);
            }
        } else {
            out.push(import_one(&state, &path)?);
        }
    }
    Ok(out)
}

/// 增强预览：返回生成的 PNG 路径（convertFileSrc 后给 <img>）
#[tauri::command]
pub fn enhance_preview(
    path: String,
    preset: Option<String>,
) -> Result<String, String> {
    let src = PathBuf::from(&path);
    let gray = load_gray(&src).map_err(map_err)?;
    let params = match preset.as_deref() {
        Some("light") => EnhancePreset::Light.params(),
        Some("strong") => EnhancePreset::Strong.params(),
        _ => EnhanceParams::default(),
    };
    let out_img = enhance_gray(&gray, &params);
    let dir = std::env::temp_dir().join("jianpubook-enhance");
    std::fs::create_dir_all(&dir).map_err(map_err)?;
    let stamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0);
    let dest = dir.join(format!("enhance_{stamp}.png"));
    DynamicImage::ImageLuma8(out_img)
        .save(&dest)
        .map_err(map_err)?;
    Ok(dest.to_string_lossy().to_string())
}
