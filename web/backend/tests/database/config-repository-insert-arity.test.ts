/**
 * The system_config INSERT has to bind as many values as it names columns.
 *
 * Removing `reg_key` took out the column name and the value it bound but left
 * the `?` behind - 68 columns against 69 placeholders - and better-sqlite3
 * rejects the statement, so EVERY system_config insert failed. Nothing in the
 * repository's own tests noticed; the API route test caught it two suites
 * away, as "returns a response (success or 404)" getting a 500.
 *
 * The column list, the placeholder list and the bound arguments are three
 * hand-maintained lists that have to agree, spread over sixty lines. This
 * counts them.
 */

process.env.SKIP_DB_INIT = '1';

import * as fs from 'fs';
import * as path from 'path';

const SOURCE = fs.readFileSync(
  path.join(__dirname, '..', '..', 'src', 'database', 'config-repository.ts'),
  'utf8'
);

/** The one INSERT that names its columns out in full. */
function systemConfigInsert(): { columns: string[]; placeholders: number } {
  const match = SOURCE.match(
    /INSERT INTO system_config \(\n([\s\S]*?)\n\s*\) VALUES \(\n([\s\S]*?)\n\s*\)/
  );
  if (!match) throw new Error('the system_config INSERT could not be found');

  const columns = match[1]
    .split(/[\n,]/)
    .map(part => part.trim())
    .filter(part => part.length > 0 && !part.startsWith('--'));

  return { columns, placeholders: (match[2].match(/\?/g) ?? []).length };
}

describe('the system_config INSERT', () => {
  it('binds one placeholder per column', () => {
    const { columns, placeholders } = systemConfigInsert();

    expect(placeholders).toBe(columns.length);
  });

  it('names no column twice', () => {
    const { columns } = systemConfigInsert();

    expect(new Set(columns).size).toBe(columns.length);
  });

  it('no longer carries the registration key', () => {
    const { columns } = systemConfigInsert();

    expect(columns).not.toContain('reg_key');
  });
});
