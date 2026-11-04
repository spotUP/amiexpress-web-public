/**
 * A TELNET CALLER GETS NO BLANK SCREEN BEFORE EVERY SCREEN.
 *
 * "when i connect to telnet, a blank screen is drawn before all screens"
 * (the sysop, 2026-11-04). The clear every caller got was thirty CRLFs and a
 * home, which on a real terminal scrolls a whole empty page past before the
 * art arrives. The sysop chose: telnet and SSH get the real clear, the web
 * terminal keeps the scrolling one for its history.
 *
 * The live BULL.TXT opens with its own `~f`, and BULL is also on the list of
 * screens the board clears for, so the caller got the clear twice in a row
 * (wire capture, 2026-11-04: CRLF x31, home, CRLF x30, home, CRLF, ESC[2J).
 * A screen that clears itself does not need the board to do it first.
 *
 * Drives displayScreen on a scratch board and reads the bytes on the wire.
 */
process.env.SKIP_DB_INIT = '1';

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { displayScreen } from '../../src/handlers/screen.handler';
import { flushOutput } from '../../src/utils/output.util';
import { invalidateScreenIndex } from '../../src/screens/screen-index.service';
import { ANSI } from '../../src/constants/ansi-codes';
import { SCROLL_CLEAR_LINES, clearScreenFor } from '../../src/utils/ansi.util';

const HARD_CLEAR = ANSI.CLEAR_SCREEN;
const SCROLL_CLEAR = '\r\n'.repeat(SCROLL_CLEAR_LINES) + '\x1b[H';

const countOf = (haystack: string, needle: string) => haystack.split(needle).length - 1;

describe('the clear a caller gets, by transport', () => {
  it('is the real clear on telnet and SSH', () => {
    expect(clearScreenFor({ connectionType: 'telnet' })).toBe(HARD_CLEAR);
    expect(clearScreenFor({ connectionType: 'ssh' })).toBe(HARD_CLEAR);
  });

  it('stays the scrolling clear on the web terminal, which keeps a history', () => {
    expect(clearScreenFor({ connectionType: 'web' })).toBe(SCROLL_CLEAR);
  });
});

describe('a screen on the wire', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { config } = require('../../src/config');
  let oldDataDir = '';
  let board = '';

  beforeEach(() => {
    board = fs.mkdtempSync(path.join(os.tmpdir(), 'telnet-clear-'));
    fs.mkdirSync(path.join(board, 'Screens'), { recursive: true });
    oldDataDir = config.getConfig().dataDir;
    config.set('dataDir', board);
    invalidateScreenIndex();
  });

  afterEach(() => {
    config.set('dataDir', oldDataDir);
    fs.rmSync(board, { recursive: true, force: true });
    invalidateScreenIndex();
  });

  async function wireOf(screen: string, body: string, connectionType: 'web' | 'telnet', file = `${screen}.TXT`) {
    fs.writeFileSync(path.join(board, 'Screens', file), body);
    const bytes: string[] = [];
    const socket: any = {
      id: `telnet-clear-${Math.random().toString(36).slice(2)}`,
      on: jest.fn(),
      emit: (event: string, data: unknown) => {
        if (event === 'ansi-output' && typeof data === 'string') bytes.push(data);
        return true;
      },
    };
    socket.session = {
      connectionType, user: { username: 'T', secLevel: 100, expert: 'X' }, tempData: {},
      screenWidth: 80, screenHeight: 24, nodeId: 1, currentConf: 1, relConfNum: 1,
      subState: 'READ_COMMAND', slowmo: 0, slowmoCount: 0, ansiEnabled: true,
    };
    await displayScreen(socket, socket.session, screen, true, /* silent */ true);
    flushOutput(socket);
    return bytes.join('');
  }

  const beforeArt = (wire: string) => wire.slice(0, wire.indexOf('ART'));

  it('reaches a telnet caller with no scrolled lines and one clear', async () => {
    const lead = beforeArt(await wireOf('BULL', 'ART\r\n', 'telnet'));

    expect(lead.startsWith(HARD_CLEAR)).toBe(true);
    expect(countOf(lead, HARD_CLEAR)).toBe(1);
    expect(lead).not.toContain('\r\n');
  });

  it('clears once when the screen opens with its own ~f, as the live BULL.TXT does', async () => {
    const wire = await wireOf('BULL', '~f|\r\nART\r\n', 'telnet');

    expect(wire).toContain('ART');
    expect(countOf(beforeArt(wire), HARD_CLEAR)).toBe(1);
    expect(beforeArt(wire)).not.toContain('\r\n\r\n');
  });

  it('scrolls a web caller once, not twice, for the same screen', async () => {
    const lead = beforeArt(await wireOf('BULL', '~f|\r\nART\r\n', 'web'));

    expect(countOf(lead, SCROLL_CLEAR)).toBe(1);
    expect(lead).not.toContain(HARD_CLEAR);
  });

  it('keeps a web caller history when a tall screen opens with ~f', async () => {
    // Too tall for the caller, so it pages: outside the inline walker, where
    // ~f on its own renders as the hard clear and would erase the history.
    const lead = beforeArt(await wireOf('BULL', '~f|\r\n' + 'ART\r\n'.repeat(40), 'web'));

    expect(countOf(lead, SCROLL_CLEAR)).toBe(1);
    expect(lead).not.toContain(HARD_CLEAR);
  });

  /*
   * "i can still see the up rough logo from the prior screen its not cleared"
   * (the sysop, 2026-11-04). QuickNew's quicknew.txt opens with a cursor hide
   * and THEN its Amiga form feed. Only a form feed at byte 0 was read as a
   * clear, so this one went out raw, a terminal took it for a line feed, and
   * the list drew over the logo, whose pause prompt stayed behind as a second
   * "Space To Resume".
   */
  // The live logon20.txt reaches the file by this assign path.
  const quickNewWire = (connectionType: 'web' | 'telnet') => wireOf(
    'BBS:screens/quicknew.txt', '\x1b[?25l\x0c\r\nART\r\n', connectionType, 'quicknew.txt');

  it('clears for a form feed behind the opening escape codes, as quicknew.txt has', async () => {
    const wire = await quickNewWire('telnet');

    expect(countOf(beforeArt(wire), HARD_CLEAR)).toBe(1);
    expect(beforeArt(wire)).toContain('\x1b[?25l');
    expect(wire).not.toContain('\x0c');
  });

  it('keeps a web caller history when the file clears itself with a form feed', async () => {
    const lead = beforeArt(await quickNewWire('web'));

    expect(countOf(lead, SCROLL_CLEAR)).toBe(1);
    expect(lead).not.toContain(HARD_CLEAR);
  });

  it('does not stack the form feed on the clear a clearing screen already got', async () => {
    const wire = await wireOf('BULL', '\x0c\r\nART\r\n', 'telnet');

    expect(countOf(beforeArt(wire), HARD_CLEAR)).toBe(1);
    expect(wire).not.toContain('\x0c');
  });
});
