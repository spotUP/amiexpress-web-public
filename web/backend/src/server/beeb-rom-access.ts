/**
 * Who may fetch the BBC ROMs.
 *
 * `/beeb/roms` used to be plain static serving behind the board-wide web
 * terminal switch, which means anyone who could reach the board could pull
 * Acorn's ROMs straight off it by URL. Once callers are asked to PROVE they
 * own the ROMs before using the machine, leaving that door open would make
 * the proof a formality - you would simply fetch what you were being asked
 * to show.
 *
 * So a caller who has proved gets a short-lived token. The emulator page
 * turns it into a cookie on the way in, because the emulator fetches its
 * own ROMs by relative path and there is no way to hang a query parameter
 * on requests made inside a vendored bundle.
 */
import * as crypto from 'crypto';

/**
 * Long enough to boot a machine and load a game, short enough that a leaked
 * URL is not a standing grant.
 */
const TOKEN_TTL_MS = 30 * 60 * 1000;

/** The cookie the emulator page leaves behind, scoped to /beeb. */
export const ROM_COOKIE = 'beebrom';

interface Grant {
  /** Who it was issued to, for the log when something goes wrong. */
  user: string;
  expires: number;
}

const grants = new Map<string, Grant>();

function sweep(now: number): void {
  for (const [token, grant] of grants) if (grant.expires <= now) grants.delete(token);
}

/** Issue a token to a caller who has proved they own the ROMs. */
export function grantRomAccess(user: string): string {
  const now = Date.now();
  sweep(now);
  const token = crypto.randomBytes(24).toString('base64url');
  grants.set(token, { user, expires: now + TOKEN_TTL_MS });
  return token;
}

/** Is this token one the board issued, and still live? */
export function romAccessHolder(token: string | undefined): string | null {
  if (!token) return null;
  const grant = grants.get(token);
  if (!grant) return null;
  if (grant.expires <= Date.now()) {
    grants.delete(token);
    return null;
  }
  return grant.user;
}

/** Drop a token, for a door that is closing behind the caller. */
export function revokeRomAccess(token: string | undefined): void {
  if (token) grants.delete(token);
}

/** Read one cookie out of a request header, without a cookie parser. */
export function cookieValue(header: string | undefined, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const at = part.indexOf('=');
    if (at === -1) continue;
    if (part.slice(0, at).trim() !== name) continue;
    return decodeURIComponent(part.slice(at + 1).trim());
  }
  return undefined;
}

/**
 * The request's query with the grant cut out of it, byte for byte.
 *
 * NOT re-serialised through URLSearchParams, which writes a space as `+`.
 * That is correct for form encoding and wrong here: jsbeeb does not read
 * `+` as a space, so `autotype=CHAIN%20%22GOMOKU%22` came back through a
 * round trip as `CHAIN+"GOMOKU"` and the machine typed the plus, answering
 * "No such variable" (2026-09-17).
 *
 * Everything except the grant is therefore passed through untouched.
 */
export function queryWithoutGrant(originalUrl: string): string {
  const at = originalUrl.indexOf('?');
  if (at === -1) return '';
  return originalUrl
    .slice(at + 1)
    .split('&')
    .filter(part => part !== 'grant' && !part.startsWith('grant='))
    .join('&');
}

/** Only for tests: forget every grant. */
export function clearRomAccess(): void {
  grants.clear();
}
