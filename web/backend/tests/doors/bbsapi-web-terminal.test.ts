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
