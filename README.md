# Edukors Slides Editor

Desktop editor for HTML presentations. Each slide is a small HTML/CSS/JS document; the main output is a **single HTML file** that opens offline in any current browser. PDF and PPTX are available as supporting static exports.

Most of the creation and formatting work can be delegated to an **AI assistant** (Claude Code or Codex, the CLI you already use) in a side panel. The interface is available in English, Portuguese and Spanish.

The repository also contains the **interactive questions server** in [`server/poll/`](server/poll/README.md): PHP + MySQL, ready for anyone to host their own and point the app to it.

## Install

Download the file for your system from the [latest release](https://github.com/mgarlabx/edukors_slides_editor/releases/latest). The app does not require Node, Python or Chrome, and updates itself when a new version is published.

| System | File | Notes |
| --- | --- | --- |
| macOS, Apple silicon or Intel | `Edukors-Slides-Editor-mac.dmg` (universal) | Signed and notarized by Apple. Open the `.dmg` and drag the app to Applications. |
| Windows 10/11 (x64) | Microsoft Store (coming soon) or `Edukors-Slides-Editor-windows.exe` | The Store version is signed by Microsoft and updated by the Store. The `setup.exe` is not code-signed yet: on first run, SmartScreen asks for **More info → Run anyway**. In 1.0 the AI assistant is not available on Windows (see [Known limitations](#known-limitations)). |
| Linux (x64) | `.AppImage` or `.deb` | The AppImage updates itself; mark it as executable (`chmod +x`). The AI assistant needs `bubblewrap` (`bwrap`) installed. |

Each release lists the SHA-256 checksum of every file (`SHA256SUMS.txt`) and carries a GitHub build provenance attestation (`gh attestation verify <file> -R mgarlabx/edukors_slides_editor`).

After installing, double-clicking an `.esf` file opens the presentation in the app.

## Usage

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

A new presentation starts without a file; the first **Save** asks where to save it, and the chosen name becomes its title. Exporting a presentation that was never saved saves it first.

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

The assistant runs on the **Claude Code** or **Codex** CLI you have installed, through the shared EDUKORS AI library ([`@edukors/ai-cli`](https://github.com/mgarlabx/edukors_ai_cli)). In **Settings → AI assistant**, add an account, give it a name and sign in: the browser opens, and if it does not, the address is shown (Claude may ask you to paste back the code it shows). Accounts are the library's own and are shared by every EDUKORS app on this computer; your personal `~/.claude` and `~/.codex` sign-ins are never used or changed. The app stores no credentials, and none go into the `.ESF`. Choose the account in use there or in the assistant; model and effort are kept per account.

The agent works in the presentation's workspace (the extracted contents of the `.ESF`) with its provider's own tools — reading and writing files, web search and reading web pages, and commands where a sandbox confines them — plus three from the app: **apply_changes**, the only way it changes slides, masters, layouts and the presentation's system prompt; **page capture** (PNG); and file **download**. It reads and writes only in that folder and its subfolders, never in the app's own files (`manifest.json`, `masters/`, `layouts/`, `slides/`, `images/`, `fonts/`, `.edukors/`), and it only works on the presentation. `apply_changes` validates each proposal (structure, embedded resources and rendering of the changed slides) and sends the problems back to the agent to fix; what it accepts is applied when the turn ends, as one step you can undo. When something is ambiguous, the agent asks: the options appear in the chat and you click one (or answer in writing). Files it saves (screenshots, downloaded images, charts, research) live in their own folders, such as `media/`, only while the presentation is open: only the images and fonts used in the slides go into the `.ESF`.

| | Files and web | Commands | Confined by |
| --- | --- | --- | --- |
| Claude Code | macOS, Windows, Linux | macOS, Linux (needs `bubblewrap`) | Claude Code's restricted mode and its sandbox |
| Codex | macOS | macOS | the macOS sandbox |

**Advanced** holds the **instructions for the agent** (global, and for this presentation, saved in the `.ESF` as `ai/system-prompt.md`), your own **MCP servers** (the `.mcp.json` format; every call asks for your permission) and the **skills** folder (each skill a folder with a `SKILL.md`; no other skill is enabled).

The assistant's footer shows how much of the account's 5-hour window is used and when the next window starts, as the provider reports it. Before the first report it shows "not available".

## Development

Requirements: Node.js 22 and npm. Install the dependencies with `npm install`; the commands below call the scripts directly with `node` (the same scripts are available as `npm run …`, see `package.json`).

```sh
node node_modules/typescript/bin/tsc --noEmit   # typecheck
node scripts/build.mjs                          # dist/
node scripts/start.mjs                          # opens the app in development (data in .local-data/)
node scripts/test.mjs                           # unit and integration tests (Node)
node scripts/e2e.mjs                            # full flow in the Electron window
node scripts/test-canvas.mjs                    # interaction and legacy object regressions
node scripts/perf.mjs                           # measurement with 50 and 300 slides
node scripts/package.mjs                        # installers for this system in release/ (electron-builder.yml)
node scripts/package.mjs --no-bump --universal   # macOS: same version, Apple silicon + Intel
node scripts/e2e.mjs --poll-server              # real questions server (local PHP + MySQL, throwaway database)
ESF_EXECUTABLE="$PWD/release/Edukors Slides Editor.app/Contents/MacOS/Edukors Slides Editor" node scripts/e2e.mjs
```

`build.mjs` increments the patch version in `package.json` on each local build; pass `--version=X.Y.Z` to set it, or `--no-bump` to keep it (CI never bumps).

Releases: set `version` in `package.json`, commit, then push a tag `vX.Y.Z` (or `vX.Y.Z-rc.N` for a pre-release). `.github/workflows/release.yml` builds, signs and stages the installers, checksums and provenance attestations in a **draft** GitHub Release. Review all builds before publishing it manually; only then do installed apps see the update.

Public installer copies use `Edukors-Slides-Editor-mac.dmg`, `Edukors-Slides-Editor-windows.exe`, and `Edukors-Slides-Editor-linux.{AppImage,deb}` (x64). Versioned originals, ZIPs, blockmaps and updater metadata retain their names. The download page prefers these public copies and falls back to the older versioned assets, including separate Mac architectures.

The tests use the AI library's **fake provider**, a separate CLI process; no real account is called. Test outputs and data go to `test-results/` (`ESF_DATA_DIR` isolates the preferences). The Electron tests run with hidden windows; set `ESF_SHOW=1` to see them.

See [CONTRIBUTING.md](CONTRIBUTING.md) before opening a pull request.

### Structure

| Path | Responsibility |
| --- | --- |
| `src/shared/model.ts` | Types, blank master, validation |
| `src/shared/render.ts` | Isolated document of each slide and step runtime |
| `src/shared/canvas.ts` | Selection, editing and gesture lifecycle on the canvas |
| `src/shared/geometry.ts` | Matrices, snapping and resizing |
| `src/main/package.ts` | `.ESF` ZIP format: reading, validation, limits, extraction and atomic writing |
| `src/main/projects.ts` | Sessions (file + internal area), saving, conflicts, recovery, path confinement |
| `src/main/exports.ts` | Static capture, PDF and PPTX |
| `src/main/ai.ts` | The agent's instructions, applying its changes, the context it gets |
| `src/main/assistant.ts` | The assistant through the EDUKORS AI library: accounts, sessions, `apply_changes`, questions |
| `src/main/mcp.ts` | The agent's web tools: page capture and download |
| `src/main/index.ts` | Electron process: window, menus, IPC, AI orchestration |
| `src/ui/` | React interface, `pt`/`en`/`es` catalogs |
| `src/shared/poll.ts` | Interactive questions: configuration, collection controller and presenter key |
| `server/poll/` | Interactive questions server (PHP + MySQL, self-hostable); single source, copied to the website by `sync-poll-server.mjs` |

Editor previews are loaded through the internal `esf-frame:` scheme, with their own CSP and origin; slide scripts therefore run outside the editor process and cannot reach its APIs.

## Known limitations

- **Windows:** the AI assistant works with Claude Code only, without running commands (native Windows has no sandbox to confine them). Editing, presenting and exporting work normally.
- **Linux:** the AI assistant works with Claude Code; its commands require `bubblewrap` (`bwrap`). Codex is offered on macOS only.
- The app is not in the Mac App Store, Snap Store or Flathub: their sandboxes do not allow running the AI CLIs installed by the user.
- Opening an `.esf` by double-click is not covered by the automated tests; the same code path is tested through a command-line argument.
- PDF and PPTX exports are images (one per slide); PPTX has been validated as OOXML but still needs testing in PowerPoint and LibreOffice.
- Exported HTML is tested in Chromium; Safari, Firefox and Edge are checked by hand.
- The player uses system fonts for its controls.

## Privacy and security

The app collects no data and has no telemetry. The connections it makes, and when, are listed in [PRIVACY.md](PRIVACY.md). To report a vulnerability, see [SECURITY.md](SECURITY.md).

## License

MIT — see [`LICENSE`](LICENSE). It also covers the server in `server/poll/`.

The installer matrix matches Graph: universal macOS, Windows x64, and Linux x64 (AppImage and deb). Earlier releases and their additional architectures/formats remain available on GitHub. For an older Mac release, the website expands the Mac download choice to show its separate Apple Silicon and Intel installers. Microsoft Store distribution for Slides is still pending; no Store download link is advertised before one is available.
