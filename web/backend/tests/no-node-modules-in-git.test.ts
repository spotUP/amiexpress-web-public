/**
 * node_modules must not be tracked, as a directory or as a symlink.
 *
 * On 2026-09-01 two symlinks were committed - web/backend/node_modules and
 * Doors/grandmaster/node_modules, both pointing at one developer's home
 * directory - and EVERY deploy failed from that commit onward:
 *
 *   #23 [backend-builder 8/9] COPY web/backend ./
 *   ERROR: cannot replace to directory .../web/backend/node_modules with file
 *
 * The image builds a real node_modules with npm ci, and COPY cannot put a
 * symlink where a directory is. The board sat on an old image for three
 * pushes before anyone looked at the deploy log.
 *
 * .gitignore said `node_modules/` with a trailing slash, which matches
 * directories only, so a symlink of that name was never ignored. It has no
 * slash now, and this fails if one is ever tracked again - by mode as well as
 * by path, because a symlink is what slipped through last time.
 */

import { execFileSync } from 'child_process';
import * as path from 'path';

const REPO = path.resolve(__dirname, '../../..');

function trackedNodeModules(): string[] {
  // Filtered by git, not here: this repo tracks ~16 000 files and the whole
  // listing overflows execFileSync's buffer (ENOBUFS).
  const out = execFileSync(
    'git', ['ls-files', '-s', '--', '*node_modules*'],
    { cwd: REPO, encoding: 'utf8' },
  );
  return out
    .split('\n')
    .filter(line => line.trim() !== '')
    .map(line => {
      const [meta, file] = line.split('\t');
      // The mode matters: 120000 is the symlink that broke the deploys.
      return `${meta.split(' ')[0]} ${file}`;
    });
}

describe('node_modules and git', () => {
  it('is not tracked, in any form', () => {
    expect(trackedNodeModules()).toEqual([]);
  });

  it('is ignored without a trailing slash, so a symlink cannot slip through', () => {
    const ignored = execFileSync(
      'git', ['check-ignore', '-v', 'web/backend/node_modules', 'Doors/grandmaster/node_modules'],
      { cwd: REPO, encoding: 'utf8' },
    );

    expect(ignored).toContain('web/backend/node_modules');
    expect(ignored).toContain('Doors/grandmaster/node_modules');
  });
});
