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
`doorman-layout.test.ts`, `theme-picker.test.ts`):

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

`web/backend/tests/forty-col-sweep.test.ts` sweeps every adapted surface; add
your door's builder to it. The SDK baselines
`sdk/tests/unit/{eighty,forty}-col-baseline.test.ts` guard the widgets - never
regenerate the eighty-col snapshot.

## 6. Ship

- `dist/` is what runs: the pre-commit hook rebuilds the door you touched; one
  door directory per agent, or the hook sweeps another agent's work in.
- Run `.claude/skills/door-sdk-freshness/SKILL.md` after SDK edits; restart the
  backend before any manual walk.
- Manual walk (sysop): web `P` session and a telnet C64, the door at 40; an
  80-column session shows no change. Record the walk in the handoff.

## What not to do

- Do not fold an 80-column layout by wrapping it - stack it.
- Do not hand-roll widgets the SDK ships (overlay, layout, status-bar,
  menu-bar, modals, prompt, panel, fkey-bar); their tiers are already done.
- Do not add a second width source, a second breakpoint ladder, or a second
  art detector; extend the one that exists.
- Do not silence a 40-column test with `it.todo`; unmark the door instead.
