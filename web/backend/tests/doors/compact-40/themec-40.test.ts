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
import { EventEmitter } from 'events';
import { AnsiToPetsciiTransducer } from '@amiexpress/bbs-door-sdk/petscii';

const REPO = path.resolve(__dirname, '../../../../..');
const THEMEC = path.join(REPO, 'Doors', 'THEMEC', 'themec');
const EIGHTY_BEFORE = path.join(__dirname, 'fixtures', 'themec-80-before.ans');

/** The socket a door is handed: everything it paints, in order. */
class CaptureSocket extends EventEmitter {
  readonly ansi: string[] = [];
  emit(event: string, data?: any): boolean {
    if (event === 'ansi-output') this.ansi.push(typeof data === 'string' ? data : String(data ?? ''));
    return super.emit(event, data);
  }
}

/**
 * Run the REAL binary under the REAL emulator for one caller geometry.
 *
 * `petsciiMode` is the only thing that separates the two cases, exactly as it
 * is in production: doorScreenWidth()/doorScreenHeight() read it, BB_SCRWIDTH
 * and BB_SCRHEIGHT answer from them, and the door lays itself out from the
 * answer.
 */
async function drive(cols: number): Promise<string> {
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
  const quit = setTimeout(() => socket.emit('door:input', 'q'), 4000);
  try {
    await session.start();
  } finally {
    clearTimeout(quit);
  }
  return socket.ansi.join('');
}

/** A C64 screen code (bit 7 = reverse) back to the character it shows. */
function screenCodeToChar(sc: number): string {
  const c = sc & 0x7f;
  if (c === 0) return '@';
  if (c <= 0x1f) return String.fromCharCode(64 + c);
  if (c <= 0x3f) return String.fromCharCode(c);
  if (c >= 0x41 && c <= 0x5a) return String.fromCharCode(c);
  return '·'; // a PETSCII graphic glyph
}

/** What a real C64 is showing after eating `ansi`, row by row. */
function petsciiScreen(ansi: string): { rows: string[]; painted: number } {
  const transducer = new AnsiToPetsciiTransducer();
  transducer.transduce(ansi);
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

const THEMES = [
  'CLASSIC', 'SLATE-SLASH', 'SLATE-MUTED', 'UPROUGH-NEON',
  'NEON-MUTED', 'QUIET-PHOSPHOR', 'PHOSPHOR-MUTED',
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

    // The masthead is on row 1 - not scrolled off by a border that overflowed.
    expect(rows[0]).toContain('THEME');

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
    const note = rows.find((r) => r.includes('THEME') && r.trim().endsWith('.'));
    expect(note).toBeDefined();
    expect(note!.trim()).toMatch(/^(THIS BOARD CANNOT KEEP A THEME\.|APPLIES THE NEXT TIME A DOOR DRAWS\.)$/);

    // And the way out is on the glass.
    expect(rows.join('\n')).toContain('Q=LEAVE');

    // Nothing the transducer could not map. `?` is what an unmapped glyph
    // prints, and no part of this screen is meant to be one.
    expect(rows.join('')).not.toContain('?');
  });

  it('an 80-column caller sees the door byte-for-byte as it was before the 40-column work', async () => {
    const ansi = await drive(80);
    const before = fs.readFileSync(EIGHTY_BEFORE, 'latin1');
    expect(ansi).toBe(before);
  });
});
