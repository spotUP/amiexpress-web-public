/**
 * rTW (WHO) and every other MULTICOM door read a node's action from its
 * singlePort.status LONG (+0x52). express.e:13184 setEnvStat is the one
 * action setter and writes it; on the web board only login and door start
 * wrote it, so rTW showed "sMOKING a jOINT" (status 0) for every other action.
 *
 * A parked web session (dropped inside its resume window) shows rTW's
 * "cARRIER lOST :-(": rTW selects that text for status 29..97 (code hunk
 * jump table +0x6c4, see constants/env-codes.ts PARKED_NODE_STATUS). A resume
 * shows the session's action again. These tests read the bytes the door reads.
 */
process.env.SKIP_DB_INIT = '1';

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

jest.mock('../../src/index', () => ({}));
jest.mock('../../src/services/node-manager.service', () => ({ nodeManager: { rekeySession: jest.fn() } }));
jest.mock('../../src/server/session-observers', () => ({ startObserving: jest.fn(), stopObserving: jest.fn() }));

import { multicomManager } from '../../src/nodes/MulticomManager';
import { MULTICOM_SINGLE_PORTS } from '../../src/amiga-emulation/memory-map';
import { setEnvStat } from '../../src/utils/acs.util';
import { installParking, attachParkedTo } from '../../src/server/session-parking';
import { EnvStat, PARKED_NODE_STATUS } from '../../src/constants/env-codes';
import { BBSState } from '../../src/constants/bbs-states';
import { DoorMessageHandler } from '../../src/amiga-emulation/session/DoorMessageHandler';
import { DoorConstants } from '../../src/amiga-emulation/DoorTypes';
import { XIMCommand } from '../../src/amiga-emulation/xim/types';

const NODE = 7;
const statusAt = MULTICOM_SINGLE_PORTS + NODE * 512 + 0x52;

function byteEmulator() {
  const mem = new Map<number, number>();
  const rd = (a: number) => mem.get(a) ?? 0;
  const wr = (a: number, v: number) => { mem.set(a, v & 0xff); };
  return {
    readMemory: rd, writeMemory: wr,
    readMemory16: (a: number) => (rd(a) << 8) | rd(a + 1),
    writeMemory16: (a: number, v: number) => { wr(a, v >> 8); wr(a + 1, v); },
    readMemory32: (a: number) => ((rd(a) << 24) | (rd(a + 1) << 16) | (rd(a + 2) << 8) | rd(a + 3)) >>> 0,
    writeMemory32: (a: number, v: number) => { wr(a, v >>> 24); wr(a + 1, v >>> 16); wr(a + 2, v >>> 8); wr(a + 3, v); },
  } as any;
}

function caller(): any {
  return {
    state: BBSState.LOGGEDON,
    connectionType: 'web',
    nodeId: NODE,
    currentStat: EnvStat.IDLE,
    user: { id: 42, username: 'spot', location: 'Gothenburg' },
  };
}

function fakeLink() {
  let hooks: any;
  return {
    id: 'old-socket',
    on: jest.fn(),
    setHooks: (h: any) => { hooks = h; },
    attach: jest.fn(),
    takeHeld: () => ({ overflowed: false, chunks: [] }),
    drop: (reason: string) => hooks.onDrop(reason),
  };
}

describe('WHO doors see the caller\'s action', () => {
  let emu: any;
  let ramDir: string;

  beforeEach(() => {
    ramDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rtw-env-'));
    process.env.RAM_DIR = ramDir;
    emu = byteEmulator();
    multicomManager.initializeInEmulator(emu, 'rtw-who-test', 1);
  });

  afterEach(() => {
    multicomManager.clearNode(NODE, 'rtw-who-test');
    multicomManager.unregisterEmulator('rtw-who-test');
    fs.rmSync(ramDir, { recursive: true, force: true });
    delete process.env.RAM_DIR;
  });

  it('setEnvStat writes the action into the node\'s singlePort status', () => {
    const session = caller();
    setEnvStat(session, EnvStat.MAIL);
    expect(emu.readMemory32(statusAt)).toBe(EnvStat.MAIL);

    setEnvStat(session, EnvStat.BULLETINS);
    expect(emu.readMemory32(statusAt)).toBe(EnvStat.BULLETINS);
  });

  it('a quiet node writes express.e\'s 0-(statCode+2)', () => {
    const session = { ...caller(), quietFlag: true };
    setEnvStat(session, EnvStat.FILES);
    expect(emu.readMemory32(statusAt) | 0).toBe(-(EnvStat.FILES + 2));
  });

  it('a parked node reads carrier lost, and a resume shows its action again', () => {
    const session = caller();
    setEnvStat(session, EnvStat.FILES);

    const link = fakeLink();
    session.webLink = link;
    installParking(link as any, session);
    expect(link.drop('transport close')).toBe('park');

    const parked = emu.readMemory32(statusAt);
    expect(parked).toBe(PARKED_NODE_STATUS);
    expect(parked >= 29 && parked <= 97).toBe(true); // rTW's cARRIER lOST band
    expect(session.currentStat).toBe(EnvStat.FILES);

    const raw: any = { id: 'new-socket', emit: jest.fn() };
    attachParkedTo(raw, session, { id: 42, username: 'spot', baud: 0 } as any);

    expect(emu.readMemory32(statusAt)).toBe(EnvStat.FILES);
  });

  it('a parked node inside a door reads carrier lost (31), and a resume shows DOORS again', () => {
    const session = caller();
    setEnvStat(session, EnvStat.DOORS);
    expect(emu.readMemory32(statusAt)).toBe(EnvStat.DOORS);

    const link = fakeLink();
    session.webLink = link;
    installParking(link as any, session);
    expect(link.drop('transport close')).toBe('park');
    expect(PARKED_NODE_STATUS).toBe(31);
    expect(emu.readMemory32(statusAt)).toBe(31);

    attachParkedTo({ id: 'new-socket', emit: jest.fn() } as any, session, { id: 42, username: 'spot', baud: 0 } as any);
    expect(emu.readMemory32(statusAt)).toBe(EnvStat.DOORS);
  });

  describe('the door ENVSTAT command (express.e:3677-3683)', () => {
    const MSG = 0x2000;

    async function envstat(session: any, data: number, str: string, doorEmu: any) {
      const handler = new DoorMessageHandler(
        doorEmu, { on: jest.fn(), emit: jest.fn() } as any, { putMsg: jest.fn() } as any,
        { executablePath: '/x/door', doorId: 'who', bbsSession: session } as any,
      );
      await (handler as any).processCommand(XIMCommand.ENVSTAT, data, str, MSG, 0);
    }

    it('SET moves the singlePort status bytes the WHO doors read', async () => {
      const session = caller();
      await envstat(session, 0, String(EnvStat.BULLETINS), byteEmulator());
      expect(session.currentStat).toBe(EnvStat.BULLETINS);
      expect(emu.readMemory32(statusAt)).toBe(EnvStat.BULLETINS);
    });

    it('GET returns the session\'s currentStat', async () => {
      const session = caller();
      setEnvStat(session, EnvStat.MAIL);
      const doorEmu = byteEmulator();
      await envstat(session, 1, '', doorEmu);
      const at = MSG + DoorConstants.MESSAGE_STRING_OFFSET;
      let out = '';
      for (let i = 0; doorEmu.readMemory(at + i) !== 0; i++) out += String.fromCharCode(doorEmu.readMemory(at + i));
      expect(out).toBe(String(EnvStat.MAIL));
    });
  });
});
