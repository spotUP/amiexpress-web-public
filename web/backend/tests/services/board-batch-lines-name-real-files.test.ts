/**
 * Every file a shipped batch line names must exist on the board.
 *
 * board/batch000 said
 *
 *     doors:quicknew/quicknew doors:quicknew/quicknew.config 14 >bbs:screens/quicknew2.txt
 *
 * while the only QuickNew config on the board (and the live volume) is
 * QuickNew.Config1. The 68K door takes its config path from ReadArgs, so every
 * logoff ran it with a path that did not exist: the live log showed
 * "doors:quicknew/quicknew.config NOT FOUND IoErr=205" and quicknew2.txt never
 * changed. batch0..batch6 named quicknew.config1 and worked.
 *
 * This reads the real batch files and resolves every `doors:` path (doors and
 * their configs ship in the repo) the way the scheduler does (Amiga
 * case-insensitive). `bbs:` paths name runtime data such as user.data, which
 * exists only on a running board, so they are not checked. Redirect targets
 * (`>file`) are outputs and may not exist yet, so they are skipped, and so
 * are `;` comment lines and `.key` directives.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as amigafs from '../../src/utils/amigafs';

const BOARD = path.resolve(__dirname, '../../../../board');

const DOORS_ASSIGN = 'doors:';

function toHostPath(amigaPath: string): string | null {
  if (!amigaPath.toLowerCase().startsWith(DOORS_ASSIGN)) return null;
  return path.join(BOARD, 'Doors', amigaPath.slice(DOORS_ASSIGN.length));
}

function batchFiles(): string[] {
  return fs
    .readdirSync(BOARD)
    .filter((name) => /^batch\d+$/i.test(name))
    .map((name) => path.join(BOARD, name));
}

describe('shipped batch lines', () => {
  beforeEach(() => amigafs.forgetDirectoryListings());

  it('the board ships batch files to check', () => {
    expect(batchFiles().map((f) => path.basename(f))).toContain('batch000');
  });

  it('name only doors and door configs that exist', () => {
    const missing: string[] = [];
    for (const file of batchFiles()) {
      const lines = fs.readFileSync(file, 'latin1').split(/\r?\n/);
      lines.forEach((line, index) => {
        // AmigaDOS script comments and directives name nothing that runs.
        if (/^\s*[;.]/.test(line)) return;
        const words = line.trim().split(/\s+/).filter((w) => w && !w.startsWith('>'));
        for (const word of words) {
          const host = toHostPath(word);
          if (host && amigafs.resolvePath(host) === null) {
            missing.push(`${path.basename(file)}:${index + 1} ${word}`);
          }
        }
      });
    }
    expect(missing).toEqual([]);
  });
});
