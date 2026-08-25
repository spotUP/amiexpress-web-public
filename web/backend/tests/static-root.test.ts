/**
 * Static file serving root regression test.
 *
 * The backend resolved its project root as `join(process.cwd(), '..', '..')`,
 * which assumes it was launched from web/backend. The BBS data paths are
 * relative to the REPO ROOT - launching from web/backend gives
 * "ENOENT: data/bbs/node1.user.tmp" on login - so the two assumptions were
 * in direct conflict. Started the documented way, the root resolved to the
 * PARENT of the repo, no frontend dist was found there, and the terminal
 * answered 404 at / and on every asset.
 */

import { readFileSync } from 'fs';
import { join } from 'path';

const source = readFileSync(
  join(__dirname, '..', 'src', 'server', 'routes-setup.ts'),
  'utf8'
);

describe('static serving root', () => {
  it('does not derive the project root from the working directory', () => {
    expect(source).not.toMatch(/projectRoot\s*=\s*join\(process\.cwd\(\)/);
  });

  it('derives it from this file\'s location, so cwd cannot change it', () => {
    expect(source).toMatch(/path\.resolve\(__dirname, '\.\.\/\.\.\/\.\.\/\.\.'\)/);
  });

  it('lets BBS_ROOT override it', () => {
    expect(source).toMatch(/process\.env\.BBS_ROOT/);
  });
});
