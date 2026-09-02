# System Configuration Guide (Summary)
**Legacy docs containing deep dives now live in `archive/CONFIG_APP_PLAN.md`, `archive/CONFIG_APP_ANALYSIS.md`, and `archive/PRODUCTION_READINESS.md`.**

## 1. Core Configuration Files
- **`.env`**: Set `PORT`, `SOCKET_PORT`, `DATABASE_URL`, `SESSION_SECRET`, `API_KEY`, and door-specific toggles (e.g., `AQUASCAN_CONF`).
- **`storage/conf/` and `Doors/`**: Mirror the Amiga directory layout (Conf1..ConfN, Dir1..DirN) to keep ECS (external command sequences) data consistent with express.e.
- **Command definitions** now live in `web/backend/src/bbs-data/commands`; customizations reflect `Commands/` screens using the original 1:1 format remembered in `archive/COMMAND_HANDLER_MODULARIZATION.md`.

## 2. Access Levels & Security
- Security levels (0–255) match express.e semantics. Adjust them through the UI or by editing the `securityLevels` table in the database.
- Command and door access checks use the original ACS bits; review `archive/SECURITY_FIXES.md` for how we preserved `PRV_COMMAND`, `PRV_GROUP`, and flag queries.
- `AO_FLAGS`, `ACS` files, and ACS bits are automatically generated from `Commands`/`Access` definitions when the importer runs.

## 3. Runtime Settings
- Terminal size and pause behavior are read from each user’s profile (height/width) to pause FR/FS exactly where express.e would.
- Logging level (`LOG_LEVEL`) and door debugging toggles (e.g., `DEBUG_XIM_OUTPUT`) are toggled via `.env`.
- `AUTO_RESTART` watchers restarts the backend using `dev/scripts/start-servers.sh` when a crash is detected (see `archive/DEPLOYMENT_SCRIPTS.md`).

## 4. File and Door Data
- Ensure `Screens` files (ANSI/petscii) and door configs match express.e names and folder structure; corrupted or misaligned ASCII art gets split into continuation blocks within FR parsing.
- `Dir1`/`DirX` files are auto-created if missing during uploads to keep door file lookups valid (AmiExpress always expects file area definitions).
- Use `archive/CONFIG_APP_PLAN.md` for multi-stage deployment config layering, and `archive/CONFIG_APP_ANALYSIS.md` for field mappings between express.e screens and modern React components.

## 5. PETSCII (Commodore 64 callers)

**Detecting a real C64.** A genuine C64 dialing in over a WiFi modem (WiModem232,
1541 Ultimate, etc.) typically negotiates no telnet options at all, so the usual
TTYPE handshake never fires. The BBS uses a ladder of signals, strongest first:

1. **Dedicated PETSCII port** — set `TELNET_PETSCII_PORT` (suggested value: 6464,
   the Synchronet convention) and every connection accepted on that port is
   treated as C64/PETSCII from the first byte. This is the only signal that
   cannot be wrong: a real C64 negotiating nothing still gets the right mode.
   A later TTYPE reply on that port cannot downgrade the session back to ANSI.
2. **TTYPE** — if the client reports a terminal type containing `C64`,
   `COMMODORE`, or `PETSCII`, the session is set to 40x25 PETSCII.
3. **DEL-probe** — the first keypress a connection sends, both at initial
   connect and again at the graphics prompt, is classified before it is
   treated as a menu answer: PETSCII DEL is byte `$14` and shifted C64 letters
   arrive as `$C1`-`$DA`; ASCII terminals send backspace `$08`, DEL `$7F`, or
   lowercase `$61`-`$7A` for the same keys. A `$14` or `$C1`-`$DA` byte commits
   the session to PETSCII and skips the graphics prompt entirely — this is
   what lets a real C64 auto-detect even though it negotiated nothing.
4. **NAWS 40x25** — a window-size hint only, not proof of a C64 (any modern
   terminal resized to 40 columns would match); demoted below TTYPE and the
   DEL-probe.

**The graphics prompt.** Modern/undetected callers see three lines, each 40
columns or fewer and in uppercase (so it stays readable on a power-on C64,
which boots into the uppercase/graphics charset):

```
COMMODORE 64: PRESS <DEL>
ANSI, RIP, PETSCII OR NO GRAPHICS
(A/R/P/N) [Q=SKIP BULLETINS]?
```

Pressing `P` on a modern terminal prints `PETSCII: SIMULATING C64 DISPLAY
(40X25)` and switches the browser terminal to the PetsciiCanvas renderer;
pressing DEL (or any byte the DEL-probe recognizes) on a real C64 skips this
prompt and the BBS goes straight to PETSCII mode.

**`.seq` screen variants.** Screen files ending in `.seq` are treated as raw
PETSCII byte content (not text) and are preferred over `.TXT`/ANSI variants
once a session is in PETSCII mode. A `_C64.seq` variant, when present, is
preferred over a plain `.seq` for callers whose `terminalType` is exactly
`c64` (i.e. real hardware, not the browser's simulated PETSCII mode). `.seq`
detection is by file extension only — any file uploaded to a file area named
`*.seq` will be read as PETSCII content by this same check if a screen path
ever loads it.

**MCI codes inside a `.seq` — the first byte opts the file in.** A `.seq` is
normally raw PETSCII art and is sent to the caller byte for byte. If its
**first byte is `~`** (`0x7E`), the BBS treats the whole file as an MCI screen
instead and substitutes codes exactly as it does in a `.TXT` — this is
express.e's own gate (`express.e:6800-6806`), evaluated ONCE, on byte 0, per
FILE. Nothing else opts a file in: a `~` on line 3 of an art file changes
nothing, and no shipped art file is affected (every `BBSTITLE.SEQ` on this
board starts `0x20` or `0x1F`). The only gated files shipped are the twelve
`Conf*/Screens/Logoff.seq`.

**Authoring rule.** Once a `.seq` opens with `~`, EVERY `0x7E` in that file is
a token candidate — including ones you meant as art. Write `~~` for a literal
`~`. If your screen needs `~` as a graphic character, do not gate the file.

**Which codes work.** All of them. There is no reduced set for PETSCII: the
same dispatch table and the same pre-pass stages serve `.TXT` and `.seq`, and
a parity test fails the build if a code is ever added to one and not the other.
That includes the structural ones — `~SS_`, `~SR_`, `~CC_`, `~f` and `~SP` run
in document order, so art before an include is painted before it and art after
it is painted after, in the charset bank and cursor position the include left
behind.

**What the codes do on a C64.** A C64 is not an ANSI terminal, and several
codes mean something narrower there:

| Code | On a C64 |
|---|---|
| `~WX` (wipes) | Never animates — screen effects are off for a PETSCII session. The directive is stripped and never printed. |
| `~c0`..`~c7` | One VIC pen byte. Holds until art or another code changes it. |
| `~b0`..`~b7`, `~z0`..`~z7` | CCGMS `$02 <colour>`: sets background **and border** together. They cannot be set independently on a C64. Inert on SyncTERM's C64 mode. |
| `~f` | `$93` CLR — clears, homes the cursor, and repaints in the current pen. |
| `~q` | Reverse off plus the default pen. There is no all-attributes reset on a C64. |
| `~CR`, `~n*` | `$0D`, which on a C64 also cancels reverse. Real KERNAL behaviour. |
| `~x`, `~y` | A relative cursor walk (`$11`/`$1D`) from wherever the cursor is; the C64 has no absolute cursor address. Clamped to 40x25. |
| `~AK` | Thirteen plain rows, no colour — the ANSI frame has no C64 equivalent worth faking. |
| `~SP` | Pauses and resumes on the same screen: bank, cursor, pen and reverse continue across the pause. |

Substituted values inherit the pen and reverse state your art left set — they
never emit a colour byte or a bank switch of their own — they fold to uppercase
in the upper-case/graphics bank rather than flipping the bank, and they **clip
at the end of their row**: a long value stops at the right edge instead of
wrapping onto your next line or scrolling the screen.

**Include lookup prefers `.seq`.** `~SS_NAME` and `~SR_NAME` resolve `.seq`
before `.TXT` for a caller in PETSCII mode (an ANSI caller's order is
unchanged). A name that already carries a known extension has it **swapped**,
not appended: `~SR_.../logoff/logoff.seq` looks for `001.logoff.seq` and then
`001.logoff.txt`, rather than for `001.logoff.seq.seq`. Includes nest at most
eight deep; a screen that includes itself stops there instead of taking the
session down.

**Author 40-column art for PETSCII callers.** An include that resolves to
80-column ANSI is not reflowed — the caller is shown
`[80-COLUMN ANSI SCREEN - SKIPPED]`. If a screen matters on a C64, ship a
40-column `.seq` beside the `.TXT`. This is the reason a C64 caller currently
sees that token at logoff: `Screens/logoff/` holds only 80-column `.txt` art.


**Which doors a C64 may enter — `MIN_COLUMNS` and `C64_ADAPT`.** Both are
tooltypes in the door's `Commands/BBSCmd/<CMD>.info` (or its installed 68K
record), and both are **default-closed**: a door that declares neither is
refused to a 40-column caller with `THIS DOOR NEEDS AN 80 COLUMN SCREEN` and
the caller lands back on the menu. Nothing else on the board changes — an
ANSI caller is never affected by either tooltype.

| Tooltype | Claim | Marker in the DOORS list |
|---|---|---|
| `MIN_COLUMNS=40` | "this door already fits 40 columns" — its own layout is width-driven | `[40]` |
| `C64_ADAPT=40` | "this 68K door reaches 40 columns through the adapter" | `[C64]` |

They are deliberately separate. `MIN_COLUMNS` is a statement about the door's
own output and is the right mark for a TypeScript door that lays itself out
from the terminal width. `C64_ADAPT` is a statement about an unmodified
80-column Amiga binary: the BBS replays the door's ANSI onto a virtual 80x25
grid and reduces each finished frame to 40 columns, keeping table columns side
by side and ending any column that lost characters with `>`. A door is never
shown both markers - `[40]` wins when both tooltypes are present.

**`MIN_COLUMNS` is a claim the BBS cannot check.** The gate reads a number, not
a door type. Putting `MIN_COLUMNS=40` on a 68K door (`XIM`, `DD`, `AMI`, `SIM`,
`FIM`) therefore DOES open it to a 40-column caller - and that caller then gets
the door's raw 80-column bytes, unadapted, because nothing in an unmodified
Amiga binary narrows its own output. It is a false claim in the registry, not a
rejected one. The board says so at registration:

```
[initializeDoors] WARN: door WHO is TYPE=XIM and declares MIN_COLUMNS=40 - a
68K door cannot narrow its own output, so it will serve raw 80-column bytes to
a 40-column caller. Use C64_ADAPT=40 instead.
```

Use `C64_ADAPT` for those doors. `MIN_COLUMNS=40` belongs on a door whose own
layout is width-driven.

`C64_ADAPT` only has an effect on the 68K door types whose output crosses the
adapter's seam — `XIM`, `DD`, `AMI`, `SIM`, `FIM`. Setting it on a TypeScript,
AREXX, MCI or WEB door does nothing: those doors paint their own screen and
the adapter never sees it. The value is a column count, read strictly (only
digits), and the caller must have at least that many columns.

Marked today, after the Phase 3 adaptation work:

- `C64_ADAPT=40` — `WHO` (RTW), `S` (ustats), `WHAT`. Note that `RTW` is a
  second command pointing at the same binary as `WHO` and is deliberately NOT
  marked: the claim is per registration, not per executable.
- `MIN_COLUMNS=40` — `THEME`, `DOORS`, `BUGS`, `DOORMAN`, `STRIP`,
  `PHREAKWARS`.

To mark a door, edit its tooltypes with the `info-editor` CLI
(`Documentation/2-Sysops/INFO_EDITOR.md`) rather than a text editor — an
`.info` file is an Amiga icon binary and a text editor destroys it:

```bash
npx tsx web/backend/src/scripts/info-editor.ts Commands/BBSCmd/WHO.info set C64_ADAPT 40
```

The BBS re-reads `Commands/BBSCmd` whenever its mtime moves, so the new
tooltype takes effect on the next command without a restart.

**A conference's `MENU_PROMPT` tooltype is yours to size.** The board's own
command prompt has a 40-column form (no board name, no the word "Menu",
`mins` for `mins. left`, the conference name clamped to the room left). A
`MENU_PROMPT` you write in a conference's `.info` replaces that prompt whole,
and the BBS does not rebuild it: only you know which of your words may be
dropped. It is not left to run off the edge, though — a sysop prompt crosses
the same width choke as every other piece of prose the board sends, so a
40-column caller gets it word-wrapped at forty rather than smeared. If you want
a C64 caller to see a short prompt, write a short one.

**Deployment follow-up — port not yet exposed.** `TELNET_PETSCII_PORT` is
wired on the backend only. Nothing outside the container can reach it yet:
`docker-compose.yml` does not publish a `6464:6464`-style port mapping (see
the `TELNET_PORT`/`SSH_PORT` pattern already there), and
`deploy/hetzner-setup.sh` does not open it in `ufw`. Exposing real C64 access
requires both changes plus a stack restart; until then the dedicated-port
detection path can only be exercised on `localhost`. This is a known sysop
follow-up, not yet done.

**Need more detail?** See the archived files for CLI-based configuration (Webhooks, Deployment). Today's documentation keeps settings explicit while deferring granular automation flows to the archives.
