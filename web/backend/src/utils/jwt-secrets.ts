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

/**
 * True for a value that is a documented placeholder, not a secret:
 * CHANGE_ME (the docker-compose default), the your_*_here lines in
 * .env.example, and the fixed development keys above. Anyone can read these in
 * the repository, so a token signed with one is a token anyone can sign.
 * docker-entrypoint.sh keeps the same list (generate_secret_if_placeholder).
 */
export function isPlaceholderSecret(value: string | undefined): boolean {
  const v = (value ?? '').trim().toLowerCase();
  if (v === '') return true;
  return v === 'change_me' || v === 'changeme' || /^your_.*_here$/.test(v) ||
    v === DEV_SECRET || v === DEV_REFRESH_SECRET;
}

function required(name: 'JWT_SECRET' | 'JWT_REFRESH_SECRET', devFallback: string): string {
  const value = process.env[name];
  if (process.env.NODE_ENV === 'production' && value && isPlaceholderSecret(value)) {
    console.error(`[Security] ${name} is a placeholder (CHANGE_ME / your_*_here / a key from the source). ` +
      'Refusing to sign or check tokens with it. Set a random value (openssl rand -base64 64) or let ' +
      'docker-entrypoint.sh generate one into /app/data/.secrets.');
    throw new Error(`${name} is a placeholder - refusing to sign or check tokens with a key from the source`);
  }
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
