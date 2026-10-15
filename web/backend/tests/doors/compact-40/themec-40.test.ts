/**
 * THEMEC opens on a 40-column caller, and the theme list is readable there.
 *
 * The sysop's report, 2026-09-06: THEMEC opened the right door at last and
 * then said THIS DOOR NEEDS AN 80 COLUMN SCREEN. The gate was right to refuse
 * it - the door really was painting 80 columns, and the reason is below.
 *
 * THE ROOT CAUSE, so this file is not read as a layout tweak. theme_picker.c
 * has asked the board for the caller's width since the day it was written
 * (`ui_screen_open` -> `ae_screen_cols` -> AE_FIELD_SCREEN_COLS, which is
 * BB_SCRWIDTH). express.e:3865 answers that field in the message's DATA
 * (`msg.data:=screen.width`), and the SDK's AEDoor transport only ever copied
 * the message's STRING - so every C door on every board was told 80, whatever
 * the caller had, and its 40-column tier was dead code. Fixed in
 * sdk/c/src/ae_transport_amiga.c (`field_answers_in_data`).
 *
 * WHY THIS IS A RUNTIME PROOF AND NOT A SOURCE PIN. The real 68K binary runs
 * under the real emulator on a real petsciiMode session; the bytes it writes
 * to the socket are replayed through the SDK's own AnsiToPetsciiTransducer
 * into its PetsciiMachine, which is the KERNAL oracle. The assertions are
 * about painted CELLS on that machine - what a C64 is showing - not about
 * what the door emitted or how many times something was called.
 *
 * RED proof (recorded 2026-09-06): rebuilt Doors/THEMEC/themec from the
 * transport WITHOUT `field_answers_in_data` and re-ran. The 40-column case
 * fails - `ae_screen_cols` falls back to 80, the door draws a bordered
 * 78-column list into 40 cells, the top border wraps onto row 2 and the
 * masthead is scrolled off, so row 1 is `+-  THEMES  ---...` and the note and
 * footer land on rows 21-23 rather than 24-25.
 */
import 'reflect-metadata';
import * as fs from 'fs';
import * as path from 'path';
import { AnsiToPetsciiTransducer } from '@amiexpress/bbs-door-sdk/petscii';
import { CaptureSocket, beforeTeardown, screenCodeToChar, replay } from './door-capture';

const REPO = path.resolve(__dirname, '../../../../..');
const THEMEC = path.join(REPO, 'Doors', 'THEMEC', 'themec');
const EIGHTY_BEFORE = path.join(__dirname, 'fixtures', 'themec-80-before.ans');

/**
 * Run the REAL binary under the REAL emulator for one caller geometry.
 *
 * `petsciiMode` is the only thing that separates the two cases, exactly as it
 * is in production: doorScreenWidth()/doorScreenHeight() read it, BB_SCRWIDTH
 * and BB_SCRHEIGHT answer from them, and the door lays itself out from the
 * answer.
 */
async function drive(cols: number, keys: string[] = []): Promise<string> {
  const { AmigaDoorSession } = require('../../../src/amiga-emulation/AmigaDoorSession');
  const socket = new CaptureSocket();
  const petscii = cols < 80;
  const session = new AmigaDoorSession(socket as any, {
    executablePath: THEMEC,
    doorType: 'XIM',
    timeout: 30,
    args: ['1'],
    assigns: {},
    toolTypes: {},
    bbsSession: {
      user: { id: '1', username: 'Sysop', location: 'Local Console', secLevel: 255 },
      nodeId: 1, nodeNumber: 1, bbsName: 'AmiExpress-Web', sysopName: 'Sysop',
      timeRemaining: 60, doorCommand: 'THEMEC', doorId: 'THEMEC',
      petsciiMode: petscii,
      terminalType: petscii ? 'c64' : 'modern',
      screenWidth: cols,
      screenHeight: 25,
    },
  });

  // One frame, then leave. The door draws on entry and redraws after every
  // key, so a single Q is enough to prove the screen and still exit cleanly
  // through ui_screen_close() + JH_SHUTDOWN.
  // `keys` are sent after the first screen has settled, 700 ms apart, and
  // the door is left a beat after the last one.
  const timers = keys.map((k, i) => setTimeout(() => socket.emit('door:input', k), 3500 + i * 700));
  timers.push(setTimeout(() => socket.emit('door:input', 'q'), keys.length ? 3500 + keys.length * 700 + 1500 : 4000));
  try {
    await session.start();
  } finally {
    timers.forEach(clearTimeout);
  }
  return socket.ansi.join('');
}

/** Whether the door really did leave the screen black behind it (the cut beforeTeardown makes, door-capture.ts, hides it). */
function leavesScreenBlack(ansi: string): boolean {
  return /\x1b\[2J(\x1b\[H)?(\x1b\[\?25[hl])?\s*$/.test(ansi);
}

function petsciiScreen(ansi: string): { rows: string[]; painted: number } {
  const transducer = new AnsiToPetsciiTransducer();
  transducer.transduce(beforeTeardown(ansi));
  const { screen, cols, rows } = transducer.machine.state;
  const out: string[] = [];
  let painted = 0;
  for (let y = 0; y < rows; y++) {
    let row = '';
    for (let x = 0; x < cols; x++) {
      const sc = screen[y * cols + x];
      if ((sc & 0x7f) !== 0x20) painted++;
      row += screenCodeToChar(sc);
    }
    out.push(row);
  }
  return { rows: out, painted };
}

/**
 * The NAMES, not the ids: the door lists what a caller reads, the same as
 * the TypeScript picker (buildThemeItems). Upper case because that is what
 * a C64 screen shows.
 */
const THEMES = [
  'CLASSIC', 'SLATE & SLASH', 'SLATE & SLASH (MUTED)', 'UPROUGH NEON',
  'UPROUGH NEON (MUTED)', 'QUIET PHOSPHOR', 'QUIET PHOSPHOR (MUTED)',
];

describe('THEMEC opens on a 40-column caller', () => {
  jest.setTimeout(120000);

  it('the shipped .info marks the door 40-ok, so the gate lets a C64 in', () => {
    const info = fs.readFileSync(path.join(REPO, 'Commands', 'BBSCmd', 'THEMEC.info'), 'latin1');
    expect(info).toContain('MIN_COLUMNS=40');
    // The mark it must NOT carry: C64_ADAPT would put the frame adapter on
    // the socket and crop a screen that is already forty columns wide.
    expect(info).not.toContain('C64_ADAPT');
  });

  it('the theme list is readable at 40: the real door on a real C64 screen', async () => {
    const ansi = await drive(40);
    // The door clears on the way out by design; the caller's screen is what it
    // painted before that, and the teardown is asserted separately below.
    expect(leavesScreenBlack(ansi)).toBe(true);
    const { rows, painted } = petsciiScreen(ansi);

    // A C64 screen, and a full one.
    expect(rows).toHaveLength(25);
    for (const row of rows) expect(row).toHaveLength(40);
    expect(painted).toBeGreaterThan(100);

    // The door addressed nothing off a C64's glass. This is what the 80-column
    // layout did: an addressed column of 60 on a 40-cell row wraps, and the
    // row it wraps onto is the next theme.
    const cups = [...ansi.matchAll(/\x1b\[(\d+);(\d+)H/g)];
    expect(cups.length).toBeGreaterThan(0);
    for (const m of cups) {
      expect(Number(m[1])).toBeLessThanOrEqual(25);
      expect(Number(m[2])).toBeLessThanOrEqual(40);
    }

    // The masthead row is on the glass at 40 too, carrying the title and no
    // rail - which is what the blessed picker draws there, measured screen
    // against screen on 2026-09-06. What a C64 loses is the RAIL, not the
    // name of the door.
    expect(rows[0].trim()).toBe('DOOR THEME');
    // And the cursor is a caret, as it is at every width in blessed.
    expect(rows.join('\n')).toContain('>>');

    // Every theme is on the glass, one per row, none eaten by the row below.
    const rowOf = (id: string) => rows.findIndex((r) => r.includes(`[ ] ${id}`) || r.includes(`[*] ${id}`));
    const seen = THEMES.map(rowOf);
    for (let i = 0; i < THEMES.length; i++) {
      expect({ theme: THEMES[i], row: seen[i] }).toEqual({ theme: THEMES[i], row: expect.any(Number) });
      expect(seen[i]).toBeGreaterThan(0);
    }
    expect(new Set(seen).size).toBe(THEMES.length);

    // The note is a WHOLE sentence. At 80 it is clipped at cols-3, which on a
    // C64 cut it mid-word ("...KEEP A THEME - SHOW"); the door carries a
    // 40-column form of each of its two sentences instead.
    //
    // Found by matching EITHER sentence, not by the word THEME: the board
    // answers AEW_THEME since 2026-09-06, so the note this board produces is
    // "APPLIES THE NEXT TIME A DOOR DRAWS." - which does not contain the word
    // at all, and the finder that looked for it returned undefined.
    // The 40-column sentence is buildNote's own since 2026-09-06 - the two
    // doors say the same thing in the same words at the same width.
    const NOTES = /^(THIS BOARD CANNOT KEEP A THEME\.|APPLIES ON NEXT DOOR DRAW\.)$/;
    const note = rows.find((r) => NOTES.test(r.trim()));
    expect(note).toBeDefined();
    expect(note!.trim()).toMatch(NOTES);

    // And the way out is on the glass, in the abbreviated form the
    // TypeScript uses at this width (buildFooterHints: Q: Bye).
    expect(rows.join('\n')).toContain('Q: BYE');

    // Nothing the transducer could not map. `?` is what an unmapped glyph
    // prints, and no part of this screen is meant to be one.
    expect(rows.join('')).not.toContain('?');
  });

  /**
   * REFRESHED AGAIN 2026-09-15: the C doors hide the caller's cursor now.
   * `ui_screen_open` emits ESC[?25l before it paints (9379da62b, binaries
   * rebuilt in 2e6f9a7a8), which is a deliberate change to every C door and
   * moved the first byte of this screen. The golden carries it.
   *
   * The golden is also ONE SCREEN now, with the way out cut off it. A
   * capture that caught a single frame runs on into ui_screen_close's reset,
   * clear, home and cursor-back-on, and a capture that caught three does
   * not - the count depends on how many masthead frames the 4-second wait
   * happened to fit on the machine that ran it, which is the one thing this
   * pin must not be sensitive to.
   *
   * REFRESHED 2026-09-07. The pin's subject is "the 40-column work did not
   * disturb the 80-column screen", and it held until two commits changed the
   * caret rule at BOTH widths on purpose - 28fcf7a5e ("the row the cursor
   * leaves loses its caret") and 4b0a44d84 ("the row under the cursor wears
   * its own theme"). Neither refreshed this fixture, so it had been red on
   * main since. The bytes below are the door as of the caret rule; any LATER
   * 40-column work still cannot move them, which is what the pin is for.
   */
  /**
   * REFRESHED 2026-10-15 for the live preview: the door now paints its theme's
   * GROUND (ESC[48;2;..] clear) instead of leaving the terminal default, so
   * the preview of another theme cannot leak the old one's background.
   */
  (process.env.THEMEC_WRITE_FIXTURE_TO ? it : it.skip)('writes the 80-column fixture (deliberate, flagged)', async () => {
    fs.writeFileSync(process.env.THEMEC_WRITE_FIXTURE_TO as string, await drive(80), 'latin1');
  });

  it('an 80-column caller sees the door byte-for-byte as it was before the 40-column work', async () => {
    const ansi = await drive(80);
    const before = fs.readFileSync(EIGHTY_BEFORE, 'latin1');

    // The FIRST screen, not the whole session. Since 2026-09-06 the masthead
    // slides while the door waits for a key (ui_key.h's idle hook), so the
    // capture carries however many frames the wait happened to fit - a
    // number that depends on the machine, not on the door. The screen the
    // caller is handed is what this pin is about; that the rail moves is
    // pinned in sdk/c/tests/test_ui_chrome.c, where it can be measured
    // rather than timed.
    const firstScreen = (out: string) => {
      const second = out.indexOf('\x1b[1;1H', out.indexOf('\x1b[1;1H') + 1);
      const tail = out.indexOf('\x1b[1;1H', second + 1);
      const screen = tail === -1 ? out : out.slice(0, tail);
      // The way OUT is not part of the screen: ui_screen_close resets, clears,
      // homes and puts the cursor back on. It is only IN the capture when the
      // wait fitted fewer than three frames, so leaving it in would make this
      // pin depend on the speed of the machine.
      return screen.replace(/\x1b\[0m\x1b\[0m\x1b\[2J\x1b\[H\x1b\[\?25h$/, '');
    };
    expect(firstScreen(ansi)).toBe(firstScreen(before));
  });
});

/**
 * LIVE PREVIEW (sysop, 2026-10-15: "THEME live previews the themes when I
 * navigate the menu, THEMEC doesn't"). Moving the cursor re-colours the whole
 * door in the highlighted theme, on the theme's GROUND - never the terminal's
 * default background, which is the leak the TypeScript door fixed the same day.
 */
describe('THEMEC previews the highlighted theme', () => {
  jest.setTimeout(120000);
  const DOWN = '\x1b[B';
  const GROUND = 'rgb0,0,0'; // every shipped theme's ground resolves to rgb 0,0,0
  const fgs = (ansi: string) => new Set([...ansi.matchAll(/38;2;(\d+;\d+;\d+)/g)].map((m) => m[1]));

  it('after a cursor move the GROUND cells carry the highlighted theme ground and the pen colours are the new theme', async () => {
    const ansi = await drive(80, [DOWN, DOWN, DOWN, DOWN, DOWN]);
    const cut = beforeTeardown(ansi);
    // Quiet Phosphor is five themes down; its pens are not Classic's.
    const lastFrame = cut.slice(cut.lastIndexOf('\x1b[2J'));
    const opening = cut.slice(0, cut.indexOf('\x1b[2J', cut.indexOf('\x1b[2J') + 1));
    expect(lastFrame.length).toBeGreaterThan(500);
    const before = fgs(opening);
    const after = fgs(lastFrame);
    expect([...after].filter((c) => !before.has(c)).length).toBeGreaterThan(0);

    const grid = replay(cut, 80, 25);
    // Blank rows between the masthead and the list, and under the note.
    for (const y of [1, ...Array.from({ length: 12 }, (_, i) => 11 + i)]) {
      for (let x = 0; x < 80; x++) expect({ y, x, bg: grid[y][x].bg }).toEqual({ y, x, bg: GROUND });
    }
  });

  it('at 40 columns a cursor move repaints in the highlighted theme and still renders', async () => {
    const ansi = await drive(40, [DOWN, DOWN]);
    const { rows } = petsciiScreen(ansi);
    expect(rows).toHaveLength(25);
    for (const row of rows) expect(row).toHaveLength(40);
    expect(rows[0].trim()).toBe('DOOR THEME');
    expect(rows.join('\n')).toContain('>>');
    expect(rows.join('')).not.toContain('?');
    // The last full frame wears another theme's pens than the opening one.
    const cut = beforeTeardown(ansi);
    const lastFrame = cut.slice(cut.lastIndexOf('\x1b[2J'));
    const opening = cut.slice(0, cut.indexOf('\x1b[2J', cut.indexOf('\x1b[2J') + 1));
    const before = fgs(opening);
    expect([...fgs(lastFrame)].filter((c) => !before.has(c)).length).toBeGreaterThan(0);
  });
});
