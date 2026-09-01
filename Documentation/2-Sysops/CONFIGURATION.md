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

**Deployment follow-up — port not yet exposed.** `TELNET_PETSCII_PORT` is
wired on the backend only. Nothing outside the container can reach it yet:
`docker-compose.yml` does not publish a `6464:6464`-style port mapping (see
the `TELNET_PORT`/`SSH_PORT` pattern already there), and
`deploy/hetzner-setup.sh` does not open it in `ufw`. Exposing real C64 access
requires both changes plus a stack restart; until then the dedicated-port
detection path can only be exercised on `localhost`. This is a known sysop
follow-up, not yet done.

**Need more detail?** See the archived files for CLI-based configuration (Webhooks, Deployment). Today's documentation keeps settings explicit while deferring granular automation flows to the archives.
