# Privacy

Edukors Slides Editor collects **no data**. It has no telemetry, analytics, crash reporting or account of its own. Your presentations stay on your computer, in the `.esf` files you save.

## Connections the app makes

| When | Where | What is sent |
| --- | --- | --- |
| At startup and every few hours | GitHub (`github.com`, `objects.githubusercontent.com`) | A request for the latest release, to offer updates. Not done in the Microsoft Store version, which is updated by the store. |
| Only if you set up an AI account and use the assistant | The AI CLI you chose (Claude Code or Codex), which talks to its own vendor | Your requests and the parts of the presentation the assistant needs. This is governed by that vendor's terms and privacy policy, under your own account. |
| Only when the assistant uses its page capture or download tools | The web address requested | An ordinary page or file request. |
| Only when you press **Test** in Settings → Interactive questions | The server address you entered | A connection test. |
| When you click the logo or Help → website | `edukors.org`, in your browser | An ordinary page visit. |

The app sends nothing else.

## AI accounts

Sign-in to the AI services is handled entirely by their CLIs, each account in its own folder kept by the shared EDUKORS AI library on this computer (`~/Library/Application Support/EDUKORS` on macOS); your personal `~/.claude` and `~/.codex` are never used. The app does not keep passwords or tokens. The 5-hour window shown in the assistant comes from what the CLI reports. Conversations with the assistant are saved inside the `.esf` file, with no account data.

## Exported HTML

An exported presentation is a single file that makes **no network requests**, with one exception: slides with interactive questions talk to the questions server that was configured when the file was exported.

- The presenter types a key once; the server returns a 12-hour session, kept in that browser. The key itself is never stored.
- Students answer on their phones through the server's page. Each phone gets a random identifier so it can answer only once per room; no name, e-mail or account is asked for.
- The Edukors server (`https://edukors.org/poll`) deletes rooms and answers after 30 days. Servers run by others with the code in [`server/poll/`](server/poll/README.md) follow their own operators' policies.

## Contact

Questions about privacy: open an issue at <https://github.com/mgarlabx/edukors_slides_editor/issues>.
