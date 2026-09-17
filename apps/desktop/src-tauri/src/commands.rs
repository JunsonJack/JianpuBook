//! Tauri IPC 命令。

use crate::library::{ImportResult, LibraryError, LibraryState, SongDto};
use tauri::State;

fn map_err(e: LibraryError) -> String {
    e.to_string()
}

#[tauri::command]
pub fn list_songs(state: State<'_, LibraryState>) -> Result<Vec<SongDto>, String> {
    let lib = state.0.lock().map_err(|e| e.to_string())?;
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
    let lib = state.0.lock().map_err(|e| e.to_string())?;
    lib.insert_text_song(&title, key.as_deref(), meter.as_deref(), &jianpu_text)
        .map_err(map_err)
}

/// 导入图片：path 为绝对路径；phash 由前端/Rust 增强管线算好后传入。
/// 若 phash 已存在，返回已有 song_id（duplicate_of 也填上）。
#[tauri::command]
pub fn import_image_song(
    state: State<'_, LibraryState>,
    title: String,
    path: String,
    phash: Option<String>,
) -> Result<ImportResult, String> {
    let lib = state.0.lock().map_err(|e| e.to_string())?;
    if let Some(h) = phash.as_deref() {
        if let Some(existing) = lib.find_by_phash_exact(h).map_err(map_err)? {
            return Ok(ImportResult {
                song_id: existing,
                title,
                duplicate_of: Some(existing),
            });
        }
    }
    let id = lib
        .insert_image_song(&title, &path, phash.as_deref())
        .map_err(map_err)?;
    Ok(ImportResult {
        song_id: id,
        title,
        duplicate_of: None,
    })
}

#[tauri::command]
pub fn enhance_gray_preview(
    _path: String,
    _preset: String,
) -> Result<String, String> {
    // W2：读图 → img_pipeline::enhance_gray → 写临时 png → 返回路径/ data URL
    Err("enhance IPC 尚未实现（W2）".into())
}
