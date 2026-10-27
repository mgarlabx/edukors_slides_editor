# Edukors Slides Editor

Desktop editor for HTML presentations. Each slide is a small HTML/CSS/JS document; the main output is a **single HTML file** that opens offline in any current browser. PDF and PPTX are available as supporting static exports.

Status: **local MVP for macOS (version 0.2.1)**. Design decisions, rules and open items are in `CLAUDE.md`.

The repository also contains the **interactive questions server** in [`server/poll/`](server/poll/README.md): PHP + MySQL, ready for anyone to host their own and point the app to it.

## Usage

The packaged application is at `release/Edukors Slides Editor.app`. It does not require Node, Python or Chrome.

- To open it: double-click the `.app` (or drag it to Applications, if you like). The first time it opens, macOS registers the association with `.ESF` files; from then on, double-clicking an `.ESF` opens the presentation with the file's folder as its root.
- The app has an *ad hoc* (local) signature, without notarization. On another machine, Gatekeeper may block it until it is signed for distribution.

### The `.ESF` file

A presentation is **a single** `.ESF` file, a standard ZIP (like a PPTX):

```text
My presentation.ESF
  manifest.json               order, metadata, references, packageVersion
  masters/<id>/{master.html,theme.css}  layouts/<id>.html  slides/<id>/{content.html,style.css,behavior.js,static.html}
  images/  fonts/             only the images and fonts in use (names are content hashes)
  ai/system-prompt.md         context for the talk (optional)
  .edukors/ai/conversations.json   assistant conversations (no account data)
```

On save, the package keeps only what the presentation uses: images and fonts that no slide, base or layout refers to any more are dropped, and files left in the workspace (the assistant's downloads, screenshots, research and scripts) do not go into the `.ESF`, so it stays as small as possible. Copy, move, rename or delete just the file; several presentations can live in the same folder. While editing, the app works in an internal area (`userData/workspaces/`) and recompresses the file on save: a temporary ZIP next to the destination is verified and only then replaces the original, which is never truncated. Unsaved changes are kept in an internal draft and recovered after a crash. If the `.ESF` changes or disappears outside the app, saving offers **Save As** or **reopen the external version**. Invalid packages, packages with unsafe paths or symbolic links, or packages above the limits (20,000 files, 512 MB per file, 2 GB in total) are rejected.

### Editing on the slide

The canvas works like Google Slides. Objects are texts, images and any visible box (background, border or shadow, such as cards). Invisible layout containers are ignored.
- **Select:** click an object. Dragging from an empty area draws a rectangle that selects the objects entirely inside it. Shift or ⌘ + click add or remove objects, and ⌘A selects all. Tab / Shift+Tab cycle through the objects; Esc clears the selection. A multiple selection has a shared outline and a handle to move the group.
- **Move:** dragging moves all selected objects (in a text being edited, use the small square at the corner of the selection). Pink guides snap edges and centers to other objects and to the slide. While dragging, Shift constrains the movement to the dominant axis; Alt/Option suspends snapping. Esc cancels the gesture and restores the previous position and selection. Arrow keys nudge by 1 px (Shift: 10 px), with one undo step per sequence.
- **Edit text:** clicking a text edits it in place. Inside an object (for example, a card), the 1st click selects the object and the 2nd enters the text; a double-click goes straight in. Enter breaks the line; Esc or clicking outside finishes. Existing formatting (colors, bold) is kept.
- **Format legacy objects:** font, size, color, border, background and shadow are also available for texts and objects of older presentations. The bar shows the theme styles and embedded fonts, without requiring `data-manual`. SVG diagrams are edited as whole images.
- **Resize boxes:** texts and visible boxes have handles on the corners and sides; the text can grow as lines wrap.
- **Resize images:** select the image and drag one of the four corner handles. The aspect ratio is preserved; Shift allows free resizing. Esc cancels and Undo reverts the whole gesture.
- **Delete:** with the focus on the slide list, Delete/Backspace delete the selected slides (the list does not scroll; the selection moves to the next slide). On the canvas, they delete only the selected objects, and while editing a text they delete text. Also: Slides menu → Delete, or the Delete button on the toolbar.
- **Undo and images:** each gesture is one undo step. An inserted image fills the layout's empty image slot or, if there is none, is placed freely at the center of the slide.

Code changes are left to the AI assistant.

### Slide master: bases and layouts

- **New slide:** the button (or ⇧⌘N) shows the layout thumbnails; double-click or **Insert**.
- **Layout of each slide:** every slide uses a layout (name in the footer); clicking the name, or Slides → Change layout…, changes it. Texts go to the fields of the new layout and objects inserted by hand are kept; freely written slides (without fields) keep their content and only change layout.
- **Slide master** (toolbar or Presentation → Slide master): two tabs, **Bases** (visual alternatives) and **Layouts** (shared content arrangements). Regular layouts follow the **active** base (CSS and objects behind the content). Slides pasted from another presentation keep a local copy of their source base and layout. The check below the thumbnail, next to the base's name ("Use this base"), applies the chosen base to all layouts, including imported ones. The toolbar above the thumbnails offers the actions of the selected tab: create, rename (also by double-clicking the name) and delete. The same new-slide icon creates bases, layouts and presentation slides. At least one base and one layout always remain. Changes, insertions and deletions in a base/layout are reflected in the slides that use them. Custom text and the slide's own objects do not change the base or other slides.
- **Copy/paste in the slide master:** select a base or layout in the corresponding tab to copy, cut or duplicate the whole item. Pasting a whole slide in this mode creates a new layout.
- **Copy/paste:** slides carry the theme, base, layout, images and embedded fonts. Copied objects keep formatting, embedded fonts, backgrounds and animations; they get new identities so they do not interfere with existing objects. Changing or deleting a layout preserves texts with no destination field and the slide's own objects.
- **Templates:** File → Save as template…; rename or delete them on the New presentation screen.

### Exports

The app asks where to save (by default, next to the `.ESF`, with its name). When it finishes, an "Exported" notice appears.

**Present** (in the app) opens the selected slide with navigation only; the presentation tools exist only in the exported HTML. All controls and messages generated in the exported HTML are in English, including notices, the presenter panel, credits and interactive questions. The content written on the slides keeps its language.

If the browser reports a preference for reduced motion, the exported HTML offers **Enable animations** or **Keep current setting** (in the app, the labels follow the interface language). Enabling restores CSS animations for that session only, including the following slides, without changing the system or the `.ESF` file. Without reduced motion, no notice appears. This applies to **Present** and to newly exported HTML; older HTML files must be exported again.

When creating a presentation, choose the folder; the `.ESF` file gets the presentation's name (with a `-2`, `-3`… suffix if it already exists).

| Format | Content |
| --- | --- |
| HTML | Single file, embedded resources and animations. Controls: bars at the corners (hot corners), dot trail with preview, pen, highlighter, text, magnifier, infinite scrolling whiteboard (trackpad/wheel, arrow keys, Space+drag, or dragging empty space with Move; shapes, arrows, colors, move, eraser, undo), presenter panel and full screen; position and whiteboard are saved in the browser. No editing commands. Regular slides work offline; interactive questions need internet access and a presenter key. |
| PDF | One page per slide, in its final state, **as an image** (text is not selectable). |
| PPTX | One image per slide; not editable in PowerPoint. |

### Interactive questions

On the desired slide, use **Insert → Interactive question** (or the chart icon in the Insert section). Choose multiple choice (2–5 options), word cloud or open answer. The activity takes up the slide area; run the same command again to edit or remove it. The configuration is saved in the `.esf` and follows copying, duplicating and undo/redo.

Answers go through an **interactive questions server**, a PHP + MySQL backend that anyone can host. The code is in [`server/poll/`](server/poll/README.md), with the installation guide. Enter the address in **Settings → Interactive questions**, which also tests the connection; the Edukors service is at `https://edukors.org/poll`. The field **starts blank**: without a server, exporting shows a warning and, in the HTML, the question says the server is not configured, without touching the network. Each exported HTML uses the server configured at the time of export.

In the exported HTML, opened by double-click, the QR code appears blurred with a closed padlock. The first time you click the **padlock**, the player asks for the **presenter key**, registered in the server's database. It can be pasted (paste button or ⌘V/Ctrl+V) and the eye button shows what was typed. The server returns a **12-hour** session, stored in that browser's `localStorage`; the key itself is never stored. After that the padlock opens and the QR code becomes readable. It takes students to the server's mobile page (with the Edukors logo), where they choose A–E or write an answer; the question and the options stay on the projection. The counter updates during collection. Click the **padlock** again to close; then use the **chart icon** to see bars with percentages, a cloud/list of frequencies or comments. The **New round** icon opens another room. A discreet button at the bottom left of the question downloads all the room's answers as **CSV** (time in UTC and answer; for multiple choice, the option's letter and text), without identifying participants. In open-answer and word-cloud questions, the question is on the left and the QR code on the right. If the session expires or the key is revoked, the player says so and asks for the key again.

Each activity/round uses an independent room, created by the server and tied to the key of whoever created it. Going back to the slide keeps the results only during that run; reloading the HTML starts another run, but the 12-hour session remains valid. When leaving an open slide, the player tries to close the collection. Closing the window abruptly does not guarantee that the room is closed on the server. Answers, keys and tokens do not go into the `.esf` or the exported HTML. The server deletes rooms and answers after 30 days.

The service returns up to 50 terms or comments; comments of up to three characters are not shown, although they count toward the total. Each phone answers once per room, through a random browser identifier, which does not prove the students' identity. PDF, PPTX, the editor and thumbnails show the question statically, without starting an activity. Regular slides keep working offline.

API contract, installation and data retention: [server/poll/README.md](server/poll/README.md).

### AI assistant

Uses the Claude Code CLI already installed and signed in. In **Settings → AI accounts**, enter the executable (e.g. `~/.local/bin/claude`) and one configuration directory per account (e.g. `~/.claude-A`, `~/.claude-B`). The app does not store credentials: authentication stays with the CLI (`CLAUDE_CONFIG_DIR`).

The agent has the Claude Code tools available in the Terminal — Bash, reading/creating/editing files, web search, reading web pages, subagents — plus two from the app: **page capture** (PNG) and file **download**. There are only two restrictions: (1) it reads and writes only in the presentation's workspace (the extracted contents of the `.ESF`) and its subfolders (commands run in the Claude Code sandbox, without network access; the web goes through the dedicated tools) and (2) it only works on the presentation. When something is ambiguous, it asks: the options appear in the chat and you just click (or answer in writing). Files it saves (screenshots, downloaded images, charts, research) go into their own folders, such as `media/`, only while the presentation is open: only the images and fonts imported and used in the slides go into the `.ESF`; the app's own files (`manifest.json`, `master/`, `layouts/`, `slides/`, `images/`, `fonts/`, `.edukors/`) change only through the structured answer, which the app validates (structure, embedded resources and rendering of the changed slides); if validation fails, it asks for **one** correction and, if the error persists, applies nothing. Every applied change can be undone.

The assistant's footer shows how much of the subscription's 5-hour window is left and when the next window starts, from the `rate_limit_event` that Claude Code emits with each request (last value kept per account). Before the first request it shows "not available".

## Development

The `npm` on this machine's PATH is incompatible with the installed Node; the commands below call the scripts directly.

```sh
node node_modules/typescript/bin/tsc --noEmit   # typecheck
node scripts/build.mjs                          # dist/
node scripts/start.mjs                          # opens the app in development (data in .local-data/)
node scripts/test.mjs                           # unit and integration tests (Node)
node scripts/e2e.mjs                            # full flow in the Electron window
node scripts/test-canvas.mjs                    # interaction and legacy object regressions
node scripts/perf.mjs                           # measurement with 50 and 300 slides
node scripts/package-mac.mjs                    # builds the .app and a signed ZIP in release/
node scripts/package-mac.mjs --version=0.2.1      # explicit version, no automatic increment
node scripts/e2e.mjs --poll-server              # real questions server (local PHP + MySQL, throwaway database)
node scripts/sync-poll-server.mjs [--check]     # copies server/poll to the published folder (default: ../_code/public_html/poll)
ESF_EXECUTABLE="$PWD/release/Edukors Slides Editor.app/Contents/MacOS/Edukors Slides Editor" node scripts/e2e.mjs
```

The tests use a **simulated** Claude CLI; no real account is called. Test outputs and data go to `test-results/` (`ESF_DATA_DIR` isolates the preferences).

Dependencies are in `node_modules/`, restored offline by `scripts/bootstrap-offline.py` from the local caches (the npm registry was not reachable). There is no `package-lock.json`.

### Structure

| Path | Responsibility |
| --- | --- |
| `src/shared/model.ts` | Types, blank master, reading the old format, validation |
| `src/shared/render.ts` | Isolated document of each slide and step runtime |
| `src/shared/canvas.ts` | Selection, editing and gesture lifecycle on the canvas |
| `src/shared/geometry.ts` | Matrices, snapping and resizing |
| `src/main/package.ts` | `.ESF` ZIP format: reading, validation, limits, extraction and atomic writing |
| `src/main/projects.ts` | Sessions (file + internal area), saving, conflicts, recovery, path confinement |
| `src/main/exports.ts` | Static capture, PDF and PPTX |
| `src/main/ai.ts` | Claude Code provider (profiles, streaming, sessions, cancellation) |
| `src/main/index.ts` | Electron process: window, menus, IPC, AI orchestration |
| `src/ui/` | React interface, `pt`/`en`/`es` catalogs |
| `src/shared/poll.ts` | Interactive questions: configuration, collection controller and presenter key |
| `server/poll/` | Interactive questions server (PHP + MySQL, self-hostable); single source, copied to the website by `sync-poll-server.mjs` |

Editor previews are loaded through the internal `esf-frame:` scheme, with their own CSP and origin; slide scripts therefore run outside the editor process and cannot reach its APIs.

## Known limitations

- Integration with a real Claude account not yet exercised (simulated CLI only).
- Opening an `.ESF` from Finder (double-click with the app closed/open) is not tested automatically; the same code was tested through a command-line argument.
- PPTX validated as ZIP/OOXML and with macOS Quick Look; still needs to be opened in PowerPoint and LibreOffice.
- Exported HTML tested in Electron's Chromium; the Safari, Chrome, Firefox and Edge matrix is still missing.
- Windows and Linux builds do not exist yet.
- The player uses system fonts for its controls (no Manrope).

## License

MIT — see `LICENSE`. It also covers the server in `server/poll/`.

## AI accounts and providers

In **Settings → Add account**, choose Claude Code, Codex, Kimi, Kiro, OpenCode or Antigravity, give it a name and create the account. A provider can be used more than once; each new account gets its own authentication directory. Existing Claude profiles are preserved. Model and effort are saved per account, and the active account can be chosen in the assistant.

Install the corresponding CLI and use **Connect**. The editor provides the login command to run in Terminal; **Advanced** lets you choose the executable and directory. Antigravity uses the official ACP server `agy_acp_server.par` with `localharness_external` in the same folder, and opens the Google login from the editor. See the [installation used by T3 Code](https://github.com/pingdotgg/t3code/blob/main/docs/user/providers-antigravity.md). The regular `agy` executable does not replace that server.

Claude and Codex have their own adapters; Kimi, Kiro, OpenCode and Antigravity use ACP. The new processes are confined by the macOS sandbox. Credentials are not written to the ESF. Model discovery depends on what each CLI reports; an ID can also be entered manually.

Validation: tests with simulated CLIs cover protocols, migration, environment isolation, resuming, cancellation and failures; the interface test covers creating several accounts, selection and persistence after a restart. No paid calls or real logins were made. The native sandbox test is skipped when the environment prevents nested sandboxing. The general E2E has `--without-legacy-canvas` to exclude the old card-editing expectations, which are incompatible with the current locking of layouts.
