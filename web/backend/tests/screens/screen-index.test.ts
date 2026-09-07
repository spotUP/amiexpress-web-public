/**
 * What the admin needs to know about the board's screens, and the two facts
 * that make it worth knowing: a screen here is a PROGRAM (252 ~SS_ includes,
 * 173 ~CC_ command invocations and 108 ~SR_ recursions across 891 files), and
 * ninety per cent of those files are byte-identical copies of each other.
 */
process.env.SKIP_DB_INIT = '1';

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { parseMciReferences } from '../../src/screens/mci-references';
import { buildScreenIndex } from '../../src/screens/screen-index.service';

describe('MCI references in a screen', () => {
  test('reads the codes this board actually uses', () => {
    const refs = parseMciReferences(
      'Welcome ~CC_gwall|\n~SS_BBS:screens/uprough.txt\n~3SR_BBS:screens/logoff\n~CL.\n'
    );
    expect(refs.map(r => `${r.code}:${r.target}`)).toEqual([
      'CC:gwall',
      'SS:BBS:screens/uprough.txt',
      'SR:BBS:screens/logoff',
      'CL:',
    ]);
  });

  test('a reference naming a node or conference is scope-specific', () => {
    const refs = parseMciReferences('~SS_BBS:Node1/BBSTITLE.txt ~SS_BBS:screens/x.txt');
    expect(refs[0].scopeSpecific).toBe(true);
    expect(refs[1].scopeSpecific).toBe(false);
  });

  test('an escaped tilde is not a reference', () => {
    expect(parseMciReferences('100~~CC_ of them')).toEqual([]);
  });
});

describe('the screen index', () => {
  let root: string;
  const write = (rel: string, body: string) => {
    fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
    fs.writeFileSync(path.join(root, rel), body, 'latin1');
  };

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'screen-index-'));
    write('Node1/BBSTITLE.txt', 'title\n');
    write('Node2/BBSTITLE.txt', 'title\n');
    write('Node1/LOGON.TXT', '~CC_gwall|\n');
    write('Node1/LOGON20.TXT', 'sysop logon\n');
    write('Conf1/MENU.TXT', 'menu\n');
    write('BULL.txt', 'bulletin\n');
    write('Screens/leftover.txt', 'nothing reads me\n');
    write('Commands/BBSCmd/GWALL.info', 'ACCESS=10\n');
  });

  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  test('reports where each screen resolves, per scope', () => {
    const index = buildScreenIndex(root);
    const bbstitle = index.screens.find(s => s.screen === 'BBSTITLE')!;
    const node1 = bbstitle.resolutions.find(r => r.id === 1)!;
    expect(node1.file).toBe(path.join('Node1', 'BBSTITLE.txt'));
    expect(node1.dirIsShared).toBe(false);
  });

  test('groups byte-identical copies', () => {
    const index = buildScreenIndex(root);
    const bbstitle = index.screens.find(s => s.screen === 'BBSTITLE')!;
    expect(bbstitle.duplicateGroups[0].paths.sort()).toEqual([
      path.join('Node1', 'BBSTITLE.txt'),
      path.join('Node2', 'BBSTITLE.txt'),
    ]);
  });

  test('lists the security variants beside the file that wins', () => {
    const index = buildScreenIndex(root);
    const logon = index.screens.find(s => s.screen === 'LOGON')!;
    const node1 = logon.resolutions.find(r => r.id === 1)!;
    expect(node1.variants.sort()).toEqual(['LOGON.TXT', 'LOGON20.TXT']);
  });

  test('a file no screen name reaches is listed as unused, never hidden', () => {
    const index = buildScreenIndex(root);
    expect(index.unused.map(f => f.relPath)).toContain(path.join('Screens', 'leftover.txt'));
  });

  test('resolves MCI references against the board', () => {
    const index = buildScreenIndex(root);
    const logon = index.files[path.join('Node1', 'LOGON.TXT')];
    expect(logon.mci[0]).toMatchObject({ code: 'CC', target: 'gwall', resolves: true });
  });

  test('a command with no .info is a broken reference', () => {
    write('Node1/LOGON.TXT', '~CC_nosuchdoor|\n');
    const index = buildScreenIndex(root);
    expect(index.files[path.join('Node1', 'LOGON.TXT')].mci[0].resolves).toBe(false);
  });

  test('sniffs the format from the bytes, not the extension', () => {
    write('Screens/art.txt', '\x1b[31mred\x1b[0m');
    const index = buildScreenIndex(root);
    expect(index.files[path.join('Screens', 'art.txt')].format).toBe('ansi');
    expect(index.files[path.join('Node1', 'BBSTITLE.txt')].format).toBe('text');
  });

  test('the callers SCREEN is art; only the callers LOG is board-written', () => {
    // express.e's callersLog() writes `Node<n>/CallersLog` (express.e:9499) and
    // never a `.txt`. Classifying the hand-drawn `Callers.txt` as board-written
    // hid it from the gallery and told the sysop an edit would be lost.
    write('Screens/Callers.txt', '\x1b[34m.----.\n\x1b[36mSpee N Name\n');
    write('Screens/callers!.txt', '\x1b[34m.----.\n\x1b[36mSpee N Name\n');
    write('Node1/CallersLog', '01-Jan-26 someone\n');
    write('Screens/lastc.txt', 'Super-AmiLog\nlAST cALLERS\n');
    const index = buildScreenIndex(root);
    expect(index.files[path.join('Screens', 'Callers.txt')].generated).toBeUndefined();
    expect(index.files[path.join('Screens', 'callers!.txt')].generated).toBeUndefined();
    // The log carries no screen extension, so it is not a screen at all.
    expect(index.files[path.join('Node1', 'CallersLog')]).toBeUndefined();
    expect(index.files[path.join('Screens', 'lastc.txt')].generated).toBe('runtime');
  });

  test('a node pointed at a shared directory reports it as shared', () => {
    write('Node9/.keep', '');
    write('Screens/Shared/BBSTITLE.txt', 'shared title\n');
    fs.writeFileSync(path.join(root, 'Node9.info'), 'SCREENS=BBS:Screens/Shared/\n');
    const index = buildScreenIndex(root);
    const node9 = index.screens.find(s => s.screen === 'BBSTITLE')!.resolutions.find(r => r.id === 9)!;
    expect(node9.dirIsShared).toBe(true);
    expect(node9.file).toBe(path.join('Screens', 'Shared', 'BBSTITLE.txt'));
  });
  test("a door's own art is listed, tagged with the door that owns it", () => {
    write('Doors/GWALL/screens/wall.ans', '\x1b[32mthe wall\n');
    const index = buildScreenIndex(root);
    const wall = index.unused.find(f => f.relPath === path.join('Doors', 'GWALL', 'screens', 'wall.ans'))!;
    expect(wall).toBeDefined();
    expect(wall.door).toBe('GWALL');
  });

  test("a door's art is never offered as a screen the board resolves", () => {
    // MENU.TXT inside a door is that door's own file. Listing it beside the
    // board's MENU would tell a sysop the board might serve it, and it cannot.
    write('Doors/GWALL/MENU.TXT', 'the door drew this\n');
    const index = buildScreenIndex(root);
    const menu = index.screens.find(s => s.screen === 'MENU')!;
    for (const resolution of menu.resolutions) {
      expect(resolution.file).not.toContain('Doors');
    }
    // It is in the file catalog - a sysop must be able to FIND it - but it
    // carries the door tag, which is what keeps it out of the board's screens.
    expect(index.files[path.join('Doors', 'GWALL', 'MENU.TXT')].door).toBe('GWALL');
  });

  test("a door's dependencies are not mistaken for its art", () => {
    write('Doors/GWALL/node_modules/some-pkg/README.txt', 'not art\n');
    write('Doors/GWALL/dist/build-log.txt', 'not art\n');
    write('Doors/GWALL/art.ans', 'art\n');
    const index = buildScreenIndex(root);
    const doorFiles = index.unused.filter(f => f.door === 'GWALL').map(f => f.relPath);
    expect(doorFiles).toEqual([path.join('Doors', 'GWALL', 'art.ans')]);
  });

  test('the board own screens carry no door tag', () => {
    const index = buildScreenIndex(root);
    expect(index.files[path.join('Node1', 'BBSTITLE.txt')].door).toBeUndefined();
  });
});

describe('what an include pulls in, and what that pulls in', () => {
  let root: string;
  const write = (rel: string, body: string) => {
    fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
    fs.writeFileSync(path.join(root, rel), body, 'latin1');
  };
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'screen-index-includes-'));
    fs.writeFileSync(path.join(root, 'ConfConfig.info'), '');
  });
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  test('a file included by an included file is read, not an orphan', () => {
    // LOGON pulls in a frame, the frame pulls in the logo. One pass over the
    // readers caught the frame and called the logo read by nothing.
    write('Node1/LOGON.TXT', '~SS_BBS:screens/frame.txt\r\n');
    write('Screens/frame.txt', 'top of frame\r\n~SS_BBS:screens/logo.txt\r\nbottom\r\n');
    write('Screens/logo.txt', 'the logo\r\n');

    const index = buildScreenIndex(root);

    expect(index.unused.map(f => f.relPath)).not.toContain(path.join('Screens', 'logo.txt'));
    expect(index.files[path.join('Screens', 'logo.txt')].readBy.some(r => r.via === 'include')).toBe(true);
  });

  test('an include cycle ends', () => {
    write('Node1/LOGON.TXT', '~SS_BBS:screens/a.txt\r\n');
    write('Screens/a.txt', '~SS_BBS:screens/b.txt\r\n');
    write('Screens/b.txt', '~SS_BBS:screens/a.txt\r\n');

    const index = buildScreenIndex(root);

    expect(index.unused.map(f => f.relPath)).not.toContain(path.join('Screens', 'b.txt'));
  });
});
