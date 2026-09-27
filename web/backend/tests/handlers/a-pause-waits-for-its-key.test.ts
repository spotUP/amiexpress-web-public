/**
 * "Space To Resume" waits for the key before anything after it runs.
 *
 * express.e's doPause() blocks (express.e:5143-5149), and any key resumes.
 * Two ways the port broke that, found walking D over telnet (2026-09-27):
 *
 *   - D showed DOWNLOADMSG, called doPause and carried straight on: the
 *     stats and "Filespec(1):" were printed under the pause before any key.
 *   - A doPause gate read `N` as More(y/n/ns)'s abort and threw itself away
 *     WITHOUT its continuation, so whatever waited on the pause never ran.
 */
process.env.SKIP_DB_INIT = '1';

jest.mock('../../src/handlers/screen.handler', () => {
  const actual = jest.requireActual('../../src/handlers/screen.handler');
  return { ...actual, displayScreen: jest.fn(async () => true) };
});

import { doPause, handlePaginatedScreenInput } from '../../src/handlers/screen.handler';
import { DownloadHandler } from '../../src/handlers/file/download.handler';

function aCaller() {
  const out: string[] = [];
  const socket: any = { id: `pause-waits-${Math.random()}`, emit: (_e: string, d: unknown) => { out.push(String(d)); return true; }, on: () => {} };
  const session: any = {
    nodeId: 1, currentConf: 1, tempData: {}, subState: 'process_command',
    user: { id: 'u1', username: 'sysop', secLevel: 255, uploads: 0, downloads: 0 },
  };
  return { socket, session, out };
}

describe('a Space To Resume pause', () => {
  it('runs what waits on it whatever key answers it - N included', async () => {
    const { socket, session } = aCaller();
    let resumed = false;
    doPause(socket, session, () => { resumed = true; });

    await handlePaginatedScreenInput(socket, session, 'N');

    expect(resumed).toBe(true);
  });
});

describe('D after the download screen', () => {
  it('prints nothing more until the pause is answered', async () => {
    const { socket, session, out } = aCaller();
    const running = DownloadHandler.handleDownloadCommand(socket, session, '');
    await new Promise((r) => setTimeout(r, 50));

    const before = out.join('');
    expect(before).toMatch(/Space To Resume/);
    expect(before).not.toMatch(/Filespec/);

    await handlePaginatedScreenInput(socket, session, '\r');
    await running;
    expect(out.join('')).toMatch(/Filespec\(1\)/);
  });
});
