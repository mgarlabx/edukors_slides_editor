# Security policy

## Supported versions

Only the latest release receives security fixes. The app updates itself, so keeping it up to date is usually automatic.

## Reporting a vulnerability

Please **do not open a public issue**. Report it privately through GitHub: on the repository page, open **Security → Report a vulnerability** ([direct link](https://github.com/mgarlabx/edukors_slides_editor/security/advisories/new)).

Include, if you can:

- the version (shown at the bottom right of the window) and the operating system;
- what an attacker can do and the steps to reproduce it;
- a sample `.esf` file or exported HTML, if the problem depends on one.

You can expect a first answer within 7 days. Once a fix is released, the advisory is published with credit to the reporter, unless you prefer to remain anonymous.

## Scope

In scope:

- the desktop app (opening `.esf` files, slide isolation, the AI assistant's confinement to the presentation folder, exports);
- the exported HTML player;
- the interactive questions server in [`server/poll/`](server/poll/README.md).

Out of scope: vulnerabilities in the AI CLIs themselves (Claude Code, Codex and others) — report them to their vendors — and problems in servers run by third parties with the code from `server/poll/`, which should go to whoever runs them.

## Security model, in short

- Each slide runs in an isolated frame with its own origin and Content Security Policy; slide scripts have no access to the file system or to the app.
- `.esf` packages are validated before opening: unsafe paths, symbolic links, encryption and oversized contents are rejected.
- The exported HTML makes no network requests, except to the interactive questions server configured by the presenter.
- The AI assistant runs the CLI chosen by the user, confined to the presentation's working folder; on macOS and Linux its shell commands run in a sandbox without network access.
- The app never writes credentials to `.esf` files or exported HTML.
