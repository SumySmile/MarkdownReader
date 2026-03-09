# Context Menu UI Guidelines

This document defines context-menu behavior for the Explorer area (`Files` and `Folders`) so interactions stay consistent across themes and future features.

## 1) Positioning

- Default anchor: menu opens on the right side of the focused row.
- Horizontal fallback: if the right side overflows viewport, open on the left side.
- Vertical alignment: align menu top to row top; if overflow at bottom, shift upward to keep fully visible.
- Recompute position every open event; never reuse previous menu coordinates.
- Keep a minimum viewport safety margin of `8px`.

## 2) Target Feedback

- While a context menu is open, the target row must show a clear context state (for example, `ring-1` + accent color).
- Context highlight is removed immediately when menu closes.
- Only one row may be in context state at a time.

## 3) Sizing & Density

- Use compact width presets:
  - File menu: `176-196px`
  - Directory menu: `168-188px`
  - Panel menu: `156-172px`
- Row height target: `28-32px`.
- Avoid long labels; use short verb-first text (`Open`, `Rename`, `Duplicate`, `Delete`).
- Avoid wrapping menu item text.

## 4) Item Grouping

- Order by usage frequency:
  1. Primary actions (`Open`, `Rename`, `Duplicate`)
  2. Utility (`Star`, `Copy Path`, `Open Containing Folder`)
  3. Destructive (`Delete`)
- Use separators between groups.
- Keep action order stable across `Files` and `Folders` when action meaning is the same.

## 5) Safety & Destructive Actions

- `Delete` should stay in the last group and use danger color token.
- If action is irreversible, require confirmation.
- Do not expose destructive actions in contexts where source isolation is required (example: `Files`-only operations must not run for `Folders` rows).

## 6) Accessibility & Keyboard

- `Esc` closes menu.
- Arrow keys navigate menu items.
- `Enter` executes selected item.
- Disabled actions remain visible but non-interactive.
- Add `aria-label` for icon-only entry points.

## 7) Layering & Overlap

- Context menu layer must be above explorer toggle handle and other floating controls.
- Tooltip should not overlap active menu content; when menu is open, tooltip priority is lower.
- Avoid any clipping by parent containers (`overflow` handling or fixed-layer container).
- On viewport resize or container scroll, close the menu immediately to avoid stale anchoring.

## 8) Theme & Contrast

- Use semantic tokens, not hard-coded colors:
  - `--bg-overlay`, `--bg-divider`, `--text-secondary`, `--accent-primary`, `--accent-danger`
- Ensure target contrast in all themes (Light, Mint, Gray, Dark).
- Dark mode should avoid low-contrast blue text for primary actions and links.

## 9) Performance Rules

- Opening menu must not trigger expensive tree recalculation.
- Keep layout stable (no explorer width jump, no scrollbar jitter).
- Menu placement logic should be pure and deterministic.

## 10) Acceptance Checklist

- Right-clicking any visible row places menu on the row's right side unless overflow.
- Repeated right-click on different rows does not drift menu position.
- Context row highlight always matches current menu target.
- Menu is never clipped and is always above sidebar toggle control.
- `Files` and `Folders` menus keep consistent visual language and action order.
- Destructive actions are isolated and safe.

## 11) Current Project Defaults (2026-03)

- `right-side first` anchor is enabled.
- Viewport clamping with margin is enabled.
- Row context highlight is enabled for file rows.
- Remaining UX tuning should follow this document before adding new context actions.
