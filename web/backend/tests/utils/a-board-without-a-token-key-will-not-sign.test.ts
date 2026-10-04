/**
 * A board started without JWT_SECRET signed and checked every token with a
 * fixed key written in the source, in seven copies - so anyone who had read
 * it could sign a sysop token (open-surface review, 2026-10-04). Production
 * now refuses; development and tests keep a fixed key so a checkout starts.
 */
process.env.SKIP_DB_INIT = '1';

import { jwtSecret, jwtRefreshSecret } from '../../src/utils/jwt-secrets';

const saved = { env: process.env.NODE_ENV, secret: process.env.JWT_SECRET, refresh: process.env.JWT_REFRESH_SECRET };
afterEach(() => {
  process.env.NODE_ENV = saved.env;
  if (saved.secret === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = saved.secret;
  if (saved.refresh === undefined) delete process.env.JWT_REFRESH_SECRET; else process.env.JWT_REFRESH_SECRET = saved.refresh;
});

test('production with no JWT_SECRET refuses instead of using the key in the source', () => {
  process.env.NODE_ENV = 'production';
  delete process.env.JWT_SECRET;
  delete process.env.JWT_REFRESH_SECRET;
  expect(() => jwtSecret()).toThrow(/JWT_SECRET is not set/);
  expect(() => jwtRefreshSecret()).toThrow(/JWT_REFRESH_SECRET is not set/);
});

test('the configured secret is the key', () => {
  process.env.NODE_ENV = 'production';
  process.env.JWT_SECRET = 'configured';
  expect(jwtSecret()).toBe('configured');
});

test('the board signs a token with it, through the database', async () => {
  process.env.NODE_ENV = 'production';
  delete process.env.JWT_SECRET;
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { Database } = require('../../src/database');
  await expect(Database.prototype.generateAccessToken.call({}, { id: 'u', username: 'x', secLevel: 255 })).rejects.toThrow(/JWT_SECRET is not set/);
});
