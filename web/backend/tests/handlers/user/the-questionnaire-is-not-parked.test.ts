/**
 * THE NEW-USER QUESTIONNAIRE IS WHERE THE LOOKUP LOOKS.
 *
 * Sysop, 2026-09-07: "i created a new user to test the new user onboarding
 * flow on localhost via telnet now but i didn't even get the questionaire".
 *
 * `findQuestionnaireScript()` (handlers/user/new-user.handler.ts) tries
 * `<nodeDir>/script<baud>` - the caller's own baud first, then 57600 down
 * to 14400 - and finding NONE is exactly how the questionnaire is skipped:
 * `beginQuestionnaire` returns false and the account is created straight
 * away. In April 2026 (2cc0485b3) all 281 script files were moved into
 * `Node<n>/disabled_scripts/`, which is precisely where the lookup cannot
 * see them.
 *
 * The board was later repaired BY HAND on the live volume. Node
 * directories are never deployed, so that repair could not reach the
 * repository: every fresh install, and every developer's localhost, still
 * shipped the questionnaire switched off, and live's behaviour rested on
 * one manual move nothing recorded. This is the same shape as the node
 * screens the deploy could not share - a hand-fixed volume telling a
 * different story from the tree.
 *
 * So this asserts the REPOSITORY's state, which is the thing that was
 * wrong. It reads the board's own node directories.
 */
import * as fs from 'fs';
import * as path from 'path';

const BOARD = path.resolve(__dirname, '../../../../..');

/**
 * Every `Node<n>` directory that actually SERVES a caller.
 *
 * A provisioned node carries its own screens; Node42-45 and Node97 hold
 * three or eight files of drop-file and TempAns leftovers, so requiring a
 * questionnaire in them would pin scratch directories rather than the board.
 *
 * The marker is `logon20.txt`, not `Logon.txt`. The plain one was the marker
 * until `93e12958a fix(screens): a screen that draws nothing is not shipped at
 * all` deleted it board-wide - after which this filter matched NOTHING, every
 * node dir dropped out, and the suite failed on an empty list instead of on
 * the board (2026-09-16). `logon20.txt` is the security-level logon screen
 * that remains, and it partitions exactly the same way: 41 provisioned nodes,
 * 5 scratch ones.
 */
function nodeDirs(): string[] {
  return fs
    .readdirSync(BOARD, { withFileTypes: true })
    .filter((e) => e.isDirectory() && /^Node\d+$/.test(e.name))
    .filter((e) => fs.existsSync(path.join(BOARD, e.name, 'logon20.txt')))
    .map((e) => e.name)
    .sort((a, b) => Number(a.slice(4)) - Number(b.slice(4)));
}

const scriptsIn = (dir: string): string[] => {
  try {
    return fs.readdirSync(path.join(BOARD, dir)).filter((f) => /^script\d+$/i.test(f));
  } catch {
    return [];
  }
};

describe('the new-user questionnaire scripts', () => {
  it('reads the board, not an empty list', () => {
    expect(nodeDirs().length).toBeGreaterThan(10);
  });

  it('sit in the node directory, where findQuestionnaireScript looks', () => {
    const withoutScripts = nodeDirs().filter((dir) => scriptsIn(dir).length === 0);
    expect(withoutScripts).toEqual([]);
  });

  it('are not parked in disabled_scripts, which is how the questionnaire went quiet', () => {
    const parked = nodeDirs().filter((dir) => scriptsIn(path.join(dir, 'disabled_scripts')).length > 0);
    expect(parked).toEqual([]);
  });

  it('offer one of the bauds the lookup actually tries', () => {
    // The lookup's own ladder, in order. A node whose only script is, say,
    // `script2400` would still be found by nothing.
    const LADDER = ['57600', '38400', '33600', '28800', '19200', '14400'];
    const unreachable = nodeDirs().filter((dir) => {
      const names = scriptsIn(dir).map((f) => f.toLowerCase().replace('script', ''));
      return !LADDER.some((baud) => names.includes(baud));
    });
    expect(unreachable).toEqual([]);
  });
});
