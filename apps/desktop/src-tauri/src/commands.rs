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

fn import_one_with_hash(
    state: &State<'_, LibraryState>,
    path: &Path,
    hash: String,
) -> Result<ImportResult, String> {
    let path_str = path.to_string_lossy().to_string();
    let title = title_from_path(path);
    if !path.is_file() {
        let msg = format!("系统找不到指定文件: {path_str}");
        return Ok(ImportResult {
            song_id: 0,
            title,
            path: path_str,
            phash: None,
            duplicate_of: None,
            status: "error".into(),
            message: Some(msg),
            thumb_path: None,
        });
    }

    let lib = state.library.lock().map_err(map_err)?;
    if let Some(id) = lib.find_by_phash_exact(&hash).map_err(map_err)? {
        return Ok(ImportResult {
            song_id: id,
            title,
            path: path_str,
            phash: Some(hash),
            duplicate_of: Some(id),
            status: "duplicate".into(),
            message: Some(format!("与曲目 #{id} 重复（pHash 完全一致）")),
            thumb_path: None,
        });
    }

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

/// 批量导入图片（绝对路径或目录）。哈希并行，入库串行。
#[tauri::command]
pub fn import_images(
    state: State<'_, LibraryState>,
    paths: Vec<String>,
) -> Result<Vec<ImportResult>, String> {
    use rayon::prelude::*;

    let mut files: Vec<PathBuf> = Vec::new();
    for p in paths {
        let path = PathBuf::from(&p);
        if path.is_dir() {
            let entries = std::fs::read_dir(&path).map_err(map_err)?;
            let mut dir_files: Vec<PathBuf> = entries
                .filter_map(|e| e.ok())
                .map(|e| e.path())
                .filter(|p| p.is_file() && is_image_ext(p))
                .collect();
            dir_files.sort();
            files.extend(dir_files);
        } else {
            files.push(path);
        }
    }

    // 并行算哈希（CPU 重），DB 写入仍串行避免锁竞争
    let hashed: Vec<(PathBuf, Result<String, String>)> = files
        .par_iter()
        .map(|p| {
            let h = hash_file(p).map_err(|e| e.to_string());
            (p.clone(), h)
        })
        .collect();

    let mut out = Vec::new();
    for (path, hash) in hashed {
        match hash {
            Ok(h) => out.push(import_one_with_hash(&state, &path, h)?),
            Err(e) => out.push(ImportResult {
                song_id: 0,
                title: title_from_path(&path),
                path: path.to_string_lossy().to_string(),
                phash: None,
                duplicate_of: None,
                status: "error".into(),
                message: Some(e),
                thumb_path: None,
            }),
        }
    }
    Ok(out)
}

/// 从内存字节导入（HTML file input / 拖拽在 Tauri 2 无真实路径时使用）
#[tauri::command]
pub fn import_images_from_bytes(
    state: State<'_, LibraryState>,
    files: Vec<ByteFile>,
) -> Result<Vec<ImportResult>, String> {
    use rayon::prelude::*;

    let staging = state.paths.data_dir.join("staging");
    std::fs::create_dir_all(&staging).map_err(map_err)?;

    let mut saved: Vec<PathBuf> = Vec::new();
    for (i, f) in files.iter().enumerate() {
        let safe = f
            .name
            .chars()
            .map(|c| if c.is_alphanumeric() || c == '.' || c == '-' || c == '_' { c } else { '_' })
            .collect::<String>();
        let name = if safe.is_empty() {
            format!("upload_{i}.png")
        } else {
            format!("{i}_{safe}")
        };
        let dest = staging.join(name);
        std::fs::write(&dest, &f.bytes).map_err(map_err)?;
        saved.push(dest);
    }

    let hashed: Vec<(PathBuf, Result<String, String>)> = saved
        .par_iter()
        .map(|p| {
            let h = hash_file(p).map_err(|e| e.to_string());
            (p.clone(), h)
        })
        .collect();

    let mut out = Vec::new();
    for (path, hash) in hashed {
        match hash {
            Ok(h) => out.push(import_one_with_hash(&state, &path, h)?),
            Err(e) => out.push(ImportResult {
                song_id: 0,
                title: title_from_path(&path),
                path: path.to_string_lossy().to_string(),
                phash: None,
                duplicate_of: None,
                status: "error".into(),
                message: Some(e),
                thumb_path: None,
            }),
        }
    }
    Ok(out)
}

#[derive(serde::Deserialize)]
pub struct ByteFile {
    pub name: String,
    pub bytes: Vec<u8>,
}

/// 增强预览：返回生成的 PNG 路径 + 元信息
/// preset: light|standard|strong；overrides 可覆盖 deskew/median/sharpen/binarize 等
#[tauri::command]
pub fn enhance_preview(
    path: String,
    preset: Option<String>,
    overrides: Option<serde_json::Value>,
) -> Result<EnhancePreviewDto, String> {
    let src = PathBuf::from(&path);
    let gray = load_gray(&src).map_err(map_err)?;
    let mut params = match preset.as_deref() {
        Some("light") => EnhancePreset::Light.params(),
        Some("strong") => EnhancePreset::Strong.params(),
        _ => EnhanceParams::default(),
    };
    let preset_id = preset.unwrap_or_else(|| "standard".into());
    if let Some(o) = overrides {
        if let Some(v) = o.get("deskew").and_then(|x| x.as_bool()) {
            params.deskew = v;
        }
        if let Some(v) = o.get("median").and_then(|x| x.as_u64()) {
            params.median = v as u32;
        }
        if let Some(v) = o.get("sharpen").and_then(|x| x.as_f64()) {
            params.sharpen = v as f32;
        }
        if let Some(v) = o.get("binarize").and_then(|x| x.as_bool()) {
            params.binarize = v;
        }
        if let Some(v) = o.get("sauvolaWindow").and_then(|x| x.as_u64()) {
            params.sauvola_window = v as u32;
        }
        if let Some(v) = o.get("sauvolaK").and_then(|x| x.as_f64()) {
            params.sauvola_k = v;
        }
        if let Some(v) = o.get("inkFallback").and_then(|x| x.as_f64()) {
            params.ink_fallback = v;
        }
        if let Some(v) = o.get("cropBorder").and_then(|x| x.as_bool()) {
            params.crop_border = v;
        }
    }
    let t0 = std::time::Instant::now();
    let out_img = enhance_gray(&gray, &params);
    let elapsed_ms = t0.elapsed().as_millis() as u64;
    let (ow, oh) = out_img.dimensions();
    let total = (ow as u64) * (oh as u64);
    let ink = out_img.pixels().filter(|p| p.0[0] < 128).count() as u64;
    let ink_ratio = if total == 0 { 0.0 } else { ink as f64 / total as f64 };
    let used_sauvola = params.binarize && ink_ratio > params.ink_fallback;

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

    Ok(EnhancePreviewDto {
        path: dest.to_string_lossy().to_string(),
        preset: preset_id,
        elapsed_ms,
        ink_ratio,
        used_sauvola,
        width: ow,
        height: oh,
    })
}

#[derive(serde::Serialize)]
pub struct EnhancePreviewDto {
    pub path: String,
    pub preset: String,
    pub elapsed_ms: u64,
    pub ink_ratio: f64,
    pub used_sauvola: bool,
    pub width: u32,
    pub height: u32,
}

/// 保存非破坏性增强参数（JSON 字符串）
#[tauri::command]
pub fn save_enhance_params(
    state: State<'_, LibraryState>,
    song_id: i64,
    params_json: String,
) -> Result<(), String> {
    let lib = state.library.lock().map_err(map_err)?;
    lib.save_enhance_params(song_id, &params_json).map_err(map_err)
}

#[tauri::command]
pub fn load_enhance_params(
    state: State<'_, LibraryState>,
    song_id: i64,
) -> Result<Option<String>, String> {
    let lib = state.library.lock().map_err(map_err)?;
    lib.load_enhance_params(song_id).map_err(map_err)
}

// ---- Books ----

use crate::library::{BookDto, BookItemDto};

#[tauri::command]
pub fn create_book(
    state: State<'_, LibraryState>,
    title: String,
    pagesetup: Option<String>,
    theme: Option<String>,
) -> Result<i64, String> {
    let lib = state.library.lock().map_err(map_err)?;
    lib.create_book(
        &title,
        pagesetup.as_deref().unwrap_or("{}"),
        theme.as_deref().unwrap_or("classic"),
    )
    .map_err(map_err)
}

#[tauri::command]
pub fn list_books(state: State<'_, LibraryState>) -> Result<Vec<BookDto>, String> {
    let lib = state.library.lock().map_err(map_err)?;
    lib.list_books().map_err(map_err)
}

#[tauri::command]
pub fn get_book(
    state: State<'_, LibraryState>,
    book_id: i64,
) -> Result<Option<BookDto>, String> {
    let lib = state.library.lock().map_err(map_err)?;
    lib.get_book(book_id).map_err(map_err)
}

#[tauri::command]
pub fn delete_book(state: State<'_, LibraryState>, book_id: i64) -> Result<(), String> {
    let lib = state.library.lock().map_err(map_err)?;
    lib.delete_book(book_id).map_err(map_err)
}

#[tauri::command]
pub fn rename_book(
    state: State<'_, LibraryState>,
    book_id: i64,
    title: String,
) -> Result<(), String> {
    let lib = state.library.lock().map_err(map_err)?;
    lib.rename_book(book_id, &title).map_err(map_err)
}

#[tauri::command]
pub fn set_book_theme(
    state: State<'_, LibraryState>,
    book_id: i64,
    theme: String,
    pagesetup: String,
) -> Result<(), String> {
    let lib = state.library.lock().map_err(map_err)?;
    lib.set_book_theme(book_id, &theme, &pagesetup).map_err(map_err)
}

#[tauri::command]
pub fn add_book_item(
    state: State<'_, LibraryState>,
    book_id: i64,
    song_id: i64,
) -> Result<i64, String> {
    let lib = state.library.lock().map_err(map_err)?;
    lib.add_book_item(book_id, song_id).map_err(map_err)
}

#[tauri::command]
pub fn remove_book_item(
    state: State<'_, LibraryState>,
    book_id: i64,
    song_id: i64,
) -> Result<(), String> {
    let lib = state.library.lock().map_err(map_err)?;
    lib.remove_book_item(book_id, song_id).map_err(map_err)
}

#[tauri::command]
pub fn reorder_book_items(
    state: State<'_, LibraryState>,
    book_id: i64,
    song_ids: Vec<i64>,
) -> Result<(), String> {
    let lib = state.library.lock().map_err(map_err)?;
    lib.reorder_book_items(book_id, &song_ids).map_err(map_err)
}

#[tauri::command]
pub fn list_book_items(
    state: State<'_, LibraryState>,
    book_id: i64,
) -> Result<Vec<BookItemDto>, String> {
    let lib = state.library.lock().map_err(map_err)?;
    lib.list_book_items(book_id).map_err(map_err)
}

#[tauri::command]
pub fn get_song_text(
    state: State<'_, LibraryState>,
    song_id: i64,
) -> Result<Option<String>, String> {
    let lib = state.library.lock().map_err(map_err)?;
    lib.get_song_text(song_id).map_err(map_err)
}

#[tauri::command]
pub fn update_song_text(
    state: State<'_, LibraryState>,
    song_id: i64,
    jianpu_text: String,
) -> Result<(), String> {
    let lib = state.library.lock().map_err(map_err)?;
    lib.update_song_text(song_id, &jianpu_text).map_err(map_err)
}

#[tauri::command]
pub fn set_song_stars(
    state: State<'_, LibraryState>,
    song_id: i64,
    stars: i64,
) -> Result<(), String> {
    let lib = state.library.lock().map_err(map_err)?;
    lib.set_song_stars(song_id, stars).map_err(map_err)
}

#[tauri::command]
pub fn set_song_tags(
    state: State<'_, LibraryState>,
    song_id: i64,
    tags: Vec<String>,
) -> Result<(), String> {
    let json = serde_json::to_string(&tags).map_err(map_err)?;
    let lib = state.library.lock().map_err(map_err)?;
    lib.set_song_tags(song_id, &json).map_err(map_err)
}

/// 批量增强曲库图片谱：结果写入 app_data/enhanced/{song_id}.png（不改原图）
#[tauri::command]
pub fn batch_enhance_images(
    state: State<'_, LibraryState>,
    preset: Option<String>,
) -> Result<Vec<EnhancePreviewDto>, String> {
    let lib = state.library.lock().map_err(map_err)?;
    let songs = lib.list_songs().map_err(map_err)?;
    drop(lib);

    let params = match preset.as_deref() {
        Some("light") => EnhancePreset::Light.params(),
        Some("strong") => EnhancePreset::Strong.params(),
        _ => EnhanceParams::default(),
    };

    let enh_dir = state.paths.data_dir.join("enhanced");
    std::fs::create_dir_all(&enh_dir).map_err(map_err)?;

    let mut out = Vec::new();
    for s in songs.iter().filter(|s| s.song_type == "image") {
        let Some(src) = s.original_path.as_deref() else {
            continue;
        };
        let path = PathBuf::from(src);
        if !path.is_file() {
            continue;
        }
        let gray = match load_gray(&path) {
            Ok(g) => g,
            Err(_) => continue,
        };
        let t0 = std::time::Instant::now();
        let out_img = enhance_gray(&gray, &params);
        let elapsed_ms = t0.elapsed().as_millis() as u64;
        let total = (out_img.width() as u64) * (out_img.height() as u64);
        let ink = out_img.pixels().filter(|p| p.0[0] < 128).count() as u64;
        let ink_ratio = if total == 0 {
            0.0
        } else {
            ink as f64 / total as f64
        };
        let used_sauvola = params.binarize && ink_ratio > params.ink_fallback;
        let dest = enh_dir.join(format!("{}.png", s.id));
        if DynamicImage::ImageLuma8(out_img).save(&dest).is_err() {
            continue;
        }
        let dest_str = dest.to_string_lossy().to_string();
        if let Ok(lib) = state.library.lock() {
            let _ = lib.set_enhanced_path(s.id, &dest_str);
        }
        out.push(EnhancePreviewDto {
            path: dest_str,
            preset: preset.clone().unwrap_or_else(|| "standard".into()),
            elapsed_ms,
            ink_ratio,
            used_sauvola,
            width: gray.width(),
            height: gray.height(),
        });
    }
    Ok(out)
}

/// 导出册子 HTML 到用户选择的路径（或 app data）
#[tauri::command]
pub fn save_book_html(
    state: State<'_, LibraryState>,
    path: String,
    html: String,
) -> Result<String, String> {
    let dest = PathBuf::from(&path);
    if let Some(parent) = dest.parent() {
        std::fs::create_dir_all(parent).map_err(map_err)?;
    }
    std::fs::write(&dest, html).map_err(map_err)?;
    let _ = &state;
    Ok(dest.to_string_lossy().to_string())
}

/// 在系统默认程序中打开文件/目录
#[tauri::command]
pub fn reveal_path(path: String) -> Result<(), String> {
    let p = PathBuf::from(&path);
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("explorer")
            .arg(if p.is_dir() { p.as_os_str() } else { p.as_os_str() })
            .spawn()
            .map_err(map_err)?;
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = p;
    }
    Ok(())
}

/// 写入演示数据（小星星 + 示例册），便于首次体验
#[tauri::command]
pub fn seed_demo(state: State<'_, LibraryState>) -> Result<i64, String> {
    let lib = state.library.lock().map_err(map_err)?;
    let text = "T: 小星星\nK: 1=C\nM: 4/4\nQ: ♩=100\nS: 儿歌\n\n1 1 5 5 | 6 6 5 - |\n词: 一 闪 一 闪 亮 晶 晶 ~\n\n4 4 3 3 | 2 2 1 - ||\n词: 满 天 都 是 小 星 星 ~\n";
    let sid = lib
        .insert_text_song("小星星", Some("1=C"), Some("4/4"), text)
        .map_err(map_err)?;
    let text2 = "T: 6/8 摇篮\nK: 1=bB\nM: 6/8\n\n1_ 1_ 1_ 1_ 1_ 1_ | 2_ 2_ 2_ 2_ 2_ 2_ | 1. 1_ 1_ 1_ ||\n词: 睡 吧 睡 吧 我 亲 爱 的 ~ ~ ~ ~\n";
    let sid2 = lib
        .insert_text_song("6/8 摇篮", Some("1=bB"), Some("6/8"), text2)
        .map_err(map_err)?;
    let bid = lib
        .create_book("示例简谱册", "{}", "classic")
        .map_err(map_err)?;
    lib.add_book_item(bid, sid).map_err(map_err)?;
    lib.add_book_item(bid, sid2).map_err(map_err)?;
    Ok(bid)
}

#[tauri::command]
pub fn export_book_json(
    state: State<'_, LibraryState>,
    book_id: i64,
) -> Result<String, String> {
    let lib = state.library.lock().map_err(map_err)?;
    let book = lib.get_book(book_id).map_err(map_err)?;
    let Some(book) = book else {
        return Err("册子不存在".into());
    };
    let items = lib.list_book_items(book_id).map_err(map_err)?;
    let payload = serde_json::json!({
        "format": "jianpubook.book",
        "version": 1,
        "book": {
            "title": book.title,
            "theme": book.theme,
            "pagesetup": serde_json::from_str::<serde_json::Value>(&book.pagesetup)
                .unwrap_or(serde_json::json!({})),
        },
        "items": items.iter().map(|it| serde_json::json!({
            "songId": it.song_id,
            "ord": it.ord,
            "type": it.song_type,
            "title": it.title,
            "key": it.key,
            "meter": it.meter,
            "originalPath": it.original_path,
            "jianpuText": it.jianpu_text,
        })).collect::<Vec<_>>(),
    });
    Ok(payload.to_string())
}
