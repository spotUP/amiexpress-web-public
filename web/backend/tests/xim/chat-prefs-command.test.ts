/** AEW_CHATPREFS (11300): the 68K door reads/writes the SAME store handleChatPrefs uses. */
const store = new Map<string, Record<string, unknown>>();
jest.mock('../../src/database', () => ({
  db: { chatPrefs: () => ({ get: (id: string) => store.get(id) ?? null, set: (id: string, p: Record<string, unknown>) => { store.set(id, p); } }) },
}));

import { chatPrefsAnswer } from '../../src/amiga-emulation/xim/chat-prefs';
import { handleChatPrefs } from '../../src/handlers/chat/prefs.handler';
import { ASYNC_OUTPUT_COMMANDS } from '../../src/amiga-emulation/session/lifecycle/door-message-callbacks';
import { XIMCommand } from '../../src/amiga-emulation/xim/types';

const session: any = { user: { id: 7 } };

beforeEach(() => store.clear());

test('GET with nothing stored is empty; no user is NO', () => {
  expect(chatPrefsAnswer('GET', session)).toBe('');
  expect(chatPrefsAnswer('GET', { user: null } as any)).toBe('NO');
  expect(chatPrefsAnswer('SET\tshowLogins\t1', { user: null } as any)).toBe('NO');
});

test('SET merges one key, keeps the others, and the TS handler sees it (same store)', () => {
  store.set('7', { showMessages: true, other: 'kept', pinnedChannels: ['a'] });
  expect(chatPrefsAnswer('SET\tshowLogins\t0', session)).toBe('OK');
  expect(chatPrefsAnswer('SET\tpinnedChannels\tgeneral, dev', session)).toBe('OK');
  const emit = jest.fn();
  handleChatPrefs({ emit } as any, session, 'get');
  expect(emit).toHaveBeenCalledWith('chat:prefs', { prefs: { showMessages: true, other: 'kept', showLogins: false, pinnedChannels: ['general', 'dev'] } });
  expect(chatPrefsAnswer('GET', session)).toBe('showLogins=0;showMessages=1;pinned=general,dev');
  expect(chatPrefsAnswer('GET\tpinned', session)).toBe('general,dev');
});

test('a value written by the TS handler is read by the door command', () => {
  handleChatPrefs({ emit: jest.fn() } as any, session, 'set', { prefs: { compactMode: true } });
  expect(chatPrefsAnswer('GET', session)).toBe('compactMode=1');
});

test('unknown key, bad bool, malformed request -> NO and nothing stored', () => {
  expect(chatPrefsAnswer('SET\tbogus\t1', session)).toBe('NO');
  expect(chatPrefsAnswer('SET\tshowLogins\tyes', session)).toBe('NO');
  expect(chatPrefsAnswer('SET\tshowLogins', session)).toBe('NO');
  expect(chatPrefsAnswer('PUT', session)).toBe('NO');
  expect(store.size).toBe(0);
});

test('size cap: stored object over MAX_PREFS_BYTES -> NO, store unchanged', () => {
  store.set('7', { big: 'x'.repeat(8 * 1024) });
  expect(chatPrefsAnswer('SET\tshowLogins\t1', session)).toBe('NO');
  expect(Object.keys(store.get('7')!)).toEqual(['big']);
});

test('GET reply never exceeds 198 bytes; pinned drops whole names', () => {
  const all: Record<string, boolean> = {};
  for (const k of ['showLogins','showFileActivity','showDoorActivity','showMessages','showSystemAnnouncements','muteAllEvents','compactMode','showTimestamps','notificationSound','mentionSound']) all[k] = true;
  store.set('7', { ...all, pinnedChannels: ['alpha-channel', 'beta-channel', 'gamma-channel', 'delta-channel'] });
  const line = chatPrefsAnswer('GET', session);
  expect(line.length).toBeLessThanOrEqual(198);
  const pinned = line.split(';pinned=')[1];
  expect(pinned.split(',').every((n) => n.endsWith('-channel'))).toBe(true);
  expect(chatPrefsAnswer('GET\tpinned', session)).toBe('alpha-channel,beta-channel,gamma-channel,delta-channel');
});

test('control bytes are stripped from key and value', () => {
  expect(chatPrefsAnswer('SET\tpinnedChannels\ta\x1b[b', session)).toBe('OK');
  expect(store.get('7')!.pinnedChannels).toEqual(['a[b']);
});

test('the command is routed as asynchronous output', () => {
  expect(ASYNC_OUTPUT_COMMANDS).toContain(XIMCommand.AEW_CHATPREFS);
  expect(XIMCommand.AEW_CHATPREFS).toBe(11300);
});
