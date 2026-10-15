/**
 * A theme the board offers has to BE on the board.
 *
 * `Themes.info` is synced to the volume by the entrypoint, so the picker
 * offered `tango` - and the loader then had no art to serve for it, because
 * the `Themes/` tree itself never reached the image. Every caller saw the
 * board's own screens whichever theme he chose (sysop, live, 2026-09-07:
 * "i see dinos menu in both cases when i change theme").
 *
 * The entrypoint's own Themes block walks what the IMAGE has, so what this
 * pins is that the image has it: the registry, the tree, and the two in step.
 */
import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

const REPO = path.resolve(__dirname, '../../../..');
const dockerfile = fs.readFileSync(path.join(REPO, 'Dockerfile'), 'utf8');
const entrypoint = fs.readFileSync(path.join(REPO, 'docker-entrypoint.sh'), 'utf8');

/**
 * Every theme the registry declares - as the IMAGE will carry it.
 *
 * READ FROM GIT, NOT FROM THE WORKING TREE. `Themes.info` is board state as
 * well as repo content: an artist creating a theme through the admin writes a
 * registry entry and a directory on the VOLUME, and on the sysop's own
 * checkout - which is also a running board - those appear in the working
 * copy. `ansiguy` is one: 58 files live on the board, nothing in git, and the
 * committed registry names only `tango`.
 *
 * Reading the working copy made this suite assert that the REPO ships a theme
 * the repo was never meant to ship, and it failed on the sysop's machine
 * while passing everywhere else. The question here is what the image carries,
 * and the image carries what is committed - so ask git.
 *
 * Same trap `tests/repo/tracked-fixtures.test.ts` exists for: a committed
 * test must not depend on a file the repo does not track.
 */
function registeredThemeDirs(): string[] {
  const info = execFileSync('git', ['show', 'HEAD:Themes.info'], {
    cwd: REPO,
    encoding: 'latin1',
    maxBuffer: 8 * 1024 * 1024,
  });
  return [...info.matchAll(/^DIR\.\d+=(.+)$/gm)].map((m) => m[1].trim()).filter((d) => d !== '');
}

describe('the image carries the themes the board offers', () => {
  it('copies the Themes tree into the template directory', () => {
    expect(dockerfile).toMatch(/^COPY Themes \/app\/default-data\/Themes$/m);
  });

  it('and the entrypoint walks it onto the volume', () => {
    // Belt and braces: the COPY is useless if nothing syncs it, and the sync
    // is useless if nothing is copied. Both have to be there.
    expect(entrypoint).toContain('$DEFAULT_DATA_DIR/Themes');
  });

  it('every theme the registry names is a directory that exists', () => {
    const dirs = registeredThemeDirs();
    expect(dirs.length).toBeGreaterThan(0);
    for (const dir of dirs) {
      expect({ dir, exists: fs.existsSync(path.join(REPO, dir)) }).toEqual({ dir, exists: true });
    }
  });

  it('...and carries at least one screen, so wearing it changes something', () => {
    for (const dir of registeredThemeDirs()) {
      const files: string[] = [];
      const walk = (d: string) => {
        for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
          const full = path.join(d, entry.name);
          if (entry.isDirectory()) walk(full);
          else files.push(full);
        }
      };
      walk(path.join(REPO, dir));
      expect({ dir, screens: files.length > 0 }).toEqual({ dir, screens: true });
    }
  });
});
