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
import { screenSearchLocations } from '../../src/screens/screen-resolution';

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

describe('the title screen', () => {
  const nodes = nodeDirectories();

  // express.e:6580 reads BBSTITLE from nodeScreenDir. This board had only
  // `Node<N>/BBSTITLE.SEQ` there - and .SEQ is this project's C64 PETSCII,
  // not a declared screen type: ScreenTypes.info offers TXT.GR and IBM, so an
  // ANSI caller's title came from `Screens/BBSTITLE.txt` through the fallback
  // and would have been missing on a real Amiga.
  //
  // The first measurement of this said 41 of 41 and was wrong: the glob
  // matched ANY extension, so the .SEQ counted. Match what the loader takes.
  it('is in the node directory, in a type an ANSI caller can read', () => {
    const missing = nodes.filter(node => {
      const entries = fs.readdirSync(path.join(REPO, node));
      return !entries.some(entry => /^BBSTITLE\d*\.(txt|TXT|TXT\.GR|IBM)$/i.test(entry));
    });

    expect(missing.join(', ')).toBe('');
  });

  // The PETSCII file stays: addPetsciiVariants tries .seq BEFORE .txt, so a
  // C64 caller still gets it and the .txt beside it does not shadow it.
  it('keeps the PETSCII sequence beside it', () => {
    const withSeq = nodes.filter(node =>
      fs.readdirSync(path.join(REPO, node)).some(e => /^BBSTITLE\.SEQ$/i.test(e)),
    );

    expect(withSeq.length).toBeGreaterThan(0);
  });
});

describe('a GLOBAL screen', () => {
  // express.e:6549 - StringF(screencheck,'\s\s',cmds.bbsLoc,'BULL') - reads a
  // GLOBAL screen from the BOARD ROOT. The resolver searched `<board>/Screens`
  // and nothing else, so a board with BULL.TXT where express.e wants it showed
  // no bulletin, and this board - which had it in Screens/ - showed one here
  // and would have shown none on a real Amiga.
  //
  // Seven screens ride on this: BULL, ONENODE, LOGON24, LANGUAGES,
  // INTERNETNAMES, REALNAMES, MAILSCAN.
  //
  // These two asserted on the SOURCE of screen.handler.ts - they grepped the
  // GLOBAL branch for `dir: baseDir`. That proves a line exists, never that it
  // runs, and it broke the moment the table moved into screen-resolution.ts
  // while the behaviour stayed identical. They ask the resolver now.
  it('is looked for at the board root, which is what express.e reads', () => {
    const dirs = screenSearchLocations('/board', 'BULL', { nodeId: 1 }).map(l => l.dir);

    expect(dirs).toContain('/board');
  });

  it('prefers the board root over the Screens directory', () => {
    const dirs = screenSearchLocations('/board', 'BULL', { nodeId: 1 }).map(l => l.dir);

    expect(dirs.indexOf('/board')).toBeGreaterThan(-1);
    expect(dirs.indexOf(path.join('/board', 'Screens'))).toBeGreaterThan(-1);
    expect(dirs.indexOf('/board')).toBeLessThan(dirs.indexOf(path.join('/board', 'Screens')));
  });

  it('every screen express.e reads from cmds.bbsLoc searches the board root', () => {
    for (const screen of ['BULL', 'ONENODE', 'LOGON24', 'LANGUAGES', 'INTERNETNAMES', 'REALNAMES', 'MAILSCAN']) {
      expect(screenSearchLocations('/board', screen, { nodeId: 1 })[0].dir).toBe('/board');
    }
  });
});
