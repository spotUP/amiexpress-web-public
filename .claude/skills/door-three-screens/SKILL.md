---
name: door-three-screens
description: How a new or changed TypeScript door is designed and proven for all three screens this board serves - fixed Amiga ANSI 80x25, responsive Amiga ANSI (wider terminals), and C64 PETSCII 40x25 with PETSCII graphics. Load before writing or reviewing any door UI.
---

# One door, three screens

Every door on this board is reached by three kinds of caller. A door is not
done until it has been PROVEN on all three, in this order, and each proof is a
test that drives the door's real screen, not a source pin.

| Screen | Geometry | Who | Non-negotiable |
|---|---|---|---|
| Fixed Amiga ANSI | 80x25 (blessed uses 80x24) | web xterm, telnet, SSH at 80 | byte-identical to what it painted before your change |
| Responsive Amiga ANSI | >80 wide, any height | wide xterm, 132-col telnet | layout grows from `screen.width`, never from a constant |
| C64 PETSCII | exactly 40x25, 16 colours, no per-cell background | web `P` session, autodetected C64 over telnet | every painted row <= 40 columns, effects off, PETSCII-mappable glyphs only |

Read `Documentation/2-Sysops/CONFIGURATION.md` section 5 (the tooltypes) and
`thoughts/shared/handoffs/2026-09-02_c64-40col-adaptation.md` (the walk) once.

## 0. A door repaints what CHANGED, never the screen

This comes first because it decides how the code is written, not how it is
tuned afterwards. The sysop has had to ask for it on door after door; if you
are writing door UI and have not thought about repaint cost, you are not
finished designing.

**68K door (C SDK).** Every 198 bytes is one XIM message, ~45 ms of emulation.
A full repaint of a seven-row list is ~1,900 bytes - ten messages, half a
second, on every keypress. THEME (C) did exactly that until 2026-09-07 and the
sysop's report was "its slow".

- Keep `drawn_*` state per widget; on a keypress repaint only the cells that
  differ. `ui_list_draw_changed(list, buf, rows_changed)` does this for a list.
- Full draw only on the first frame and after something that moves many rows:
  theme change, resize, a mark moving.
- Animation ticks touch ONE row (the masthead), never the frame.
- Never `ansi_clear()` between keypresses.
- Compose a frame into the buffer and flush ONCE - two writes are two
  messages.

**TypeScript door (blessed SDK).** `Screen._differentialRendering` is ON by
default, so `screen.render()` already emits only changed cells - your job is
not to defeat it:

- Mutate the element that changed (`setContent`, `setLabel`) and call
  `screen.render()`. Do not rebuild the widget tree per frame: destroying an
  element sets `_fullRedrawNeeded` and ships the whole 80x24 screen.
- `forceFullRedraw()` is for a real transition (dialog closed, screen
  swapped), not for "make sure it's right".
- `setDifferentialRendering(false)` is an escape hatch for a door that
  bypasses the cell buffer. If you reach for it, say why in a comment.
- Before 2026-08-25 this was gated behind modem emulation and every frame
  shipped 10-40 KB - 0.2-0.8 MB/s per player. That is what a full redraw
  costs when nobody is watching.

**Measure it, do not guess.** Numbers, not an opinion that it "feels fine":

    npx tsx --tsconfig web/backend/tsconfig.json \
      dev/scripts/door-probe/repaint-cost.ts <binary> --cols 80
    npx tsx --tsconfig web/backend/tsconfig.json \
      dev/scripts/door-probe/repaint-cost.ts <binary> --cols 40
    make -C sdk/c probe     # both widths against the proof door

It drives the real binary through the board's emulator and prints, per key,
the bytes net of animation and the XIM message count. THEME (C) after the fix:
~210 bytes, 2 messages, first byte in 100-250 ms. **More than a few hundred
bytes for a cursor move means the door is not drawing smart** - fix it before
shipping, and put the measurement in the handoff.

## 1. Geometry comes from the screen, never from a number

- Build the screen with `createScreen(bbs, {...})` from
  `sdk/utils/blessed-helpers.ts`. It reads `bbs.getTerminalSize()`, which the
  backend answers from the ONE width source (`doorScreenWidth()`,
  `web/backend/src/amiga-emulation/xim/screen-width.util.ts`). `new Screen({})`
  is the DOORMAN bug of 2026-09-02: the door painted 80 columns onto a 40-column
  canvas and folded.
- Exactly 80 keeps the legacy pipeline; compact (40) and wide (>80) go
  responsive. Do not special-case 41-79; the backend clamps ANSI prose to
  `max(80, reported)` and the SDK leaves those on the legacy path.
- Read the tier, do not compare widths yourself:
  `getBreakpointName(screen.width)` (`'xxs'` at 40), `getCompactProfile(width)`
  (`borders`, `singleColumn`, `collapseChrome`, `gap`, `padding`),
  `isCompactWidth(width)`, `effectsAllowed(width)`,
  `calculateDialogWidth(width)` - all flat exports of `@amiexpress/bbs-door-sdk`.
- Every panel, list column, masthead, rule and box takes its width from the
  screen or the profile. A literal `80`, `40`, `substring(0, 34)` in layout code
  is a defect; the only literal allowed is a `|| 80` fallback for an unknown
  width.

## 2. The 40-column layout rules

- `singleColumn`: side-by-side panes stack (list above detail). One record per
  row; drop columns the profile cannot fit rather than truncating every cell.
- `borders === false`: no frames; `collapseChrome`: masthead plus status in one
  row; padding from the profile.
- Effects OFF when `!effectsAllowed(width)`: masthead rails, glitch and
  typewriter effects, wipes. A moving effect on a 40-column canvas leaves stray
  glyphs mid-row (DOORMAN, 2026-09-02).
- Rows may use all 40 columns (the PETSCII transducer holds a pending wrap, so
  40 glyphs plus CRLF costs no blank line). A prompt the cursor rests on uses 39.
- Prose goes through the choke, never `socket.emit`: `bbs.write()`/`writeLine()`
  wrap for a PETSCII session via `wrapDoorTextForSession`; positioned output is
  left alone. A door that builds a long line from several writes defeats the
  choke - build the string, then write it once.
- The C64 command prompt is `[2:Conference] (120 mins): ` - keep your own
  prompts as short.

## 3. PETSCII graphics

The C64 shows what the transducer (`sdk/petscii/ansi-to-petscii.ts`) can map:

- Glyphs: the table in `sdk/petscii/unicode-to-petscii.ts` - single-line box
  drawing (heavy, double and rounded fall back to single), the block elements
  PETSCII has (`$61-$67`, `$6C`, `$7B`, `$7C`, `$7E`, `$7F`, half and quarter
  blocks, shades), and the symbols listed there. Anything else prints `?`.
  Design chrome from those glyphs; check a new glyph against the table before
  using it.
- Colour: 16 VIC-II colours, nearest match from truecolor/256/16 SGR. No
  per-cell background - PETSCII has none. Reverse video is the only way to fill
  a cell (`rvs` space = solid block in the pen colour). Screen background and
  border are set once by the BBS (`$02` convention); a door must not depend on
  a coloured backdrop behind text.
- Cursor addressing is honoured (CUP, save/restore); scrolling regions and
  alternate screens are not. Paint the whole screen, then diff-paint.
- Title art for a C64 is a `.seq` file the sysop commissions; an 80-column ANSI
  art screen is never folded, it is skipped with a token. Give your door a
  `.seq` title if it has an ANSI one.

## 4. Gates and marks (the door must declare what it fits)

- `Commands/BBSCmd/<CMD>.info` tooltypes, numeric, absent = closed:
  `MIN_COLUMNS=40` - a TypeScript door that has been adapted and proven at 40
  (shows `[40]`); `C64_ADAPT=40` - a 68K door served through the frame adapter
  (shows `[C64]`). A PETSCII caller is refused with a one-line notice for any
  door carrying neither. Never mark a door you have not proven; the mark is a
  promise the gate enforces.
- Edit `.info` files with `applyTooltypes()` (bytes), never an editor.

## 5. Proof - the tests a door ships with

Put them in `web/backend/tests/doors/compact-40/<door>.test.ts` (see
`doorman-layout.test.ts`, `screen-theme-picker.test.ts`):

1. **80-column identity** - capture the (glyph, SGR) grid of the rendered 80x24
   screen from the code BEFORE your change, pin it, and keep it green after.
   Blessed's fill pass may change byte counts; the painted grid may not.
2. **40x25 layout** - drive the door's real screen with a stub `bbs` whose
   `getTerminalSize()` returns 40x25: every painted row <= 40 (`_getCoords` or
   the buffer), stacked panes, chrome height 1, effects gated (spy on the SDK
   masthead/glitch function: 0 calls at 40, 1 at 80).
3. **Responsive** - the same at 132x40: no clipping, columns grow.
4. **Gate reachability** - add the door to
   `web/backend/tests/doors/compact-40/marked-doors-launch-on-c64.test.ts`:
   a PETSCII session launches it through the real `executeDoor`, an ANSI
   session launches byte-identically.
5. **PETSCII oracle** (for anything with graphics) - feed the door's 40-column
   frames through `AnsiToPetsciiTransducer` into a `PetsciiMachine` and assert
   the glyphs you drew are on the glass (no `?`), pattern in
   `web/backend/tests/petscii-frame/c64-door-adapter-corpus-e2e.test.ts`.
6. Prove RED: revert the width rule, the 40-column test must fail; put a
   constant back, the 80-column pin must fail.
7. **One reachability test per door** - drive the real entry point (the 68K
   binary or the shipped `dist/` pair), count a sentinel proving the new code
   ran, and assert the bytes on disk, not a mock call. Reference:
   `web/backend/tests/doors/w-door-saves-location-and-returns-from-notify.test.ts`.
8. **Fixtures are committed and a missing one FAILS the test** - a test that
   writes its own fixture on first run pins whatever the door does. Reference:
   `web/backend/tests/doors/compact-40/usersettings-40.test.ts:9-14,47`.
9. **Wait for output, never fixed sleeps** - drive keys on the frame or text
   appearing; fixed `at:` timings went red under load (263 s). Reference: idle
   steps at `usersettings-40.test.ts:51,87`.
10. **Per-sink assertions** - a secret test first shows each sink DID carry the
    message, then asserts absence; a sink that is empty proves nothing. Assert
    per key, not on the contiguous string (`!includes('Zebra7')` passes while a
    one-char-per-line trace leaks). Reference: `web/backend/tests/xim/redact.test.ts`.
11. **Reuse the shared harnesses, do not copy them** -
    `web/backend/tests/doors/dispatch-harness.ts`,
    `web/backend/tests/doors/compact-40/door-capture.ts`,
    `web/backend/tests/doors/compact-40/fixtures/drive-door.cjs`.

`web/backend/tests/forty-col-sweep.test.ts` sweeps every adapted surface; add
your door's builder to it. The SDK baselines
`sdk/tests/unit/{eighty,forty}-col-baseline.test.ts` guard the widgets - never
regenerate the eighty-col snapshot.

## 5a. Look-and-feel parity with the sibling doors

A door passes this checklist at 80, wide and 40 before it is called done.
Compare it side by side with THEME (C) / SUBS / NOTIFY.

- **Animate the masthead rail while idle** - a door that sits still looks
  dead next to its siblings. C: `ui_key` `idle` hook calling
  `ui_masthead_rail_tick` with `UI_RAIL_STEP` / `UI_RAIL_TICK_DELAY`, touching
  the rail only (`sdk/c/examples/achieve/achieve.c:201-229`; hook at
  `sdk/c/include/ui_key.h:88`). TS: `attachDoorChrome`
  (`sdk/engines/ui/theme/chrome.ts:671`). Off at 40 (section 2).
- **Text role -> theme token (binding)**; never a hardcoded colour
  (`sdk/c/include/ui_theme.h:88`):

  | Role | Token |
  |---|---|
  | background (paint it, never bg -1) | GROUND |
  | primary text, labels | INK |
  | secondary text, hints | DIM |
  | values | ACCENT_ALT |
  | section headings | ACCENT |
  | frames, dividers | CHROME |
  | masthead, key bar | BAR + BAR_INK |
  | selected row | SELECTION_BG + SELECTION_INK |
  | success / refusal / caution | OK / ALERT / WARN |

  One empty line between sections.
- **Mouse hover** - TS: `enableMouse` plus list mouse (NOTIFY:
  `Doors/notify/app.ts:67`). C: no SDK mouse support yet; note the gap in the
  handoff, do not hand-roll it.
- **Leave keys are `q`, `Q`, `Esc`, `X`, and nothing else binds `q`** - NOTIFY
  bound `q` to Quiet hours, so a W caller pressing `q` landed in the wrong
  screen (2026-10-15). Reference: `Doors/notify/app.ts:393`; quiet hours is F3.
- **A long list follows page-wise** - one-row scroll repaints the whole box
  per key; set `page_follow` (`sdk/c/include/ui_list.h:59`); no scroll regions
  on PETSCII.
- **Scrollbars are the SDK's, one look** (sysop, 2026-10-15): solid colour
  bars, track = a space on DIM, thumb = a space on INK (BAR is the ground in six themes), no glyphs (identical in
  Topaz/latin1 and as reverse space in PETSCII), hover ACCENT where the mouse is
  supported. A door never passes its own scrollbar glyphs or colours: the
  unification has LANDED, and the `scrollbar` option is `boolean` (on/off), so
  a glyph or colour object does not type-check. Write `scrollbar: true` and
  nothing else. Reference implementations:
  - TypeScript: `Element.renderScrollbar` (`sdk/engines/ui/blessed/core/element.ts:2734`)
    reads the roles from `scrollbarRoles(activeTheme())`
    (`sdk/engines/ui/theme/styles.ts:97`: track = DIM, thumb = INK, hover = ACCENT)
    and the thumb from `thumbGeometry` (`sdk/engines/ui/blessed/core/scrollbar.ts:23`).
    A theme switch recolours it because `retintTree` activates the new theme
    (`sdk/engines/ui/theme/live.ts`). The ANSI editor's tagged-box bar uses the
    same two functions (`sdk/engines/ui/ansi-editor/rendering/viewport.ts`).
  - C: `draw_row` in `sdk/c/src/ui_list.c` (the `scroll_track` / `scroll_thumb`
    fields, defaulting to the DIM and INK tokens). A screen with no cell
    backgrounds gets a reverse-video space; a cursor move at the same offset
    does not rewrite the bar.
  - Proof: `sdk/test/one-scrollbar.test.ts`, `sdk/c/tests/test_ui_list.c`,
    `sdk/tests/unit/the-scroll-bar-is-solid-blocks-on-a-c64.test.ts`.

## 5b. 40-column traps (each one shipped broken once)

- **Measure the row length BEFORE clipping** - a clipped row always passes the
  "<= 40" check, so the test proves nothing. Measure the composed row, then
  clip, and assert on the pre-clip length. Reference: the overflow scan in
  `usersettings-40.test.ts:147`.
- **The scrollbar takes one column** - the text area is `width - 1`, not
  `width`.
- **Message rows wrap at the width actually drawn**, not at the screen width.
- **Keep the row below a stacked label visible** - when a label sits above its
  value, set `follow_extra = 1` so the window keeps both rows
  (`sdk/c/include/ui_list.h:64`).

## 5c. Board integration (a door that talks to the board)

- **A new board-own AEW command that awaits goes in `ASYNC_OUTPUT_COMMANDS`**
  (`web/backend/src/amiga-emulation/session/lifecycle/door-message-callbacks.ts:72`)
  - else the door reads its own request back (AEW_POSTMSG race, 2026-10-04).
- **Answer through `writeMessageString`**
  (`web/backend/src/amiga-emulation/xim/messages.ts:243`) - it zeroes the whole
  String, so no secret tail stays behind; on a throw answer empty so the door
  never hangs.
- **Secrets stay out of all seven XIM log sinks and the keystroke traces** -
  redact the request (`web/backend/src/amiga-emulation/xim/redact.ts:13`) and
  wrap every masked entry in `AEW_USERFIELD SECRET 1|0` (C: `ae_uf_secret`,
  `sdk/c/include/ae_userfield.h:65`; board: `xim/secret-input.ts:19`,
  `io.ts:24`). Trace every path a key can take (hotkey readers too, not only
  `queueInput`).
- **Gate writes on OPEN** - SET/PASSWORD/CHOICES refuse unless the door said
  OPEN (ACS gate, `web/backend/src/amiga-emulation/xim/userfield.ts:50,104`).
- **Register only through `writeNewDoorRegistration`
  (`web/backend/src/services/config-services/door-info-file.service.ts:409`)
  and `applyTooltypes` (`web/backend/src/utils/info-file.util.ts:927`)** - never
  hand-edit `.info` bytes.
- **An admin import of backend code through a vite alias needs a Dockerfile
  config-builder `COPY`** - the build passes locally and the deploy fails
  (`Dockerfile:93`; guard `web/backend/tests/dockerfile-copies-admin-sources.test.ts`).
- **A TS door's `dist/` is built and committed** (RULES.md section 5).
- **A settings door declares `SETTINGS=YES`, `SETTINGS_LABEL`,
  `SETTINGS_SECTION`, `DESCRIPTION`** so it appears in W
  (`web/backend/src/handlers/commands/w-settings-doors.ts:12-14`).
- **Return to the hub through the settings-resume loop, never a nested call** -
  a nested `processCommand` stacked 8 frames deep per round trip. Reference:
  `runReturnedCommand` (`web/backend/src/handlers/commands/settings-resume.ts:82`,
  called at `door.handler.ts:3249`); drop the record when the caller is leaving
  (`theCallerIsLeaving`, `door.handler.ts:1282`).

## 6. Ship

- `dist/` is what runs: the pre-commit hook rebuilds the door you touched; one
  door directory per agent, or the hook sweeps another agent's work in.
- Run `.claude/skills/door-sdk-freshness/SKILL.md` after SDK edits; restart the
  backend before any manual walk.
- Manual walk (sysop): web `P` session and a telnet C64, the door at 40; an
  80-column session shows no change. Record the walk in the handoff.
- Repaint cost measured at 80 and 40 (section 0), and the numbers recorded
  beside the walk.

## What not to do

- Do not fold an 80-column layout by wrapping it - stack it.
- Do not hand-roll widgets the SDK ships (overlay, layout, status-bar,
  menu-bar, modals, prompt, panel, fkey-bar); their tiers are already done.
- Do not add a second width source, a second breakpoint ladder, or a second
  art detector; extend the one that exists.
- Do not silence a 40-column test with `it.todo`; unmark the door instead.
- Do not repaint the screen on a keypress, and do not ship a door whose
  repaint cost you have not measured (section 0). This is the note the sysop
  has had to write on door after door.
