# Teacher's guide — Edukors Slides Editor

This guide shows how to create a presentation in Edukors Slides Editor, from the first slide to a file ready to present. You do not need to write HTML: everything is done on the slide itself and with the AI assistant.

## 1. The idea in one sentence

A presentation is a set of **slides**, each a small web page, sharing one look: the **base** (colors, fonts and what sits behind every slide) and the **layouts** (how the content is arranged). The editor keeps everything in one `.esf` file and exports **a single HTML file** that opens in any browser, even offline.

## 2. Install and open

**On a Mac** (Apple Silicon or Intel, macOS 13 or later):

1. Download [`Edukors-Slides-Editor-mac.dmg`](https://github.com/mgarlabx/edukors_slides_editor/releases/latest/download/Edukors-Slides-Editor-mac.dmg), open it and drag the app into the **Applications** folder.
2. Open the app. The first time, macOS asks whether to open an app downloaded from the Internet: click **Open**.

**On Windows** (10 or 11, 64-bit):

1. Open the editor's page in the Microsoft Store, [Edukors Slides Editor](https://apps.microsoft.com/detail/9PHLLNHZW4Z2), and click **Get**. No warning and no administrator password.
2. The editor is in the Start menu. New versions come through the Microsoft Store, like those of any app installed from it.

Without the Microsoft Store (some school computers have it turned off), use the [`Edukors-Slides-Editor-windows.exe`](https://github.com/mgarlabx/edukors_slides_editor/releases/latest/download/Edukors-Slides-Editor-windows.exe) installer. If the browser distrusts the file, choose **Keep**; if Windows shows **Windows protected your PC**, click **More info** and then **Run anyway**.

**On Linux** (64-bit, x64):

- On **Ubuntu, Debian, Mint** and their relatives, download [`Edukors-Slides-Editor-linux.deb`](https://github.com/mgarlabx/edukors_slides_editor/releases/latest/download/Edukors-Slides-Editor-linux.deb) and install it with a double click (or `sudo apt install ./Edukors-Slides-Editor-linux.deb`). The editor is added to the applications menu, and an `.esf` opens in it with a double click.
- On **other distributions**, download [`Edukors-Slides-Editor-linux.AppImage`](https://github.com/mgarlabx/edukors_slides_editor/releases/latest/download/Edukors-Slides-Editor-linux.AppImage), make it executable (`chmod +x`) and open it. It runs without installing.

New versions come through the editor itself: when one is ready, a notice offers **Restart**, and the editor asks about anything unsaved first.

**On every system**, the first time, the editor shows the **Terms of use** (the MIT license, explained): you must accept them to go on. They stay in **Help** afterwards, which also shows the editor's version. From there you can create a **New presentation** or **Open** an `.esf` file. Once installed, an `.esf` opens in the editor with a double click.

## 3. The window

| Part | What it does |
| --- | --- |
| **Top bar** | File (new, open, recent, save, export, show in folder), **Present**, the switch between **Slides** and **Slide Master**, undo and redo, editing of the slide's objects (copy, cut, paste, duplicate, delete), **Insert** (text, shape, image, link, interactive question), Settings and Help. On the right, the slide list (⌥⌘0) and the **AI assistant** ✦ (⇧⌘A). |
| **Tabs** (just below) | One open presentation per tab. The dot on a tab means unsaved changes. |
| **Format bar** | Font, size, color, bold, italic, underline, line, fill, shadow and crop for the object selected on the slide. |
| **Slide list** (left) | The thumbnails, with a bar to create, move, duplicate, copy, cut, paste and delete slides. Drag its right edge to change the width. |
| **Slide** (center) | The slide being edited; below it, the **presenter notes**. |
| **AI assistant** (right) | The conversation with the agent that creates and changes slides. |
| **Status bar** | Whether it is saved, the file, the slide's **layout** (click to change it) and the editor's version. |

## 4. Create a presentation, step by step

1. **New presentation.** Click the new presentation icon (or press ⌘N) and pick a template: *Blank presentation* or one of your templates. A double click, or **Create**, opens it.
2. **Add slides.** The new slide button, at the top of the slide list (or ⇧⌘N), shows the layouts: pick one with a double click or **Insert**.
3. **Write.** Click a text on the slide to edit it right there.
4. **Ask the assistant.** Open ✦ and describe what you want: "create three slides on the water cycle for 6th grade". See section 7.
5. **Save** with ⌘S. The first time, the editor asks where and under what name: the whole presentation is one file, `my-lesson.esf`, which you can copy, move and rename freely.

The file keeps only what the presentation uses (images and fonts no slide cites are dropped on saving), so it stays small. If the computer shuts down before you save, the editor recovers the draft the next time it opens. If the file changes outside the editor, it is never overwritten without asking.

To reuse a look, use **File → Save as template…**: the template appears in the **New presentation** gallery, where it can also be renamed and deleted.

## 5. Editing on the slide

The slide works as in PowerPoint or Google Slides:

- **Select.** Click an object (text, image, shape, link) to select it; ⇧ or ⌘ + click adds another; dragging from an empty spot selects everything inside the rectangle. ⌘A selects every object on the slide. Tab goes through the objects.
- **Move.** Drag the object (a text, by its border). Pink guides show alignment with edges and centers; hold ⌥ to turn snapping off and ⇧ to move along one axis. The arrow keys move 1 px (⇧, 10 px).
- **Resize.** Pull the white handles; an image keeps its proportions (⇧ frees them). ⌘ + arrows resize too.
- **Text.** Click inside a text to edit it, keeping its formatting. Select a stretch to change its font, size or color in the format bar.
- **Images.** **Insert → Image** pastes the copied image or, if there is none, asks for a file; you can also drag images from your computer onto the slide. If the layout has an empty image slot, the image goes there. The crop button opens a box with handles: Enter confirms, Esc cancels.
- **Shapes and links.** The chosen shape lands on the slide with an adjustable line and fill. A link uses the copied address; its caption replaces the address on the slide, and the **QR code** option puts the code beside it.
- **Order and alignment.** A right click on an object offers **Bring to front**, **Send to back** and, for texts, horizontal and vertical alignment.
- **Copy between slides and presentations.** Copied objects (⌘C) paste (⌘V) on another slide, even in another presentation, with the same look and animations.

Each gesture is one undo step (⌘Z). Only Esc cancels a gesture in progress.

**Slides in the list.** Click a thumbnail to go to that slide; ⇧ and ⌘ select several. With the list in focus, ⌫ deletes the selected slides, ⌘D duplicates them and ⌘C/⌘V copy them (to another presentation too, which gives them its own look). ⌘↑ and ⌘↓ change the order; Home and End go to the first and the last. The last area clicked decides: after clicking the slide, ⌫ and ⌘D act on objects, not on slides.

## 6. Slide Master: bases and layouts

**Slide Master**, on the top bar or in the Presentation menu, swaps the slide list for two tabs:

- **Bases.** Each base is an alternative look for the whole presentation: colors, fonts and the objects behind every slide (a logo, a band). The ✓ below the thumbnail picks the **active** base, which applies to every slide. This way you can try another look without touching the content.
- **Layouts.** Each layout is a content arrangement (cover, title and text, two columns…), shared by all bases. A new slide starts from a layout. What comes from the layout changes only here, and the change reaches every slide that uses it; on the slides, only the texts and images in the layout's slots can be edited.

Rename with a double click on the name. A presentation always keeps at least one base and one layout; the slides of a deleted layout move to the previous one, with their content. To **change a slide's layout**, click the layout's name in the status bar (or **Slides → Change layout…**): the texts go to the fields with the same name in the new layout.

The code details (HTML and CSS of bases and layouts) are the assistant's job: ask "make the titles navy blue on every slide" or "create a layout with an image on the left and text on the right".

## 7. The AI assistant

The ✦ icon at the right end of the top bar (or ⇧⌘A) opens and closes the **assistant** beside the slide; closing it neither stops nor erases the conversation. It sees the presentation and changes it on request: it creates and rewrites slides, changes the look, searches the web, captures pages and downloads images. It works only on the open presentation and only in its folder, and it never deletes slides: that is up to you.

**Before using it.** Install [Claude Code](https://claude.com/claude-code) or [Codex](https://developers.openai.com/codex/cli/) on your computer; the editor does not download them. Then, in **Settings → AI assistant**, create an account and sign in: the provider's page opens in the browser (if it does not, the editor shows the address and, for Claude, a field for the code). The account is yours, not the editor's, and it is available to the other Edukors apps on this computer. On Windows, the assistant works only with Claude Code, without running commands: it reads and writes the presentation's files and searches the web.

**How to ask.** Type in the field at the bottom and send. The selected slides go with the request, so "this slide" means the selected slide. Examples:

- "Create a cover and three slides on fractions for 6th grade."
- "Rewrite this slide with shorter sentences."
- "Make an animation that reveals the steps one at a time."
- "Look up recent data on deforestation and make a chart."
- "Change the font of the whole presentation to a more legible one."

The paper clip 📎 attaches files (texts, PDFs, images) for it to use. When a request could go more than one way, it asks with options in the chat: pick one or type another answer.

**Every change is checked.** The editor checks and draws every slide the assistant proposes; what fails goes back to it to fix. What it does in one answer is **one undo step**: ⌘Z undoes it all at once. The assistant does not save the file: save it yourself, with ⌘S, when you are happy.

**Standing instructions.** In **Settings → AI assistant → Advanced**, the **Instructions for the agent** have two tabs: **Global**, for every presentation (tone, audience, style rules), and **This presentation**, the context of this talk (audience, goals, sources), kept in the `.esf` itself. Your **MCP servers** (each call asks for your permission) and the **skills** folder are there too.

**Model and effort.** The button next to Send picks the model and the **effort**: more effort, more careful and slower answers, using more of your plan.

**Sessions and usage.** The title at the top of the panel opens the earlier sessions (with search); **New session** starts another conversation. Conversations are kept in the presentation. The circle in the header shows how much of the session's context is in use, and the footer shows the account, the last request and the use of the plan's 5-hour window.

**Stop.** While the assistant works, the **Stop** button ends the request; nothing it was doing is applied.

## 8. Interactive questions

**Insert → Interactive question** turns the slide into a live question: **multiple choice**, **word cloud** or **open answer**. In the exported HTML, you unlock the question with your presenter key, the audience scans the QR code and answers on their phones, and the results appear as bars, a cloud or a list, with a CSV download.

The answers go through a questions server that **you or your institution host** (PHP and MySQL, with an installation guide in the [repository](https://github.com/mgarlabx/edukors_slides_editor)). Enter its address in **Settings → Interactive questions** and use **Test connection**. Without a server, exporting warns you and the question says the server is missing.

## 9. Present and export

**Present** (⌘↵) shows the presentation from the selected slide, with navigation only, for rehearsing.

**Export** (⌘E) produces:

| Format | What you get |
| --- | --- |
| **HTML** (recommended) | A single file, with images, fonts and animations, that opens in any browser, even offline (only interactive questions use the network). |
| **PDF** | One page per slide, as an image. |
| **PPTX** | One image slide per slide, for whoever must receive a PowerPoint file; not editable. |

**In the exported HTML**, the arrow keys, the space bar and Page Down/Up change slides. Move the mouse to a top corner to see the tools: **presenter panel** (opens in another window, with every slide and the current one highlighted), **pen**, **highlighter**, **text**, **eraser**, **magnifier**, infinite **whiteboard** and **full screen**. A bottom corner shows the slide trail, with a preview on hover. The HTML's controls are always in English, whatever the editor's language.

## 10. Shortcuts

On Windows and Linux, ⌘ stands for Ctrl, ⌥ for Alt and ⇧ for Shift.

| Shortcut | Action |
| --- | --- |
| ⌘N / ⌘O / ⌘S / ⇧⌘S | New, open, save, save as |
| ⌘W | Close the tab |
| ⌘1 … ⌘9 | Go to tab 1 … 9 |
| ⌘Z / ⇧⌘Z | Undo / redo |
| ⌘X / ⌘C / ⌘V | Cut, copy and paste (slides or objects, by the last area clicked) |
| ⌘D | Duplicate slides or objects |
| ⌫ | Delete slides or objects |
| ⌘A | Select every slide or every object on the slide |
| ⇧⌘N | New slide |
| ⌘↑ / ⌘↓ | Move the slide up / down |
| Arrows / ⇧ + arrows | Move the object 1 px / 10 px |
| ⌘ + arrows | Resize the object |
| ⌘↵ | Present |
| ⌘E | Export |
| ⌥⌘0 | Show / hide the slide list |
| ⇧⌘A | Open / close the AI assistant |
| ⌘= / ⌘− / ⌘0 | Zoom in / zoom out / actual size |
| ⌘, | Settings |
| Esc | Cancel the gesture in progress |
