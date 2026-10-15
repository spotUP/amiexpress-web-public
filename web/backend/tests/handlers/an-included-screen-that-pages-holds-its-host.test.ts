/**
 * An included screen that pages holds the screen that included it.
 *
 * express.e's displayFile stops inside its own checkForPause, so a host
 * screen goes on only after the caller answers the include's More. Here the
 * include installed its gate and returned, and the host drew the rest of its
 * text straight under "(Pause)...More(y/n/ns)?": LOGON's `~SS_quicknew.txt`
 * paged at 25 lines, the art after it landed below the prompt, and the board
 * then waited on a prompt the caller could not see (walked over telnet,
 * 2026-09-27).
 */
process.env.SKIP_DB_INIT = '1';

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { parseMciCodes, handlePaginatedScreenInput } from '../../src/handlers/screen.handler';
import { flushOutput } from '../../src/utils/output.util';
import { config } from '../../src/config';

function aCaller() {
  const out: string[] = [];
  const socket: any = {
    id: `include-pages-${Math.random().toString(36).slice(2)}`,
    emit: (_e: string, d: unknown) => { if (typeof d === 'string') out.push(d); return true; },
    on: () => {},
  };
  const session: any = {
    user: { username: 'sysop', secLevel: 255 }, nodeId: 1, currentConf: 1, currentConfName: 'Main',
    timeRemaining: 3600, slowmo: 0, slowmoCount: 0, screenHeight: 24,
  };
  return { socket, session, out };
}

const wire = (out: string[]) => out.join('');
const tick = (ms = 60) => new Promise((r) => setTimeout(r, ms));

describe('a host screen including a file too long for one page', () => {
  const original = config.get('dataDir');
  beforeEach(() => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'include-pages-'));
    fs.mkdirSync(path.join(root, 'Screens'), { recursive: true });
    const long = Array.from({ length: 30 }, (_, i) => `LINE ${i + 1}`).join('\r\n') + '\r\n';
    fs.writeFileSync(path.join(root, 'Screens', 'long.txt'), long, 'latin1');
    config.set('dataDir', root);
  });
  afterEach(() => config.set('dataDir', original));

  it('does not draw what follows the include until the More is answered', async () => {
    const { socket, session, out } = aCaller();
    const running = parseMciCodes('~\r\n~SS_BBS:Screens/long.txt\r\nAFTER\r\n', session, undefined, undefined, undefined, socket);
    await tick();
    flushOutput(socket);

    expect(wire(out)).toMatch(/More\(y\/n\/ns\)/);
    expect(wire(out)).not.toContain('AFTER');

    await handlePaginatedScreenInput(socket, session, '\r');
    await running;
    flushOutput(socket);
    expect(wire(out)).toContain('LINE 30');
    expect(wire(out)).toContain('AFTER');
  });

  it('goes on to the host\'s own text when the caller answers N', async () => {
    const { socket, session, out } = aCaller();
    const running = parseMciCodes('~\r\n~SS_BBS:Screens/long.txt\r\nAFTER\r\n', session, undefined, undefined, undefined, socket);
    await tick();

    await handlePaginatedScreenInput(socket, session, 'N');
    await running;
    flushOutput(socket);
    expect(wire(out)).not.toContain('LINE 30');
    expect(wire(out)).toContain('AFTER');
  });
});
