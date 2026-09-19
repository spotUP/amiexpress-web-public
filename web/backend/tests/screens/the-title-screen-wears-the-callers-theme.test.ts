/**
 * THE SCREENS BEFORE LOGIN, AND THE THEME THE BROWSER REMEMBERS.
 *
 * "i switched to h7's theme on the live bbs, most screens show old ones"
 * (sysop, 2026-09-18). The live log named the reason for the title screen:
 * its search locations were `[ 'tango: Node', ... ]` - the BOARD DEFAULT -
 * because BBSTITLE is drawn in the pre-login sequence, where the session has
 * no user and `resolveCallerTheme` has nobody to ask.
 *
 * "we save cookies so it should remember the theme". So the terminal keeps the
 * resolved slug in a cookie, the handshake carries it, and the board asks the
 * SAME judge with it - which is what keeps a draft theme out of a stranger's
 * title screen.
 */
process.env.SKIP_DB_INIT = '1';

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { BBSState } from '../../src/constants/bbs-states';
import { loadScreenFile } from '../../src/handlers/screen.handler';
import { rememberedTheme } from '../../src/screens/remembered-theme';
import { clearThemeRegistryCache } from '../../src/screens/theme-registry';
import { invalidateScreenIndex } from '../../src/screens/screen-index.service';
import { config } from '../../src/config';

let root: string;
let previousDataDir: string;

const write = (rel: string, body: string) => {
  fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
  fs.writeFileSync(path.join(root, rel), body, 'latin1');
};

/** A caller the board has NOT identified yet - the pre-login session. */
const aStranger = (preLoginTheme?: string): any => ({
  nodeId: 1, state: BBSState.LOGON, currentConf: 1,
  ansiEnabled: true, screenHeight: 24, screenWidth: 80,
  preLoginTheme, tempData: {},
});

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'pre-login-theme-'));
  previousDataDir = config.get('dataDir');
  config.set('dataDir', root);
  fs.writeFileSync(path.join(root, 'ConfConfig.info'), '');
  fs.writeFileSync(path.join(root, 'Themes.info'), [
    'TYPE.0=tango', 'TITLE.0=Tango', 'DIR.0=Themes/tango', 'STATUS.0=live', 'WIDTHS.0=80',
    'TYPE.1=h7', 'TITLE.1=H7', 'DIR.1=Themes/h7', 'OWNER.1=h7', 'STATUS.1=live', 'WIDTHS.1=80',
    'TYPE.2=wip', 'TITLE.2=WIP', 'DIR.2=Themes/wip', 'OWNER.2=someone', 'STATUS.2=draft', 'WIDTHS.2=80',
    'DEFAULT=tango', '',
  ].join('\n'), 'latin1');

  write('Node1/BBSTITLE.txt', 'THEBOARDTITLE\r\n');
  write('Themes/tango/Node/BBSTITLE.txt', 'TANGOTITLE\r\n');
  write('Themes/h7/Node/BBSTITLE.txt', 'H7TITLE\r\n');
  write('Themes/wip/Node/BBSTITLE.txt', 'WIPTITLE\r\n');
  clearThemeRegistryCache();
  invalidateScreenIndex();
});
afterEach(() => {
  config.set('dataDir', previousDataDir);
  fs.rmSync(root, { recursive: true, force: true });
  clearThemeRegistryCache();
  invalidateScreenIndex();
});

describe('the title screen a returning caller is shown', () => {
  it('is the board default when the browser remembers nothing', () => {
    expect(loadScreenFile('BBSTITLE', 1, 1, aStranger())?.content).toContain('TANGOTITLE');
  });

  it('is the theme the browser remembers, before anyone has logged in', () => {
    expect(loadScreenFile('BBSTITLE', 1, 1, aStranger('h7'))?.content).toContain('H7TITLE');
  });

  it('refuses a DRAFT theme named in a cookie - nobody has proved they own it', () => {
    const drawn = loadScreenFile('BBSTITLE', 1, 1, aStranger('wip'))?.content ?? '';

    expect(drawn).not.toContain('WIPTITLE');
    expect(drawn).toContain('TANGOTITLE');
  });

  it('a theme that is no longer registered falls back, it does not blank the screen', () => {
    expect(loadScreenFile('BBSTITLE', 1, 1, aStranger('retired'))?.content).toContain('TANGOTITLE');
  });

  it("the caller's own preference wins once they have logged in", () => {
    const session = aStranger('tango');
    session.user = { username: 'h7', secLevel: 255, screenTheme: 'h7' };

    expect(loadScreenFile('BBSTITLE', 1, 1, session)?.content).toContain('H7TITLE');
  });
});

describe('the cookie itself', () => {
  it('reads the slug out of a handshake cookie header', () => {
    expect(rememberedTheme('bbs_font=topaz; bbs_screen_theme=h7; bbs_modem_speed=19200')).toBe('h7');
  });

  it('answers null for no cookie, and for one that is not a slug', () => {
    expect(rememberedTheme(undefined)).toBeNull();
    expect(rememberedTheme('bbs_screen_theme=')).toBeNull();
    // A path is not a theme name: the registry lookup would fail anyway, and
    // a slug check keeps a traversal attempt from reaching it at all.
    expect(rememberedTheme('bbs_screen_theme=../../etc/passwd')).toBeNull();
  });
});
