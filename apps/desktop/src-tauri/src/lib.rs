mod commands;
mod library;

use library::{AppPaths, Library, LibraryState};
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
            std::fs::create_dir_all(data_dir.join("thumbs")).ok();
            let lib = Library::open(&data_dir.join("library.db"))
                .map_err(|e| format!("open library: {e}"))?;
            app.manage(LibraryState {
                library: Mutex::new(lib),
                paths: AppPaths { data_dir },
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::list_songs,
            commands::import_text_song,
            commands::import_images,
            commands::enhance_preview,
            commands::save_enhance_params,
            commands::load_enhance_params,
        ])
        .run(tauri::generate_context!())
        .expect("error while running JianpuBook");
}
