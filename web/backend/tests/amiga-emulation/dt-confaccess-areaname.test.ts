/**
 * Regression: DT_CONFACCESS (cmd 146) must return the user's access area NAME
 * ("Sysop", "Elite", "Lamer", "Disabled"), not the raw X-flag string.
 *
 * AquaScan v1.0 CS mode calls DT_CONFACCESS and appends the result to
 * "BBS:ACCESS/AREA." to build the path for GetDiskObject. If we return
 * "XXXXXXXXXX" (X-flags), it tries to open "ACCESS/AREA.XXXXXXXXXX.info"
 * which doesn't exist. Returning "Sysop" makes it open "ACCESS/AREA.Sysop.info"
 * which does exist and contains the list of conferences to scan.
 *
 * WEB_* deviation from express.e:3778 (which returns raw conferenceAccess flags).
 */

jest.mock('../../src/utils/XIMLogger', () => ({
  ximLogger: { log: jest.fn() },
}));
jest.mock('../../src/services/UserDatabaseManager', () => ({
  userDatabaseManager: { getUser: jest.fn(), readConfAccessFromDisk: jest.fn(() => 'XXXXXXXXXX') },
}));

import { XIMDataQueryHandler } from "../../src/amiga-emulation/xim/data-query";
import { XIMCommand } from "../../src/amiga-emulation/xim/types";

const MSG_ADDR = 0x1000;

class StubEmulator {
  private regs = new Map<number, number>();
  private mem = new Map<number, number>();
  getRegister(r: number) { return this.regs.get(r) ?? 0; }
  setRegister(r: number, v: number) { this.regs.set(r, v >>> 0); }
  writeMemory(a: number, b: number) { this.mem.set(a >>> 0, b & 0xff); }
  readMemory(a: number) { return this.mem.get(a >>> 0) ?? 0; }
  readMemory8(a: number) { return this.readMemory(a); }
  readMemory16(a: number) { return ((this.readMemory(a) << 8) | this.readMemory(a + 1)) >>> 0; }
  readMemory32(a: number) {
    return ((this.readMemory(a) << 24) | (this.readMemory(a+1) << 16) |
            (this.readMemory(a+2) << 8) | this.readMemory(a+3)) >>> 0;
  }
  writeMemory32(a: number, v: number) {
    this.writeMemory(a, (v >>> 24) & 0xff);
    this.writeMemory(a+1, (v >>> 16) & 0xff);
    this.writeMemory(a+2, (v >>> 8) & 0xff);
    this.writeMemory(a+3, v & 0xff);
  }
  writeMemory16(a: number, v: number) {
    this.writeMemory(a, (v >>> 8) & 0xff);
    this.writeMemory(a+1, v & 0xff);
  }
  getPC() { return 0; }
}

class StubParser {
  private written = '';
  writeMessageString(_addr: number, s: string) { this.written = s; }
  writeString(_addr: number, s: string, _max: number) { this.written = s; }
  readString(_addr: number, _max: number) { return ''; }
  readStringAtAddr(_addr: number, _max: number) { return ''; }
  writeData(_addr: number, _v: number) {}
  getCommandName(_cmd: number) { return 'DT_CONFACCESS'; }
  getCommand(_addr: number) { return XIMCommand.DT_CONFACCESS; }
  getData(_addr: number) { return 1; }
  getStringAddr(_addr: number) { return 0; }
  readMessage(_addr: number): any {
    return { msgAddr: _addr, command: XIMCommand.DT_CONFACCESS, data: 1, string: '', node: 1, line: 0, signal: 0, task: 0, replyPort: 0 };
  }
  getWritten() { return this.written; }
}

class StubExecLib {
  replyMsg(_port: number, _msg: number) {}
  putMsg(_port: number, _msg: number) {}
  getLibraryBase(_name: string) { return 0; }
}

function makeQuery(sessionOverride: Record<string, unknown>) {
  const emu = new StubEmulator() as any;
  const parser = new StubParser();
  const state = { confAccess: '', language: 'txt', replyHandled: false, doorCommand: 'CS' } as any;
  const bbsSession = { nodeId: 1, bbsRoot: '/tmp', ...sessionOverride } as any;
  const query = new XIMDataQueryHandler(emu, new StubExecLib() as any, parser as any, bbsSession, state);
  return { query, parser };
}

function callRead(sessionOverride: Record<string, unknown>): string {
  const { query, parser } = makeQuery(sessionOverride);
  const msg = {
    msgAddr: MSG_ADDR, command: XIMCommand.DT_CONFACCESS,
    data: 1, string: '', node: 1, line: 0, signal: 0, task: 0, replyPort: 0,
  } as any;
  query.handleDataQuery(msg);
  return parser.getWritten();
}

describe('DT_CONFACCESS area name derivation', () => {
  test('returns areaName directly when set on user object', () => {
    expect(callRead({ user: { areaName: 'Sysop', secLevel: 255 } })).toBe('Sysop');
  });

  test('returns areaName from session root when set', () => {
    expect(callRead({ areaName: 'Elite', user: { secLevel: 100 } })).toBe('Elite');
  });

  test('derives Sysop from secLevel 255 when areaName is empty', () => {
    expect(callRead({ user: { areaName: '', secLevel: 255 } })).toBe('Sysop');
  });

  test('derives Elite from secLevel 100 when areaName is empty', () => {
    expect(callRead({ user: { areaName: '', secLevel: 100 } })).toBe('Elite');
  });

  test('derives Lamer from secLevel 20 when areaName is empty', () => {
    expect(callRead({ user: { areaName: '', secLevel: 20 } })).toBe('Lamer');
  });

  test('derives Disabled from low secLevel when areaName is empty', () => {
    expect(callRead({ user: { areaName: '', secLevel: 5 } })).toBe('Disabled');
  });

  test('returned value is at most 10 characters', () => {
    const result = callRead({ user: { areaName: 'SysopLongName', secLevel: 255 } });
    expect(result.length).toBeLessThanOrEqual(10);
  });
});
