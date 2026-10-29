<p align="center">
  <img src="build/icon.png" alt="" width="112">
</p>

<h1 align="center">Edukors Slides Editor</h1>

<p align="center">
  A presentation editor that runs on your computer, with an AI assistant at your side.<br>
  Each presentation becomes <strong>a single HTML file</strong> that opens offline in any browser.<br>
  More information at <a href="https://edukors.org/slides/"><strong>edukors.org/slides</strong></a>.
</p>

<p align="center">
  <a href="https://apps.microsoft.com/detail/9PHLLNHZW4Z2"><img src="https://img.shields.io/badge/Download-Windows-0078D4?style=for-the-badge&logo=windows&logoColor=white" alt="Download for Windows"></a>
  <a href="https://github.com/mgarlabx/edukors_slides_editor/releases/latest/download/Edukors-Slides-Editor-mac.dmg"><img src="https://img.shields.io/badge/Download-macOS-000000?style=for-the-badge&logo=apple&logoColor=white" alt="Download for Mac"></a>
  <a href="https://github.com/mgarlabx/edukors_slides_editor/releases/latest/download/Edukors-Slides-Editor-linux.AppImage"><img src="https://img.shields.io/badge/Download-Linux-E95420?style=for-the-badge&logo=linux&logoColor=white" alt="Download for Linux"></a>
</p>

<p align="center">
  <a href="https://github.com/mgarlabx/edukors_slides_editor/releases/latest"><img src="https://img.shields.io/github/v/release/mgarlabx/edukors_slides_editor?label=latest" alt="Latest release"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-green" alt="MIT license"></a>
</p>

<p align="center">
  <sub>Free, for Windows 10/11 (x64), macOS 13+ (Apple Silicon and Intel) and Linux (x64). See <a href="#download">Download</a> for the details.</sub>
</p>

## Part of Edukors.org

[Edukors.org](https://edukors.org) is a project of open tools for teaching and learning. The Slides Editor is its presentation editor: made for teachers and speakers who want rich, interactive slides without depending on an online service or a heavy office suite.

A presentation is a set of small web pages, one per slide, sharing a common look. The editor saves it in a single `.esf` file, and exports it as **one self-contained HTML file**: everything it needs (text, images, fonts, animations, presenter tools) travels inside it, so it opens offline, in any current browser, on any computer.

<table>
  <tr>
    <td width="33%" valign="top">
      <h3>✏️ Editor</h3>
      <strong>This app</strong>, where presentations are created, edited and rehearsed.
    </td>
    <td width="33%" valign="top">
      <h3>📄 The HTML</h3>
      The exported presentation: a single file with the slides and the presenter tools.
    </td>
    <td width="33%" valign="top">
      <h3>🙋 Questions server</h3>
      An optional server you host yourself, for live questions the audience answers on their phones.
    </td>
  </tr>
</table>

## What it is for

<table>
  <tr>
    <td width="33%" valign="top">
      <h3>🤖 Ask the AI</h3>
      Ask the assistant to create slides, rewrite texts, research a topic, or change the look of the whole presentation.
    </td>
    <td width="33%" valign="top">
      <h3>🖱️ Edit on the slide</h3>
      Click, drag, resize and format texts, images, shapes and links directly on the slide.
    </td>
    <td width="33%" valign="top">
      <h3>🎨 Design once</h3>
      Bases and layouts set the look of every slide, as a slide master does.
    </td>
  </tr>
  <tr>
    <td width="33%" valign="top">
      <h3>🙋 Engage the audience</h3>
      Add live questions: multiple choice, word cloud or open answer, answered by phone through a QR code.
    </td>
    <td width="33%" valign="top">
      <h3>🎤 Present</h3>
      Present with hot corners, a slide trail, pen, highlighter, magnifier, an infinite whiteboard and a presenter panel.
    </td>
    <td width="33%" valign="top">
      <h3>📦 Export</h3>
      Produce the single HTML file, or a PDF or PPTX copy (one image per slide).
    </td>
  </tr>
</table>

## How it works

**The slides.** Each slide is a small HTML, CSS and JavaScript document, at 1600 × 900, isolated from the others. The interface is minimal on purpose: most creation and formatting is done by the AI assistant, and the rest by hand on the slide. The interface is available in English, Portuguese and Spanish.

**Editing on the slide.** The canvas works like Google Slides or PowerPoint. Click an object to select it, drag to move it (pink guides snap edges and centers), pull its handles to resize, and click a text to edit it in place, keeping its formatting. A formatting bar sets the font, size, color, border, background and shadow; images can be cropped. Each gesture is one undo step; Esc cancels a gesture in progress.

**Slide master: bases and layouts.** A **base** is a visual alternative for the whole presentation (its colors, fonts and the objects behind every slide); the active base applies to every slide. **Layouts** are content arrangements shared by all bases: a new slide starts from one, and what comes from the layout changes only in the slide master, reaching every slide that uses it. A slide can change layout at any time, keeping its texts.

**The AI assistant.** A panel on the right holds the assistant. It sees the presentation and changes it on request: it creates and rewrites slides, researches the web, captures pages, downloads images and adjusts the theme. It asks when something is ambiguous (the options appear in the chat), and each change it makes is applied as one step you can undo. It works only on the open presentation and only inside its folder. The assistant runs on **Claude Code** or **Codex**, installed on your computer, with an AI account you connect in the editor; accounts are shared with the other Edukors apps on the same computer.

**Interactive questions.** Insert → Interactive question turns a slide into a live question. In the exported HTML, the presenter unlocks it with a key, the audience scans the QR code and answers on their phones, and the results appear as bars, a word cloud or a list, with a CSV download. The answers go through a [questions server](server/poll/README.md) that **you or your institution host**: there is no shared Edukors server.

**The `.esf` file.** A presentation is a single `.esf` file, a standard ZIP (like a PPTX), with the slides, the bases and layouts, the images and fonts in use, the assistant's conversations and an optional description of the talk for the assistant. It keeps only what the presentation uses, so it stays small. Copy, move or rename just the file; double-clicking it opens the editor. Unsaved changes are recovered after a crash, and a file changed outside the editor is never overwritten silently.

**Exports.**

| Format | What you get |
| --- | --- |
| **HTML** | A single file with every resource embedded and the animations. Presenter tools: hot corners, dot trail with preview, pen, highlighter, text, magnifier, infinite whiteboard, presenter panel and full screen. Works offline; only interactive questions need the internet. |
| **PDF** | One page per slide, in its final state, as an image. |
| **PPTX** | One image per slide, for whoever must receive a PowerPoint file; not editable. |

## Download

Choose the version for your system. The apps are notarized and approved: the macOS version is notarized by Apple, and the Windows version is approved by Microsoft and distributed through the Microsoft Store.

| System | Download | Requirements |
| --- | --- | --- |
| **Windows** | [Microsoft Store](https://apps.microsoft.com/detail/9PHLLNHZW4Z2) | Windows 10 or 11, 64-bit (x64) |
| | [Edukors-Slides-Editor-windows.exe](https://github.com/mgarlabx/edukors_slides_editor/releases/latest/download/Edukors-Slides-Editor-windows.exe) | The same, for schools that block the Microsoft Store |
| **macOS** | [Edukors-Slides-Editor-mac.dmg](https://github.com/mgarlabx/edukors_slides_editor/releases/latest/download/Edukors-Slides-Editor-mac.dmg) | macOS 13 or later, Apple Silicon or Intel |
| **Linux** | [Edukors-Slides-Editor-linux.AppImage](https://github.com/mgarlabx/edukors_slides_editor/releases/latest/download/Edukors-Slides-Editor-linux.AppImage) | 64-bit (x64) |
| | [Edukors-Slides-Editor-linux.deb](https://github.com/mgarlabx/edukors_slides_editor/releases/latest/download/Edukors-Slides-Editor-linux.deb) | Optional, for Debian, Ubuntu, Mint and their relatives |

The links always give the latest version; every version is on the [releases](https://github.com/mgarlabx/edukors_slides_editor/releases) page, and the [CHANGELOG](CHANGELOG.md) says what changed in each. Each release lists the SHA-256 checksum of every file (`SHA256SUMS.txt`) and carries a GitHub build provenance attestation (`gh attestation verify <file> -R mgarlabx/edukors_slides_editor`).

**On Windows**, it is available in the Microsoft Store: open the editor's page in the store and click **Install**. Does your school block the Microsoft Store? Download the `.exe` installer. Outside the store, Windows may still show security warnings, even though the app is approved: in the browser, keep the file; on the **Windows protected your PC** warning, click **More info** and then **Run anyway**.

**On macOS**, a `.dmg` file, notarized by Apple. Open the file and drag the app into the **Applications** folder.

**On Linux**, an `.AppImage` file. Make the file executable (`chmod +x`) and open it, no installation needed. On Debian, Ubuntu and their relatives, the `.deb` is an alternative that adds the editor to the applications menu and opens `.esf` files with a double click: `sudo apt install ./Edukors-Slides-Editor-linux.deb`.

The editor needs no Node, Python or Chrome: editing, presenting and exporting work right after installing.

**Updates.** The app updates itself: it checks for a new version when it opens and every few hours, and offers to restart once one is ready, asking about unsaved presentations first.

**Optional: the AI assistant.** Install [Claude Code](https://claude.com/claude-code) (`claude`) or [Codex](https://developers.openai.com/codex/cli/) (`codex`) on your computer; the editor never downloads them for you. Then, in **Settings → AI assistant**, add an account and sign in: the provider's page opens in the browser (if it does not, the editor shows the address and, for Claude, a field for the code shown after you authorize). Each account keeps its own sign-in, separate from the one you may use in a terminal, and the accounts are shared with the other Edukors apps on this computer. Under **Advanced**, the same page holds standing instructions for the assistant (for all presentations and for this one), your MCP servers (every call asks for your permission) and the skills folder. The providers and accounts are handled by the shared Edukors AI library, [`@edukors/ai-cli`](https://github.com/mgarlabx/edukors_ai_cli).

| | Files and web | Commands | Confined by |
| --- | --- | --- | --- |
| Claude Code | macOS, Windows, Linux | macOS, Linux (needs `bubblewrap`) | Claude Code's restricted mode and its sandbox |
| Codex | macOS | macOS | the macOS sandbox |

**Optional: interactive questions.** Host the [questions server](server/poll/README.md) (PHP + MySQL, with an installation guide) on your own web hosting, register a presenter key, and enter its address in **Settings → Interactive questions**, which also tests the connection. The field starts blank: without a server, exporting warns you, and in the HTML the question says the server is not configured, without touching the network. Each exported HTML uses the server set at the time of export.

## Building from source

Requirements: [Node.js](https://nodejs.org) 22 and npm.

```sh
git clone https://github.com/mgarlabx/edukors_slides_editor.git
cd edukors_slides_editor
npm install
node scripts/build.mjs --no-bump   # dist/
node scripts/start.mjs             # opens the editor (data in .local-data/)
```

`node scripts/package.mjs` builds the installers for the system it runs on into `release/` (with `--universal` on the Mac, Apple Silicon and Intel). The published installers, for all three systems, are built on GitHub by the release workflow when a version tag is pushed.

## Project status

The editor is young and evolving. It runs on macOS (universal: Apple Silicon and Intel), signed and notarized by Apple, on Windows (x64), signed through the Microsoft Store (the installer on GitHub is not signed) and on Linux (x64).

Known limitations:

- **Windows:** the AI assistant works with Claude Code only, without running commands (native Windows has no sandbox to confine them).
- **Linux:** the AI assistant works with Claude Code; its commands need `bubblewrap` (`bwrap`). Codex is offered on macOS only.
- The app is not in the Mac App Store, Snap Store or Flathub: their sandboxes do not allow running the AI CLIs installed by the user.
- PDF and PPTX exports are images, one per slide.
- The exported HTML is tested in Chromium; Safari, Firefox and Edge are checked by hand.

## For developers

The app is built with [Electron](https://www.electronjs.org), React and TypeScript.

```sh
node node_modules/typescript/bin/tsc --noEmit   # typecheck
node scripts/test.mjs                           # unit and integration tests (Node)
node scripts/e2e.mjs                            # full flow in the Electron window (hidden; ESF_SHOW=1 shows it)
node scripts/e2e.mjs --poll                     # interactive questions, with the server mocked
node scripts/e2e.mjs --poll-server              # the real questions server (local PHP + MySQL, throwaway database)
node scripts/perf.mjs                           # 50 and 300 slides
```

`build.mjs` increments the patch version in `package.json` on each local build; `--version=X.Y.Z` sets it and `--no-bump` keeps it (CI never bumps). The tests use the AI library's **fake provider**, a separate CLI process; no real account is called.

| Path | Responsibility |
| --- | --- |
| `src/shared/model.ts` | Types, blank master, validation |
| `src/shared/render.ts` | Isolated document of each slide and step runtime |
| `src/shared/canvas.ts`, `geometry.ts` | Selection, editing and gestures on the canvas; matrices, snapping and resizing |
| `src/shared/player.ts`, `poll.ts` | The exported player; interactive questions |
| `src/main/package.ts`, `projects.ts` | The `.esf` ZIP format; sessions, saving, conflicts, recovery |
| `src/main/exports.ts` | Static capture, PDF and PPTX |
| `src/main/ai.ts`, `assistant.ts`, `mcp.ts` | The assistant's instructions and changes; accounts and sessions through the AI library; its web tools |
| `src/main/index.ts` | Electron process: window, menus, IPC |
| `src/ui/` | React interface, `pt`/`en`/`es` catalogs |
| `server/poll/` | The interactive questions server (PHP + MySQL, self-hosted) |

Editor previews load through an internal `esf-frame:` scheme, with their own CSP and origin, so slide scripts run outside the editor process and cannot reach its APIs.

**Releases.** Set `version` in `package.json`, merge, then push a tag `vX.Y.Z` (or `vX.Y.Z-rc.N` for a pre-release). `.github/workflows/release.yml` builds, signs and stages the installers, checksums and provenance attestations in a **draft** GitHub Release, to review and publish by hand; only then do installed apps see the update. See [CONTRIBUTING.md](CONTRIBUTING.md) before opening a pull request.

## Privacy and security

The app collects no data and has no telemetry. The connections it makes, and when, are listed in [PRIVACY.md](PRIVACY.md). To report a vulnerability, see [SECURITY.md](SECURITY.md).

## License

[MIT](LICENSE), including the questions server in `server/poll/`. Copyright (c) 2026 Edukors.
