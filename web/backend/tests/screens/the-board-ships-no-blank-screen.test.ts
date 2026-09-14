/**
 * The board must not ship a screen file that draws nothing.
 *
 * A screen that DOES NOT EXIST and a screen that exists with nothing in it are
 * not the same thing to AmiExpress, and the difference is a keypress from the
 * caller. express.e:6773-6774:
 *
 *     IF (fh:=Open(filename,OLDFILE))<>0
 *       res:=TRUE
 *
 * displayScreen answers TRUE for any file that OPENS, whatever is in it, and
 * the display flow pauses on that answer - `IF displayScreen(SCREEN_BULL) THEN
 * doPause()` (express.e:28556, command.handler.ts:864). So an empty screen file
 * buys a full `(Pause)...Space To Resume:` on a blank terminal, while an ABSENT
 * one is skipped in silence. The port is 1:1 with the Amiga here; shipping the
 * empty file is the defect.
 *
 * The sysop, 2026-09-14: "i get an empty prompt after loging in with ansi
 * mode", and "it has been like this for a while". It was 272 tracked files of
 * exactly two bytes - `~\n`, the MCI gate character and a newline - across
 * Logon.txt, Logon100.txt, Logon20.txt, Logon.ttx and joined.txt on forty-odd
 * nodes.
 *
 * THEY WERE NEVER ART. `c3e68ef4c` created eighty of them empty, to put a file
 * where express.e looks for one. And `Screens/LOGON.TXT` shows how the rest
 * got there - 26 bytes, then 16, then 2, then 0, across three sensible commits
 * that each removed one MCI line (`~CC_ANNLOGON`, then `~CC_wall`) until
 * nothing was left but a file that still opens. Nobody was wrong at any step;
 * the end state was a blank pause at every login.
 *
 * So this asks the repository a question rather than a function: does any
 * tracked screen file render to nothing? A test over `git ls-files` because
 * the defect is in what the board SHIPS - a unit test of the renderer would
 * have passed throughout, and did.
 */
import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

const REPO = path.resolve(__dirname, '..', '..', '..', '..');

/** Extensions the board loads as a screen. */
const SCREEN_EXT = new Set(['.txt', '.ttx', '.seq', '.ans', '.rip', '.tti']);

/**
 * WHERE THE LOADER LOOKS, and nowhere else.
 *
 * The question is what a CALLER can be served, so the scope is the directories
 * `loadScreenFile` searches: the board root, `Screens/`, a node's own
 * directory, a conference's, and a theme's copy of any of those. An empty file
 * anywhere else is somebody's fixture or build output and cannot reach a
 * terminal - `dev/scripts/door-corpus/goldens/**\/output.txt` is empty for
 * twenty-odd doors on purpose, because that is what those doors printed.
 */
const SERVED = /^(?:Screens\/|Node\d+\/|Conf\d+\/|Themes\/[^/]+\/|[^/]+\.(?:txt|ttx|seq|ans|rip|tti)$)/i;

/**
 * Fixtures are exempt, and only fixtures.
 *
 * `tests/fixtures/board-screens/screens-logon.txt` IS a two-byte `~\n` on
 * purpose - it is the empty screen some other suite needs to point at. A
 * fixture is never served to a caller.
 */
const EXEMPT = /^web\/backend\/tests\/fixtures\//;

/** Every tracked file that the board would load as a screen. */
function trackedScreens(): string[] {
  const out = execFileSync('git', ['ls-files', '-z'], { cwd: REPO, maxBuffer: 64 * 1024 * 1024 })
    .toString('utf8')
    .split('\0')
    .filter(Boolean);
  return out.filter(
    (p) => SCREEN_EXT.has(path.extname(p).toLowerCase()) && SERVED.test(p) && !EXEMPT.test(p),
  );
}

/**
 * What a caller would see, near enough to judge emptiness.
 *
 * The leading `~` gate (express.e:6800-6806) and the MCI lines behind it are
 * instructions, not ink; a file made only of those draws nothing on its own.
 * `~SS_` and `~XI` are the exception - an include or a door PUTS something on
 * the screen - so a file carrying one of those is not blank even though every
 * line of it is a code.
 */
function drawsNothing(bytes: Buffer): boolean {
  const text = bytes.toString('latin1');
  if (/~(?:SS_|SR_|SX_|XI|CC_|f\b)/.test(text)) return false;
  const withoutCodes = text
    .replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '')   // ANSI
    .replace(/~[A-Za-z0-9_]*\|?/g, '')        // MCI, including the bare gate
    .replace(/[\s\x00\x0c\x1a]/g, '');        // whitespace, NULs, form feed, EOF
  return withoutCodes.length === 0;
}

describe('the screens this repository ships', () => {
  it('never ships one that opens and draws nothing', () => {
    const offenders = trackedScreens().filter((rel) => {
      const full = path.join(REPO, rel);
      let bytes: Buffer;
      try {
        bytes = fs.readFileSync(full);
      } catch {
        return false;   // a path git knows and the worktree does not is not this test's business
      }
      return drawsNothing(bytes);
    });

    /*
     * Named, not counted. A count tells whoever breaks this that something is
     * wrong; the list tells them which file and therefore which screen goes
     * blank, which is the part that took a live board and four sessions to
     * find the first time.
     */
    expect({ count: offenders.length, offenders: offenders.slice(0, 40) })
      .toEqual({ count: 0, offenders: [] });
  });

  it('still counts a file that only includes another as drawing something', () => {
    // The round trip. `~f|` + `~SS_BBS:Bulletins/bull7.txt` is every visible
    // byte of this board's BULL screen and must never be read as blank.
    expect(drawsNothing(Buffer.from('~f|\n~SS_BBS:Bulletins/bull7.txt\n', 'latin1'))).toBe(false);
  });

  it('counts the two-byte gate as drawing nothing', () => {
    expect(drawsNothing(Buffer.from('~\n', 'latin1'))).toBe(true);
  });

  it('counts an empty file as drawing nothing', () => {
    expect(drawsNothing(Buffer.alloc(0))).toBe(true);
  });

  it('counts real art as drawing something', () => {
    expect(drawsNothing(Buffer.from('\x1b[33mlAST cALLERS\x1b[0m\r\n', 'latin1'))).toBe(false);
  });
});
