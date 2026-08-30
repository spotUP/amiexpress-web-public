/**
 * The board reads its configuration from the file the board reads.
 *
 * One bug turned up six times in a day, always the same shape: the admin
 * writes a setting to bbsConfig.info, and something else reads it out of the
 * `system_config` database row. The two never meet, so a sysop changes a
 * value, the form saves it, and the board carries on with the old one. It is
 * silent by construction - both halves work perfectly, on different data.
 *
 * Where it had got to by the time it was audited:
 *
 *   mail-notification.service   SMTP host, the MAIL_ON_* flags, the BBS name.
 *                               The page showed smtp.gmail.com while "Test
 *                               SMTP Connection" said "not configured", and
 *                               mail had never worked.
 *   password-policy.util        minimum length, minimum strength, max fails
 *   login-post.service          the same, plus password expiry
 *   new-user.handler            the same, plus the strict policy flag
 *   auth-socket-handlers        max password fails
 *   screen.handler              max_nodes, for %NODELIST
 *   node-manager.service        max_nodes, for how many nodes exist
 *
 * Every one of those fields has a tooltype. getBoardConfig is the single
 * place to ask, and this test is what stops a seventh appearing: a runtime
 * consumer that reaches for the database instead has to justify itself here.
 */

import * as fs from 'fs';
import * as path from 'path';

const SRC = path.join(__dirname, '..', '..', 'src');

/**
 * A single line may opt out by carrying this marker, with its reason.
 *
 * The database is still the right answer for the things that genuinely live
 * there - the encrypted SMTP password, the VAPID push keys - so a narrow read
 * says so on the line itself rather than exempting a whole file and hiding
 * whatever drifts into it later.
 */
const LINE_OPT_OUT = 'config-source-ok';

/**
 * Files allowed to read system_config out of the database.
 *
 * The config layer itself must: it OWNS the database mirror, and the secrets
 * genuinely live there. Everything else is a runtime consumer and belongs on
 * getBoardConfig().
 */
const MAY_READ_THE_DATABASE = [
  // Owns the mirror and the merge.
  'services/config-services/system-config.service.ts',
  'services/config.service.ts',
  'database/config-repository.ts',
  // Serves the admin, which is where the merge is exposed.
  'api/config-routes.ts',
  // Writes the mirror during an import, and reads it back to export.
  'services/import-transaction.service.ts',
  'services/amiga-export.service.ts',
  // Encryption round-trip check, run by hand.
  'scripts/test-encrypt-config.ts',
];

function sourceFiles(dir: string, found: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === 'dist') continue;
      sourceFiles(full, found);
    } else if (entry.name.endsWith('.ts')) {
      found.push(full);
    }
  }
  return found;
}

describe('where the board reads its configuration', () => {
  it('has no runtime consumer reading system_config from the database', () => {
    const offenders: string[] = [];

    for (const file of sourceFiles(SRC)) {
      const relative = path.relative(SRC, file).split(path.sep).join('/');
      if (MAY_READ_THE_DATABASE.includes(relative)) continue;

      const lines = fs.readFileSync(file, 'utf8').split('\n');

      lines.forEach((line, index) => {
        if (!/getConfigRepository\(\)\s*\.\s*getSystemConfig\(/.test(line)) return;

        // The line itself, or the short comment immediately above it, carries
        // the reason. Three lines is enough for a sentence explaining why.
        const declared = [line, lines[index - 1], lines[index - 2], lines[index - 3]]
          .some((candidate) => (candidate ?? '').includes(LINE_OPT_OUT));
        if (declared) return;

        offenders.push(`${relative}:${index + 1} reads system_config from the database`);
      });
    }

    // Jest's expect takes no message, so the report goes in the value.
    expect(offenders.join('\n')).toBe('');
  });

  it('offers one accessor for the whole board to use', () => {
    const service = fs.readFileSync(
      path.join(SRC, 'services', 'bbs-config-file.service.ts'),
      'utf8'
    );

    expect(service).toContain('export function getBoardConfig');
    // A cached reader that never notices a write is the same bug wearing a
    // different hat, so the writer has to drop the cache.
    expect(service).toContain('invalidateBoardConfig');
  });
});
