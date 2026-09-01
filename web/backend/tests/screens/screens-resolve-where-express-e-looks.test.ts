/**
 * A screen this port displays must be one a real Amiga displays too.
 *
 * express.e:6544-6640 selects ONE directory per screen type and gives up if
 * the file is not there. There is no fallback:
 *
 *   LOGON, LOGOFF, BBSTITLE, AWAITSCREEN, JOIN, JOINED, JOINCONF, NODE_BULL
 *     -> nodeScreenDir, which is each node's SCREENS tooltype and defaults to
 *        <bbsLoc>/Node<N>/  (ACP.e:2666-2673)
 *   MENU, CONF_BULL, JoinMsgBase, DownloadMsg -> confScreenDir
 *   BULL -> cmds.bbsLoc
 *
 * This port ALSO searches `Node<N>/Screens/` and falls back to `Screens/`,
 * which express.e does not. That is a parity gap in the forgiving direction:
 * a screen present only in those places works here and is MISSING on a real
 * Amiga - the sysop sees it in testing and callers on the real board do not.
 *
 * Measured on the live board 2026-09-01: LOGON, LOGOFF, BBSTITLE, JOIN,
 * JOINED, JOINCONF and GUESTLOGON all resolved correctly on all 41 nodes.
 * AWAITSCREEN resolved on NONE of them - every node had it only in
 * `Node<N>/Screens/`, so no real Amiga would have shown an await screen.
 *
 * This pins the shipped tree so that gap cannot reopen.
 */

import * as fs from 'fs';
import * as path from 'path';

const REPO = path.join(__dirname, '..', '..', '..', '..');

function nodeDirectories(): string[] {
  return fs.readdirSync(REPO)
    .filter(name => /^Node\d+$/.test(name))
    .filter(name => fs.statSync(path.join(REPO, name)).isDirectory())
    .sort();
}

/** Case-insensitively, as both an Amiga volume and the loader resolve. */
function hasScreen(directory: string, base: string): boolean {
  try {
    const wanted = base.toLowerCase();
    return fs.readdirSync(directory)
      .some(entry => entry.toLowerCase().replace(/\.[^.]*$/, '') === wanted);
  } catch {
    return false;
  }
}

describe('the await screen', () => {
  const nodes = nodeDirectories();

  it('has node directories to check', () => {
    expect(nodes.length).toBeGreaterThan(10);
  });

  // express.e:6545-6547 reads this one with a plain fileExists - no security
  // search, no variants - straight out of nodeScreenDir.
  it('is in the node directory express.e reads, on every node', () => {
    const missing = nodes.filter(
      node => !hasScreen(path.join(REPO, node), 'awaitscreen'),
    );

    expect(missing.join(', ')).toBe('');
  });

  // The port would find it there through a fallback express.e does not have,
  // so a copy left behind is not harmless - it is the thing that hid this.
  it('is not left only in the Screens subdirectory', () => {
    const strayOnly = nodes.filter(node => {
      const inNodeDir = hasScreen(path.join(REPO, node), 'awaitscreen');
      const inScreens = hasScreen(path.join(REPO, node, 'Screens'), 'awaitscreen');
      return inScreens && !inNodeDir;
    });

    expect(strayOnly.join(', ')).toBe('');
  });
});

describe('a GLOBAL screen', () => {
  const handler = fs.readFileSync(
    path.join(REPO, 'web/backend/src/handlers/screen.handler.ts'),
    'utf8',
  );

  // express.e:6549 - StringF(screencheck,'\s\s',cmds.bbsLoc,'BULL') - reads a
  // GLOBAL screen from the BOARD ROOT. The resolver searched `<board>/Screens`
  // and nothing else, so a board with BULL.TXT where express.e wants it showed
  // no bulletin, and this board - which had it in Screens/ - showed one here
  // and would have shown none on a real Amiga.
  //
  // Seven screens ride on this: BULL, ONENODE, LOGON24, LANGUAGES,
  // INTERNETNAMES, REALNAMES, MAILSCAN.
  it('is looked for at the board root, which is what express.e reads', () => {
    const globalBranch = handler.slice(
      handler.indexOf('screenDirType === ScreenDirType.GLOBAL'),
      handler.indexOf('screenDirType === ScreenDirType.GLOBAL') + 1400,
    );

    expect(globalBranch).toContain("dir: baseDir");
  });

  // The board root goes FIRST: it is express.e's answer, and Screens/ is only
  // there until the files are moved out of it.
  it('prefers the board root over the Screens directory', () => {
    const globalBranch = handler.slice(handler.indexOf('screenDirType === ScreenDirType.GLOBAL'));
    const root = globalBranch.indexOf('dir: baseDir');
    const screens = globalBranch.indexOf('dir: globalScreensDir');

    expect(root).toBeGreaterThan(-1);
    expect(screens).toBeGreaterThan(-1);
    expect(root).toBeLessThan(screens);
  });
});
