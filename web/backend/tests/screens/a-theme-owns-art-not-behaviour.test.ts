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

describe('a theme may restyle a program, and not re-run it', () => {
  it('draws the THEME\'s copy when it runs exactly what the board runs', async () => {
    /*
     * A conference bulletin here is 1745 bytes of ANSI logo with one `~SS_`
     * at the end. Refusing every themed copy took the artist's LOGO away
     * along with the behaviour he should not have had - so the question is
     * not "does it carry codes" but "does it carry DIFFERENT codes".
     */
    write('Screens/BULL.TXT', '~f|BOARDLOGO\r\n~SS_BBS:Screens/tail.txt\r\n');
    write('Themes/t1/Board/BULL.TXT', '~f|THEMELOGO\r\n~SS_BBS:Screens/tail.txt\r\n');
    write('Screens/tail.txt', 'THETAIL\r\n');
    invalidateScreenIndex();

    const { socket, session, emits } = aCaller();
    await displayScreen(socket, session, 'BULL', false);

    expect(emits.join('')).toContain('THEMELOGO');
    expect(emits.join('')).not.toContain('BOARDLOGO');
    expect(emits.join('')).toContain('THETAIL');
  });

  it('draws the THEME\'s art with the BOARD\'s codes when the theme adds a door to it', async () => {
    /*
     * Themes/607080/Conf/4/bull20.txt on the live board, in miniature: the
     * board's include plus a `~XI` the theme added.
     *
     * UNTIL 2026-09-18 THIS TOOK THE ARTIST'S LOGO AWAY TOO. A screen is a
     * head block of codes, a drawing and a tail block, and refusing the whole
     * file to refuse the codes threw out the half a theme is FOR: h7 was worn
     * on the live board and four of its screens went on showing the board's
     * art, three of them only because a code had been lost from the theme's
     * copy. The board's program is put back around the theme's drawing now -
     * the same splice the MCI carry makes on a replace.
     */
    write('Screens/BULL.TXT', '~f|BOARDLOGO\r\n~SS_BBS:Screens/tail.txt\r\n');
    write('Themes/t1/Board/BULL.TXT', '~f|THEMELOGO\r\n~SS_BBS:Screens/tail.txt\r\n~XISUBSCAN\r\n');
    write('Screens/tail.txt', 'THETAIL\r\n');
    invalidateScreenIndex();

    const { socket, session, emits } = aCaller();
    await displayScreen(socket, session, 'BULL', false);

    const drawn = emits.join('');
    // The artist's picture.
    expect(drawn).toContain('THEMELOGO');
    expect(drawn).not.toContain('BOARDLOGO');
    // The board's program, unchanged: its include ran...
    expect(drawn).toContain('THETAIL');
    // ...and the code the theme tried to add did not reach the caller.
    expect(drawn).not.toContain('SUBSCAN');
  });
});

describe('a board screen that is ALL program, worn by a theme that draws a logo', () => {
  it('draws the logo first, not after the last bulletin where the pause lands on it', async () => {
    /*
     * Live 2026-09-28: `Screens/BULL.TXT` is `~f|`, `~SS_ bull1 ~SP`,
     * `~SS_ bull6` and no drawing at all; tango's `Board/BULL.TXT` is a logo.
     * Every line of the board's file counted as its head, so the logo went
     * BELOW the whole program - under Super-AmiLog, right above the
     * `(Pause)` that ends the screen ("a logo draws before the pause in super
     * amilog", sysop). A board file with no drawing has no art slot of its
     * own; the theme's goes where a drawing sits in every other screen -
     * after the clear, before the first thing the program runs.
     */
    write('Screens/BULL.TXT', '~f|\r\n~SS_BBS:Screens/one.txt\r\n~SS_BBS:Screens/six.txt\r\n');
    write('Themes/t1/Board/BULL.TXT', 'THEMELOGO\r\n');
    write('Screens/one.txt', 'BULLETINONE\r\n');
    write('Screens/six.txt', 'SUPERAMILOG\r\n');
    invalidateScreenIndex();

    const { socket, session, emits } = aCaller();
    await displayScreen(socket, session, 'BULL', false);

    // Each include is its own segment and only the first is drawn here; the
    // logo has to be in front of it, not queued behind the last one.
    const drawn = emits.join('');
    expect(drawn).toContain('BULLETINONE');
    expect(drawn).toContain('THEMELOGO');
    expect(drawn.indexOf('THEMELOGO')).toBeLessThan(drawn.indexOf('BULLETINONE'));
  });
});

describe("h7's own case: a code the theme's copy has LOST", () => {
  it("draws the theme's art and still runs the code that is missing from it", async () => {
    /*
     * The live board, 2026-09-18: `Node/awaitscreen.txt` in the theme had no
     * `~CC_TELNET-FRONT`, `Node/logon20.txt` had lost the board's `~5SR_`
     * flash pool, `Node/Logoff.txt` picked from two logoff screens where the
     * board picks from three. Nothing about those is a theme trying to change
     * behaviour - they are files that went through an editor that could not
     * see the codes under the art. The art is the artist's, the program is
     * the board's, and a caller gets both.
     */
    write('Screens/BULL.TXT', '~f|BOARDLOGO\r\n~CC_gwall\r\n~SS_BBS:Screens/tail.txt\r\n');
    write('Themes/t1/Board/BULL.TXT', '~f|THEMELOGO\r\n~SS_BBS:Screens/tail.txt\r\n');
    write('Screens/tail.txt', 'THETAIL\r\n');
    invalidateScreenIndex();

    const { socket, session, emits } = aCaller();
    await displayScreen(socket, session, 'BULL', false);

    const drawn = emits.join('');
    expect(drawn).toContain('THEMELOGO');
    expect(drawn).not.toContain('BOARDLOGO');
    expect(drawn).toContain('THETAIL');
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
