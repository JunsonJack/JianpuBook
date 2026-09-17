mod commands;
mod library;

use library::{Library, LibraryState};
use std::sync::Mutex;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let data_dir = app
                .path()
                .app_data_dir()
                .unwrap_or_else(|_| std::path::PathBuf::from("./data"));
            let lib = Library::open(&data_dir.join("library.db"))
                .map_err(|e| format!("open library: {e}"))?;
            app.manage(LibraryState(Mutex::new(lib)));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::list_songs,
            commands::import_text_song,
            commands::import_image_song,
            commands::enhance_gray_preview,
        ])
        .run(tauri::generate_context!())
        .expect("error while running JianpuBook");
}
