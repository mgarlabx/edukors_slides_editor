# Changelog

## 1.1.0

- **AI assistant through the shared Edukors AI library** ([`@edukors/ai-cli`](https://github.com/mgarlabx/edukors_ai_cli) 0.2.0). Claude Code and Codex, with accounts made and signed in from **Settings → AI assistant** (the browser opens; otherwise the address is shown, with a field for Claude's code) and shared with the other Edukors apps. Accounts from 1.0 are not carried over: sign in once again. Kimi, Kiro, OpenCode and Antigravity are no longer offered.
- The assistant changes the presentation through one tool, `apply_changes`: every proposal is validated and rendered, problems go back to it to fix, and what it accepts is applied when its answer ends, as one undo step. It asks its questions during the answer, with options in the chat.
- It works in the presentation's folder with its provider's own file and web tools, and commands where a sandbox confines them: on Windows, Claude Code without commands; Codex on macOS.
- **Settings → AI assistant** has the accounts first and, under **Advanced**, the instructions for the assistant, your own MCP servers (each call asks for permission) and a skills folder.
- **Interactive questions:** there is no shared Edukors server any more; each presenter hosts the [questions server](server/poll/README.md) and enters its address in Settings.
- Installers: universal macOS app (Apple Silicon and Intel), Windows and Linux for x64, with stable download names (`Edukors-Slides-Editor-mac.dmg`, `-windows.exe`, `-linux.AppImage`, `-linux.deb`).

## 1.0.0

- First public release: macOS (signed and notarized), Windows and Linux.
