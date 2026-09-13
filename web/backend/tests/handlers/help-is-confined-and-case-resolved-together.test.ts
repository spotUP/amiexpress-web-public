/**
 * Both halves of the `^` fix, asserted in one place.
 *
 * Two fixes landed on the same line, from two sessions, and were merged by
 * hand:
 *
 *   resolveHelpDir  - the board's own spelling of the directory. AmigaDOS does
 *                     not care about case and ext4 does, and this line had
 *                     broken twice in production for that reason.
 *   confineToHelp   - the caller's term is a NAME. `path.join` normalises
 *                     `..`, so `^ ../../../x` read any text file on the
 *                     container, for any logged-on caller.
 *
 * Neither is visible from the other's test, and taking either side of that
 * merge whole would have silently dropped the other. So the case that matters
 * asserts BOTH AT ONCE, against a board that spells the directory `Help/`: a
 * real topic resolves there, and a traversal is refused from that same root.
 * A later tidy-up cannot satisfy this by halves.
 *
 * These bind the real exported functions - not a copy of the rule.
 */
process.env.SKIP_DB_INIT = '1';

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { confineToHelp, resolveHelpDir } from '../../src/handlers/commands/utility-commands.handler';

/** A board that spells it `Help/`, as an AmiExpress distribution ships it. */
function boardSpelling(dirName: string): { dataDir: string; secret: string } {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'help-both-'));
  fs.mkdirSync(path.join(dataDir, dirName), { recursive: true });
  fs.writeFileSync(path.join(dataDir, dirName, 'TESTPAGE.txt'), 'a real help page');
  const secret = path.join(dataDir, 'secrets.txt');
  fs.writeFileSync(secret, 'not for callers');
  return { dataDir, secret };
}

describe('the ^ help lookup', () => {
  for (const spelling of ['HELP', 'Help', 'help']) {
    it(`finds a topic and refuses a traversal on a board that spells it ${spelling}/`, () => {
      const { dataDir } = boardSpelling(spelling);

      // Half one: the directory the board actually spells.
      //
      // HOW MUCH THIS PROVES DEPENDS ON THE FILESYSTEM IT RUNS ON, and that
      // is the whole point of the bug. On a case-INSENSITIVE disk (macOS,
      // where this is usually run) a hardcoded 'HELP' resolves fine on a
      // board spelling it 'Help', so this assertion cannot fail here and
      // neither can a red-proof of it. On the case-SENSITIVE ext4 the board
      // runs on, a hardcoded name misses and the topic below is not found -
      // which is how this line broke in production, twice.
      //
      // So it is asserted through the FILE, which is decidable on both: if
      // the directory was resolved wrongly there is nothing under it.
      const helpDir = resolveHelpDir(dataDir);
      expect(fs.existsSync(path.join(helpDir, 'TESTPAGE.txt'))).toBe(true);

      // Half two, from that same resolved root: a topic resolves...
      expect(confineToHelp(helpDir, 'TESTPAGE')).toBe(path.join(helpDir, 'TESTPAGE'));

      // ...and nothing reaches outside it.
      expect(confineToHelp(helpDir, '../secrets')).toBeNull();
      expect(confineToHelp(helpDir, '../../../../etc/hosts')).toBeNull();
      expect(confineToHelp(helpDir, '/etc/hosts')).toBeNull();
      expect(confineToHelp(helpDir, 'sub/page')).toBeNull();
      expect(confineToHelp(helpDir, 'sub\\page')).toBeNull();
    });
  }

  it('is confined even when the help directory itself is missing', () => {
    // resolveHelpDir falls back to the literal path; the confinement must not
    // relax because the directory is not there yet.
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'help-none-'));

    const helpDir = resolveHelpDir(dataDir);

    expect(confineToHelp(helpDir, '../../etc/hosts')).toBeNull();
    expect(confineToHelp(helpDir, 'TESTPAGE')).toBe(path.join(helpDir, 'TESTPAGE'));
  });
});
