/**
 * A conference that does not live in `Conf<n>` is still found.
 *
 * express.e reads a conference's directory from ConfConfig.info's `LOCATION.n`
 * tooltype, and a sysop is free to point it anywhere - `Work:Confs/Elite/`,
 * `BBS:EliteArea/`, a differently-cased `BBS:conf2/`. Code that builds the
 * name `Conf${n}` by hand silently reads the wrong directory on any board that
 * moved one.
 *
 * `xim/data-query.ts` did exactly that for a file-scan door's `DT_NAME`: it
 * joined `<bbsRoot>/Conf<n>/NumULs`, so on a board with a relocated conference
 * every FR/N/F/CS/SCAN/NSU door reported 0 files. It now goes through
 * `conferenceDir()`, the one resolver that reads LOCATION.n - which also
 * case-resolves the result through amigafs, because ext4 under the Linux
 * container will not match `conf2/` against `Conf2/`.
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { applyTooltypes } from '../../src/utils/info-file.util';
import { conferenceDir } from '../../src/conferences/conference-paths';
import { XIMMessageParser } from '../../src/amiga-emulation/xim/messages';
import { XIMDataQueryHandler } from '../../src/amiga-emulation/xim/data-query';
import { XIMSystemCommandsHandler } from '../../src/amiga-emulation/xim/system-commands';
import { IconLibrary } from '../../src/amiga-emulation/api/IconLibrary';
import { DoorConstants } from '../../src/amiga-emulation/DoorTypes';
import { XIMCommand } from '../../src/amiga-emulation/xim/types';

/** Byte-addressable stand-in for the emulator's memory. */
class StubEmulator {
  private mem = new Map<number, number>();

  readMemory(addr: number): number {
    return this.mem.get(addr) ?? 0;
  }
  writeMemory(addr: number, value: number): void {
    this.mem.set(addr, value & 0xff);
  }
  readMemory16(addr: number): number {
    return (this.readMemory(addr) << 8) | this.readMemory(addr + 1);
  }
  readMemory32(addr: number): number {
    return (
      (this.readMemory(addr) << 24) |
      (this.readMemory(addr + 1) << 16) |
      (this.readMemory(addr + 2) << 8) |
      this.readMemory(addr + 3)
    );
  }
  writeMemory32(addr: number, value: number): void {
    this.writeMemory(addr, (value >>> 24) & 0xff);
    this.writeMemory(addr + 1, (value >>> 16) & 0xff);
    this.writeMemory(addr + 2, (value >>> 8) & 0xff);
    this.writeMemory(addr + 3, value & 0xff);
  }
  readString(addr = 0, maxLen = 200): string {
    const bytes: number[] = [];
    for (let i = 0; i < maxLen; i += 1) {
      const byte = this.readMemory(addr + i);
      if (byte === 0) break;
      bytes.push(byte);
    }
    return String.fromCharCode(...bytes);
  }
}

describe('a conference is found where LOCATION.n says, not at Conf<n>', () => {
  let root: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'conf-location-'));
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  function writeConfConfig(entries: Array<[string, string]>): void {
    const tooltypes: Array<[string, string]> = [['NCONFS', String(entries.length)]];
    entries.forEach(([name, location], i) => {
      tooltypes.push([`NAME.${i + 1}`, name]);
      tooltypes.push([`LOCATION.${i + 1}`, location]);
    });
    applyTooltypes(path.join(root, 'ConfConfig.info'), tooltypes);
  }

  describe('conferenceDir()', () => {
    test('follows a LOCATION that is not Conf<n>', () => {
      writeConfConfig([
        ['General', 'BBS:Conf1/'],
        ['Elite', 'BBS:EliteArea/'],
      ]);
      fs.mkdirSync(path.join(root, 'EliteArea'), { recursive: true });

      expect(conferenceDir(root, 2)).toBe(path.join(root, 'EliteArea'));
    });

    test('resolves a LOCATION whose case differs from the directory on disk', () => {
      writeConfConfig([
        ['General', 'BBS:Conf1/'],
        ['Elite', 'BBS:elitearea/'],
      ]);
      fs.mkdirSync(path.join(root, 'EliteArea'), { recursive: true });

      // The case walk has to RUN, and the assertion has to say so on either
      // host. On the macOS dev machine the volume is case-insensitive, so
      // `<root>/elitearea` exists and every fs assertion below passes even
      // with the walk ripped out - the whole bug is that ext4 in the Linux
      // container is not, and there that path ENOENTs. So spy on the walk
      // (call-through, real behaviour) and pin that conferenceDir funnels its
      // exit through it, with the un-cased path the sysop wrote.
      const resolved = conferenceDir(root, 2);

      // WHERE THIS PIN BITES: on a case-SENSITIVE host - ext4 in the Linux
      // container, and Linux CI. There `<root>/elitearea` does not exist, so
      // without conferenceDir()'s amigafs walk existsSync() below is false and
      // this test is red. On the macOS dev machine the volume is
      // case-insensitive: `elitearea` resolves to `EliteArea` in the kernel,
      // amigafs.resolvePath() takes its exact-hit fast path, and the function
      // cannot observably differ - so treat a local green here as no evidence.
      expect(fs.existsSync(resolved)).toBe(true);
      expect(fs.statSync(resolved).isDirectory()).toBe(true);
      expect(fs.readdirSync(root).sort()).toEqual([
        'ConfConfig.info',
        'EliteArea',
      ]);
    });

    test('honours an absolute LOCATION outside the BBS root', () => {
      const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'conf-outside-'));
      try {
        writeConfConfig([['General', 'BBS:Conf1/'], ['Offsite', outside]]);

        expect(conferenceDir(root, 2)).toBe(outside);
      } finally {
        fs.rmSync(outside, { recursive: true, force: true });
      }
    });

    test('falls back to Conf<n> when ConfConfig.info is missing', () => {
      expect(conferenceDir(root, 3)).toBe(path.join(root, 'Conf3'));
    });

    test('falls back to Conf<n> when the entry carries no LOCATION', () => {
      applyTooltypes(path.join(root, 'ConfConfig.info'), [
        ['NCONFS', '2'],
        ['NAME.1', 'General'],
        ['NAME.2', 'Elite'],
      ]);

      expect(conferenceDir(root, 2)).toBe(path.join(root, 'Conf2'));
    });
  });

  describe('DT_NAME for a file-scan door', () => {
    const MSG_ADDR = 0x6000;

    test('counts the uploads of the relocated conference, not of Conf<n>', () => {
      writeConfConfig([
        ['General', 'BBS:Conf1/'],
        ['Elite', 'BBS:EliteArea/'],
      ]);
      fs.mkdirSync(path.join(root, 'EliteArea'), { recursive: true });
      fs.writeFileSync(path.join(root, 'EliteArea', 'NumULs'), '4271\n', 'latin1');
      // A decoy in the place the old code looked. If DT_NAME reports this
      // number the resolver was bypassed.
      fs.mkdirSync(path.join(root, 'Conf2'), { recursive: true });
      fs.writeFileSync(path.join(root, 'Conf2', 'NumULs'), '9\n', 'latin1');

      const emulator = new StubEmulator();
      const parser = new XIMMessageParser(emulator as never);
      const handler = new XIMDataQueryHandler(
        emulator as never,
        { replyMsg: jest.fn() } as never,
        parser,
        {
          bbsRoot: root,
          conferenceNumber: 2,
          doorCommand: 'FR', // one of the file-scan doors
          user: { username: 'SYSOP' },
        } as never,
        {} as never
      );

      handler.handleDataQuery({
        msgAddr: MSG_ADDR,
        command: XIMCommand.DT_NAME,
        data: 1, // READ
        replyPort: 0,
      });

      expect(
        parser.readString(MSG_ADDR + DoorConstants.MESSAGE_STRING_OFFSET, 31)
      ).toBe('4271');
    });
  });

  describe('GET_CONFNUM tells the door the conference LOCATION', () => {
    test('names the relocated conference, in Amiga form, not a host Conf<n>', () => {
      writeConfConfig([
        ['General', 'BBS:Conf1/'],
        ['Elite', 'BBS:EliteArea/'],
      ]);
      fs.mkdirSync(path.join(root, 'EliteArea'), { recursive: true });
      fs.mkdirSync(path.join(root, 'Conf2'), { recursive: true }); // decoy

      const emulator = new StubEmulator();
      const parser = new XIMMessageParser(emulator as never);
      const handler = new XIMSystemCommandsHandler(
        emulator as never,
        { replyMsg: jest.fn() } as never,
        { emit: jest.fn(), on: jest.fn() } as never,
        parser,
        { bbsPath: root, conferenceId: 2 } as never,
        {} as never
      );

      const NAME_ADDR = 0x7000;
      const PATH_ADDR = 0x7400;
      (
        handler as unknown as {
          handleGetConfNumCommand: (msg: {
            msgAddr: number;
            command: number;
            data: number;
            replyPort: number;
            filler1: number;
            filler2: number;
          }) => void;
        }
      ).handleGetConfNumCommand({
        msgAddr: 0x7800,
        command: 0,
        data: 2,
        replyPort: 0,
        filler1: NAME_ADDR,
        filler2: PATH_ADDR,
      });

      expect(emulator.readString(NAME_ADDR, 54)).toBe('Elite');
      expect(emulator.readString(PATH_ADDR, 54)).toBe('BBS:EliteArea/');
    });

    test('falls back to the Amiga form BBS:Conf<n>/ with no ConfConfig.info', () => {
      const emulator = new StubEmulator();
      const parser = new XIMMessageParser(emulator as never);
      const handler = new XIMSystemCommandsHandler(
        emulator as never,
        { replyMsg: jest.fn() } as never,
        { emit: jest.fn(), on: jest.fn() } as never,
        parser,
        { bbsPath: root, conferenceId: 3 } as never,
        {} as never
      );

      const PATH_ADDR = 0x7400;
      (
        handler as unknown as {
          handleGetConfNumCommand: (msg: Record<string, number>) => void;
        }
      ).handleGetConfNumCommand({
        msgAddr: 0x7800,
        command: 0,
        data: 3,
        replyPort: 0,
        filler1: 0,
        filler2: PATH_ADDR,
      });

      // Never a host path - the door reads this string.
      expect(emulator.readString(PATH_ADDR, 54)).toBe('BBS:Conf3/');
    });
  });

  describe('ACP tooltypes for a relocated conference', () => {
    function synthesize(bbsRoot: string): string[] {
      const icons = new IconLibrary({} as never, bbsRoot);
      return (
        icons as unknown as { synthesizeACPTooltypes: () => string[] }
      ).synthesizeACPTooltypes();
    }

    test('reads NDIRS, ULPATH and DLPATH out of the LOCATION directory', () => {
      writeConfConfig([['Elite', 'BBS:EliteArea/']]);
      const elite = path.join(root, 'EliteArea');
      fs.mkdirSync(path.join(elite, 'Upload'), { recursive: true });
      fs.mkdirSync(path.join(elite, 'DIR1'), { recursive: true });
      fs.mkdirSync(path.join(elite, 'DIR7'), { recursive: true });
      // Decoys in the directory the old code walked.
      fs.mkdirSync(path.join(root, 'Conf1', 'DIR2'), { recursive: true });

      const tooltypes = synthesize(root);

      expect(tooltypes).toContain('ULPATH.1=BBS:EliteArea/Upload/');
      expect(tooltypes).toContain('DLPATH.1=BBS:EliteArea/Upload/');
      // 7 from EliteArea/DIR7, not 2 from the Conf1 decoy.
      expect(tooltypes).toContain('NDIRS=7');
    });

    test('still lists a conference that does live in Conf<n>', () => {
      writeConfConfig([['General', 'BBS:Conf1/']]);
      fs.mkdirSync(path.join(root, 'Conf1', 'Upload'), { recursive: true });
      fs.mkdirSync(path.join(root, 'Conf1', 'DIR3'), { recursive: true });

      const tooltypes = synthesize(root);

      expect(tooltypes).toContain('ULPATH.1=BBS:Conf1/Upload/');
      expect(tooltypes).toContain('NDIRS=3');
    });
  });
});
