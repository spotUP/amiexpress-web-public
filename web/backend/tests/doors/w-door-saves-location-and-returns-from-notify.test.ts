/**
 * W14: THE one reachability test for the W settings door. A typed W goes
 * through the board's real entry (handleCommand -> processCommand ->
 * runBbsCommand -> executeDoor -> executeAmigaDoor -> the real binary ->
 * AEW_USERFIELD -> applyWField -> saveAccount -> userFileManager), edits
 * Location with a Swedish 0xF6 letter, and a NOTIFY round trip brings the
 * caller back to W on the row they left (W6 resume record).
 *
 * NOTIFY is registered with the unrouted type of the dispatch harness: jest
 * cannot import() a TypeScript door by file URL (see
 * compact-40/fixtures/drive-notify.cjs), and what this test proves is the
 * board's return path, not NOTIFY's screen (compact-40/notify.test.ts).
 */
import * as fs from 'fs';
import * as path from 'path';

const REPO = path.resolve(__dirname, '../../../..');

jest.mock('../../src/utils/acs-access-loader');
const updateUser = jest.fn(async () => undefined);
jest.mock('../../src/database', () => ({
  db: new Proxy({}, { get: (_t, key) => {
    if (key === 'getUserById') return async () => ({ id: 'u1', username: 'Spot', location: 'Old Town', slotNumber: 1 });
    if (key === 'updateUser') return updateUser;
    return async () => undefined;
  } }),
}));

import { EventEmitter } from 'events';
import {
  installDispatchHarness, register, doorOver, doorDropFileManager,
} from './dispatch-harness';
import { handleCommand } from '../../src/handlers/command.handler';
import { readTooltypeMap } from '../../src/utils/info-file.util';
import { userFileManager } from '../../src/services/UserFileManager';
import { LoggedOnSubState } from '../../src/constants/bbs-states';

installDispatchHarness(root => {
  // The door binary, where the registration says it is, on the board root.
  fs.mkdirSync(path.join(root, 'Doors'), { recursive: true });
  fs.symlinkSync(path.join(REPO, 'board', 'Doors', 'USERSETTINGS'), path.join(root, 'Doors', 'USERSETTINGS'));
});

// Module exports are not configurable here, so jest.spyOn cannot wrap them; a
// pass-through mock gives the same sentinels (call counts, return values).
jest.mock('../../src/services/user-settings/w-fields', () => {
  const actual = jest.requireActual('../../src/services/user-settings/w-fields');
  return { ...actual, applyWField: jest.fn(actual.applyWField) };
});
jest.mock('../../src/handlers/commands/settings-resume', () => {
  const actual = jest.requireActual('../../src/handlers/commands/settings-resume');
  return {
    ...actual,
    takeSettingsResumeRow: jest.fn(actual.takeSettingsResumeRow),
    resumeSettingsHub: jest.fn(actual.resumeSettingsHub),
    runReturnedCommand: jest.fn(actual.runReturnedCommand),
  };
});
const fields = jest.requireMock('../../src/services/user-settings/w-fields');
const resume = jest.requireMock('../../src/handlers/commands/settings-resume');

class CaptureSocket extends EventEmitter {
  id = 'w-reach';
  readonly ansi: string[] = [];
  emit(event: string, data?: any): boolean {
    if (event === 'ansi-output') this.ansi.push(typeof data === 'string' ? data : String(data ?? ''));
    return super.emit(event, data);
  }
}

async function until(pred: () => boolean, ms: number): Promise<void> {
  const end = Date.now() + ms;
  while (!pred()) {
    if (Date.now() > end) throw new Error('timed out');
    await new Promise(r => setTimeout(r, 100));
  }
}

function newUser(): any {
  return { id: 'u1', username: 'Spot', realname: 'Johan', location: 'Old Town', slotNumber: 1, secLevel: 10,
    securityFlags: 'T'.repeat(128), userFlags: 0, editor: 'Prompt', zoomType: 0, availableForChat: true, protocol: 'zmodem' };
}

function newSession(user: any): any {
  return { state: 'loggedon', subState: LoggedOnSubState.PROCESS_COMMAND, user, nodeId: 1,
    terminalType: 'ansi', petsciiMode: false, screenWidth: 80, screenHeight: 25, currentConf: 1, tempData: {},
    commandHistory: [], historyIndex: 0, historyCycle: 0, commandText: 'W' };
}

async function registerBoard(): Promise<void> {
  // The SHIPPED W registration, and NOTIFY declared under W.
  const wTypes = Object.fromEntries(readTooltypeMap(path.join(REPO, 'board', 'Commands', 'BBSCmd', 'W.info')));
  await register(
    { ...doorOver('W', wTypes), type: 'XIM', location: wTypes.LOCATION },
    doorOver('NOTIFY', { SETTINGS: 'YES', SETTINGS_LABEL: 'Notifications', SETTINGS_SECTION: 'Communication', MIN_COLUMNS: '40' }),
    // An unrelated door that really runs and exits: the W binary again, under another command name.
    { ...doorOver('OTHER', wTypes), type: 'XIM', location: wTypes.LOCATION },
  );
}

describe('W through the board: save onto user.data and come back from a settings door', () => {
  let userData = '';
  test('a caller types W, changes their location onto user.data, visits NOTIFY and is back on its row', async () => {
    const user = newUser();
    // The board's own user.data: tests/setup.ts points the user files at a per-run temp board.
    userData = (userFileManager as any).userDataPath as string;
    fs.mkdirSync(path.dirname(userData), { recursive: true });
    fs.writeFileSync(userData, userFileManager.userRecord(user, 1));
    await registerBoard();
    const applySpy = fields.applyWField as jest.Mock;
    applySpy.mockClear();
    const takeSpy = resume.takeSettingsResumeRow as jest.Mock;
    takeSpy.mockClear();
    const socket = new CaptureSocket();
    const session = newSession(user);
    const out = () => socket.ansi.join('');
    const frames = () => out().split('USER CONFIGURATION').length - 1;

    const run = handleCommand(socket as any, session, '\r');
    await until(() => frames() >= 1, 20000);
    socket.emit('door:input', '4');
    socket.emit('door:input', '\r');
    socket.emit('door:input', '\x15Göteborg\r'); // CTRL-U clears the default, then the new location
    await until(() => applySpy.mock.calls.length >= 1, 10000);
    socket.emit('door:input', '16'); // the last field
    socket.emit('door:input', '\x1b[B'); // down: headings skipped, onto Notifications
    socket.emit('door:input', '\r');
    await until(() => frames() >= 2, 30000); // NOTIFY ran, the board reopened W
    await until(() => takeSpy.mock.results.some(r => r.value !== null), 10000);
    socket.emit('door:input', 'q');
    await run;

    // 1. The door's write ran once, for field 4, and the disk holds it.
    expect(applySpy).toHaveBeenCalledTimes(1);
    expect(applySpy.mock.calls[0][1]).toBe(4);
    const record = fs.readFileSync(userData).subarray(0, 232);
    expect(Array.from(record.subarray(40, 49))).toEqual([0x47, 0xf6, 0x74, 0x65, 0x62, 0x6f, 0x72, 0x67, 0x00]);
    // 2. NOTIFY's registration ran, then W again, on the Notifications row.
    // Three launches, in order: W, NOTIFY (the returned command), W again (the resume). W alone would be 1.
    expect(doorDropFileManager.createAllDropFiles).toHaveBeenCalledTimes(3);
    expect(resume.runReturnedCommand).toHaveBeenCalledTimes(1);   // the tail's loop ran NOTIFY and reopened W
    expect(takeSpy.mock.results.filter(r => r.value !== null)).toHaveLength(1);
    const second = out().slice(out().lastIndexOf('USER CONFIGURATION'));
    expect(second).toMatch(/\x1b\[(\d+);\d+H>>[\s\S]{0,80}?\x1b\[\1;\d+H[^\x1b]*Notifications/);
    // The record was spent: W was reopened once, not again after q.
    expect(resume.settingsResumeOf(session)).toBeUndefined();
    expect(frames()).toBe(2);
  }, 90000);

  test('an unrelated door after W does not reopen W', async () => {
    const user = newUser();
    await registerBoard();
    const session = newSession(user);
    const socket = new CaptureSocket();
    // What the W door's RESUME verb leaves behind when a caller heads for a settings door.
    resume.armSettingsResume(session, 'W', 7);
    expect(resume.settingsResumeOf(session)).toBeDefined();
    const hub = resume.runReturnedCommand as jest.Mock;   // the tail's only way into the resume loop
    hub.mockClear();
    session.commandText = 'OTHER';
    const out = () => socket.ansi.join('');
    const run = handleCommand(socket as any, session, '\r');
    await until(() => out().includes('USER CONFIGURATION'), 20000);
    socket.emit('door:input', 'q');
    await run;
    // OTHER ran and exited without handing back a command: its exit discarded
    // the armed record, so the tail never reopened W (one frame, no hub call).
    expect(doorDropFileManager.createAllDropFiles).toHaveBeenCalled();
    // settingsResumeOf carries the discard proof: the armed record is gone after OTHER's exit.
    expect(resume.settingsResumeOf(session)).toBeUndefined();
    expect(out().split('USER CONFIGURATION').length - 1).toBe(1);
    expect(hub).not.toHaveBeenCalled();
  }, 30000);
});
