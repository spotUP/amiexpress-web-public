/**
 * A BULLETIN IS DRAWN ONCE.
 *
 * "two exact same super-amilog screens, one drew then quickly cleared and the
 * next landed with a prompt" - months of it, and on 2026-09-16 "it happens
 * when i select it in the bulls door as well", which took every include and
 * theme out of the question: it is how the board RENDERS this one file.
 *
 * The file is the board's own Bulletins/bull6.txt as SAmiLog writes it: it
 * opens with `~f`, carries 170 colour codes, eleven `ESC[nC` cursor-rights
 * and one `ESC[75D ESC[B` pair for its two-line legend. Nothing in it is
 * drawn twice on the way in; whatever goes out twice was added by the board.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { displayScreen } from '../../src/handlers/screen.handler';
import { config } from '../../src/config';

/**
 * FROZEN at 38 rows as the board shipped it (a922a780f): the live file is
 * rewritten at every logoff and fitted to the screen since SamiLogService
 * learned fitRows, so read live it stopped paging - and the paged case is the
 * one the sysop reported (RULES.md, "The board is not a fixture").
 */
const SAMILOG = fs.readFileSync(path.join(__dirname, '..', 'fixtures', 'board-screens', 'bulletins-bull6-samilog.txt'));

function socketDouble() {
  const out: string[] = [];
  return {
    out,
    socket: {
      id: `once-${Math.random().toString(36).slice(2)}`,
      on: () => {}, off: () => {}, removeListener: () => {},
      emit: (event: string, payload: any) => {
        if (event === 'ansi-output' && typeof payload === 'string') out.push(payload);
        return true;
      },
    } as any,
  };
}

const ansi = (screenHeight = 24): any => ({
  nodeId: 1, petsciiMode: false, screenWidth: 80, screenHeight, user: { securityLevel: 255 },
});

let root: string;
let previousRoot: any;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'drawn-once-'));
  fs.mkdirSync(path.join(root, 'Bulletins'), { recursive: true });
  fs.mkdirSync(path.join(root, 'Screens'), { recursive: true });
  fs.writeFileSync(path.join(root, 'Bulletins', 'bull6.txt'), SAMILOG);
  fs.writeFileSync(path.join(root, 'Screens', 'BULL.TXT'), '~f|\n~SS_BBS:Bulletins/bull6.txt\n', 'latin1');
  previousRoot = config.get('dataDir');
  (config as any).set?.('dataDir', root);
});

afterEach(() => {
  if (previousRoot !== undefined) (config as any).set?.('dataDir', previousRoot);
  fs.rmSync(root, { recursive: true, force: true });
});

const count = (haystack: string, needle: string): number => haystack.split(needle).length - 1;

describe('Super-AmiLog, through the board', () => {
  it('goes out once when shown as the BULL step', async () => {
    const { socket, out } = socketDouble();
    await displayScreen(socket, ansi(), 'BULL', false);
    const wire = out.join('');

    expect(count(wire, 'lAST cALLERS')).toBe(1);
    expect(count(wire, 'Super-AmiLog')).toBe(1);
  });

  it('goes out once when shown as a file on its own, as the bulls door shows it', async () => {
    const { socket, out } = socketDouble();
    await displayScreen(socket, ansi(), 'BBS:Bulletins/bull6.txt', false);
    const wire = out.join('');

    expect(count(wire, 'lAST cALLERS')).toBe(1);
    expect(count(wire, 'Super-AmiLog')).toBe(1);
  });

  it('clears the screen once, not once per copy', async () => {
    const { socket, out } = socketDouble();
    await displayScreen(socket, ansi(), 'BBS:Bulletins/bull6.txt', false);
    const wire = out.join('');

    // Wherever the art appears, no clear may come AFTER it - that is the
    // "drew then quickly cleared" the sysop watches every login.
    const art = wire.indexOf('lAST cALLERS');
    const clearsAfterArt = count(wire.slice(art), '\x1b[2J');
    expect(clearsAfterArt).toBe(0);
  });
});

/**
 * THE SYSOP'S SCROLLBACK, live, 2026-09-16, after B then 6:
 *
 *      _______      _             · lAST cALLERS ·       _   ...   Mo!/aC!
 *     |     _/______\_______________________  _________  /_______| |    _|
 *
 *              ___________  _____  ______  ______  __________  ___________
 *                                                                 _______
 *      _______      _             · lAST cALLERS ·       _   ...   Mo!/aC!
 *     ...the whole screen...
 *     (Pause)...More(y/n/ns)?
 *
 * Two rows of the art, then the art again in full, ending in the PAGINATION
 * prompt. A file that paginates goes out twice: once because `~f` at its top
 * puts the walker in inline mode and it starts emitting, and once more as
 * page one. The screen must be short enough to page for it to show, which
 * is why a 24-row test saw it once and a caller saw it twice.
 */
describe('Super-AmiLog on a screen it does not fit', () => {
  it('still goes out once, as page one, and not as a false start before it', async () => {
    const { socket, out } = socketDouble();
    await displayScreen(socket, ansi(20), 'BBS:Bulletins/bull6.txt', false);
    const wire = out.join('');

    expect(count(wire, 'lAST cALLERS')).toBe(1);
  });
});
