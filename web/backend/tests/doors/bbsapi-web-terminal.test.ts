const applyModemSpeed = jest.fn(async () => true);
const togglePetsciiCharset = jest.fn(async () => 'swedish');
jest.mock('../../src/services/user-settings/web-terminal-settings', () => ({
  ...jest.requireActual('../../src/services/user-settings/web-terminal-settings'),
  applyModemSpeed: (...a: unknown[]) => applyModemSpeed(...(a as [])),
  togglePetsciiCharset: (...a: unknown[]) => togglePetsciiCharset(...(a as [])),
}));
const performErasure = jest.fn(async () => undefined);
jest.mock('../../src/handlers/user/gdpr.handler', () => ({
  ...jest.requireActual('../../src/handlers/user/gdpr.handler'),
  performErasure: (...a: unknown[]) => performErasure(...(a as [])),
}));
import * as bcrypt from 'bcryptjs';
import { BBSApi } from '../../src/doors/BBSApi';

function api() {
  const socket: any = { emit: jest.fn(), on: jest.fn(), off: jest.fn() };
  const session: any = { user: { id: 7, username: 'Spot', passwordHash: bcrypt.hashSync('Abc123!x', 4) } };
  return { bbs: new BBSApi(socket, session), socket, session };
}
test('chooseModemSpeed stores through the board service with the door\'s socket and session', async () => {
  const { bbs, socket, session } = api();
  expect(await bbs.chooseModemSpeed(3)).toBe(true);
  expect(applyModemSpeed).toHaveBeenCalledWith(socket, session, 3);
});
test('the character set answer carries the board\'s own sentence', async () => {
  const { bbs } = api();
  const out = await bbs.togglePetsciiCharset();
  expect(out.charset).toBe('swedish');
  expect(out.notice).toContain('SWEDISH');
});
test('eraseMyAccount refuses with the board flow\'s text and erases only when every answer holds', async () => {
  const { bbs, socket, session } = api();
  expect(await bbs.eraseMyAccount({ confirm: 'YES ERASE', password: 'nope', username: 'Spot' })).toEqual({ ok: false, reason: 'Password incorrect. Deletion cancelled.' });
  expect(await bbs.eraseMyAccount({ confirm: 'nope', password: 'Abc123!x', username: 'Spot' })).toEqual({ ok: false, reason: 'Deletion cancelled.' });
  expect(performErasure).not.toHaveBeenCalled();
  expect(await bbs.eraseMyAccount({ confirm: 'YES ERASE', password: 'Abc123!x', username: 'Spot' }, { check: true })).toEqual({ ok: true });
  expect(performErasure).not.toHaveBeenCalled();
  expect(await bbs.eraseMyAccount({ confirm: 'YES ERASE', password: 'Abc123!x', username: 'Spot' })).toEqual({ ok: true });
  expect(performErasure).toHaveBeenCalledWith(socket, session);
});
test('the door API reaches the other services with its own caller', async () => {
  const { bbs, socket, session } = api();
  session.user.realname = 'Johan';
  expect(bbs.webTerminalSettings().petsciiPalette).toBe('C128 (VDC)');
  expect(bbs.terminalFontChoices().length).toBeGreaterThan(0);
  expect(bbs.terminalFontChoices()[0]).toEqual({ id: expect.any(String), label: expect.any(String) });
  expect(await bbs.chooseTerminalFont('MicroKnight')).toBe('set');
  expect(await bbs.togglePetsciiPalette()).toBe('vic');
  expect(socket.emit).toHaveBeenCalledWith('petscii-palette', { palette: 'vic' });
  expect(session.user.petsciiPalette).toBe('vic');
});
test('myData returns the caller\'s own rows only', () => {
  const { bbs } = api();
  const rows = bbs.myData();
  expect(rows[0]).toEqual({ label: 'Handle', value: 'Spot' });
  expect(JSON.stringify(rows)).not.toContain('passwordHash');
});
test('a door cannot use eraseMyAccount to guess the password: five refusals end it', async () => {
  const { bbs, session } = api();
  const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  for (let i = 0; i < 5; i++) {
    expect(await bbs.eraseMyAccount({ confirm: 'YES ERASE', password: `guess${i}`, username: 'Spot' }, { check: true })).toEqual({ ok: false, reason: 'Password incorrect. Deletion cancelled.' });
  }
  expect(warn).toHaveBeenCalledTimes(5);
  expect(warn.mock.calls.flat().join(' ')).not.toContain('guess');
  expect(await bbs.eraseMyAccount({ confirm: 'YES ERASE', password: 'Abc123!x', username: 'Spot' }, { check: true })).toEqual({ ok: false, reason: 'Too many attempts. Deletion cancelled.' });
  expect((session as any).erasurePasswordRefusals).toBe(5);
  warn.mockRestore();
});
