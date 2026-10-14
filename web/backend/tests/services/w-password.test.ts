jest.mock('../../src/utils/acs-access-loader');
jest.mock('../../src/services/account.service', () => ({
  changeAccount: jest.fn(async (s: any, u: any) => { Object.assign(s.user, u); }),
  saveAccount: jest.fn(),
}));
const boardConfig = { min_password_length: 6, min_password_strength: 3 };
jest.mock('../../src/services/bbs-config-file.service', () => ({ getBoardConfig: () => boardConfig }));

import * as bcrypt from 'bcryptjs';
import { changeWPassword, PASSWORDS_DIFFER, passwordTooShort, passwordTooWeak } from '../../src/services/user-settings/w-password';

const caller = (): any => ({ nodeId: 1, user: { id: 7, secLevel: 10, securityFlags: 'T'.repeat(128), passwordHash: 'old', pwdLastUpdated: 0 } });

test('two different passwords are refused with express.e\'s text and nothing changes (26023)', async () => {
  const s = caller();
  expect(await changeWPassword(s, 'Abc123', 'Abc124')).toEqual({ kind: 'refused', refusal: PASSWORDS_DIFFER, retry: false });
  expect(s.user.passwordHash).toBe('old');
});
test('too short and too weak say so with the board\'s own numbers (26011-26018)', async () => {
  expect(await changeWPassword(caller(), 'Ab1', 'Ab1')).toEqual({ kind: 'refused', refusal: passwordTooShort(6), retry: false });
  expect(await changeWPassword(caller(), 'abcdefgh', 'abcdefgh')).toEqual({ kind: 'refused', refusal: passwordTooWeak(3), retry: false });
  expect(passwordTooWeak(3)).toBe('\r\nPassword must have at least 3 of these:\r\n  upper case,lower case, numeric and symbols - changes not saved');
});
test('an empty first or second entry changes nothing (26003, 26007)', async () => {
  expect(await changeWPassword(caller(), '', 'x')).toEqual({ kind: 'unchanged' });
  expect(await changeWPassword(caller(), 'x', '')).toEqual({ kind: 'unchanged' });
});
test('a good password is hashed and pwdLastUpdated is set (26025-26026)', async () => {
  const s = caller();
  const before = Math.floor(Date.now() / 1000);
  expect(await changeWPassword(s, 'Abc123!x', 'Abc123!x')).toEqual({ kind: 'stored', value: 'ENCRYPTED' });
  expect(bcrypt.compareSync('Abc123!x', s.user.passwordHash)).toBe(true);
  expect(s.user.pwdLastUpdated).toBeGreaterThanOrEqual(before);
});
test('spaces around a password are part of it, as getPass2 keeps them (1540-1544)', async () => {
  const s = caller();
  expect(await changeWPassword(s, ' Abc123!x ', ' Abc123!x ')).toEqual({ kind: 'stored', value: 'ENCRYPTED' });
  expect(bcrypt.compareSync(' Abc123!x ', s.user.passwordHash)).toBe(true);
  expect(bcrypt.compareSync('Abc123!x', s.user.passwordHash)).toBe(false);
});
