/**
 * A screen the board does not have is shown as nothing, to anyone.
 *
 * express.e's displayScreen (6539-6655) answers FALSE for a missing file and
 * prints nothing. The port also called notifySysop, which writes to the
 * session's own socket - so every caller, not a sysop, read a red
 * "Screen not found: <NAME>" wherever a non-silent screen was missing.
 */
process.env.SKIP_DB_INIT = '1';

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { config } from '../../src/config';
import { displayScreen } from '../../src/handlers/screen.handler';
import { flushOutput } from '../../src/utils/output.util';

test('a missing non-silent screen puts nothing on the caller\'s screen', async () => {
  const previous = config.get('dataDir');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'missing-screen-'));
  fs.mkdirSync(path.join(root, 'Screens'), { recursive: true });
  config.set('dataDir', root);
  const wire: string[] = [];
  const socket: any = {
    id: `missing-screen-${Math.random().toString(36).slice(2)}`,
    emit: (_e: string, data: unknown) => { if (typeof data === 'string') wire.push(data); return true; },
    on: () => socket,
  };
  const session: any = { socket, nodeId: 1, currentConf: 1, user: { username: 'caller', secLevel: 10 } };
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
  try {
    expect(await displayScreen(socket, session, 'NOSUCHSCREEN', false, false)).toBe(false);
    flushOutput(socket);
    expect(wire.join('')).not.toContain('Screen not found');
  } finally {
    config.set('dataDir', previous);
    fs.rmSync(root, { recursive: true, force: true });
    jest.restoreAllMocks();
  }
});
