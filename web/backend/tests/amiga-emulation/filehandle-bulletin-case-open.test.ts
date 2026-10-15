/**
 * A door's bulletin write lands in the real "Bulletins/" directory.
 *
 * MultiTop/MegaTop are invoked as
 *
 *   mtop doors:multitop/designs/mtopulbytes1.dsg bbs:bulletins/bull1.txt ...
 *
 * - the lowercase "bulletins/" comes from the door's own argument string, and
 * on AmigaDOS (a case-insensitive, case-preserving filesystem) that reaches
 * "Bulletins/bull1.txt". The emulator has amigafs for exactly this, and
 * FileManager.open() already checks amigafs.existsSync(sysPath) before
 * logging "(EXISTS)" - but FileHandle.open() then handed the UNRESOLVED path
 * to raw fs.openSync. On the case-sensitive Linux container that meant:
 *
 *   MODE_NEWFILE (O_WRONLY|O_CREAT|O_TRUNC) -> ENOENT on the missing
 *     lowercase parent, Open() returns 0, the bulletin never regenerates;
 *   MODE_OLDFILE / MODE_READWRITE (O_RDWR|O_CREAT) -> an empty lowercase
 *     twin is created beside the real file, and the door reads 0 bytes.
 *
 * macOS hides all of it behind a case-insensitive filesystem, so the
 * assertions below pin the two halves that ARE observable on any host: that
 * amigafs.openSync understands the numeric O_CREAT mask FileHandle passes,
 * and that FileHandle.open() goes through amigafs at all.
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as amigafs from '../../src/utils/amigafs';
import { FileHandle } from '../../src/amiga-emulation/api/FileHandle';
import { DosLibrary } from '../../src/amiga-emulation/api/DosLibrary';
import { CPURegister } from '../../src/amiga-emulation/cpu/MoiraEmulator';

// The module's exports are non-configurable, so jest.spyOn() cannot wrap them.
// Wrap openSync at module load instead, delegating to the real implementation,
// so the "did FileHandle go through amigafs" assertion stays a runtime fact
// rather than a source grep.
jest.mock('../../src/utils/amigafs', () => {
  const actual = jest.requireActual('../../src/utils/amigafs');
  return { ...actual, openSync: jest.fn(actual.openSync) };
});

const openSyncCalls = amigafs.openSync as unknown as jest.Mock;

const MODE_NEWFILE_FLAGS =
  fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_TRUNC;
const MODE_OLDFILE_FLAGS = fs.constants.O_RDWR | fs.constants.O_CREAT;

describe("a door's bulletin write reaches the real Bulletins directory", () => {
  let root: string;
  let realDir: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'bulletin-case-'));
    realDir = path.join(root, 'Bulletins');
    fs.mkdirSync(realDir, { recursive: true });
  });

  afterEach(() => {
    jest.restoreAllMocks();
    fs.rmSync(root, { recursive: true, force: true });
  });

  describe('amigafs.createsOnOpen', () => {
    test('recognises the numeric O_CREAT mask FileHandle passes', () => {
      expect(amigafs.createsOnOpen(MODE_NEWFILE_FLAGS)).toBe(true);
      expect(amigafs.createsOnOpen(MODE_OLDFILE_FLAGS)).toBe(true);
    });

    test('leaves a plain read open alone', () => {
      expect(amigafs.createsOnOpen(fs.constants.O_RDONLY)).toBe(false);
      expect(amigafs.createsOnOpen('r')).toBe(false);
      // 'r+' and 'rs+' open for update but still require the file to exist -
      // a bare "has a plus sign" test would wrongly send them down the
      // create-in-parent branch and invent files AmigaDOS would have refused.
      expect(amigafs.createsOnOpen('r+')).toBe(false);
      expect(amigafs.createsOnOpen('rs+')).toBe(false);
    });

    test('still recognises the string forms', () => {
      for (const flags of ['w', 'w+', 'a', 'a+']) {
        expect(amigafs.createsOnOpen(flags)).toBe(true);
      }
    });
  });

  describe('amigafs.openSync with the emulator numeric flags', () => {
    test('creates a new bulletin inside the differently-cased parent', () => {
      const asked = path.join(root, 'bulletins', 'bull1.txt');

      const fd = amigafs.openSync(asked, MODE_NEWFILE_FLAGS, 0o666);
      try {
        fs.writeSync(fd, Buffer.from('TOP UPLOADERS\n', 'latin1'), 0, 14, 0);
      } finally {
        fs.closeSync(fd);
      }

      expect(fs.readdirSync(realDir)).toContain('bull1.txt');
      expect(fs.readFileSync(path.join(realDir, 'bull1.txt'), 'latin1')).toBe(
        'TOP UPLOADERS\n'
      );
    });

    test('opens the existing file rather than minting an empty twin', () => {
      fs.writeFileSync(path.join(realDir, 'bull1.txt'), 'A'.repeat(2124), 'latin1');
      const asked = path.join(root, 'bulletins', 'bull1.txt');

      const fd = amigafs.openSync(asked, MODE_OLDFILE_FLAGS, 0o666);
      let size: number;
      try {
        size = fs.fstatSync(fd).size;
      } finally {
        fs.closeSync(fd);
      }

      expect(size).toBe(2124);
      expect(fs.readdirSync(root)).toEqual(['Bulletins']);
    });

    test('reports a missing parent as ENOENT so IoErr becomes 205', () => {
      const asked = path.join(root, 'nowhere', 'bull1.txt');

      let caught: NodeJS.ErrnoException | null = null;
      try {
        amigafs.openSync(asked, MODE_NEWFILE_FLAGS, 0o666);
      } catch (err) {
        caught = err as NodeJS.ErrnoException;
      }

      expect(caught).not.toBeNull();
      expect(caught?.code).toBe('ENOENT');
    });
  });

  describe('FileHandle', () => {
    test('opens through amigafs, not raw fs', () => {
      openSyncCalls.mockClear();
      const asked = path.join(root, 'bulletins', 'bull1.txt');

      const fh = new FileHandle('bbs:bulletins/bull1.txt', asked);
      expect(fh.open('w')).toBe(true);
      fh.close();

      expect(openSyncCalls).toHaveBeenCalledWith(asked, MODE_NEWFILE_FLAGS, 0o666);
    });

    test("a door's 23 writes survive Close on a MODE_NEWFILE handle", () => {
      const asked = path.join(root, 'bulletins', 'bull1.txt');
      const fh = new FileHandle('bbs:bulletins/bull1.txt', asked);

      expect(fh.open('w')).toBe(true);
      let expected = '';
      for (let line = 0; line < 23; line += 1) {
        const chunk = `line ${line}\n`;
        expected += chunk;
        expect(fh.write(Buffer.from(chunk, 'latin1')).bytesWritten).toBe(chunk.length);
      }
      fh.close();

      expect(fs.readFileSync(path.join(realDir, 'bull1.txt'), 'latin1')).toBe(expected);
    });

    test('MODE_NEWFILE truncates a bulletin that already has content', () => {
      fs.writeFileSync(path.join(realDir, 'bull1.txt'), 'X'.repeat(2124), 'latin1');
      const asked = path.join(root, 'bulletins', 'bull1.txt');
      const fh = new FileHandle('bbs:bulletins/bull1.txt', asked);

      expect(fh.open('w')).toBe(true);
      fh.write(Buffer.from('new', 'latin1'));
      fh.close();

      expect(fs.readFileSync(path.join(realDir, 'bull1.txt'), 'latin1')).toBe('new');
    });
  });

  describe('SetFileSize', () => {
    class StubEmulator {
      private regs = new Map<number, number>();
      getRegister(reg: number): number {
        return this.regs.get(reg) ?? 0;
      }
      setRegister(reg: number, value: number): void {
        this.regs.set(reg, value | 0);
      }
      writeMemory(): void {}
      readLong(): number {
        return 0;
      }
    }

    test('truncates through amigafs, like the statSync beside it', () => {
      // SetFileSize() stats handle.realPath through amigafs and then reopened
      // it with raw fs - so on the container it ENOENTs on a path it had just
      // resolved. Same defect class as FileHandle.open(), same pin.
      fs.writeFileSync(path.join(realDir, 'bull1.txt'), 'X'.repeat(2124), 'latin1');
      const asked = path.join(root, 'bulletins', 'bull1.txt');

      const stub = new StubEmulator();
      const dos = new DosLibrary(stub as any, root);
      const bptr = 0x99;
      (dos as any).openFiles.set(bptr, {
        id: bptr,
        name: 'bull1.txt',
        mode: 1004,
        position: 0,
        isConsole: false,
        buffer: undefined,
        realPath: asked,
      });

      stub.setRegister(CPURegister.D1, bptr);
      stub.setRegister(CPURegister.D2, 512);
      stub.setRegister(CPURegister.D3, 1); // OFFSET_BEGINNING

      openSyncCalls.mockClear();
      expect(dos.handleCall(-456)).toBe(true);

      expect(openSyncCalls).toHaveBeenCalledWith(asked, 'r+');
      expect(stub.getRegister(CPURegister.D0)).toBe(512);
      expect(fs.statSync(path.join(realDir, 'bull1.txt')).size).toBe(512);
    });
  });
});
