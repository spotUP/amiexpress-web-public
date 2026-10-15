/**
 * `^ <topic>` and `TTX <page>` read the board's help directory. express.e
 * says BBS:help/ and AmigaDOS is case-insensitive; the container's ext4 is
 * not, and that mismatch has broken this path twice in production - once
 * CWD-relative, once hardcoded to HELP against a volume spelling it
 * otherwise. The case must come off the disk.
 *
 * These assert BEHAVIOUR, not the spelling that comes back: a developer's
 * macOS volume is case-insensitive, so the literal answers there whatever
 * the directory is called, and only the container can tell the two apart.
 * Reading the topic through the resolved path fails on ext4 without the fix
 * and passes on both with it.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { resolveHelpDir } from '../../src/handlers/commands/utility-commands.handler';

function boardWithHelp(dirName: string): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'helpdir-'));
  fs.mkdirSync(path.join(root, dirName));
  fs.writeFileSync(path.join(root, dirName, 'TESTPAGE.TXT'), 'a page\n');
  return root;
}

describe('the help directory is read in the case the board writes it', () => {
  for (const spelling of ['HELP', 'Help', 'help']) {
    test(`${spelling}/ - the topic under it is reachable`, () => {
      const root = boardWithHelp(spelling);
      const dir = resolveHelpDir(root);
      expect(fs.existsSync(dir)).toBe(true);
      expect(fs.readFileSync(path.join(dir, 'TESTPAGE.TXT'), 'utf-8')).toBe('a page\n');
    });
  }

  test('a board with no help directory falls back to the literal, so the caller gets express.e\'s silence rather than an error', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'helpdir-'));
    const dir = resolveHelpDir(root);
    expect(dir).toBe(path.join(root, 'HELP'));
    expect(fs.existsSync(dir)).toBe(false);
  });
});
