/**
 * An AREXX door's high-score file is found when the disk spells it in a
 * different case.
 *
 * `Doors/STNG/STNG.Rexx` (registered, `Commands/BBSCmd/STNG.info`, `TYPE=AIM`,
 * no `ADDRESS COMMAND`) is the real case:
 *
 *     STNGDir = "Doors:STNG/"            line 23
 *     pragma('directory',STNGDir)        line 53
 *     if exists('STNGdat') ...           line 55
 *     open(STNG,'STNGdat','R')           line 56
 *     if ~exists('hiscores') ...         line 70
 *     open(hi,'hiscores','W')            lines 71, 248, 266
 *     open(hi,'hiscores','R')            line 76
 *
 * and the file shipped in this repo is `Doors/STNG/HISCORES` - uppercase.
 *
 * AmigaDOS filesystems are case-insensitive and case-preserving, so on a real
 * Amiga (and on the macOS dev machine) `'hiscores'` finds `HISCORES`. ext4
 * under the Linux container is neither: `AREXXFileIO.resolveAmigaPath()`
 * substituted the assign and then handed the result to plain `fs`, so the
 * read ENOENTed - the trivia high-score table never loaded on the board - and
 * the `'W'` open minted a lowercase twin `hiscores` beside the real file, which
 * the next run then read as empty.
 *
 * macOS cannot observe that ENOENT, so - as in
 * tests/amiga-emulation/filehandle-bulletin-case-open.test.ts - these assert at
 * RUNTIME that the ops reached amigafs, by wrapping the module's exports at
 * load time. A source grep would prove nothing.
 *
 * NOT changed, and pinned here so it stays that way: a bare relative path
 * resolves against `currentDir`, which starts at the BBS root and is moved only
 * by `pragma('directory')`. That is 1:1 with express.e - an AIM door is
 * launched as `REXXDOOR <node> <cmd>` via `Execute()` (express.e:4272-4277)
 * from AmiExpress's own current directory, and express.e never `CurrentDir()`s
 * into a door's directory (its one CurrentDir pair, :26282/:26316, is the
 * PlayPen zoom path). STNG.Rexx sets its own directory because that is the
 * convention; defaulting to the door directory would be a silent divergence.
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as amigafs from '../../src/utils/amigafs';
import { AREXXFileIO } from '../../src/services/arexx-file-io';

// The module's exports are non-configurable, so jest.spyOn() cannot wrap them.
jest.mock('../../src/utils/amigafs', () => {
  const actual = jest.requireActual('../../src/utils/amigafs');
  return {
    ...actual,
    existsSync: jest.fn(actual.existsSync),
    statSync: jest.fn(actual.statSync),
    readFileSync: jest.fn(actual.readFileSync),
    writeFileSync: jest.fn(actual.writeFileSync),
    appendFileSync: jest.fn(actual.appendFileSync),
    mkdirSync: jest.fn(actual.mkdirSync),
  };
});

const shim = amigafs as unknown as Record<string, jest.Mock>;

const HISCORES = '2\nSYSOP\nDEUCE\n';

describe("an AREXX door's hiscores file is found in a differently-cased directory", () => {
  let root: string;
  let doorDir: string;
  let io: AREXXFileIO;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'stng-case-'));
    doorDir = path.join(root, 'Doors', 'STNG');
    fs.mkdirSync(doorDir, { recursive: true });
    // Exactly as the door ships: uppercase on disk, lowercase in the script.
    fs.writeFileSync(path.join(doorDir, 'HISCORES'), HISCORES, 'latin1');
    fs.writeFileSync(path.join(doorDir, 'STNGdat'), 'Q1\nA1\n', 'latin1');

    for (const fn of Object.values(shim)) {
      if (typeof fn === 'function' && 'mockClear' in fn) fn.mockClear();
    }
    io = new AREXXFileIO(root);
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  /** What STNG.Rexx does on line 53 before it touches any file. */
  function enterDoorDirectory(): void {
    io.pragma('directory', 'Doors:STNG/');
  }

  test("pragma('directory') resolves the door directory through amigafs", () => {
    const previous = io.pragma('directory', 'Doors:STNG/');

    expect(previous).toBe(root);
    // The trailing slash the door wrote in "Doors:STNG/" is carried through,
    // as it always was; what matters is that it names the real directory.
    expect(path.resolve(io.cwd())).toBe(
      path.resolve(amigafs.resolveExistingAncestors(doorDir))
    );
    expect(fs.statSync(io.cwd()).isDirectory()).toBe(true);
  });

  test("EXISTS('hiscores') finds the uppercase HISCORES", () => {
    enterDoorDirectory();

    const found = io.exists('hiscores');

    expect(found).not.toBe('');
    expect(shim.existsSync).toHaveBeenCalled();
    expect(fs.readFileSync(found, 'latin1')).toBe(HISCORES);
  });

  test("EXISTS still reports a genuinely absent file as absent", () => {
    enterDoorDirectory();

    expect(io.exists('nosuchfile')).toBe('');
  });

  test("STATEF('hiscores') reports the real size, not a 0-byte twin", () => {
    enterDoorDirectory();

    const statef = io.statef('hiscores');

    expect(statef.startsWith('FILE ')).toBe(true);
    expect(statef.split(' ')[1]).toBe(String(HISCORES.length));
    expect(shim.statSync).toHaveBeenCalled();
  });

  test("OPEN('hiscores','R') reads the real table back", () => {
    enterDoorDirectory();

    expect(io.open('hi', 'hiscores', 'R')).toBe(1);
    expect(io.readln('hi')).toBe('2');
    expect(io.readln('hi')).toBe('SYSOP');
    expect(io.readln('hi')).toBe('DEUCE');
    expect(io.close('hi')).toBe(0);

    expect(shim.readFileSync).toHaveBeenCalled();
  });

  test("OPEN('STNGdat','R') reads the question bank", () => {
    enterDoorDirectory();

    expect(io.open('STNG', 'STNGdat', 'R')).toBe(1);
    expect(io.readln('STNG')).toBe('Q1');
    io.close('STNG');
  });

  test("OPEN('hiscores','W') rewrites the real file instead of minting a twin", () => {
    enterDoorDirectory();

    expect(io.open('hi', 'hiscores', 'W')).toBe(1);
    io.writeln('hi', '1');
    io.writeln('hi', 'NEWCHAMP');
    expect(io.close('hi')).toBe(0);

    expect(fs.readFileSync(path.join(doorDir, 'HISCORES'), 'latin1')).toBe(
      '1\nNEWCHAMP\n'
    );
    expect(fs.readdirSync(doorDir).sort()).toEqual(['HISCORES', 'STNGdat']);
    expect(shim.writeFileSync).toHaveBeenCalled();
  });

  test("OPEN('hiscores','A') appends to the real file", () => {
    enterDoorDirectory();

    expect(io.open('hi', 'hiscores', 'A')).toBe(1);
    io.writeln('hi', 'LATECOMER');
    expect(io.close('hi')).toBe(0);

    expect(fs.readFileSync(path.join(doorDir, 'HISCORES'), 'latin1')).toBe(
      `${HISCORES}LATECOMER\n`
    );
    expect(fs.readdirSync(doorDir).sort()).toEqual(['HISCORES', 'STNGdat']);
    expect(shim.appendFileSync).toHaveBeenCalled();
  });

  test('a brand-new file lands inside the real door directory', () => {
    enterDoorDirectory();

    expect(io.open('log', 'stng.log', 'W')).toBe(1);
    io.writeln('log', 'played');
    expect(io.close('log')).toBe(0);

    expect(fs.readdirSync(doorDir).sort()).toEqual([
      'HISCORES',
      'STNGdat',
      'stng.log',
    ]);
    expect(fs.readdirSync(root)).toEqual(['Doors']);
  });

  test('a lowercase doors: assign reaches the real Doors directory', () => {
    // AmigaDOS assign names are case-insensitive; doors write them both ways.
    expect(io.exists('doors:STNG/hiscores')).not.toBe('');
    expect(io.exists('DOORS:STNG/hiscores')).not.toBe('');
  });

  test('a bare relative path still resolves against the BBS root (express.e:4272-4277)', () => {
    // No pragma() yet: currentDir is the BBS root, which is where a real
    // AIM door starts. Changing this would be a divergence, not a fix.
    fs.writeFileSync(path.join(root, 'ROOTFILE'), 'x', 'latin1');

    expect(io.cwd()).toBe(root);
    expect(io.exists('rootfile')).not.toBe('');
    expect(io.exists('hiscores')).toBe('');
  });
});
