/**
 * The login sequence, as data a picker can edit and put back.
 *
 * "can we build an editor for all bulls etc that shows during login so i can
 * pick what i want and dont want in the admin ui?" (sysop, 2026-09-14). The
 * board shows five MultiTop-II bulletins on the way in because
 * `Themes/607080/Node/BULL.TXT` lists them - five `~SS_` includes with `~SP`
 * between - and the only way to change that was to edit a file on a volume
 * the sysop cannot see.
 *
 * A screen file here is a PROGRAM, and most of it is not the sysop's to
 * reorder: `~f|`, art, prompts, anything the loader understands and this does
 * not. So the model is LINES, not references. A line carrying exactly one
 * `~SS_`/`~CC_`/`~SR_` is an ITEM the picker may tick, drop or move; every
 * other line is an ANCHOR that keeps its place and its bytes.
 *
 * The first test is the one that matters: read any screen on this board and
 * write it back unchanged, and the bytes must be identical. Everything else
 * the editor does is a diff against that.
 */
import * as fs from 'fs';
import * as path from 'path';
import {
  LOGIN_SEQUENCE,
  readScreenProgram,
  writeScreenProgram,
  applyLoginSelection,
} from '../../src/screens/login-sequence';

const REPO = path.resolve(__dirname, '..', '..', '..', '..');

/** The board's own screen files, which is the only corpus that proves anything. */
function boardScreens(limit = 400): string[] {
  const roots = ['Screens', 'Node1', 'Node2', 'Bulletins', 'Conf1', 'Conf2'];
  const out: string[] = [];
  const walk = (dir: string) => {
    let entries: fs.Dirent[];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (out.length >= limit) return;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) walk(full);
      else if (/\.(txt|ttx)$/i.test(e.name) && fs.statSync(full).size < 200_000) out.push(full);
    }
  };
  for (const r of roots) walk(path.join(REPO, r));
  return out;
}

describe('a screen read and written back is the same screen', () => {
  const files = boardScreens();

  it('found the board to test against', () => {
    expect(files.length).toBeGreaterThan(20);
  });

  it('round-trips every one of them byte for byte', () => {
    const broken: string[] = [];
    for (const file of files) {
      const original = fs.readFileSync(file, 'latin1');
      const back = writeScreenProgram(readScreenProgram(original));
      if (back !== original) broken.push(path.relative(REPO, file));
    }
    expect(broken).toEqual([]);
  });

  it('round-trips the shapes a board file is made of, named explicitly', () => {
    // CRLF, a trailing newline or none, `~~` (a literal tilde, not a code),
    // and a line carrying two codes - which is an ANCHOR, not an item.
    for (const text of [
      '~f|\r\n~SS_BBS:Bulletins/bull1.txt ~SP\r\n',
      '~SS_BBS:a.txt',
      'plain art, no codes at all\n\n\n',
      '~~SS_ is a literal tilde and not an include\n',
      '~CC_gl ~CC_gwall\n',
      '',
    ]) {
      expect(writeScreenProgram(readScreenProgram(text))).toBe(text);
    }
  });
});

describe('the items a picker may touch', () => {
  const NODE_BULL = [
    '~f|',
    '~SS_BBS:Bulletins/bull1.txt ~SP',
    '~SS_BBS:Bulletins/bull2.txt ~SP',
    '~SS_BBS:Bulletins/bull3.txt ~SP',
    '~SS_BBS:Bulletins/bull4.txt ~SP',
    '~SS_BBS:Bulletins/bull5.txt',
    '',
  ].join('\n');

  it('reads the sysop\'s five bulletins, in order, with their pauses', () => {
    const program = readScreenProgram(NODE_BULL);

    expect(program.items.map(i => i.target)).toEqual([
      'BBS:Bulletins/bull1.txt',
      'BBS:Bulletins/bull2.txt',
      'BBS:Bulletins/bull3.txt',
      'BBS:Bulletins/bull4.txt',
      'BBS:Bulletins/bull5.txt',
    ]);
    expect(program.items.map(i => i.pause)).toEqual([true, true, true, true, false]);
    expect(program.items.every(i => i.code === 'SS')).toBe(true);
  });

  it('does not offer `~f|` as something to tick', () => {
    // It is an anchor: the picker cannot move it, drop it or reorder past it.
    expect(readScreenProgram(NODE_BULL).items.some(i => i.target.includes('f'))).toBe(false);
  });

  it('drops the three the sysop unticks, and keeps the rest byte-identical', () => {
    const program = readScreenProgram(NODE_BULL);
    const keep = program.items.filter(i => /bull[13]\.txt$/.test(i.target));

    const out = applyLoginSelection(NODE_BULL, keep);

    // bull3 is the LAST item now, so its `~SP` goes: a pause on the final
    // screen of the walk makes the caller press a key to reach the menu he
    // was going to be shown anyway.
    expect(out).toBe([
      '~f|',
      '~SS_BBS:Bulletins/bull1.txt ~SP',
      '~SS_BBS:Bulletins/bull3.txt',
      '',
    ].join('\n'));
  });

  it('reorders without rewriting the lines it moves', () => {
    const program = readScreenProgram(NODE_BULL);
    const reversed = [...program.items].reverse();

    const out = applyLoginSelection(NODE_BULL, reversed);
    const back = readScreenProgram(out);

    expect(back.items.map(i => i.target)).toEqual([
      'BBS:Bulletins/bull5.txt',
      'BBS:Bulletins/bull4.txt',
      'BBS:Bulletins/bull3.txt',
      'BBS:Bulletins/bull2.txt',
      'BBS:Bulletins/bull1.txt',
    ]);
    // Each item keeps ITS OWN pause across the move - bull5 was authored
    // without one and still has none, now at the top - except the last, where
    // a pause would make the caller press a key to reach the menu he was
    // going to be shown anyway. Forcing a pause onto every item but the last
    // would overrule a sysop who deliberately runs two screens together.
    expect(back.items.map(i => i.pause)).toEqual([false, true, true, true, false]);
  });

  it('adds a bulletin that was never in the file', () => {
    const program = readScreenProgram(NODE_BULL);
    const withNew = [
      ...program.items,
      { code: 'SS' as const, target: 'BBS:Bulletins/bull6.txt', pause: true },
    ];

    const out = applyLoginSelection(NODE_BULL, withNew);

    expect(readScreenProgram(out).items.map(i => i.target)).toContain('BBS:Bulletins/bull6.txt');
    expect(out.startsWith('~f|')).toBe(true);
  });

  it('empties to nothing when the last item is unticked, anchors kept', () => {
    // An EMPTY screen file still opens, and a file that opens earns a pause on
    // a blank screen (express.e:6773). The caller of this decides to delete;
    // the function's job is to say the program has no items left.
    const out = applyLoginSelection(NODE_BULL, []);

    expect(readScreenProgram(out).items).toEqual([]);
    expect(out).toContain('~f|');
  });
});

describe('the sequence itself', () => {
  it('is the walk the board actually makes, in order', () => {
    // login-post.service.ts:803 shows LOGON unless quickFlag; the rest is
    // command.handler.ts's display flow (283-292, 858-900).
    expect(LOGIN_SEQUENCE.map(s => s.screen)).toEqual([
      'LOGON', 'BULL', 'NODE_BULL', 'ACHIEVETOP', 'MAILSCAN', 'CONF_BULL',
    ]);
  });

  it('says which step a caller can be spared', () => {
    // quickFlag skips LOGON and nothing else (express.e:29853).
    const logon = LOGIN_SEQUENCE.find(s => s.screen === 'LOGON');
    expect(logon!.skippedByQuickFlag).toBe(true);
    expect(LOGIN_SEQUENCE.filter(s => s.skippedByQuickFlag)).toHaveLength(1);
  });
});
