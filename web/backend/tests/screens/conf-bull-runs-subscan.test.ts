/**
 * The join-time hook: `~XISUBSCAN` in a conference bulletin.
 *
 * This is the whole point of the SUBS work and it is one line in a text file,
 * with no code behind it at all. It is also the part most likely to be got
 * wrong, because THREE separate rules decide whether that line does anything,
 * and when it does nothing there is no error anywhere:
 *
 *   1. CONF_BULL resolves to a screen named BULL, not CONFBULL
 *      (screens/screen-tables.ts:146-147), in the conference's own directory.
 *   2. SECURITY-NUMBERED VARIANTS WIN. findSecurityScreen tries BULL<sec> from
 *      floor(secLevel/5)*5 downwards before plain BULL
 *      (utils/screen-security.util.ts:158-171). On this board the live files
 *      are `Conf<n>/bull20.txt`, so editing BULL.TXT changes nothing at all
 *      for any caller at level 20 or above.
 *   3. THE allowMCI GATE (screen.handler.ts:2100-2105, express.e:6800-6806).
 *      If the file's first line does not start with `~`, the file is displayed
 *      RAW - `commands = []` - and every MCI code in it, `~XI` included, is
 *      inert text that never runs.
 *
 * The board is not a fixture: these assert exact values, so the bulletins are
 * ones this file writes into a temp directory.
 */
process.env.TELNET_PORT = '0';
process.env.SSH_PORT = '0';
process.env.BACKEND_PORT = '0';
process.env.PORT = '0';
process.env.SKIP_SERVER_START = '1';
process.env.SKIP_DB_INIT = '1';

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const BOARD = fs.mkdtempSync(path.join(os.tmpdir(), 'amix-confbull-'));
process.env.BBS_ROOT = BOARD;
process.env.BBS_DATA_DIR = BOARD;

/**
 * REQUIRED, not imported. `import` is HOISTED above the `process.env`
 * assignments above, and src/config.ts:102 reads BBS_DATA_DIR ONCE, at module
 * load, into a singleton - so a static import here would resolve every screen
 * against the guard's per-worker temp board instead of this fixture, and the
 * bulletin would simply not be found.
 */
type ScreenHandler = typeof import('../../src/handlers/screen.handler');
let screens: ScreenHandler;
let flushOutput: typeof import('../../src/utils/output.util').flushOutput;

const CONF = 1;
const CONF_DIR = path.join(BOARD, `Conf${CONF}`);

/** The token a sysop adds, verbatim, exactly as the plan writes it. */
const TOKEN = '~XISUBSCAN';

function writeBulletin(name: string, body: string) {
  fs.mkdirSync(CONF_DIR, { recursive: true });
  fs.writeFileSync(path.join(CONF_DIR, name), body, 'latin1');
}

function clearBulletins() {
  if (!fs.existsSync(CONF_DIR)) return;
  for (const f of fs.readdirSync(CONF_DIR)) {
    if (/^bull/i.test(f)) fs.unlinkSync(path.join(CONF_DIR, f));
  }
}

function makeSession(secLevel = 20): any {
  return {
    user: { username: 'Sysop', name: 'Sysop', secLevel, location: 'Local' },
    currentConf: CONF,
    currentConfName: 'Amiga Chat',
    conferenceName: 'Amiga Chat',
    nodeId: 1,
    timeRemaining: 3600,
    slowmo: 0,
    slowmoCount: 0,
  };
}

function makeSocket(): { socket: any; emitted: string[] } {
  const emitted: string[] = [];
  const socket: any = {
    emit: (_event: string, payload: any) => { emitted.push(String(payload ?? '')); },
    on: () => {},
    removeAllListeners: () => {},
    id: `confbull-${Math.random()}`,
  };
  return { socket, emitted };
}

describe('a conference bulletin that runs the SUBS digest', () => {
  beforeAll(() => {
    /*
     * And RESET first. tests/setup.ts (setupFilesAfterEnv) imports
     * src/database, which pulls src/config in BEFORE this file's body runs -
     * so by the time the env above is set, the config singleton already holds
     * the guard's per-worker temp board and every screen lookup resolves
     * there. resetModules drops it so the require below builds a fresh one
     * against BBS_DATA_DIR.
     */
    jest.resetModules();
    screens = require('../../src/handlers/screen.handler');
    flushOutput = require('../../src/utils/output.util').flushOutput;
  });

  afterAll(() => {
    fs.rmSync(BOARD, { recursive: true, force: true });
  });

  beforeEach(() => {
    clearBulletins();
  });

  it("finds a THEME's copy of the bulletin, which is a security variant too", () => {
    /*
     * `CONF_BULL` is served as `bull20.txt` - BULL plus the caller's security
     * band - and the themed lookup asked for the SCREEN's name and then the
     * plain variations, so it found neither. Every themed conference bulletin
     * on this board therefore read as "the theme has no copy of this" and the
     * board's file was served, for every theme, since themes shipped. The live
     * board said it once the log was asked to name the reason: "skipping h7:
     * Conf/2: it has no CONF_BULL of its own", about a file that is right
     * there.
     *
     * The theme's ART is drawn with the BOARD's codes around it, so the digest
     * the board runs is still the board's.
     */
    writeBulletin('BULL20.TXT', `~f\r\nBOARDBULLETIN\r\n${TOKEN}\r\n`);
    fs.writeFileSync(path.join(BOARD, 'Themes.info'), [
      'TYPE.0=t1', 'TITLE.0=T1', 'DIR.0=Themes/t1', 'STATUS.0=live', 'WIDTHS.0=80', '',
    ].join('\n'), 'latin1');
    const themeConf = path.join(BOARD, 'Themes', 't1', 'Conf', String(CONF));
    fs.mkdirSync(themeConf, { recursive: true });
    fs.writeFileSync(path.join(themeConf, 'BULL20.TXT'),
      '~f\r\nTHEMEBULLETIN\r\n~SS_BBS:Screens/elsewhere.txt\r\n', 'latin1');

    const session = makeSession(20);
    session.user.screenTheme = 't1';
    const loaded = screens.loadScreenFile('CONF_BULL', CONF, 1, session);

    expect(loaded?.content).toContain('THEMEBULLETIN');
    expect(loaded?.content).not.toContain('BOARDBULLETIN');
    // The board's digest still runs; the theme's include does not.
    expect(loaded?.content).toContain(TOKEN);
    expect(loaded?.content).not.toContain('elsewhere.txt');
  });

  it('CONF_BULL resolves to BULL<sec> before BULL', () => {
    // Both on disk, and the one with the caller's security band wins. This is
    // why "I edited BULL.TXT and nothing happened" is the report to expect.
    writeBulletin('BULL.TXT', `~f\nthe plain one\n`);
    writeBulletin('BULL20.TXT', `~f\n${TOKEN}\nthe level-20 one\n`);

    const loaded = screens.loadScreenFile('CONF_BULL', CONF, 1, makeSession(20));
    expect(loaded).not.toBeNull();
    expect(path.basename(loaded!.filePath).toUpperCase()).toBe('BULL20.TXT');
    expect(loaded!.content).toContain(TOKEN);
  });

  it('a bulletin whose first line is ~ queues SUBSCAN and drops the token', async () => {
    const content = `~f\n${TOKEN}\nWelcome to the conference.\n`;
    const { parsed, commands } = await screens.parseMciCodes(content, makeSession(), 'AmiExpress-Web', 'Sysop');

    // The command is queued as a BBSCMD NAME - no ':' in it, which is what
    // screen.handler.ts:2422 uses to tell a command from a path.
    expect(commands).toContain('SUBSCAN');
    expect(commands.some((c: string) => c.includes(':'))).toBe(false);

    // And the token itself is gone from what the caller sees. The DOOR's own
    // output is NOT suppressed - doorSilent is initialised false at
    // XIMProtocol.ts:166 and never set true - which is exactly what the
    // three-line digest needs.
    expect(parsed).not.toContain('XISUBSCAN');
    expect(parsed).toContain('Welcome to the conference.');
  });

  it('a bulletin whose first line is not ~ leaves ~XISUBSCAN as inert text', async () => {
    // THE FAILURE MODE A SYSOP WOULD REPORT AS "the digest does nothing".
    // Driven through the real displayScreen so the gate itself is what is
    // being tested, not a copy of its expression.
    writeBulletin('BULL20.TXT', `Welcome to the conference.\n${TOKEN}\n`);

    const { socket, emitted } = makeSocket();
    await screens.displayScreen(socket, makeSession(20), 'CONF_BULL', false);
    flushOutput(socket);

    // Raw display: the token is printed as literal text and no command runs.
    expect(emitted.join('')).toContain(TOKEN);
  });

  it('the same bulletin with a ~ first line does not print the token', async () => {
    writeBulletin('BULL20.TXT', `~f\nWelcome to the conference.\n${TOKEN}\n`);

    const { socket, emitted } = makeSocket();
    await screens.displayScreen(socket, makeSession(20), 'CONF_BULL', false);
    flushOutput(socket);

    // The gate passed, the MCI pass stripped it, and the caller sees the
    // bulletin without the plumbing.
    expect(emitted.join('')).not.toContain('XISUBSCAN');
    expect(emitted.join('')).toContain('Welcome to the conference.');
  });
});
