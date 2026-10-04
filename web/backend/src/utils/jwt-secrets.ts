/**
 * The two secrets every token on this board is signed and checked with -
 * the one place they are read.
 *
 * Each caller used to fall back to a fixed string written in the source when
 * the variable was unset, in seven copies. On a board started without
 * JWT_SECRET that string IS the key, and anyone who has read the source can
 * sign a sysop token. Production refuses to run without it; development and
 * tests keep a fixed key so a checkout starts.
 */
const DEV_SECRET = 'amiexpress-secret-key-change-in-production';
const DEV_REFRESH_SECRET = 'amiexpress-refresh-secret-change-in-production';

function required(name: 'JWT_SECRET' | 'JWT_REFRESH_SECRET', devFallback: string): string {
  const value = process.env[name];
  if (value) return value;
  if (process.env.NODE_ENV === 'production') {
    throw new Error(`${name} is not set - refusing to sign or check tokens with a key from the source`);
  }
  return devFallback;
}

export function jwtSecret(): string {
  return required('JWT_SECRET', DEV_SECRET);
}

export function jwtRefreshSecret(): string {
  return required('JWT_REFRESH_SECRET', DEV_REFRESH_SECRET);
}
