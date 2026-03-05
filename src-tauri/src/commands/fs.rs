use serde::Serialize;
use std::fs;

#[derive(Serialize)]
pub struct DirEntry {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
}

#[tauri::command]
pub async fn read_dir_sorted(path: String) -> Result<Vec<DirEntry>, String> {
    let read = fs::read_dir(&path).map_err(|e| e.to_string())?;
    let mut entries: Vec<DirEntry> = read
        .filter_map(|e| e.ok())
        .map(|e| {
            let is_dir = e.file_type().map(|t| t.is_dir()).unwrap_or(false);
            DirEntry {
                name: e.file_name().to_string_lossy().into_owned(),
                path: e.path().to_string_lossy().into_owned(),
                is_dir,
            }
        })
        .collect();

    // Directories first, then alphabetical (case-insensitive)
    entries.sort_by(|a, b| {
        b.is_dir
            .cmp(&a.is_dir)
            .then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase()))
    });

    Ok(entries)
}
