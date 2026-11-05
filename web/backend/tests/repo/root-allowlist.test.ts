/**
 * THE REPOSITORY ROOT HOLDS ONLY THE BOARD TREE AND A FIXED LIST OF PROJECT
 * ENTRIES.
 *
 * The rule, its reason and the list itself live in
 * `dev/scripts/check-root-allowlist.cjs`; the pre-push hook runs the same
 * file, so the hook and this suite can never disagree about what a stray is.
 * See also the "Repository layout" section of RULES.md.
 */
import * as path from 'path';

interface RootChecker {
  BOARD_ENTRIES: Set<string>;
  PROJECT_ENTRIES: Record<string, string>;
  rootEntries(repoRoot: string, ref?: string): string[];
  findStrays(entries: string[]): string[];
  describe(strays: string[]): string;
}

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..', '..');

// eslint-disable-next-line @typescript-eslint/no-var-requires
const checker: RootChecker = require(path.join(REPO_ROOT, 'dev/scripts/check-root-allowlist.cjs'));

describe('the repository root holds only board data and listed project entries', () => {
  const entries = checker.rootEntries(REPO_ROOT);

  it('tracks no stray at the root', () => {
    const strays = checker.findStrays(entries);
    expect({ strays, whatToDo: strays.length > 0 ? checker.describe(strays) : 'none' })
      .toEqual({ strays: [], whatToDo: 'none' });
  });

  it('names no entry that is gone, so the list stays the true layout', () => {
    const listed = [...checker.BOARD_ENTRIES, ...Object.keys(checker.PROJECT_ENTRIES)];
    expect(listed.filter((name) => !entries.includes(name))).toEqual([]);
  });

  it('flags the kind of stray the 2026-11-05 cleanup removed', () => {
    expect(checker.findStrays(['Conf1', 'Conf1.info', 'Node7', 'batch3', 'web', 'test-all.sh', 'Conf2.info.bak.png']))
      .toEqual(['Conf2.info.bak.png', 'test-all.sh']);
  });
});
