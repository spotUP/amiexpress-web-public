/**
 * An AREXX door's lowercase "bbs:bulletins/bull1.txt" reaches the real
 * "Bulletins/bull1.txt".
 *
 * Two defects sat on top of each other in the emulated rexxsupport.library /
 * rexxarplib.library:
 *
 *   1. resolveAmigaPath() matched the assign prefixes case-SENSITIVELY
 *      ('DOORS:', 'BBS:', 'RAM:', 'T:', 'SYS:'). AmigaDOS volume and assign
 *      names are case-insensitive and real doors write them lowercase, so
 *      "bbs:bulletins/bull1.txt" missed every branch, fell through to the
 *      relative-path branch and produced "<bbsRoot>/bbs:bulletins/bull1.txt" -
 *      a literal directory named "bbs:bulletins". That one is observable on
 *      any host, macOS included.
 *
 *   2. The result was then handed to plain fs, with no case resolution of the
 *      remaining components. On the case-sensitive Linux container
 *      "<bbsRoot>/bulletins/" does not exist ("Bulletins/" does), so every
 *      EXISTS / STATEF / DELETE / RENAME / SHOWDIR / READFILE / WRITEFILE on a
 *      door-supplied path failed or, worse, created a lowercase twin next to
 *      the real file. macOS hides this behind a case-insensitive volume, which
 *      is why the assertions below also pin, at runtime, that the calls go
 *      through amigafs at all.
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as amigafs from '../../src/utils/amigafs';
import { MoiraEmulator } from '../../src/amiga-emulation/cpu/MoiraEmulator';
import { RexxSupportLibrary } from '../../src/amiga-emulation/api/RexxSupportLibrary';
import { RexxArpLibrary } from '../../src/amiga-emulation/api/RexxArpLibrary';
import { resolveExistingAncestors } from '../../src/amiga-emulation/api/rexx-path';

// The module's exports are non-configurable, so jest.spyOn() cannot wrap them.
// Wrap them at module load instead, delegating to the real implementations, so
// "did this go through amigafs" stays a runtime fact rather than a source grep.
jest.mock('../../src/utils/amigafs', () => {
  const actual = jest.requireActual('../../src/utils/amigafs');
  return {
    ...actual,
    existsSync: jest.fn(actual.existsSync),
    statSync: jest.fn(actual.statSync),
    readdirSync: jest.fn(actual.readdirSync),
    unlinkSync: jest.fn(actual.unlinkSync),
    mkdirSync: jest.fn(actual.mkdirSync),
    renameSync: jest.fn(actual.renameSync),
    readFileSync: jest.fn(actual.readFileSync),
    writeFileSync: jest.fn(actual.writeFileSync),
  };
});

const shim = amigafs as unknown as Record<string, jest.Mock>;

/** The Rexx libraries take an emulator only for ALLOCMEM/FREEMEM bookkeeping. */
const stubEmulator = {} as MoiraEmulator;

const BULLETIN = 'TOP UPLOADERS\r\n';

describe("an AREXX door's lowercase bbs: path reaches the real Bulletins directory", () => {
  let root: string;
  let realDir: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'arexx-path-case-'));
    realDir = path.join(root, 'Bulletins');
    fs.mkdirSync(realDir, { recursive: true });
    fs.writeFileSync(path.join(realDir, 'bull1.txt'), BULLETIN, 'latin1');
    for (const fn of Object.values(shim)) {
      if (typeof fn === 'function' && 'mockClear' in fn) fn.mockClear();
    }
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  describe('resolveExistingAncestors', () => {
    test('resolves a path whose every component already exists', () => {
      const asked = path.join(root, 'bulletins', 'bull1.txt');

      const resolved = resolveExistingAncestors(asked);

      expect(fs.readFileSync(resolved, 'latin1')).toBe(BULLETIN);
    });

    test('lands a not-yet-created file inside the existing parent', () => {
      // resolvePath() is all-or-nothing and returns null the moment one
      // component is missing - which is every file a door is about to create.
      // Without the walk up to the deepest existing ancestor the caller gets
      // the raw lowercase path and mints a twin directory beside the real one.
      const asked = path.join(root, 'bulletins', 'brand-new.txt');

      const resolved = resolveExistingAncestors(asked);

      expect(path.basename(resolved)).toBe('brand-new.txt');
      expect(fs.existsSync(path.dirname(resolved))).toBe(true);
      expect(fs.statSync(path.dirname(resolved)).isDirectory()).toBe(true);
    });

    test('hands back the path untouched when nothing above it exists', () => {
      const asked = path.join(root, 'nowhere', 'deeper', 'x.txt');

      expect(resolveExistingAncestors(asked)).toBe(
        path.join(root, 'nowhere', 'deeper', 'x.txt')
      );
    });
  });

  describe('rexxsupport.library', () => {
    let rexx: RexxSupportLibrary;

    beforeEach(() => {
      rexx = new RexxSupportLibrary(stubEmulator, root);
    });

    test('EXISTS finds the bulletin through a lowercase bbs: assign', () => {
      expect(rexx.exists('bbs:bulletins/bull1.txt')).toBe(1);
      expect(shim.existsSync).toHaveBeenCalled();
    });

    test('EXISTS still finds it through the uppercase BBS: assign', () => {
      expect(rexx.exists('BBS:Bulletins/bull1.txt')).toBe(1);
    });

    test('EXISTS reports a genuinely missing file as missing', () => {
      expect(rexx.exists('bbs:bulletins/nosuch.txt')).toBe(0);
    });

    test('STATEF reports the real file size, not an empty twin', () => {
      const statef = rexx.statef('bbs:bulletins/bull1.txt');

      expect(statef.startsWith('FILE ')).toBe(true);
      expect(statef.split(' ')[1]).toBe(String(BULLETIN.length));
      expect(shim.statSync).toHaveBeenCalled();
    });

    test('DELETE removes the real bulletin', () => {
      fs.writeFileSync(path.join(realDir, 'doomed.txt'), 'x', 'latin1');

      expect(rexx.delete('bbs:bulletins/doomed.txt')).toBe(1);

      expect(fs.existsSync(path.join(realDir, 'doomed.txt'))).toBe(false);
      expect(shim.unlinkSync).toHaveBeenCalled();
    });

    test('MAKEDIR creates inside the real directory instead of a twin', () => {
      expect(rexx.makedir('bbs:bulletins/archive')).toBe(1);

      expect(fs.readdirSync(realDir)).toContain('archive');
      expect(fs.readdirSync(root)).toEqual(['Bulletins']);
      expect(shim.mkdirSync).toHaveBeenCalled();
    });

    test('RENAME moves the real bulletin', () => {
      expect(rexx.rename('bbs:bulletins/bull1.txt', 'bbs:bulletins/bull9.txt')).toBe(1);

      expect(fs.readdirSync(realDir)).toEqual(['bull9.txt']);
      expect(fs.readFileSync(path.join(realDir, 'bull9.txt'), 'latin1')).toBe(BULLETIN);
      expect(shim.renameSync).toHaveBeenCalled();
    });

    test('SHOWDIR lists the real directory', () => {
      fs.writeFileSync(path.join(realDir, 'bull2.txt'), 'y', 'latin1');

      const listed = rexx.showdir('bbs:bulletins', 'F').split(' ').sort();

      expect(listed).toEqual(['bull1.txt', 'bull2.txt']);
      expect(shim.readdirSync).toHaveBeenCalled();
    });

    test('never creates a literal "bbs:..." directory under the BBS root', () => {
      rexx.exists('bbs:bulletins/bull1.txt');
      rexx.makedir('bbs:bulletins/archive');
      rexx.showdir('bbs:bulletins', 'A');

      expect(fs.readdirSync(root)).toEqual(['Bulletins']);
    });
  });

  describe('rexxarplib.library', () => {
    let arp: RexxArpLibrary;

    beforeEach(() => {
      arp = new RexxArpLibrary(stubEmulator, root);
    });

    test('READFILE reads the bulletin through a lowercase bbs: assign', () => {
      expect(arp.readfile('bbs:bulletins/bull1.txt')).toBe(BULLETIN);
      expect(shim.readFileSync).toHaveBeenCalled();
    });

    test('WRITEFILE lands in the real directory, not a lowercase twin', () => {
      expect(arp.writefile('bbs:bulletins/bull7.txt', 'NEW STATS\r\n')).toBe(1);

      expect(fs.readdirSync(realDir)).toContain('bull7.txt');
      expect(fs.readFileSync(path.join(realDir, 'bull7.txt'), 'latin1')).toBe(
        'NEW STATS\r\n'
      );
      expect(fs.readdirSync(root)).toEqual(['Bulletins']);
      expect(shim.writeFileSync).toHaveBeenCalled();
    });

    test('FILELIST matches files in the real directory', () => {
      fs.writeFileSync(path.join(realDir, 'bull2.txt'), 'y', 'latin1');
      fs.writeFileSync(path.join(realDir, 'notes.doc'), 'z', 'latin1');

      const listed = arp.filelist('#?.txt', 'bbs:bulletins').split(' ').sort();

      expect(listed).toEqual(['bull1.txt', 'bull2.txt']);
      expect(shim.readdirSync).toHaveBeenCalled();
    });
  });
});
