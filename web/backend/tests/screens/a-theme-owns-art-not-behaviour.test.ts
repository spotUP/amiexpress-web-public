/**
 * A theme changes how the board LOOKS and nothing about what it DOES.
 *
 * "the login sequence should not be theme dependant this explains a lot of our
 * issues in the bbs" (sysop, 2026-09-14), after removing a logo from his logon
 * screen in the admin and watching the board go on drawing it - his edit had
 * landed in `Node1/logon20.txt` while his board read the theme's copy.
 *
 * A screen file here is a PROGRAM: `Node/logon20.txt` is 149 bytes of which
 * bulletins show, which doors run and where the pauses fall. Six of his seven
 * themes carried their own byte-identical copy (md5 e71dbab7 all round), so a
 * caller wearing one ran a forked login for no visual gain at all.
 *
 * The theme keeps its lever: the ART a program names is still overridable
 * through `Themes/<slug>/Files/`, which mirrors the board root verbatim. That
 * is asserted here too, because the decision to stop theming programs rests
 * on it being true.
 *
 * Design: thoughts/shared/plans/2026-09-14-a-theme-owns-art-not-behaviour-design.md
 */
process.env.SKIP_DB_INIT = '1';

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { BBSState, LoggedOnSubState } from '../../src/constants/bbs-states';
import { displayScreen } from '../../src/handlers/screen.handler';
import { invalidateScreenIndex } from '../../src/screens/screen-index.service';
import { config } from '../../src/config';

let root: string;
let previousDataDir: string;

const write = (rel: string, body: string) => {
  fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
  fs.writeFileSync(path.join(root, rel), body, 'latin1');
};

function aCaller() {
  const emits: string[] = [];
  const socket = {
    id: `theme-art-${Math.random().toString(36).slice(2)}`,
    emit: (_e: string, d: unknown) => { if (typeof d === 'string') emits.push(d); },
    on: () => {},
  } as any;
  const session = {
    nodeId: 1, state: BBSState.LOGGEDON, subState: LoggedOnSubState.READ_COMMAND,
    currentConf: 1, ansiEnabled: true, screenHeight: 24, screenWidth: 80,
    screenTheme: 't1',
    user: { username: 'sysop', name: 'sysop', secLevel: 255, expert: 'X', screenTheme: 't1' },
    tempData: {},
  } as any;
  return { socket, session, emits };
}

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'theme-art-'));
  previousDataDir = config.get('dataDir');
  config.set('dataDir', root);
  fs.writeFileSync(path.join(root, 'ConfConfig.info'), '');
  fs.writeFileSync(path.join(root, 'Themes.info'), [
    'TYPE.0=t1', 'TITLE.0=T1', 'DIR.0=Themes/t1', 'STATUS.0=live', 'WIDTHS.0=80', 'DEFAULT=t1', '',
  ].join('\n'), 'latin1');
  invalidateScreenIndex();
});

afterEach(() => {
  config.set('dataDir', previousDataDir);
  fs.rmSync(root, { recursive: true, force: true });
  invalidateScreenIndex();
});

describe('a screen that DOES something', () => {
  it('comes from the board even when the theme has forked it', async () => {
    write('Node1/LOGON.TXT', '~SS_BBS:Screens/board-art.txt\r\n');
    write('Themes/t1/Node/LOGON.TXT', '~SS_BBS:Screens/theme-art.txt\r\n');
    write('Screens/board-art.txt', 'BOARDPROGRAMRAN\r\n');
    write('Screens/theme-art.txt', 'THEMEPROGRAMRAN\r\n');
    invalidateScreenIndex();

    const { socket, session, emits } = aCaller();
    await displayScreen(socket, session, 'LOGON', false);

    expect(emits.join('')).toContain('BOARDPROGRAMRAN');
    expect(emits.join('')).not.toContain('THEMEPROGRAMRAN');
  });

  it('still comes from the theme when the board has no copy at all', async () => {
    // Not a fork - a screen the board never had. Refusing it would take away
    // something already being served.
    write('Themes/t1/Node/LOGON.TXT', '~SS_BBS:Screens/theme-art.txt\r\n');
    write('Screens/theme-art.txt', 'THEMEONLYRAN\r\n');
    invalidateScreenIndex();

    const { socket, session, emits } = aCaller();
    await displayScreen(socket, session, 'LOGON', false);

    expect(emits.join('')).toContain('THEMEONLYRAN');
  });
});

describe('a screen that only SHOWS something', () => {
  it('still comes from the theme, which is what a theme is for', async () => {
    write('Node1/BBSTITLE.txt', 'BOARDTITLE\r\n');
    write('Themes/t1/Node/BBSTITLE.txt', 'THEMETITLE\r\n');
    invalidateScreenIndex();

    const { socket, session, emits } = aCaller();
    await displayScreen(socket, session, 'BBSTITLE', false);

    expect(emits.join('')).toContain('THEMETITLE');
    expect(emits.join('')).not.toContain('BOARDTITLE');
  });
});

describe('the lever a theme keeps', () => {
  it('overrides the ART a board program includes, through the Files mirror', async () => {
    // The program stays the board's; the logo it names is the theme's. This
    // is why stopping the fork costs an artist nothing, and the whole design
    // rests on it - so it is pinned here rather than assumed.
    write('Node1/LOGON.TXT', '~SS_BBS:Screens/logo.txt\r\n');
    write('Screens/logo.txt', 'BOARDLOGO\r\n');
    write('Themes/t1/Files/Screens/logo.txt', 'THEMELOGO\r\n');
    invalidateScreenIndex();

    const { socket, session, emits } = aCaller();
    await displayScreen(socket, session, 'LOGON', false);

    expect(emits.join('')).toContain('THEMELOGO');
    expect(emits.join('')).not.toContain('BOARDLOGO');
  });
});
