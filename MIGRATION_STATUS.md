# Migration status — 02/11/2026 (end of the second session, with the user's first test round)

## Scope — authoritative

Multiple inputs, one native save format: **ESLX only**. ESF and PPTX open as imports (unsaved tabs, originals never written). Exports (HTML player, PDF, PPTX of images) are a separate command and never overwrite the document or an imported source. Interface in **five languages**: pt, en, es, zh, hi.

## Done

- **The production app now runs on Edukors Common.** `src/main/index.ts` (ESM, `dist/main.mjs`) calls Common's `startDesktopApp` (appId `slides`, `.eslx`, opens `.esf`/`.pptx`) and adds only what Slides needs: the `esf-frame:` scheme, a second preload (`dist/preload.cjs`, `window.slides`, registered with `session.registerPreloadScript`, exposed only on `dist/index.html`, sender checked on every call), exports with fonts/minify, Present, templates, clipboard, interactive question server, file fingerprints and drafts. Common was not modified.
- **Renderer** `src/common/editor.tsx` + `config.ts` + `slides.css`, mounted inside Common's shell (`dist/index.html` → `config.js` → Common `boot.js` → `slides.js`). Common owns title bar, toolbar, tabs, Save/Open/Recent, AI panel and settings, help, terms, update notice. Slides renders by portals: slide list in the left panel, canvas + notes in the workspace, format bar in the context slot (kept open as a fixed row), Present/view switch in the toolbar, Export next to Save, link/question in Insert, status in the status bar, two settings sections (Interactive questions, This presentation).
- Per-document state `src/common/store.ts` (undo/redo per document, selection, slide master view). AI tools `src/common/assistant-tools.ts`: `read_document`, `apply_changes` (revision-checked, one undo step, never deletes slides), `import_image` (https image download through the main process). The agent works in Common's private folder (no `documentPath`).
- Regained from the old ProjectStore: confirm before saving over an `.eslx` changed outside the app (in-page dialog), drafts every 2 s while modified, recovery offer after a crash.
- Legacy removed: old React shell (`App.tsx`, `AssistantSettings.tsx`, `Help.tsx`), old assistant (`main/assistant.ts`, `ai.ts`, `mcp.ts`), `@edukors/ai-cli`, `@edukors/ai-ui`, `electron-updater`. Backups with the working-tree patch and the files: `migration-backups/retired-legacy-20261102-184546/` (also the earlier Common prototype under `prototype/`).
- Help: full guide revised in pt/en/es; guide, terms and quick guide added in zh/hi; TERMS_VERSION 2026-11-02.
- Packaging: SDK platform binaries excluded (as in the Text Editor; the installed Claude Code/Codex CLI is used), which also fixed the universal build. CI runs typecheck, unit tests, headless Chrome suite, inheritance and the Electron smoke.

## After the user's first test (same day)

- **Version by date**, as in the other Edukors apps: `package.json` 26.11.2, shown as v.26.11.02; `build.mjs` sets it from the date (`--version=` overrides; `--no-bump`/CI keep it). MSIX 26.11.2.0 > 1.3.0.0.
- **Large PowerPoint/ESF**: Common's host opens other formats only up to 50 MB. The main process wraps `dialog.showOpenDialog`: when Common's Open picks a larger `.pptx`/`.esf` (≤ 1 GB) Slides reads it and sends it to the page (`slides:open-large`), which imports it; Common sees a cancelled dialog. Not in Recent; double-click in Finder still has Common's 50 MB limit.
- **Common's controls**: the format bar is `EdukorsFormat` (text, align, valign, shape, image, link, arrange) applied through the canvas frame; Insert shape and the shape type use `EdukorsShapes.pick` (icons); the canvas context menu is `EdukorsContextMenu`. Canvas now accepts `opacity` and reports text alignment and opacity.
- **Editable PPTX export** (user request; replaces “PPTX of images”): `src/shared/pptx-extract.ts` (in the hidden render window: text blocks with runs, images with crop, Slides shapes, solid boxes) + `pptx-writer.ts` (native `p:sp`/`p:pic`, background picture of what remains). Save still writes only .eslx.
- Fixed: the canvas frame took the keyboard while a Common picker/menu was open (closed it), and must still take it after toolbar clicks.
- DMG: `release/Edukors-Slides-Editor-26.11.2-mac-universal.dmg`, SHA-256 `4dd4eb743de6794118a626148bc2b88c4e06460b35260c0191da6bbb58930784`. Smoke 17/17 on dist and on the packaged app.

## Second test round (same day)

- Import notices can be removed (Remove notices, one undo step). Saving shows "Processing…" in the status bar until Common's toast or saved event. Notes have no label (placeholder only).
- Speed: the document state no longer deep-copies or stringifies image data on every change (assets are shared and compared by ID); drafts are packed in the main process every 3 s of quiet.
- Opacity works for shapes, images and boxes (the frame accepts `opacity`). Style and stacking-order changes apply in place, without reloading the canvas frame (no flash).
- Right click uses Common's object menu: clipboard, duplicate, delete, order; with several objects, align top/middle/bottom/left/center/right and distribute (3+); edit text; on an empty spot, paste and insert. The canvas implements `arrange` and `edit`.
- Legacy UI replaced by Common's: all dialogs (gallery, layouts, template name, error, question editor) use Common's file-dialog structure and small buttons; Export uses `EdukorsFileDialogs.exportAs` (next to the document, progress and errors in the dialog; the main process writes directly); slide-list tools and template buttons are Common `.tool` buttons with Common icons and tooltips; `confirm()` replaced by an in-page dialog; the old React shell CSS, tokens, logo, tooltips, pickers and context menu were removed.
- Not reproduced: base/layout objects selectable on a slide (click, double click, ⌘A, Tab, marquee and right click all leave them locked in a new presentation). Needs the user's example.
- DMG `release/Edukors-Slides-Editor-26.11.2-mac-universal.dmg`, SHA-256 `3c52848d2194c1338b95284288f4b7e6d2c83c64abb1ca0621e64076f8cb060e`, smoke 17/17 dist and packaged; installed in /Applications (previous copies in the Trash).

## Third test round (same day)

- Layout texts locked on slides (all layout content is `data-esf-locked`; inheritance test updated: canvas edits of a layout field are refused, a field's own text from the assistant or a layout change is still kept).
- Frames: images and fonts served from the frame scheme (registered once per presentation) instead of base64 in every canvas and thumbnail; a new frame loads behind the visible one and replaces it when ready (no flash). On the user's 26-slide, 9.4 MB sample (a copy in test-results/), switching slides went from 170–370 ms to 80–130 ms in the hidden Electron app; dragging showed no long tasks; a text edit still costs one ~60 ms task.
- DMG SHA-256 `7181136f1d64d7124b65b59c1cf65e46001dd611e80d9a90578600161f9774c1`, smoke 17/17 dist and packaged, installed in /Applications.

## Verification (this session)

- Typecheck clean. `node scripts/test.mjs`: 56/56.
- `node scripts/test-common-headless.mjs` (real page over HTTP, frames from a second origin): 7 store/tool tests + gallery, canvas edit/bold, slide list, undo/redo, keys, notes, slide master, layouts, questions/export rule, conversations, settings, pt/zh/hi labels and help, ESF/PPTX → Save → Save As writes ESLX only, sources unchanged.
- `node scripts/test-inheritance.mjs`: all pass, ESLX round trip included.
- `node scripts/smoke-electron.mjs` (hidden windows, ESF_HIDDEN) on `dist` **and on the packaged universal app from the DMG**: 14/14 (start, both bridges, esf-frame canvas, Save .eslx, ESF and PPTX imports, Recent, Export HTML and PDF, Present window, template, draft, external-change prompt, crash recovery).
- DMG: `release/Edukors-Slides-Editor-1.3.0-COMMON-TEST-mac-universal.dmg`, SHA-256 `4399af3bb0b1cddd1b8f68dcceb866a6da0b79558d87490308f249448cee931e`, Developer ID signed (hardened runtime), **not notarized**.

## Pending

1. User homologation of the DMG. No release, tag, push or store submission was made.
2. Editable PPTX: checked with Quick Look and by reopening in the app, not yet opened in PowerPoint itself; notes, animations, tables and rotation are not exported.
3. Old Electron scripts written for the old shell were not ported: `e2e.mjs`, `test-canvas.mjs`, `test-master-editor.mjs`, `perf.mjs`, `store-screenshots.mjs`, `test-poll.mjs`, `test-poll-live.mjs`, `test-eslx.mjs` (`test-motion.mjs` and `test-poll-server.mjs` test the player and still apply). Store screenshots need a new script.
3. `ProjectStore` in `src/main/projects.ts` is no longer used by the app (only `readDeck`/`writeDeck`/`serialize`); its tests remain. Remove it with its tests in a cleanup.
4. Known differences from the old shell (Common decisions): macOS menu is Common's minimal one (app, Edit, Window), shortcuts are handled by the page; theme light/dark/system; update check only notifies with a download link (no auto-install).
5. In zh/hi the in-app Present window falls back to English (the player has words in pt/en/es only). Exported HTML is always English.
6. PPTX import remains partial (notices are shown and saved). Windows/Linux packages, Microsoft Store and App Store not built or tested in this session.
