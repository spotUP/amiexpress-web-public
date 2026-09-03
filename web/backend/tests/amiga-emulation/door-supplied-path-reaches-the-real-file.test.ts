/**
 * A path a 68K door supplies reaches the real, possibly differently-cased,
 * file on disk.
 *
 * AmigaDOS filesystems are case-insensitive and case-preserving; ext4 under
 * the Linux container is neither. Every place the emulator took a path that
 * came from the DOOR (an XIM message string, an Execute() argument, a command
 * name) and handed it straight to plain fs was a hole: it worked on the macOS
 * dev machine, whose volume is case-insensitive, and failed on the board.
 *
 * The FileHandle/SetFileSize half of this was closed by
 * filehandle-bulletin-case-open.test.ts. These are the survivors that same
 * review listed:
 *
 *   DoorMessageHandler  CHECK_PLAYPEN_EXISTS, DISPLAY_FILE, CHECK_TO_DISPLAY /
 *                       JH_SG (findSecurityScreen), GET_CMD_TOOLTYPE
 *   DosLibrary          SetProtection (chmod), VERSION <file> ($VER read)
 *   XIMProtocol         GET_CMD_TOOLTYPE .info lookup
 *   xim/data-query      DT_DUMP
 *
 * macOS cannot observe the ENOENT itself, so - as in the FileHandle test -
 * these assert at RUNTIME that the call went through amigafs, by wrapping the
 * module's exports at load time. A source grep would prove nothing.
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as amigafs from '../../src/utils/amigafs';
import { DosLibrary } from '../../src/amiga-emulation/api/DosLibrary';
import { CPURegister } from '../../src/amiga-emulation/cpu/MoiraEmulator';
import { DoorMessageHandler } from '../../src/amiga-emulation/session/DoorMessageHandler';
import { DoorConstants } from '../../src/amiga-emulation/DoorTypes';
import { XIMCommand } from '../../src/amiga-emulation/xim/types';
import { XIMMessageParser } from '../../src/amiga-emulation/xim/messages';
import { XIMDataQueryHandler } from '../../src/amiga-emulation/xim/data-query';

// The module's exports are non-configurable, so jest.spyOn() cannot wrap them.
// Wrap at module load, delegating to the real implementations.
jest.mock('../../src/utils/amigafs', () => {
  const actual = jest.requireActual('../../src/utils/amigafs');
  return {
    ...actual,
    existsSync: jest.fn(actual.existsSync),
    readFileSync: jest.fn(actual.readFileSync),
    chmodSync: jest.fn(actual.chmodSync),
    writeFileSync: jest.fn(actual.writeFileSync),
    resolveExistingAncestors: jest.fn(actual.resolveExistingAncestors),
  };
});

// displayFile() runs the file through the MCI parser, which wants a live BBS
// session. Only the path resolution is under test here.
jest.mock('../../src/handlers/screen.handler', () => ({
  parseMciCodes: jest.fn(async (contents: string) => ({ parsed: contents })),
}));

const shim = amigafs as unknown as Record<string, jest.Mock>;

const SCREEN_BODY = 'WELCOME TO THE BOARD\n';

/** Byte-addressable stand-in for the emulator's memory + register file. */
class StubEmulator {
  private regs = new Map<number, number>();
  private mem = new Map<number, number>();

  getRegister(reg: number): number {
    return this.regs.get(reg) ?? 0;
  }
  setRegister(reg: number, value: number): void {
    this.regs.set(reg, value | 0);
  }
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
  readLong(): number {
    return 0;
  }
  readString(addr: number, maxLen = 200): string {
    const bytes: number[] = [];
    for (let i = 0; i < maxLen; i += 1) {
      const byte = this.readMemory(addr + i);
      if (byte === 0) break;
      bytes.push(byte);
    }
    return String.fromCharCode(...bytes);
  }
  writeString(addr: number, text: string): void {
    for (let i = 0; i < text.length; i += 1) {
      this.writeMemory(addr + i, text.charCodeAt(i) & 0xff);
    }
    this.writeMemory(addr + text.length, 0);
  }
}

describe('a door-supplied path reaches the real file on a case-sensitive host', () => {
  let root: string;
  let screensDir: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'door-path-case-'));
    screensDir = path.join(root, 'Screens');
    fs.mkdirSync(screensDir, { recursive: true });
    fs.writeFileSync(path.join(screensDir, 'BULL.TXT'), SCREEN_BODY, 'latin1');
    for (const fn of Object.values(shim)) {
      if (typeof fn === 'function' && 'mockClear' in fn) fn.mockClear();
    }
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  describe('DoorMessageHandler', () => {
    const MSG_ADDR = 0x2000;

    interface Emitted {
      event: string;
      payload: unknown;
    }

    function buildHandler(emitted: Emitted[], doorId = 'testdoor') {
      const emulator = new StubEmulator();
      const socket = {
        on: jest.fn(),
        emit: jest.fn((event: string, payload: unknown) => {
          emitted.push({ event, payload });
        }),
      };
      const handler = new DoorMessageHandler(
        emulator as never,
        socket as never,
        { putMsg: jest.fn() } as never,
        {
          executablePath: path.join(root, 'door'),
          doorId,
          bbsSession: { bbsRoot: root, dataDir: root, user: { secLevel: 255 } },
        }
      );
      return { handler, emulator };
    }

    /** Drive the real command switch (the no-XIMProtocol fallback path). */
    async function dispatch(
      handler: DoorMessageHandler,
      command: number,
      str: string,
      data = 0
    ): Promise<void> {
      await (
        handler as unknown as {
          processCommand: (
            command: number,
            data: number,
            str: string,
            msgAddr: number,
            replyPortAddr: number
          ) => Promise<void>;
        }
      ).processCommand(command, data, str, MSG_ADDR, 0);
    }

    test('CHECK_PLAYPEN_EXISTS finds a file the door named in the other case', async () => {
      const emitted: Emitted[] = [];
      const { handler, emulator } = buildHandler(emitted);
      const asked = path.join(root, 'screens', 'BULL.TXT');

      await dispatch(handler, XIMCommand.CHECK_PLAYPEN_EXISTS, asked);

      expect(shim.existsSync).toHaveBeenCalledWith(asked);
      expect(emulator.readMemory32(MSG_ADDR + DoorConstants.MESSAGE_DATA_OFFSET)).toBe(1);
    });

    test('CHECK_PLAYPEN_EXISTS still reports a genuinely missing file as missing', async () => {
      const emitted: Emitted[] = [];
      const { handler, emulator } = buildHandler(emitted);

      await dispatch(
        handler,
        XIMCommand.CHECK_PLAYPEN_EXISTS,
        path.join(root, 'screens', 'NOSUCH.TXT')
      );

      expect(emulator.readMemory32(MSG_ADDR + DoorConstants.MESSAGE_DATA_OFFSET)).toBe(0);
    });

    test('DISPLAY_FILE reads the screen through amigafs, not raw fs', async () => {
      const emitted: Emitted[] = [];
      const { handler } = buildHandler(emitted);
      const asked = path.join(root, 'screens', 'BULL.TXT');

      await dispatch(handler, XIMCommand.DISPLAY_FILE, asked);

      expect(shim.existsSync).toHaveBeenCalledWith(asked);
      expect(shim.readFileSync).toHaveBeenCalledWith(asked, 'utf-8');
      expect(emitted).toContainEqual({
        event: 'ansi-output',
        payload: SCREEN_BODY.replace(/\n/g, '\r\n'),
      });
    });

    test('CHECK_TO_DISPLAY searches for the security screen through amigafs', async () => {
      const emitted: Emitted[] = [];
      const { handler } = buildHandler(emitted);

      await dispatch(handler, XIMCommand.CHECK_TO_DISPLAY, 'screens/BULL');

      // findSecurityScreen() walks the security levels down from 255 and then
      // falls back to the bare name; every probe has to use the shim or the
      // screen is invisible on a case-sensitive filesystem.
      expect(shim.existsSync).toHaveBeenCalledWith(
        path.join(root, 'screens/BULL.txt')
      );
      expect(emitted).toContainEqual({
        event: 'ansi-output',
        payload: SCREEN_BODY.replace(/\n/g, '\r\n'),
      });
    });

    test('GET_CMD_TOOLTYPE reads the LOCATION out of a differently-cased icon', async () => {
      // Outcome, not a spy: an amigafs.existsSync guard in front of a raw-fs
      // READER passes on ext4 and then returns an empty tooltype map, so
      // "mtop never reaches MTOP.info" stayed true. Assert the VALUE.
      fs.mkdirSync(path.join(root, 'Commands', 'BBSCmd'), { recursive: true });
      fs.writeFileSync(
        path.join(root, 'Commands', 'BBSCmd', 'TESTDOOR.info'),
        'LOCATION=Doors:testdoor/testdoor\x00',
        'latin1'
      );
      const emitted: Emitted[] = [];
      const { handler, emulator } = buildHandler(emitted, 'testdoor');

      await dispatch(handler, XIMCommand.GET_CMD_TOOLTYPE, 'LOCATION');

      expect(emulator.readMemory32(MSG_ADDR + DoorConstants.MESSAGE_DATA_OFFSET)).toBe(1);
      expect(emulator.readString(MSG_ADDR + DoorConstants.MESSAGE_STRING_OFFSET)).toBe(
        'Doors:testdoor/testdoor'
      );

      // The outcome above cannot fail on macOS - its volume is
      // case-insensitive, so even the raw-fs reader finds the file. The pin
      // that discriminates on THIS host is that the READER, not just the
      // guard in front of it, went through amigafs: an amigafs.existsSync
      // guard followed by fs.readFileSync passes the guard on ext4 and then
      // returns an empty map.
      expect(shim.readFileSync).toHaveBeenCalledWith(
        path.join(root, 'Commands', 'BBSCmd', 'testdoor.info')
      );
    });

    test('GET_CMD_TOOLTYPE still reports a tooltype that is genuinely absent', async () => {
      fs.mkdirSync(path.join(root, 'Commands', 'BBSCmd'), { recursive: true });
      fs.writeFileSync(
        path.join(root, 'Commands', 'BBSCmd', 'TESTDOOR.info'),
        'LOCATION=Doors:testdoor/testdoor\x00',
        'latin1'
      );
      const emitted: Emitted[] = [];
      const { handler, emulator } = buildHandler(emitted, 'testdoor');

      await dispatch(handler, XIMCommand.GET_CMD_TOOLTYPE, 'NOSUCHKEY');

      expect(emulator.readMemory32(MSG_ADDR + DoorConstants.MESSAGE_DATA_OFFSET)).toBe(0);
    });
  });

  describe('DosLibrary', () => {
    test('VERSION <file> reads $VER through amigafs', () => {
      // The target file comes from the door's own command line; PathManager
      // hands POSIX absolute paths straight through with no case resolution,
      // so the $VER read has to do it.
      fs.writeFileSync(
        path.join(screensDir, 'DOOR'),
        '\u0000$VER: TestDoor 1.2 (03.09.26)\u0000',
        'latin1'
      );
      const asked = path.join(root, 'screens', 'DOOR');

      const emulator = new StubEmulator();
      const dos = new DosLibrary(emulator as never, root);
      dos.enableNewFileSystem(root); // wires PathManager, as a live door session does
      shim.existsSync.mockClear();
      shim.readFileSync.mockClear();
      const cmdAddr = 0x4000;
      emulator.writeString(cmdAddr, `VERSION ${asked}`);
      emulator.setRegister(CPURegister.D1, cmdAddr);
      emulator.setRegister(CPURegister.D2, 0);
      emulator.setRegister(CPURegister.D3, 0);

      expect(dos.handleCall(-222)).toBe(true); // _LVOExecute

      expect(shim.existsSync).toHaveBeenCalledWith(asked);
      expect(shim.readFileSync).toHaveBeenCalledWith(asked);
    });

    test('SetProtection chmods through amigafs, like the existsSync above it', () => {
      // The existsSync() guard four lines up already used the shim; the chmod
      // then went raw, so on the container it failed on a path it had just
      // confirmed. Same defect class as the SetFileSize open.
      const target = path.join(screensDir, 'BULL.TXT');
      fs.chmodSync(target, 0o600);
      const asked = path.join(root, 'screens', 'BULL.TXT');

      const emulator = new StubEmulator();
      const dos = new DosLibrary(emulator as never, root);
      const namePtr = 0x3000;
      emulator.writeString(namePtr, asked);
      emulator.setRegister(CPURegister.D1, namePtr);
      // Amiga protection bits: clear = permitted. 0 => read+write+execute.
      emulator.setRegister(CPURegister.D2, 0);

      expect(dos.handleCall(-186)).toBe(true);

      expect(shim.chmodSync).toHaveBeenCalledWith(asked, 0o555 | 0o200);
      expect(emulator.getRegister(CPURegister.D0)).toBe(-1);
      expect(fs.statSync(target).mode & 0o777).toBe(0o555 | 0o200);
    });
  });

  describe('xim/data-query', () => {
    test('DT_DUMP writes the user dump into the real directory', () => {
      const emulator = new StubEmulator();
      const parser = new XIMMessageParser(emulator as never);
      const handler = new XIMDataQueryHandler(
        emulator as never,
        { replyMsg: jest.fn() } as never,
        parser,
        { bbsRoot: root, user: { username: 'SYSOP' } } as never,
        {} as never
      );

      const msgAddr = 0x5000;
      // The door names the dump file; "screens/" must reach "Screens/".
      parser.writeString(
        msgAddr + DoorConstants.MESSAGE_STRING_OFFSET,
        'screens/userdump.json',
        200
      );

      handler.handleDataQuery({
        msgAddr,
        command: XIMCommand.DT_DUMP,
        data: 0,
        replyPort: 0,
      });

      expect(shim.writeFileSync).toHaveBeenCalledWith(
        path.join(root, 'screens/userdump.json'),
        expect.stringContaining('SYSOP'),
        'utf8'
      );
      expect(fs.readdirSync(screensDir)).toContain('userdump.json');
      expect(fs.readdirSync(root)).toEqual(['Screens']);
    });

    test('DT_DUMP overwrites an existing upper-cased dump instead of twinning it', () => {
      // writeFileSync only case-resolves the PARENT, so the file itself has to
      // be resolved first or "dump.txt" lands beside the real "DUMP.TXT".
      fs.writeFileSync(path.join(screensDir, 'DUMP.TXT'), 'stale', 'latin1');

      const emulator = new StubEmulator();
      const parser = new XIMMessageParser(emulator as never);
      const handler = new XIMDataQueryHandler(
        emulator as never,
        { replyMsg: jest.fn() } as never,
        parser,
        { bbsRoot: root, user: { username: 'SYSOP' } } as never,
        {} as never
      );

      const msgAddr = 0x5100;
      parser.writeString(
        msgAddr + DoorConstants.MESSAGE_STRING_OFFSET,
        'screens/dump.txt',
        200
      );

      handler.handleDataQuery({
        msgAddr,
        command: XIMCommand.DT_DUMP,
        data: 0,
        replyPort: 0,
      });

      expect(fs.readdirSync(screensDir).sort()).toEqual(['BULL.TXT', 'DUMP.TXT']);
      expect(
        fs.readFileSync(path.join(screensDir, 'DUMP.TXT'), 'latin1')
      ).toContain('SYSOP');

      // macOS cannot show the twin: on a case-insensitive volume amigafs's own
      // fast path (fs.existsSync of the asked spelling) succeeds, so the whole
      // shim is a no-op here and every spelling writes the same inode. The pin
      // that discriminates on THIS host is that the FILE, not only its parent,
      // was put through the resolver - writeFileSync alone resolves the parent
      // and then joins the door's spelling of the basename.
      expect(shim.resolveExistingAncestors).toHaveBeenCalledWith(
        path.join(root, 'screens', 'dump.txt')
      );
    });
  });
});
