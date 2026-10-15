/**
 * What points at a screen, before it is deleted.
 *
 * "if i delete a logo that is used in one of the screen files etc in the bbs,
 * can we update the file as well and remove it?" - the sysop, 2026-09-15,
 * about the ANSI Studio's own delete.
 *
 * A screen is pulled into another screen by an MCI sentinel:
 * `~SS_BBS:screens/uprough.txt`. Delete the target and the including screen
 * draws nothing where the logo was, quietly - the hollow-screen class this
 * board spent a night on. So the delete has to be able to say what breaks.
 *
 * REMOVABLE is the distinction that matters. A sentinel ALONE on its line can
 * be taken out cleanly. One sitting INLINE with art or text is part of a
 * composition, and no rule can tell what the rest of that row is holding up -
 * so it is reported and never rewritten (the sysop's rule).
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { findScreenReferences, removeScreenReferences } from '../../src/screens/screen-references';

let root: string;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'screen-refs-'));
  fs.mkdirSync(path.join(root, 'Screens'), { recursive: true });
  fs.mkdirSync(path.join(root, 'Bulletins'), { recursive: true });
});

const write = (rel: string, text: string) =>
  fs.writeFileSync(path.join(root, rel), text, 'latin1');

it('finds a screen pulled in by another screen', () => {
  write('Screens/uprough.txt', 'the logo\n');
  write('Screens/BULL.TXT', 'header\n~SS_BBS:screens/uprough.txt\nfooter\n');

  const refs = findScreenReferences(root, 'Screens/uprough.txt');

  expect(refs).toEqual([expect.objectContaining({
    from: 'Screens/BULL.TXT',
    line: 2,
    removable: true,
  })]);
});

it('matches whatever case and assign the sentinel was written in', () => {
  // AmigaDOS does not care, and neither does the loader: `BBS:` and `WORK:bbs/`
  // reach the same file, and this board's own screens mix the spellings.
  write('Screens/uprough.txt', 'the logo\n');
  write('Screens/A.TXT', '~SS_BBS:Screens/UPROUGH.TXT\n');
  write('Screens/B.TXT', '~SS_WORK:bbs/screens/uprough.txt\n');

  const refs = findScreenReferences(root, 'Screens/uprough.txt');

  expect(refs.map(r => r.from).sort()).toEqual(['Screens/A.TXT', 'Screens/B.TXT']);
});

it('calls a sentinel sitting INLINE with art unremovable', () => {
  // The line carries a drawing as well. Taking the sentinel out edits somebody
  // else's composition, and the rest of the row may be holding the layout up.
  write('Screens/uprough.txt', 'the logo\n');
  write('Screens/C.TXT', '\x1b[34m| ~SS_BBS:screens/uprough.txt \x1b[34m|\n');

  const [ref] = findScreenReferences(root, 'Screens/uprough.txt');

  expect(ref.removable).toBe(false);
});

it('treats a line of only whitespace around the sentinel as removable', () => {
  write('Screens/uprough.txt', 'the logo\n');
  write('Screens/D.TXT', '   ~SS_BBS:screens/uprough.txt   \n');

  const [ref] = findScreenReferences(root, 'Screens/uprough.txt');

  expect(ref.removable).toBe(true);
});

it('does not report the screen pointing at itself', () => {
  write('Screens/self.txt', '~SS_BBS:screens/self.txt\n');

  expect(findScreenReferences(root, 'Screens/self.txt')).toEqual([]);
});

it('does not confuse a screen with one whose name merely starts the same', () => {
  write('Screens/bull.txt', 'menu\n');
  write('Screens/A.TXT', '~SS_BBS:screens/bull20.txt\n');

  expect(findScreenReferences(root, 'Screens/bull.txt')).toEqual([]);
});

it('reports every line when one screen names it twice', () => {
  write('Screens/uprough.txt', 'the logo\n');
  write('Screens/E.TXT', '~SS_BBS:screens/uprough.txt\nmiddle\n~SS_BBS:screens/uprough.txt\n');

  const refs = findScreenReferences(root, 'Screens/uprough.txt');

  expect(refs.map(r => r.line)).toEqual([1, 3]);
});

it('never looks inside a dot-directory', () => {
  // Run against the real board this walked into `.claude/worktrees/agent-<id>/`
  // - another session's checkout of the same repository - and reported 170
  // references in files the sysop has never seen. `.revisions`, the screen
  // history, is the same shape: every copy of every screen ever saved.
  write('Screens/uprough.txt', 'the logo\n');
  fs.mkdirSync(path.join(root, '.claude', 'worktrees', 'agent-x', 'Screens'), { recursive: true });
  write('.claude/worktrees/agent-x/Screens/A.TXT', '~SS_BBS:screens/uprough.txt\n');
  fs.mkdirSync(path.join(root, 'Screens', '.Revisions', 'uprough.txt'), { recursive: true });
  write('Screens/.Revisions/uprough.txt/old.txt', '~SS_BBS:screens/uprough.txt\n');

  expect(findScreenReferences(root, 'Screens/uprough.txt')).toEqual([]);
});

it('looks only where this board keeps screens', () => {
  // Run against the repository this matched a stray `68klog.txt` at the root
  // and another BBS's screens vendored under Documentation/ - same sentinels,
  // none of them this board's.
  write('Screens/uprough.txt', 'the logo\n');
  fs.mkdirSync(path.join(root, 'Documentation', 'reference-boardBBS', 'Node1'), { recursive: true });
  write('Documentation/reference-boardBBS/Node1/logon10.txt', '~SS_BBS:screens/uprough.txt\n');
  write('68klog.txt', 'a log that happens to quote ~SS_BBS:screens/uprough.txt\n');

  expect(findScreenReferences(root, 'Screens/uprough.txt')).toEqual([]);
});

it('does find one in a conference and a node', () => {
  write('Screens/uprough.txt', 'the logo\n');
  fs.mkdirSync(path.join(root, 'Node3'), { recursive: true });
  fs.mkdirSync(path.join(root, 'Conf5'), { recursive: true });
  write('Node3/logon20.txt', '~SS_BBS:screens/uprough.txt\n');
  write('Conf5/menu.txt', '~SS_BBS:screens/uprough.txt\n');

  expect(findScreenReferences(root, 'Screens/uprough.txt').map(r => r.from).sort())
    .toEqual(['Conf5/menu.txt', 'Node3/logon20.txt']);
});

it('answers empty for a screen nothing includes', () => {
  write('Screens/lonely.txt', 'art\n');
  write('Screens/F.TXT', 'no sentinels here\n');

  expect(findScreenReferences(root, 'Screens/lonely.txt')).toEqual([]);
});

describe('removing the references that can be removed', () => {
  it('drops the line and leaves the rest of the screen alone', () => {
    write('Screens/uprough.txt', 'the logo\n');
    write('Screens/BULL.TXT', 'header\n~SS_BBS:screens/uprough.txt\nfooter\n');

    const refs = findScreenReferences(root, 'Screens/uprough.txt');
    const done = removeScreenReferences(root, refs, () => {});

    expect(done).toEqual([{ file: 'Screens/BULL.TXT', linesRemoved: 1 }]);
    expect(fs.readFileSync(path.join(root, 'Screens/BULL.TXT'), 'latin1'))
      .toBe('header\nfooter\n');
  });

  it('never touches a sentinel that shares its line with art', () => {
    write('Screens/uprough.txt', 'the logo\n');
    const art = '\x1b[34m| ~SS_BBS:screens/uprough.txt \x1b[34m|\n';
    write('Screens/C.TXT', art);

    const done = removeScreenReferences(root, findScreenReferences(root, 'Screens/uprough.txt'), () => {});

    expect(done).toEqual([]);
    expect(fs.readFileSync(path.join(root, 'Screens/C.TXT'), 'latin1')).toBe(art);
  });

  it('saves a revision of every screen it rewrites, before rewriting it', () => {
    // A delete that silently edits three other screens is not undoable from
    // the admin. One that leaves a revision behind is.
    write('Screens/uprough.txt', 'the logo\n');
    write('Screens/BULL.TXT', '~SS_BBS:screens/uprough.txt\nkeep\n');
    const revised: string[] = [];

    removeScreenReferences(root, findScreenReferences(root, 'Screens/uprough.txt'),
      rel => { revised.push(rel + ':' + fs.readFileSync(path.join(root, rel), 'latin1').length); });

    // The LENGTH is the proof it ran before the write: the file is 33 bytes
    // with the sentinel line and 5 without it.
    expect(revised).toEqual(['Screens/BULL.TXT:33']);
  });

  it('keeps the file own line endings', () => {
    // This board mixes CRLF and LF. Rewriting one into the other shows up as
    // every line changing in the next revision diff.
    write('Screens/uprough.txt', 'the logo\n');
    write('Screens/D.TXT', 'a\r\n~SS_BBS:screens/uprough.txt\r\nb\r\n');

    removeScreenReferences(root, findScreenReferences(root, 'Screens/uprough.txt'), () => {});

    expect(fs.readFileSync(path.join(root, 'Screens/D.TXT'), 'latin1')).toBe('a\r\nb\r\n');
  });

  it('drops two references in one screen in a single rewrite', () => {
    write('Screens/uprough.txt', 'the logo\n');
    write('Screens/E.TXT', '~SS_BBS:screens/uprough.txt\nmiddle\n~SS_BBS:screens/uprough.txt\n');

    const done = removeScreenReferences(root, findScreenReferences(root, 'Screens/uprough.txt'), () => {});

    expect(done).toEqual([{ file: 'Screens/E.TXT', linesRemoved: 2 }]);
    expect(fs.readFileSync(path.join(root, 'Screens/E.TXT'), 'latin1')).toBe('middle\n');
  });
});
