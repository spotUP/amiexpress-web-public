/**
 * EVERY BOARD SCREEN NOW ANSWERS A C64, AND THE GENERATED ONES ARE SCREENS.
 *
 * The sysop, 2026-09-15: "this will be easier to use if you create default
 * screens for all missing petscii screens can you do that based on the ansi
 * screens?" - after a session in which a 40-column caller met
 * `[80-COLUMN ANSI SCREEN - SKIPPED]` at the door.
 *
 * `dev/scripts/generate-default-petscii-screens.ts` writes a `<stem>.seq`
 * beside each ANSI screen. This file proves the two things that matter about
 * them:
 *
 *   1. REACHABILITY - the loader really does serve the generated file to a
 *      40-column PETSCII caller, through `displayScreen`, the product's own
 *      entry point, with no skip token in sight.
 *   2. They are SCREENS - 40 columns wide, no taller than 25 rows, and a menu
 *      still carries every command its ANSI original carried. A `.seq` goes
 *      RAW to the wire (screen.handler.ts:2489): nothing downstream will page
 *      it, wrap it or fix it.
 *
 * Plus the guard the first run of the generator taught us to want: a screen
 * the sysop has drawn on is never overwritten by a re-run.
 */
process.env.SKIP_DB_INIT = '1';

jest.mock('../../src/index', () => {
  const states = require('../../src/constants/bbs-states');
  return { BBSState: states.BBSState, LoggedOnSubState: states.LoggedOnSubState, BBSSession: {} };
});
jest.mock('../../src/utils/flag-pause.util', () => ({
  checkForPause: jest.fn().mockResolvedValue(true),
  flagPause: jest.fn().mockResolvedValue(true),
}));

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { displayScreen } from '../../src/handlers/screen.handler';
import { config } from '../../src/config';
import { PetsciiMachine, screenCodeToPetscii } from '@amiexpress/bbs-door-sdk/petscii';
import {
  generateSeqBytes,
  isMachineWritten,
  overwriteDecision,
  readManifest,
  titleFor,
} from '../../../../dev/scripts/generate-default-petscii-screens';

const REPO = path.resolve(__dirname, '..', '..', '..', '..');
const COLS = 40;
const MAX_ROWS = 25;

/** One screen code as the glyph a PetMe64 canvas paints for it (sdk/tests/petscii/blessed-repaint.test.ts). */
function screenCodeToChar(sc: number, bank: 0 | 1): string {
  const p = screenCodeToPetscii(sc & 0x7f);
  if (p >= 0x20 && p <= 0x3f) return String.fromCharCode(p);
  if (bank === 1) {
    if (p >= 0x41 && p <= 0x5a) return String.fromCharCode(p - 0x41 + 0x61);
    if (p >= 0xc1 && p <= 0xda) return String.fromCharCode(p - 0xc1 + 0x41);
  } else if (p >= 0x41 && p <= 0x5f) {
    return String.fromCharCode(p);
  }
  if (p === 0x40 || (p >= 0x5b && p <= 0x5f)) return String.fromCharCode(p);
  return '#';
}

/** A `.seq` replayed on a C64 of `rows` rows: the rows it painted, as text. */
function replay(bytes: Uint8Array, rows = MAX_ROWS): { text: string[]; used: number } {
  const machine = new PetsciiMachine({ cols: COLS, rows });
  machine.feed(bytes);
  const text: string[] = [];
  let used = 0;
  for (let y = 0; y < rows; y++) {
    let line = '';
    for (let x = 0; x < COLS; x++) line += screenCodeToChar(machine.state.screen[y * COLS + x], machine.state.charsetBank);
    text.push(line);
    if (line.trim()) used = y + 1;
  }
  return { text, used };
}

function socketDouble() {
  const out: string[] = [];
  const raw: Buffer[] = [];
  return {
    out,
    raw,
    socket: {
      id: `petscii-default-${Math.random().toString(36).slice(2)}`,
      on: () => {},
      off: () => {},
      removeListener: () => {},
      emit: (event: string, payload: any) => {
        if (event === 'ansi-output' && typeof payload === 'string') out.push(payload);
        // A .seq leaves on `petscii-bytes` (raw) or `petscii-output` (the
        // PUA string), never on `ansi-output` - screen.handler.ts:2273-2354.
        if (event === 'petscii-bytes' || event === 'petscii-output') {
          // `petscii-bytes` carries the file's bytes base64-encoded; the
          // legacy string event carries them as PUA text.
          const body = typeof payload === 'string' ? payload : payload?.data ?? payload;
          raw.push(event === 'petscii-bytes' ? Buffer.from(String(body), 'base64') : Buffer.from(String(body), 'latin1'));
        }
        return true;
      },
    } as any,
  };
}

const c64 = (): any => ({
  nodeId: 1,
  petsciiMode: true,
  screenWidth: COLS,
  screenHeight: MAX_ROWS,
  user: { securityLevel: 255 },
});

describe('a 40-column caller has a screen for the board\'s ANSI ones', () => {
  let root: string;
  let previousRoot: any;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'petscii-defaults-'));
    fs.mkdirSync(path.join(root, 'Screens'), { recursive: true });
    // The board's own ONENODE - 80-column art, the screen the sysop was left
    // staring at - and the generated companion beside it.
    fs.copyFileSync(path.join(REPO, 'Screens', 'ONENODE.TXT'), path.join(root, 'Screens', 'ONENODE.TXT'));
    fs.copyFileSync(path.join(REPO, 'Screens', 'ONENODE.seq'), path.join(root, 'Screens', 'ONENODE.seq'));
    previousRoot = config.get('dataDir');
    (config as any).set?.('dataDir', root);
  });

  afterEach(() => {
    if (previousRoot !== undefined) (config as any).set?.('dataDir', previousRoot);
  });

  it('serves the generated .seq instead of skipping the 80-column art', async () => {
    const { socket, out, raw } = socketDouble();
    const shown = await displayScreen(socket, c64(), 'ONENODE', false);

    expect(shown).toBe(true);
    expect(out.join('')).not.toContain('SKIPPED');
    // What reaches a C64 is the PETSCII file's own bytes, not a reflow of the
    // ANSI one: the loader swapped .TXT for .seq (screen.handler.ts:1603-1637).
    expect(raw.length).toBeGreaterThan(0);
    const wire = Buffer.concat(raw).toString('latin1').toLowerCase();
    expect(wire).toContain('already');
  });
});

describe('every generated default is a screen', () => {
  const manifest = readManifest(REPO);
  const targets = Object.keys(manifest);

  it('the generator has run over the board', () => {
    expect(targets.length).toBeGreaterThan(100);
  });

  it('no file is taller than a C64 screen or wider than 40 columns', () => {
    const tall: string[] = [];
    for (const target of targets) {
      const file = path.join(REPO, target);
      if (!fs.existsSync(file)) continue;
      const { used } = replay(new Uint8Array(fs.readFileSync(file)), 60);
      if (used > MAX_ROWS) tall.push(`${target} (${used} rows)`);
    }
    expect(tall).toEqual([]);
  });

  it('a menu keeps every command its ANSI original carried', () => {
    // Conference 1's three-column menu, kept as a fixture since the board
    // serves one shared menu (9be4d11aa) and no longer ships this layout.
    const source = fs.readFileSync(path.join(__dirname, '../fixtures/board-screens/conf1-menu.txt')).toString('latin1');
    const { bytes } = generateSeqBytes(source, titleFor('Menu'));
    expect(bytes).not.toBeNull();
    const screen = replay(bytes as Uint8Array).text.join('\n').toUpperCase();

    // The three-column dot-leader menu at 40 columns: `narrow` truncated every
    // label to `[E].......e>`, which is what the re-layout replaced.
    for (const command of ['[E]', '[FR]', '[G]', '[RZ]', '[CS]', '[WALL]', '[TLIST]', '[ULIST]', '[ZOOM]', '[DD]']) {
      expect(screen).toContain(command);
    }
    expect(screen).toContain('ENTER MESSAGE');
    expect(screen).toContain('GLOBAL BBS LIST');
    expect(screen).not.toContain('>|');
  });
});

describe('what the generator refuses to touch', () => {
  it('leaves the screens the board writes for itself alone', () => {
    for (const machineWritten of ['Bulletins/bull1.txt', 'Bulletins/bull7.txt', 'Screens/AchieveTop.txt', 'Conf1/Bulletins/conftop.txt']) {
      expect(isMachineWritten(machineWritten)).toBe(true);
    }
    expect(isMachineWritten('Conf1/Menu.txt')).toBe(false);
    // And none of them has a companion on disk: a frozen .seq would be
    // resolved ahead of the file MultiTop rewrites at every logoff.
    expect(fs.existsSync(path.join(REPO, 'Bulletins', 'bull1.seq'))).toBe(false);
    expect(fs.existsSync(path.join(REPO, 'Screens', 'AchieveTop.seq'))).toBe(false);
  });

  it('never overwrites a screen someone has drawn on', () => {
    const manifest = { 'Screens/X.seq': 'aaa' };
    const ours = Buffer.from('mine');
    const manifestOfOurs = { 'Screens/X.seq': require('crypto').createHash('sha1').update(ours).digest('hex') };

    // A hand-drawn screen this script never wrote: skipped, --force or not.
    expect(overwriteDecision(Buffer.from('hand drawn'), 'Screens/X.seq', manifest, false)).toBe('edited');
    expect(overwriteDecision(Buffer.from('hand drawn'), 'Screens/X.seq', manifest, true)).toBe('edited');
    // Our own untouched output: left alone by default, refreshed on --force.
    expect(overwriteDecision(ours, 'Screens/X.seq', manifestOfOurs, false)).toBe('exists');
    expect(overwriteDecision(ours, 'Screens/X.seq', manifestOfOurs, true)).toBe('write');
    // Nothing there at all.
    expect(overwriteDecision(null, 'Screens/X.seq', manifest, false)).toBe('write');
  });

  it('keeps the board\'s hand-drawn PETSCII titles', () => {
    // Node*/BBSTITLE.SEQ and the logoff pool predate this script and are not
    // in its manifest, which is what stops a re-run from replacing a drawing
    // with a masthead.
    const manifest = readManifest(REPO);
    expect(manifest['Node0/BBSTITLE.seq']).toBeUndefined();
    expect(manifest['Screens/logoff/001.logoff.seq']).toBeUndefined();
  });
});
