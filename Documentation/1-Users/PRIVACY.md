---
date: 2026-04-24
topic: privacy-notice-longform
status: final
---

# Privacy notice

Long-form version of the notice users see in-terminal
(`Screens/PRIVACY.TXT`). Intended for the sysop's public docs and as
reference material for what the BBS does with user data.

## Who we are

This BBS is operated by the sysop configured in `bbsConfig.info`. Contact
is the `SYSOP_EMAIL` tooltype — it's what replaces the `$SYSOP_EMAIL$`
placeholder in the in-terminal notice at display time.

Hosting: Hetzner Online GmbH, Falkenstein, Germany (EU). Data never
leaves the EU under normal operation.

## What we collect

### At registration
- Handle (used as your primary identifier on the BBS)
- Password (stored bcrypt-hashed; the plaintext is never retained)
- Optional free-text fields: real name, group affiliation, phone, email
- Computer type preference
- Screen preferences (lines per screen, screen-clear-after-messages,
  ANSI mode)
- Timestamp of your explicit consent to this notice, plus the version
  of the notice you consented to

### Per session
- IP address of your connection
- Time of connection and disconnection
- Node assignment (which BBS node slot you occupied)
- Session duration
- Protocol (web/telnet/SSH)

### From your activity on the BBS
- Message posts you author (subject, body, recipient, conference)
- File uploads you perform (filename, size, description)
- File downloads you perform
- Chat and voice/video session metadata (if you use `/chat/`)
- Door game scores, match results, and related in-game events
- Call statistics (total calls, calls today, bytes up/down, ratios)

## Why we collect it

- **Operate your account.** We need the handle + password to let you
  log in, the preferences to render the BBS the way you like, the
  activity stats to enforce ratios and time limits.
- **Let you communicate.** Messages, chat, and voice sessions
  inherently route through the server; the server stores them so other
  users can see them later.
- **Keep the BBS working and abuse-free.** Session logs and CallersLog
  entries help the sysop diagnose crashes, spot abusive patterns, and
  investigate complaints.

## Legal basis

- **Your explicit consent** to this notice (captured at registration;
  re-captured on first login for pre-GDPR accounts).
- **Legitimate interest** in operating a functional BBS (Art. 6(1)(f)
  GDPR).

## How long we keep it

- **Logs and call records:** bounded in size by the
  `LogRetentionService` (default 10 MB per log file, tail-trimmed
  daily). Older entries age out naturally.
- **Profile, posts, uploads, chat logs:** kept until you request
  deletion (run `W` -> `20 DELETE MY ACCOUNT (GDPR)`) or the
  service shuts down, whichever comes first.
- **Session metadata on disconnect:** non-identifying portions may be
  retained in call logs within the retention window above.

## Who sees it

- **The sysop**, via the admin UI and disk files.
- **Hetzner** (hosting provider) has physical access to the server.
- **Discord / Slack** (only if the sysop has configured webhooks).
  By default the `WEBHOOK_INCLUDE_PII` tooltype is off, so webhook
  payloads carry `User #<id>` instead of your handle and strip real
  name, location, phone, email. The sysop can turn this off to send
  full payloads (not recommended; documented here for transparency).

No third-party advertising, analytics, or tracking.

## Your rights (GDPR Art. 15–22)

From the BBS main menu run `W` (Write User Parameters), then:

- **19 VIEW MY DATA** — prints the data we hold on you: profile,
  consent stamps, call stats, GDPR metadata. Right of access
  (Art. 15) and portability (Art. 20, in terminal-readable form).
- **20 DELETE MY ACCOUNT (GDPR)** — soft-deletes your account,
  scrubs your handle + free-text PII from the user row, replaces
  message bodies with `*** erased ***`, scrubs your questionnaire
  answers, and redacts recent logs. Three-step confirm:
  literal `YES ERASE` -> password re-entry -> type your handle.
  Right to erasure (Art. 17).
- **Rectification** (Art. 16) — the other `W` options let you edit
  your profile fields. Password changes in particular go through
  `W` -> `6 PASSWORD`.
- **Restriction / object** (Art. 18/21) — folded into erasure for
  this pseudonymous service. Email the sysop if you need something
  more granular.
- **Complaint** — contact the sysop at the address in
  `Screens/PRIVACY.TXT`. If they don't help, your national DPA.

## Security

- Passwords: bcrypt (cost 10 at time of writing) — plaintext never
  stored.
- Transport: HTTPS for the web client. Telnet on port 2323 is
  **cleartext by design** (period-authentic). SSH on port 2222
  is available.
- At rest: SQLite file on the hosting volume; filesystem ACLs are
  the boundary.
- Cross-tab session isolation: see the 2026-04-24 fix — a user
  opening a second tab does not see the first tab's output.

## Breach notification

The sysop pledges best-effort breach notification within 72 hours
of becoming aware of an incident that materially affects your data.

## Children

The service is not directed at users under 16 (EU) / 18 (US). If
you're under that age for your jurisdiction, please don't register.

## Version history

- **1.0** (2026-04-24) — initial GDPR baseline notice.

The version number is stamped on your consent at registration and on
backfill. If we publish a 2.0, you'll be prompted on next login to
re-consent.

## Source of truth for this document

The terminal copy (`Screens/PRIVACY.TXT`) is the canonical consent
text; this file is the longer-form companion. If they ever disagree,
`PRIVACY.TXT` wins for what users actually accepted.

Implementation plan: `thoughts/shared/plans/2026-04-24-gdpr-hobby-baseline.md`.
