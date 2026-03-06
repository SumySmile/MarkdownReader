# MarkdownEditor

A desktop Markdown editor based on Tauri + React + TypeScript.

## Features

- Open and edit markdown files in Source / Split / Preview modes.
- Sidebar supports both:
  - Folder explorer (for markdown files in pinned directories).
  - File panel (imported files list, independent from folder tree).
- File panel capabilities:
  - Import single or multiple files (`+ File` / `Ctrl+O`).
  - Collapse/expand panel (default expanded).
  - Star files and pin starred files to top.
  - Right-click file: remove file from panel.
  - Right-click Files header: clear unstarred files.
- Supports multiple markdown extensions:
  - `.md`, `.markdown`, `.mdown`, `.mkd`, `.mkdn`, `.mdx`, `.rmd`, `.qmd`
- Supports opening markdown file directly via OS file association (after installer install).
- Launcher scripts for fast startup with no console window:
  - `MarkdownViewer.bat`
  - `QuickStart.bat`

## Install / Build

```powershell
npm install
npm run tauri build
```

Build outputs:

- App executable: `src-tauri\\target\\release\\markdown-reader.exe`
- NSIS installer: `src-tauri\\target\\release\\bundle\\nsis\\markdown-reader_0.1.0_x64-setup.exe`
- MSI installer: `src-tauri\\target\\release\\bundle\\msi\\markdown-reader_0.1.0_x64_en-US.msi`

## Development

```powershell
npm run tauri dev
```

## Notes

- App window title: `MarkdownEditor`.
- Product name in packaging metadata: `MarkdownEditor`.
- If startup or preview content seems stale after rapid file switching/importing, this version includes open-request sequencing to prevent old file reads from overriding the current file content.
