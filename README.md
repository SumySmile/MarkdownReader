# MarkdownEditor

A desktop Markdown editor based on Tauri + React + TypeScript.

## Features

- Markdown-first editing and reading experience:
  - Source mode
  - Preview mode
  - Markdown files support optional split preview in Source mode (non-markdown files stay single-pane)
  - Markdown render pipeline with GFM + code highlighting + relative image support
  - Sync scroll toggle is available only when Markdown split view is enabled
- Sidebar supports both:
  - Folder explorer (for openable files in pinned directories).
  - File panel (imported files list, independent from folder tree).
  - Explorer panel can be hidden/shown from the sidebar divider toggle.
- Pinned directory safety:
  - Directories with no openable files are skipped when pinning.
  - Stored pinned directories are re-validated on startup and invalid ones are removed.
- File panel capabilities:
  - Import single or multiple files (toolbar icon / `Ctrl+O`).
  - Explorer uses grouped cards: `Files` and `Folders`.
  - `Files` panel supports collapse/expand (default expanded).
  - Empty state visuals are unified between `Files` and `Folders` cards.
  - Quick filters use icon toggles in the header:
    - `MD` filter icon (left of Import Files) toggles markdown-only view.
    - `Star` filter icon toggles starred-only view.
  - Star files and pin starred files to top.
  - Starring a file from the folder tree syncs to the Files panel.
  - Star icon is rendered as a solid star for clearer state.
  - Long filenames are truncated with ellipsis and full-path tooltip in both sections.
  - Files rows and folder-tree file rows share unified layout: fixed star column + consistent text color + hover/active feedback.
  - Right-click file: open / rename / star / remove / copy path / open containing folder.
  - Right-click any directory node: copy path / open directory / refresh (plus unpin when the directory is pinned).
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
  - Includes default fallback highlighting so non-markdown code files keep visible syntax colors.
  - Unknown file types fall back to plain text highlighting.
  - Markdown formatting symbols (for example `##`, `**`) are tuned for better visibility in dark theme.
- Mode behavior for non-markdown files:
  - Editable text files are locked to Source mode.
  - Read-only text files are locked to Preview mode.
  - Markdown files keep full Source/Preview flow and optional split behavior.
- Text preview highlighting:
  - Preview mode for supported text files uses extension-based syntax highlighting when possible.
  - Falls back to plain text rendering if highlighting is unavailable.
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
- Dark theme palette is tuned for readability with slightly lighter deep gray backgrounds.
- If startup or preview content seems stale after rapid file switching/importing, request sequencing and stale watcher callback guards are included to prevent old file reads from overriding current content.
- On startup restore, pinned directories/files, expanded directory nodes, and the last opened file are restored; the active file is re-added to the imported file list and scrolled into active view.
- Path handling uses a shared normalization utility (including Windows drive/root and long-path prefix cases) to keep imported list, folder tree, and star state matching reliably.
