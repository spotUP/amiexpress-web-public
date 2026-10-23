/**
 * A sysop is told at logon when no Kickstart ROM is installed (68K doors then
 * run on the AROS fallback). Driven through `runPostAuthLogin`, the pipeline
 * every transport's login runs; the ROM resolver is the real one, pointed at a
 * temp ROM directory.
 */
process.env.SKIP_DB_INIT = '1';

jest.mock('../../src/services/node-reservation.service', () => ({
  ...jest.requireActual('../../src/services/node-reservation.service'),
  isReservationMatch: jest.fn(() => true),
}));
jest.mock('../../src/server/logoff', () => ({
  ...jest.requireActual('../../src/server/logoff'),
  beginLogoff: jest.fn(),
}));
jest.mock('../../src/services/user-already-online', () => ({
  ...jest.requireActual('../../src/services/user-already-online'),
  userAlreadyOnNode: jest.fn(() => null),
}));
jest.mock('../../src/services/mail-notification.service', () => ({
  ...jest.requireActual('../../src/services/mail-notification.service'),
  mailOnLogon: jest.fn(async () => undefined),
}));
jest.mock('../../src/services/batch-scheduler', () => ({
  ...jest.requireActual('../../src/services/batch-scheduler'),
  runExecuteOn: jest.fn(async () => undefined),
}));
jest.mock('../../src/handlers/screen.handler', () => ({
  ...jest.requireActual('../../src/handlers/screen.handler'),
  displayScreen: jest.fn(async () => true),
  doPause: jest.fn(async () => undefined),
}));
jest.mock('../../src/database', () => ({
  db: {
    updateUser: jest.fn(async () => undefined),
    generateAccessToken: jest.fn(async () => 'token'),
    generateRefreshToken: jest.fn(async () => 'refresh'),
    getUserByUsername: jest.fn(async () => null),
  },
  getDatabase: () => ({
    updateUser: jest.fn(async () => undefined),
    getUserByUsername: jest.fn(async () => null),
  }),
}));

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { BBSState, LoggedOnSubState } from '../../src/constants/bbs-states';
import { getSystemTime } from '../../src/utils/date-time.util';
import { installKickstart, clearRomCache } from '../../src/amiga-emulation/rom/amiga-rom';
import { syntheticKickstart } from '../amiga-rom/synthetic-rom';

function emitter() {
  const emitted: Array<{ event: string; data: unknown }> = [];
  return {
    emitted,
    id: 'ks-login-socket',
    emit(event: string, data?: unknown) { emitted.push({ event, data }); return true; },
    on() { return this; },
    join() { return this; },
  } as any;
}

function row(username: string, slotNumber: number, secLevel: number): any {
  const yesterday = new Date(getSystemTime().getTime() - 2 * 86400 * 1000);
  return {
    id: `row-${username}`, username, slotNumber, passwordHash: 'hash',
    realname: 'Ks Caller', location: 'Here', phone: '', email: '',
    secLevel, uploads: 0, downloads: 0, bytesUpload: 0, bytesDownload: 0,
    ratio: 0, ratioType: 0, timeTotal: 3600, timeLimit: 3600, timeUsed: 0,
    chatLimit: 600, chatUsed: 0, lastLogin: yesterday, firstLogin: yesterday,
    calls: 3, callsToday: 0, newUser: false, expert: 'N', ansi: true,
    linesPerScreen: 23, computer: '', screenType: '', protocol: '/X Zmodem',
    editor: 'Prompt', zoomType: 'QWK', availableForChat: true, quietNode: false,
    autoRejoin: 1, confAccess: 'XXXXXXXXXX', areaName: '', uuCP: false,
    topUploadCPS: 0, topDownloadCPS: 0, byteLimit: 0, userFlags: 0, baud: 0,
    created: yesterday, updated: yesterday,
  };
}

async function loginAs(secLevel: number, slot: number): Promise<string> {
  const { runPostAuthLogin } = require('../../src/services/login-post.service');
  const socket = emitter();
  const r = row(`ks${slot}`, slot, secLevel);
  await runPostAuthLogin(
    socket,
    { state: BBSState.LOGON, subState: LoggedOnSubState.READ_COMMAND, connectionType: 'telnet', nodeId: 3, tempData: {} },
    r,
    { lastLoginBeforeUpdate: r.lastLogin },
  );
  return socket.emitted
    .filter((e: { event: string }) => e.event === 'ansi-output')
    .map((e: { data: unknown }) => String(e.data)).join('');
}

describe('the Kickstart notice at logon', () => {
  let dir: string;
  const saved = { ...process.env };
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ks-login-'));
    process.env.ROM_DIR = dir;
    delete process.env.AEDOOR_ROM;
    delete process.env.AEDOOR_ROM_FILE;
    clearRomCache();
  });
  afterEach(() => {
    process.env = { ...saved };
    fs.rmSync(dir, { recursive: true, force: true });
    clearRomCache();
  });

  it('tells a sysop, naming the AROS fallback and the Health page', async () => {
    const said = await loginAs(255, 911);
    expect(said).toContain('[INFO]');
    expect(said).toContain('AROS fallback');
    expect(said).toContain('admin Health page');
  });

  it('tells a normal user nothing', async () => {
    expect(await loginAs(30, 912)).not.toContain('Kickstart');
  });

  it('tells a sysop nothing once a ROM is installed', async () => {
    expect(installKickstart(syntheticKickstart({ execVersion: 40 })).ok).toBe(true);
    expect(await loginAs(255, 913)).not.toContain('Kickstart');
  });
});
