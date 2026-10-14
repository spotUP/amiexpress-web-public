/**
 * AEW_USERFIELD - the W door's one board command. Driven where it lives;
 * the routing from a real 68K binary is W14's.
 */
jest.mock('../../src/utils/acs-access-loader');
const saveAccount = jest.fn(async () => undefined);
jest.mock('../../src/services/account.service', () => ({
  changeAccount: jest.fn(async (s: any, u: any) => { Object.assign(s.user, u); }),
  saveAccount: (...a: unknown[]) => saveAccount(...(a as [])),
}));
const permissionDenied = jest.fn();
jest.mock('../../src/utils/error-handling.util', () => ({ ErrorHandler: { permissionDenied: (...a: unknown[]) => permissionDenied(...a) } }));
// A pass-through wrapper: the real rules run, and the sentinel counts the calls.
jest.mock('../../src/services/user-settings/w-fields', () => {
  const actual = jest.requireActual('../../src/services/user-settings/w-fields');
  return { ...actual, applyWField: jest.fn(actual.applyWField) };
});
const doors: any[] = [];
jest.mock('../../src/handlers/command-handler/dependency-injection', () => ({ getDoors: () => doors }));

import { userFieldAnswer, USERFIELD_WIRE_MAX } from '../../src/amiga-emulation/xim/userfield';
import { XIMDataQueryHandler } from '../../src/amiga-emulation/xim/data-query';
import { XIMCommand } from '../../src/amiga-emulation/xim/types';
import { ACSPermission } from '../../src/constants/acs-permissions';
const socket = { emit: jest.fn() };
const caller = (): any => ({
  nodeId: 1, doorCommand: 'W',
  user: { id: 7, username: 'Spot', realname: 'Johan', location: 'Old Town', secLevel: 10, securityFlags: 'T'.repeat(128), userFlags: 0 },
});

beforeEach(() => { saveAccount.mockClear(); permissionDenied.mockClear(); doors.length = 0; });

test('OPEN without ACS_EDIT_USER_INFO says NO after the board printed the refusal (25718)', async () => {
  const s = caller();
  const flags = s.user.securityFlags.split(''); flags[ACSPermission.EDIT_USER_INFO] = 'F'; s.user.securityFlags = flags.join('');
  expect(await userFieldAnswer('OPEN', s, socket)).toBe('NO');
  expect(permissionDenied).toHaveBeenCalledWith(socket, 'edit user information');
  expect(await userFieldAnswer('OPEN', caller(), socket)).toBe('OK');
});

test('GET answers state, label, value, kind, limit and prompt', async () => {
  expect(await userFieldAnswer('GET 4', caller(), socket)).toBe('E\tGroup\tOld Town\tT\t29\tGroup: ');
});

test('a latin1 value is stored as the caller typed it and the account is saved once', async () => {
  const s = caller();
  expect(await userFieldAnswer('SET 4 Göteborg', s, socket)).toBe('OK\tGöteborg');
  expect(s.user.location).toBe('Göteborg');
  expect(saveAccount).toHaveBeenCalledTimes(1);
});

test('TAB, ESC and CR inside a value never reach the record', async () => {
  const s = caller();
  expect(await userFieldAnswer('SET 4 Old\tTown\x1b[2J\r', s, socket)).toBe('OK\tOldTown[2J');
  expect(s.user.location).toBe('OldTown[2J');
});

test('unchanged input answers SAME and does not save', async () => {
  expect(await userFieldAnswer('SET 4 ', caller(), socket)).toBe('SAME');
  expect(saveAccount).not.toHaveBeenCalled();
});

test('access taken back by DT_REMBIT between GET and SET denies the write', async () => {
  const s = caller();
  expect((await userFieldAnswer('GET 4', s, socket)).startsWith('E\t')).toBe(true);
  const parser: any = { writeData: jest.fn(), writeString: jest.fn(), writeMessageString: jest.fn(), readString: jest.fn(() => ''), writeCommand: jest.fn(), getCommandName: jest.fn(() => 'CMD') };
  const dq = new XIMDataQueryHandler({ readMemory32: () => 0, writeMemory32: () => undefined, writeMemory: () => undefined, readString: () => '' } as any,
    { replyMsg: jest.fn() } as any, parser, s, {} as any);
  dq.handleDataQuery({ command: XIMCommand.DT_REMBIT, data: ACSPermission.EDIT_USER_LOCATION, string: '', msgAddr: 0x1000 } as any);
  expect(await userFieldAnswer('SET 4 Nowhere', s, socket)).toBe('DENIED');
  expect(s.user.location).toBe('Old Town');
  expect(await userFieldAnswer('GET 4', s, socket)).toBe('D\tGroup\t[DISABLED]\tT\t29\tGroup: ');
});

test('a refused name carries its retry flag and express.e\'s text', async () => {
  expect(await userFieldAnswer('SET 0 NEW', caller(), socket)).toBe('NO\t1\tUsername not allowed!!');
});

test('the password goes through changeWPassword and SET 6 is denied', async () => {
  expect(await userFieldAnswer('SET 6 secret', caller(), socket)).toBe('DENIED');
  expect(await userFieldAnswer('PASSWORD Abc123!x\tAbc123!y', caller(), socket)).toBe('NO\t0\t\r\nPasswords do not match, changes not saved');
});

test('the declared doors come one at a time and never overflow the wire', async () => {
  doors.push({ command: 'NOTIFY', enabled: true, accessLevel: 1, description: 'x'.repeat(400),
    toolTypes: { SETTINGS: 'YES', SETTINGS_LABEL: 'Notifications' } });
  const first = await userFieldAnswer('DOORS 0', caller(), socket);
  expect(first.startsWith('NOTIFY\t')).toBe(true);
  expect(first.length).toBeLessThanOrEqual(USERFIELD_WIRE_MAX);
  expect(await userFieldAnswer('DOORS 1', caller(), socket)).toBe('');
});

test('a door the caller may not run is not listed (the board filters at query time)', async () => {
  doors.push({ command: 'SYSONLY', enabled: true, accessLevel: 200, toolTypes: { SETTINGS: 'YES' } });
  expect(await userFieldAnswer('DOORS 0', caller(), socket)).toBe('');
});

test('the sentinel: a SET reaches applyWField exactly once', async () => {
  const spy = require('../../src/services/user-settings/w-fields').applyWField as jest.Mock;
  spy.mockClear();
  await userFieldAnswer('SET 5 555-9999', caller(), socket);
  expect(spy).toHaveBeenCalledTimes(1);
});
