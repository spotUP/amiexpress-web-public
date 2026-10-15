/**
 * The livechat door's own login modal asks what every other chat login asks.
 *
 * The door checked only the password (db.authenticateUser): a locked, deleted
 * or level-0 account logged into chat through it, and a wrong password there
 * never counted toward MAX_PASSWORD_FAILS (express.e:1008-1018). It now asks
 * services/chat-login, the check the HTTP login and the socket modal share.
 *
 * The door reaches the backend by `require(process.cwd() + '/src/...')`, so
 * the account record (logon-gates, password-failures) is stubbed at that seam
 * and the real chatLogin runs between them.
 */
import * as path from 'path';

const BACKEND = path.resolve(__dirname, '../..');
const mockRefusal = { value: null as string | null };
const mockCountWrongPassword = jest.fn();
const mockClearWrongPasswords = jest.fn();

jest.mock('../../src/database', () => ({
  db: {
    getUserByUsername: async (name: string) =>
      name === 'locked' || name === 'caller'
        ? { id: 7, username: name, secLevel: 100, passwordHash: 'right' }
        : null,
    verifyPassword: async (password: string, hash: string) => password === hash,
  },
}));
jest.mock('../../src/services/load-account', () => ({
  loadAccount: (user: unknown) => ({ user }),
}));
jest.mock('../../src/services/logon-gates', () => ({
  accountRefusal: () => mockRefusal.value,
}));
jest.mock('../../src/services/password-failures', () => ({
  countWrongPassword: (...args: unknown[]) => mockCountWrongPassword(...args),
  clearWrongPasswords: (...args: unknown[]) => mockClearWrongPasswords(...args),
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { verifyCredentials } = require('../../../../Doors/livechat/chat-only-login');

describe('livechat door login', () => {
  const cwd = process.cwd();
  beforeAll(() => process.chdir(BACKEND));
  afterAll(() => process.chdir(cwd));
  beforeEach(() => {
    mockRefusal.value = null;
    mockCountWrongPassword.mockClear();
    mockClearWrongPasswords.mockClear();
  });

  it('refuses a locked account with the right password', async () => {
    mockRefusal.value = 'account-locked';
    const result = await verifyCredentials({ username: 'locked', password: 'right' });
    expect(result.success).toBe(false);
    expect(result.error).toBe('That account cannot log on. Call the board to find out why.');
  });

  it('counts a wrong password against the account', async () => {
    const result = await verifyCredentials({ username: 'caller', password: 'wrong' });
    expect(result.success).toBe(false);
    expect(mockCountWrongPassword).toHaveBeenCalledTimes(1);
  });

  it('lets a caller in whose account the gates pass', async () => {
    const result = await verifyCredentials({ username: 'caller', password: 'right' });
    expect(result).toEqual({ success: true, user: { username: 'caller', secLevel: 100, id: 7 } });
    expect(mockClearWrongPasswords).toHaveBeenCalledTimes(1);
  });
});
