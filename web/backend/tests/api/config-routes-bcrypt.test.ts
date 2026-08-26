/**
 * The admin API hashes with the bcrypt this project actually installs.
 *
 * Reported from the live site, saving a user:
 *
 *   Failed to update user: Cannot find module 'bcrypt'
 *   Require stack: - /app/web/backend/src/api/config-routes.ts
 *
 * The whole backend uses bcryptjs, and that is what package.json declares.
 * This one file required the NATIVE bcrypt, which is not a dependency - so
 * every password written through the admin API threw, in every environment
 * that had not happened to pick the native package up by accident. Setting a
 * user's password from /admin could never have worked in the container.
 *
 * The two produce interchangeable hashes, so existing passwords still
 * verify.
 */

import { readFileSync } from 'fs';
import { join } from 'path';

const SRC = join(__dirname, '..', '..', 'src');

function read(...parts: string[]): string {
  return readFileSync(join(SRC, ...parts), 'utf8');
}

describe('the admin config API', () => {
  const routes = read('api', 'config-routes.ts');

  it('does not require the native bcrypt', () => {
    expect(routes).not.toMatch(/require\(['"]bcrypt['"]\)/);
    expect(routes).not.toMatch(/from ['"]bcrypt['"]/);
  });

  it('uses bcryptjs', () => {
    expect(routes).toMatch(/import \* as bcrypt from ['"]bcryptjs['"]/);
  });

  it('still hashes every password it writes', () => {
    // Three places write a password: create, disk-slot update, database
    // update. None of them may store it in the clear.
    const hashes = routes.match(/bcrypt\.hash\(password, 10\)/g) ?? [];

    expect(hashes.length).toBeGreaterThanOrEqual(3);
  });
});

describe('the backend as a whole', () => {
  it('never reaches for the native bcrypt anywhere', () => {
    // One file doing this is how the admin API broke; a test that only
    // covered that file would let the next one through.
    const { execSync } = require('child_process');
    const hits = execSync(
      `grep -rln "require(['\\"]bcrypt['\\"])\\|from ['\\"]bcrypt['\\"]" ${SRC} --include=*.ts || true`,
      { encoding: 'utf8' }
    ).trim();

    expect(hits).toBe('');
  });

  it('declares bcryptjs as a dependency', () => {
    const pkg = JSON.parse(readFileSync(join(SRC, '..', 'package.json'), 'utf8'));

    expect(pkg.dependencies.bcryptjs).toBeDefined();
    expect(pkg.dependencies.bcrypt).toBeUndefined();
  });
});
