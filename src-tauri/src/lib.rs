mod commands;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            commands::fs::read_dir_sorted,
            commands::fs::read_text_file,
            commands::fs::write_text_file,
            commands::fs::get_launch_args
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
