# MarkdownEditor

A desktop Markdown editor based on Tauri + React + TypeScript.

## Features

- Markdown-first editing and reading experience:
  - Source mode
  - Preview mode
  - Markdown files support optional split preview in Source mode (non-markdown files stay single-pane)
  - Markdown render pipeline with GFM + code highlighting + relative image support
  - Preview TOC uses rendered headings as source of truth, so TOC click and destination stay consistent.
  - TOC jump keeps a safe top offset to avoid heading lines being covered near the top of Preview.
  - YAML frontmatter is rendered as a dedicated readable block in Preview (preserves original line breaks).
  - Sync scroll toggle is available only when Markdown split view is enabled
  - Toolbar hierarchy is stabilized:
    - `Source / Preview` remains centered as the primary control.
    - Markdown quick-action icons are shown as lightweight ghost icons to avoid visual noise.
    - Split-off state uses a dashed-divider icon for clearer meaning.
  - Markdown quick actions in Source mode:
    - Insert table, task list, and fenced code block.
    - Fold heading at cursor and unfold all headings.
    - Keyboard shortcuts: `Ctrl+Alt+T/L/K/F/U`.
    - Quick-action row can be collapsed/expanded from the top toolbar and the state is persisted.
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
  - Header actions are grouped: import/pin actions and filter toggles are visually separated.
  - Star state is shared across Files and Folders for the same path.
  - Files list membership stays independent: starring in Folders does not auto-add into Files.
  - Star icon is rendered as a solid star for clearer state.
  - In `Star` filter mode, folder ancestors of starred files stay visible and are marked with `*` in Folders (without forcing expand/collapse changes).
  - Long filenames are truncated with ellipsis and full-path tooltip in both sections.
  - Files rows and folder-tree file rows share unified layout: fixed star column + consistent text color + hover/active feedback.
  - Right-click file: open / rename (name only, extension unchanged) / duplicate (custom name) / delete / star / remove / copy path / open containing folder.
  - `Open Containing Folder` works for file rows in both `Files` and `Folders`.
  - On Windows/macOS it reveals the target file in system explorer; on Linux it opens the parent directory.
  - Right-click any directory node: copy path / open directory / refresh (plus unpin when the directory is pinned).
  - Right-click directory supports `New File`; when no extension is provided, `.md` is appended by default.
  - Context menu is anchored to the selected row (prefers right side, falls back to left when needed) and stays in viewport.
  - The right-click target row is outlined so the action target is always clear.
  - Right-click target outline is layered above neighboring row hover states to avoid border clipping.
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
  - Markdown formatting symbols (for example `##`, `**`, `[]()`) are tuned across all themes.
  - Dark is the only deep theme and uses a dedicated markdown/syntax palette for readability.
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
- NSIS installer: `src-tauri\\target\\release\\bundle\\nsis\\MarkdownEditor_0.1.0_x64-setup.exe`
- MSI installer: `src-tauri\\target\\release\\bundle\\msi\\MarkdownEditor_0.1.0_x64_en-US.msi`

## Distribution

- For sharing with other users, send the installer (`.exe` or `.msi`) instead of the raw `markdown-reader.exe`.
- Recommended package for most Windows users:
  - `src-tauri\\target\\release\\bundle\\nsis\\MarkdownEditor_0.1.0_x64-setup.exe`
- If taskbar icon still shows old cache after upgrade, unpin and pin the app again.

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
- On startup restore, pinned directories/files, expanded directory nodes, and the last opened file are restored; active file reveal is maintained without forcing it into `Files`.
- On startup, the app auto-reveals the active file path in Folders by expanding only its ancestor chain; other folders remain collapsed by default.
- Sidebar hide/show keeps tree instance mounted, preserving folder expansion and current selection when reopened.
- Path handling uses a shared normalization utility (including Windows drive/root and long-path prefix cases) to keep imported list, folder tree, and star state matching reliably.
- Main window icon is explicitly set at startup on Windows to ensure taskbar/thumbnail icon consistency.

## UI Guidelines

- Context-menu behavior standards for Explorer are documented in:
  - `UI_CONTEXT_MENU_GUIDELINES.md`
