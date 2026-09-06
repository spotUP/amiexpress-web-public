/**
 * THE SYSOP'S REPORT on dRE!WAll v2.0, from a real 40-column PETSCII session
 * on the live board (2026-09-06), in his own words:
 *
 *   "it could have better layout and use the full 40 columns for the
 *    tags/usernames, the usernames are not right aligned"
 *   "i guess long 80 column comments needs to be split to two lines as well"
 *
 * plus, from his screenshot, a full row of '?' in blue immediately above the
 * door's footer, under a blue rule with tick marks.
 *
 * Every assertion here reads CELLS OFF THE ORACLE - what a C64 is showing after
 * eating the bytes the live telnet/SSH transport wrote - not the ladder's own
 * return value:
 *
 *   captured 68K door output
 *     -> emitter.emit('ansi-output')        (what a door does)
 *     -> installC64DoorAdapter               (FrameReconstructor + the ladder)
 *     -> buildConnectionEmitter              (the LIVE transport)
 *     -> AnsiToPetsciiTransducer             (inside it)
 *     -> PetsciiMachine                      (the KERNAL oracle)
 *
 * THE INPUT. `sdk/tests/petscii/frame/fixtures/wall.ans` is a harness capture,
 * and the harness cannot reach the door's style header: dRE!WAll reads
 * `dOORS:dRE/dRE!WAll/dRE!WAll.iNfO` for its STYLES tooltype and then
 * `dOORS:dRE/dRE!WAll/dRE!WAll.StYlE.%d`, and under `run-amiga-door.ts` that
 * lookup does not resolve (verified 2026-09-06: two capture runs, one with
 * `--assigns DOORS=...` and one with `--tooltypes STYLES=2`, both produced the
 * identical 2927-byte stream with no style bytes in it). The capture leaves
 * exactly two three-row gaps for it - rows 1-3 above the entries and rows 19-21
 * between the last entry and the footer at row 22 - and the board's own
 * `dRE!WAll.info` says `STYLES=2`. So the fixture below is the capture with the
 * door's OWN `StYlE.2` file, byte for byte off disk, painted into those two
 * gaps. Nothing is invented: both halves are the door's own bytes, and the
 * result reproduces the sysop's screenshot row for row.
 *
 * The door's bytes are latin1 (`amiga-emulation/api/DosLibrary.ts:1222`), which
 * is why the style file is decoded that way and its $AF bytes arrive as U+00AF
 * MACRON.
 */
import * as fs from 'fs';
import * as path from 'path';
import { PetsciiMachine } from '@amiexpress/bbs-door-sdk/petscii';
import { buildConnectionEmitter } from '../../src/server/connection-emitter';
import { installC64DoorAdapter, uninstallC64DoorAdapter } from '../../src/server/c64-door-adapter';

const COLS = 40;
const ROWS = 25;
const CHUNK = 64;
const CHUNKS_PER_FRAME = 8;
const TICK_MS = 5;
const MAX_FRAME_MS = 40;
const GAP_MS = 20;

const REPO = path.resolve(__dirname, '../../../..');
const realSetTimeout = global.setTimeout;
const wait = (ms: number) => new Promise((resolve) => realSetTimeout(resolve, ms));

/**
 * The capture, with the door's own STYLE.<n> block in the two gaps it leaves,
 * and optionally one more entry row painted last.
 *
 * `entry` is written the way the door writes every row of its wall, which the
 * capture itself shows verbatim: `ESC[<row>;0H`, the message in a 61-column
 * field, the author in a 17-column one. Painting it at row 18 - the row the
 * door's own last entry occupies - is a repaint, and the frame model takes the
 * last write, exactly as a terminal does.
 */
function liveWallCapture(style: 1 | 2 = 2, entry?: { message: string; author: string }): string {
  const capture = fs.readFileSync(path.join(REPO, 'sdk/tests/petscii/frame/fixtures/wall.ans')).toString('utf8');
  const styleFile = fs.readFileSync(path.join(REPO, `Doors/dRE/dRE!WAll/dRE!WAll.StYlE.${style}`)).toString('latin1');
  const rows = styleFile.split('\n').slice(0, 3);
  expect(rows).toHaveLength(3);
  const block = (top: number) => rows.map((r, i) => `\x1b[${top + i};0H${r}`).join('');
  const head = '\x1b[2J\x1b[H\r\n\r';
  expect(capture.startsWith(head)).toBe(true);
  const tail = entry
    ? `\x1b[18;0H\x1b[0m${entry.message.padEnd(61, ' ')}${entry.author.padEnd(17, ' ')}`
    : '';
  return head + block(1) + block(19) + capture.slice(head.length) + tail;
}

/** One capture through the real emitter, the real adapter and the real transport. */
async function glass(text: string): Promise<PetsciiMachine> {
  const writes: Buffer[] = [];
  const session: any = { terminalType: 'c64', petsciiMode: true, screenWidth: 40, screenHeight: 25 };
  const connection: any = {
    sessionId: 'wall-record',
    session,
    write: (d: Buffer | string) => writes.push(typeof d === 'string' ? Buffer.from(d) : Buffer.from(d)),
    on: () => undefined,
    off: () => undefined,
    close: () => undefined,
  };
  const emitter = buildConnectionEmitter(connection);
  installC64DoorAdapter(emitter, session, { tickMs: TICK_MS, maxFrameMs: MAX_FRAME_MS });
  let n = 0;
  for (let i = 0; i < text.length; i += CHUNK, n++) {
    emitter.emit('ansi-output', text.slice(i, i + CHUNK));
    if (n % CHUNKS_PER_FRAME === CHUNKS_PER_FRAME - 1) await wait(GAP_MS);
  }
  await wait(GAP_MS * 3);
  uninstallC64DoorAdapter(emitter);
  const machine = new PetsciiMachine();
  machine.feed(Buffer.concat(writes));
  return machine;
}

/** Screen codes of one painted row, reverse bit stripped. */
const rowCodes = (m: PetsciiMachine, y: number) =>
  Array.from({ length: COLS }, (_, x) => m.state.screen[y * COLS + x] & 0x7f);

/** A row's letters as text; bank 1, so a-z is $01-$1A and A-Z is $41-$5A. */
function rowText(m: PetsciiMachine, y: number): string {
  return rowCodes(m, y)
    .map((sc) => {
      if (sc >= 0x01 && sc <= 0x1a) return String.fromCharCode(0x60 + sc);
      if (sc >= 0x20 && sc <= 0x3f) return String.fromCharCode(sc);
      if (sc >= 0x41 && sc <= 0x5a) return String.fromCharCode(sc);
      return '�';
    })
    .join('');
}

/** Every row of the glass, trailing blanks trimmed. */
const screenText = (m: PetsciiMachine) =>
  Array.from({ length: ROWS }, (_, y) => rowText(m, y).replace(/ +$/, ''));

/** The PETSCII screen code for '?'. A row of these is the reported fault. */
const QUESTION_MARK = 0x3f;
/** Screen code $63, UPPER ONE EIGHTH BLOCK: one lit pixel row at the TOP of the cell, in both banks. */
const UPPER_EIGHTH = 0x63;
/** Screen code $64, LOWER ONE EIGHTH BLOCK - what '_' already maps to. */
const LOWER_EIGHTH = 0x64;

describe("the sysop's dRE!WAll report, on the glass of a real 40-column C64", () => {
  let machine: PetsciiMachine;

  beforeAll(async () => {
    machine = await glass(liveWallCapture());
  });

  it('the author is flush against the right margin at 40', () => {
    // Every wall entry the door painted, and the column its author ENDS on.
    // The door writes the author into a 17-column field starting at source
    // column 61; at 40 columns the last cell of the name must be the last cell
    // of the row.
    const authors = ['spot', 'sysop', 'Sysop', 'dR.dRE!/tRSi'];
    const rows = screenText(machine);
    const seen: Array<{ y: number; author: string }> = [];
    rows.forEach((text, y) => {
      for (const author of authors) {
        if (text.endsWith(author)) seen.push({ y, author });
      }
    });
    // The capture has seven wall entries plus seven "VIRGIN LINE" placeholder
    // rows; the ones still on a 25-row screen after the ladder's tail-paging
    // all end in their author.
    expect(seen.length).toBeGreaterThanOrEqual(7);
    for (const { y, author } of seen) {
      expect({ y, endsAt: rows[y].length }).toEqual({ y, endsAt: COLS });
      expect(rowText(machine, y).slice(COLS - author.length)).toBe(author);
    }
  });

  it('an entry costs one row, so ten fit where five did', () => {
    // Before the record rung each entry cost two rows - the message on one and
    // the author, landing at column 61-40 = 21, on the next - so seven entries
    // ate fourteen rows. The seven short entries of this capture must now sit
    // on seven CONSECUTIVE rows, each carrying both fields.
    const rows = screenText(machine);
    const entries = ['test 1', 'test 2', 'test 3', 'boom!', 'uPTOWN is alive!', 'test', 'q'];
    // Matched on the WHOLE row - message, blanks, author - so "test" cannot
    // find the row that says "test 1".
    const ys = entries.map((message) =>
      rows.findIndex((t) => {
        const m = /^(.*?) +(spot|sysop|Sysop)$/.exec(t);
        return m !== null && m[1] === message;
      }),
    );
    expect(ys.every((y) => y >= 0)).toBe(true);
    expect(ys).toEqual(ys.map((_, i) => ys[0] + i));
  });

  it('a long wall comment wraps instead of vanishing', () => {
    // The door's own placeholder line is 59 columns of message beside a
    // 12-column author - a comment authored on an 80-column board. Every word
    // of it must be on the glass, across two 40-column rows, with the author
    // right-aligned on the LAST of them, and nothing truncated.
    const rows = screenText(machine);
    const tail = rows.findIndex((t) => t.endsWith('dR.dRE!/tRSi'));
    expect(tail).toBeGreaterThan(0);
    const head = rows[tail - 1];
    const joined = `${head} ${rows[tail].slice(0, COLS - 'dR.dRE!/tRSi'.length)}`.replace(/\s+/g, ' ').trim();
    expect(joined).toBe('VIRGIN LINE VIRGIN LINE VIRGIN LINE VIRGIN LINE VIRGIN LINE');
    // The continuation row carries no author: that is what tells a reader which
    // text belongs to which name.
    expect(/(spot|sysop|Sysop|dR\.dRE!\/tRSi)$/.test(head)).toBe(false);
  });

  it('the separator rule is not a row of question marks', () => {
    // dRE!WAll's STYLE.2 draws a three-row bar: a rule of '_' at the bottom of
    // its cells, a row of tick marks, and a rule of the Amiga's $AF MACRON at
    // the TOP of its cells. The macron row reached the caller as 40 '?'
    // because the encoder had no mapping for U+00AF.
    const codes = Array.from({ length: ROWS }, (_, y) => rowCodes(machine, y));
    for (const row of codes) {
      expect(row.filter((sc) => sc === QUESTION_MARK).length).toBeLessThan(COLS);
    }
    // and it is the RIGHT glyph, not merely not a '?': the upper rule and the
    // lower rule are mirror images of each other.
    const upper = codes.findIndex((row) => row.every((sc) => sc === UPPER_EIGHTH));
    const lower = codes.findIndex((row) => row.every((sc) => sc === LOWER_EIGHTH));
    expect({ upper: upper >= 0, lower: lower >= 0 }).toEqual({ upper: true, lower: true });
    // the bar reads bottom-rule, ticks, top-rule, and the ticks are between them
    expect(lower).toBeLessThan(upper);
    expect(upper - lower).toBe(2);
  });
});

/**
 * THE SECOND REPORT, 2026-09-06, after the `record` rung shipped as 0c38c0522.
 * The sysop re-tested on his dev board and found two things still wrong.
 *
 * His long comment came back as ONE row reading, literally:
 *
 *   yeah! dre!wal> 40 col petscii> now sysop
 *
 * The author was right where the rung put it and the MESSAGE had been eaten.
 * The message below is the exact reconstruction: any message of the shape
 * `<part>  <part>  now` in dRE!WAll's 61-column field renders to that string
 * character for character, which is how the cause was identified. The row has
 * two runs of blanks of its own plus the author's, so `columnSpans` saw four
 * columns, `narrowRow` matched, and the ladder asked `narrow` BEFORE `record`.
 * The rung was never reached - it did not fall through and it did not narrow
 * the left field.
 *
 * And STYLE.1's row of repeated tags came back as
 * `Dre> Dre!> Dre!> Dre!> Dre!> Dre!> Dre!>`, which is `narrow` shortening
 * seven identical columns, and reaches `narrow` by its own path with no
 * involvement from `record` at all.
 */
describe("the sysop's second dRE!WAll report", () => {
  /** Renders to `yeah! dre!wal> 40 col petscii> now sysop` under the shipped ladder. */
  const LONG = 'yeah! dre!wall is  40 col petscii ok  now';

  it('a long wall comment wraps instead of losing its tail', async () => {
    const machine = await glass(liveWallCapture(2, { message: LONG, author: 'sysop' }));
    const rows = screenText(machine);

    // not one character of what he typed is missing, and nothing is marked as
    // shortened
    const tail = rows.findIndex((t) => t.endsWith('sysop') && t.includes('now'));
    expect(tail).toBeGreaterThan(0);
    const joined = `${rows[tail - 1]} ${rows[tail].slice(0, COLS - 'sysop'.length)}`;
    expect(joined.replace(/\s+/g, ' ').trim()).toBe(LONG.replace(/\s+/g, ' ').trim());
    expect(joined).not.toContain('>');

    // and the author is still where the first report put it
    expect(rows[tail].length).toBe(COLS);
    expect(rowText(machine, tail).slice(COLS - 'sysop'.length)).toBe('sysop');
    // the continuation row carries no author
    expect(rows[tail - 1].endsWith('sysop')).toBe(false);
  });

  it('the repeated tag row keeps whole tags instead of Dre>', async () => {
    const machine = await glass(liveWallCapture(1));
    const rows = screenText(machine);
    const tagRow = rows.findIndex((t) => t.includes('Dre!Wall'));
    expect(tagRow).toBeGreaterThanOrEqual(0);
    // every tag on the row is whole, and none is marked as shortened
    expect(rows[tagRow]).not.toContain('>');
    expect(rows[tagRow].trim().split(/\s+/).every((t) => t === 'Dre!Wall')).toBe(true);
    // as many whole copies as 40 columns hold
    expect(rows[tagRow].trim().split(/\s+/).length).toBe(4);
  });
});
