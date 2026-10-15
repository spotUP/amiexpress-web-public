/**
 * Import and Export sent `Bearer null` on every request.
 *
 * Eight fetches read `localStorage.getItem('token')`; the JWT is stored under
 * `authToken` (api/client.ts:16). So the whole Import/Export feature 401'd,
 * on both the admin app and the BBS frontend's copy of it. The export
 * download was worse still: it put the token in a QUERY STRING, and the auth
 * middleware reads the Authorization header and nothing else, so it could not
 * have worked whatever the key was called.
 *
 * The key now lives in one place. This test reads the components to prove
 * none of them has grown its own copy again.
 */

import * as fs from 'fs';
import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { readAdminSources, SRC } from './admin-sources';

/** Each file's code, with comment lines dropped - a comment ABOUT the bug is not the bug. */
const SOURCES = readAdminSources(/\.(ts|tsx)$/).map(({ rel, text }) => ({
  rel,
  code: text
    .split('\n')
    .filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line))
    .join('\n'),
}));

describe('the session token is read from one place', () => {
  it("no component reads localStorage 'token'", () => {
    const offenders = SOURCES
      .filter(({ code }) => /localStorage\.getItem\(\s*'token'\s*\)/.test(code))
      .map(({ rel }) => rel);

    // Vitest's expect takes no message, so the report goes in the value.
    expect(offenders.join(', ')).toBe('');
  });

  // The admin and the BBS terminal are ONE ORIGIN - the board at `/`, the
  // admin at `/admin` - so they share a localStorage. Both used `authToken`:
  // the BBS chat writes it on login and clears it on logout, and the admin
  // listens for that key changing to keep its tabs in step. A caller logging
  // into the board handed their token to the sysop's admin session, or
  // cleared it and logged the sysop out. Reported on the live board, with the
  // BBS login as `origo` and the admin as `sysop`.
  //
  // A privilege boundary is not a place to share a storage key.
  it('does not use the storage key the BBS terminal writes', () => {
    const offenders = SOURCES
      .filter(({ rel }) => rel !== path.join('api', 'auth-token.ts'))
      .filter(({ code }) => /'authToken'/.test(code))
      .map(({ rel }) => rel);

    expect(offenders.join(', ')).toBe('');
  });

  it('reads and writes that key through one module', () => {
    const offenders = SOURCES
      .filter(({ rel }) => rel !== path.join('api', 'auth-token.ts'))
      .filter(({ code }) => /localStorage\.(getItem|setItem|removeItem)\(\s*ADMIN_TOKEN_KEY/.test(code))
      .map(({ rel }) => rel);

    expect(offenders.join(', ')).toBe('');
  });

  it('no request puts the token in a query string', () => {
    // The auth middleware never reads one, so a URL carrying `?token=` is a
    // request that cannot be authorised - and it leaks the JWT into history,
    // proxy logs and the Referer header on the way.
    const offenders = SOURCES
      .filter(({ code }) => /[?&]token=\$\{/.test(code))
      .map(({ rel }) => rel);

    expect(offenders.join(', ')).toBe('');
  });

  it('the client offers the header and the download so nothing has to hand-roll them', () => {
    const client = fs.readFileSync(path.join(SRC, 'api', 'client.ts'), 'utf8');
    expect(client).toContain('authHeaders(');
    expect(client).toContain('downloadFile(');
  });
});
