# MarkdownEditor

A desktop Markdown editor based on Tauri + React + TypeScript.

## Features

- Markdown-first editing and reading experience:
  - Source mode (with optional split preview)
  - Preview mode
  - Markdown render pipeline with GFM + code highlighting + relative image support
- Sidebar supports both:
  - Folder explorer (for openable files in pinned directories).
  - File panel (imported files list, independent from folder tree).
- File panel capabilities:
  - Import single or multiple files (`+ File` / `Ctrl+O`).
  - Collapse/expand panel (default expanded).
  - Star files and pin starred files to top.
  - Right-click file: open / star / remove / copy path / open containing folder.
  - Right-click Files header: clear unstarred files.
- AI-skill oriented file support:
  - Editable whitelist includes common markdown/code/config/script files such as:
    - `.md`, `.markdown`, `.mdx`, `.py`, `.ts`, `.tsx`, `.js`, `.jsx`, `.json`, `.yaml`, `.toml`, `.sh`, `.ps1`, `.env`, etc.
  - Read-only preview for selected types (for example `.log`, `.csv`, `.xml`, `.sql`, lock files).
  - Path protection: files under `.git/` and `node_modules/` are preview-only.
- Performance guardrail:
  - Files larger than `1MB` open as preview-only to avoid editor lag.
- Source editor syntax highlighting:
  - Language is selected by file extension (e.g. `.py`, `.ts`, `.tsx`, `.js`, `.json`, `.yaml`, `.sh`, `.ps1`).
  - Unknown file types fall back to plain text highlighting.
- Supports opening markdown file directly via OS file association (after installer install).
- Launcher scripts:
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

`QuickStart.bat` starts development mode directly, so each launch uses the latest local code.

## Notes

- App window title: `MarkdownEditor`.
- Product name in packaging metadata: `MarkdownEditor`.
- If startup or preview content seems stale after rapid file switching/importing, request sequencing and stale watcher callback guards are included to prevent old file reads from overriding current content.
