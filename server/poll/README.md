# Edukors interactive questions service

Backend for the interactive questions of **Edukors Slides Editor**. The presenter
runs the exported HTML, types a presenter key once (the session lasts 12 hours in
that browser) and shows a QR code; students answer on their phones at `r/`.

The folder is self-contained: copy it to any PHP host to run your own server, then
point the desktop app at it (**Settings → Interactive questions → Server**).

This folder lives in the Edukors Slides Editor repository as `server/poll/`, next
to the app whose exported presentations call it. License: MIT (see `LICENSE` at the
repository root). The student page shows the Edukors logo (`r/logo.png`); replace
that file to use your own.

## Requirements

- PHP 8.1+ with `pdo_mysql` and `mbstring`.
- MySQL 5.7+ or MariaDB 10.3+.
- HTTPS (the app accepts plain `http://` only for `localhost`).
- No rewrite rules are needed: `q.php` and `r/` are reached directly.

## Install

1. Copy this folder to your server, e.g. `https://example.org/poll/`.
2. Create a database (`edukors_poll` on edukors.org) and apply the schema:

   ```sh
   mysql -u <user> -p <database> < sql/poll.sql
   ```

3. Copy `poll.config.example.php` to `private/poll.config.php` **outside the web
   root** and fill in the credentials. `config.php` looks for, in order:
   - the file named in the `EDUKORS_POLL_CONFIG` environment variable;
   - `../../private/poll.config.php` (the edukors.org layout, beside `public_html`);
   - `../private/poll.config.php`;
   - `poll.config.php` in this folder (last resort for hosts with nothing outside the web root).

   Set `$poll_base_url` if the public URL cannot be derived from the request
   (e.g. behind a proxy that hides HTTPS).
4. Create a presenter key. Either over SSH:

   ```sh
   php bin/newkey.php "Presenter name"     # prints the key once
   ```

   or in SQL (only the hash is stored; use a long random key):

   ```sql
   INSERT INTO poll_presenter (key_hash, name, active, created_at)
     VALUES (SHA2('EDK-XXXX-XXXX-XXXX', 256), 'Presenter name', 1, UTC_TIMESTAMP());
   ```

   To revoke a key: `UPDATE poll_presenter SET active = 0 WHERE id = …;` (its sessions stop at once).
5. Check it:

   ```sh
   curl -s -X POST https://example.org/poll/q.php -H 'Content-Type: application/json' -d '{"proc":"ping"}'
   curl -s -X POST https://example.org/poll/q.php -H 'Content-Type: application/json' -d '{"proc":"auth","key":"EDK-…"}'
   ```

6. In the app, enter `https://example.org/poll` in **Settings → Interactive
   questions** (the field starts blank; there is no default server) and export
   the presentation again: each exported HTML talks only to the server set when
   it was exported. Without a server, the exported question says so and makes no
   network request.

## API

All calls are `POST` with a JSON body. Replies are `{"data": …}` or
`{"error": "<code>"}` with a matching HTTP status.

Presenter (`q.php`, CORS open because exported files have origin `null`; the
token in the body authorizes each call):

| proc | input | result |
| --- | --- | --- |
| `ping` | — | `{service:"edukors-poll", version:1}` |
| `auth` | `key` | `{token, expiresAt}` (ms) — `401 invalid_key` |
| `prepare` | `token, type (quiz/tag/post), meta (2–5 options for quiz)` | `{room, url}` |
| `open` / `close` | `token, room` | `"ok"` |
| `count` | `token, room` | `{responses, status (0/1)}` |
| `results` | `token, room` | quiz `{response, responses}[]`; tag ≤ 50 `{response, responses}`; post ≤ 50 `{response}` (texts longer than 3 characters) |
| `export` | `token, room` | `{type, meta, rows: {response, at}[]}`, every answer oldest first (`at` in UTC ISO 8601, quiz `response` = option index); no participant ids |

An expired or revoked session answers `401 session_expired`; the player then
asks for the key again. A room belongs to the presenter who prepared it.

Student (`r/r.php`, same origin): `status {room}` → `{status, type, meta}`;
`respond {room, participant, response}` → `409 closed` or `409 already_responded`
when applicable. One answer per participant id (a random id kept by the phone's
browser) and room: this is not a proof of identity.

## Data and retention

Only key and token hashes are stored. Rooms and their answers are deleted 30 days
after creation, and expired sessions are removed, by occasional cleanup during
normal requests (no cron job). Whoever runs the server can read the answers sent
to it: presenters who use someone else's server trust it with their audience's
responses.
