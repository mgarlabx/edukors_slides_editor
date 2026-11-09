# Changelog

## 26.11.9

- **Rulers** above and to the left of the slide, in slide units (1600 × 900). Pressing a ruler shows a guide line across the slide while the mouse is held.
- **Position and size while dragging:** moving an object shows its top and left, resizing shows its height and width, in slide units, just outside the object.
- **Group and ungroup** any objects (texts, images, shapes, texts inside other blocks) with the button on the format bar, the right-click menu, ⌘G and ⇧⌘G. A group never changes the slide's layout; a click on a member selects the group, a second click only that member; a drag, the handles and alignment act on the whole group; ⌘D duplicates it as a new group.
- **Format bar in one row:** alignment, paragraph (lists and line spacing), strikethrough/subscript/superscript and stacking order are now dropdown menus.
- **Pasting an image file copied in the Finder** (or Explorer) inserts the image itself, not its icon.
- **Pasted texts keep their font's own name** (older copies renamed it); a font the destination already has is not added again.

## 26.11.8

- **Slide master:** the base selected in the panel is the active one (a ✓ badge marks it); the active tab (Bases or Layouts) is now clearly highlighted.
- **Resize several objects together** from the handles on the group's outline (images keep their proportions).
- **Pasting into a text keeps the copied font,** size, weight and color.
- **Copying text from the assistant's messages** copies the text, not the selected slides.
- **One Present window at a time;** it closes with its presentation's tab and when the app quits.
- **The assistant can look at images inside the presentation** (`read_image`).

## 26.11.4

Versions are now numbered by date (YY.M.D), as in the other Edukors apps.

- **Same interface as the other Edukors apps:** title bar, toolbar, tabs, Open/Save/Recent, the AI assistant panel, settings, help, terms, light/dark/system theme and the update notice now come from Edukors Common. The format bar, shape picker and right-click menu are Common's (with align and distribute for several objects).
- **New native format `.eslx`.** `.esf` presentations and PowerPoint `.pptx` files open as imports (the originals are never written); Save writes only `.eslx`. Files up to 1 GB open, with an "Opening…" indicator.
- **Editable PPTX export:** text, pictures and shapes become native PowerPoint objects (replaces the export of one image per slide).
- **Interface in five languages:** Portuguese, English, Spanish, Chinese and Hindi (help and terms included). Exported HTML stays in English.
- **Layouts locked on the slide:** everything that comes from a layout, its texts included, is part of the layout; the slide's own text and objects stay editable.
- **Faster canvas:** images and fonts are shared between the canvas and thumbnails, and a new slide replaces the previous one only when ready (no flash).
- **PowerPoint import, much closer to the original:** slide, layout and master backgrounds (color, gradient, picture); the master and layouts become the presentation's base and layouts (pictures on every slide); groups; preset shapes (stars, explosions, arrows, polygons, connectors) and custom shapes as editable shapes; text styles inherited from placeholders and the master; text boxes no longer clip their text when moved.
- **Large presentations stay fast:** editing no longer re-checks every image or sends the whole file for the draft after each change; saving no longer decodes and recompresses every image (images are stored under their own type), so saving 130 MB takes about half a second instead of several.
- **"Saving…" and "Exporting…" indicator** (from Edukors Common) appears as soon as Save, Replace or Export is clicked, above the dialog.
- Drafts and recovery after a crash, a question before saving over a file changed on disk, and resizable side panels.
- Save As and Export to a file that already exists ask first, with only Cancel or Replace.

## 1.3

From this version on, releases are named X.Y (1.3, 1.4…).

- **AI assistant, same look as the Graph editor:** accounts, service setup, model and effort, usage, conversations and questions now come from the shared Edukors interface ([`@edukors/ai-ui`](https://github.com/mgarlabx/edukors_ai_cli/tree/main/packages/ui) 0.1.4, on `@edukors/ai-cli` 0.2.2), in Portuguese, English and Spanish.
- **Review before applying:** the assistant's changes can wait for you as a proposal, to accept or discard, or be applied directly once validated. New installs start in review; existing setups keep applying directly.
- **Installing Claude Code or Codex:** when a service is missing, Settings shows its official guide and the install command for your system, to copy; the editor never runs it.
- **Usage** shows the account's limit windows as the service reports them. Each conversation keeps the account it ran on. Removing an account signs it out first.
- **Recent files:** a recent file that was moved or deleted shows "File not found", with the choice to remove it from the list.
- **Interactive questions:** without a questions server, a presentation with questions is not exported to HTML; the export shows a warning with a shortcut to Settings (PDF and PPTX remain available).

## 1.2.0

- **Terms of use** (the MIT license, explained, in Portuguese, English and Spanish): the first time it opens, the editor asks you to accept them, or to decline and quit; they stay in Help. A new version of the terms asks again.
- **Help** (icon on the toolbar, also in the Help menu): a quick guide with the first steps and the shortcuts, the full teacher's guide and the terms of use, in Portuguese, English and Spanish, with the editor's version.

## 1.1.0

- **AI assistant through the shared Edukors AI library** ([`@edukors/ai-cli`](https://github.com/mgarlabx/edukors_ai_cli) 0.2.0). Claude Code and Codex, with accounts made and signed in from **Settings → AI assistant** (the browser opens; otherwise the address is shown, with a field for Claude's code) and shared with the other Edukors apps. Accounts from 1.0 are not carried over: sign in once again. Kimi, Kiro, OpenCode and Antigravity are no longer offered.
- The assistant changes the presentation through one tool, `apply_changes`: every proposal is validated and rendered, problems go back to it to fix, and what it accepts is applied when its answer ends, as one undo step. It asks its questions during the answer, with options in the chat.
- It works in the presentation's folder with its provider's own file and web tools, and commands where a sandbox confines them: on Windows, Claude Code without commands; Codex on macOS.
- **Settings → AI assistant** has the accounts first and, under **Advanced**, the instructions for the assistant, your own MCP servers (each call asks for permission) and a skills folder.
- **Interactive questions:** there is no shared Edukors server any more; each presenter hosts the [questions server](server/poll/README.md) and enters its address in Settings.
- Installers: universal macOS app (Apple Silicon and Intel), Windows and Linux for x64, with stable download names (`Edukors-Slides-Editor-mac.dmg`, `-windows.exe`, `-linux.AppImage`, `-linux.deb`).

## 1.0.0

- First public release: macOS (signed and notarized), Windows and Linux.
