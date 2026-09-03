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
  readString(): string {
    return '';
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

      const resolved = conferenceDir(root, 2);

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
});
