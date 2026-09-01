/**
 * The admin edits the files AmiExpress reads, not the database mirror of them.
 *
 * Security levels exist twice in the API. `/config/security/levels/:level`
 * reads and writes `Access/ACS.<level>.info`, keyed `ACS.CENSORED` - the file
 * express.e opens. `/config/security/:level` reads the database mirror, keyed
 * `CENSORED`. Two families describing the same thing, and the client carried
 * four methods on the mirror with no caller in this app: dead code that would
 * have looked like the obvious thing to reach for.
 *
 * The mirror routes stay on the backend - dev/console uses them. This keeps
 * the admin's client off them.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const client = readFileSync(resolve(__dirname, '../api/client.ts'), 'utf8');
const code = client.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

describe('the admin API client and security levels', () => {
  it('asks for security levels by the path that reads the .info files', () => {
    expect(code).toContain('/config/security/levels');
  });

  it('does not reach the database mirror', () => {
    // `/config/security/${level}` and `/config/security/${id}` are the mirror;
    // `/config/security/levels/${level}` is not, so the levels segment is what
    // separates them.
    const mirrorCalls = [...code.matchAll(/\/config\/security\/\$\{[^}]+\}/g)]
      .map(match => match[0])
      .filter(call => !call.includes('levels'));

    expect(mirrorCalls).toEqual([]);
  });

  it('does not post to the mirror collection', () => {
    expect(code).not.toContain('`${API_BASE}/config/security`');
  });
});
