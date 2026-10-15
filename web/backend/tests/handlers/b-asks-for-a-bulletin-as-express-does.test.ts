/**
 * B's "Which Bulletin" answer (express.e:24636-24655): Val() of what was
 * typed - a word is bulletin 0 - and "Sorry there is no bulletin #n" with no
 * line break of the port's own before it (lineInput's is printed on Enter).
 * The port invented "Invalid bulletin number" and doubled the breaks.
 */
process.env.SKIP_DB_INIT = '1';

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { config } from '../../src/config';
import { handleBulletinInput, setDisplayFileCommandsDependencies } from '../../src/handlers/commands/display-file-commands.handler';

test('a word is bulletin 0, said as express.e says it', () => {
  const previous = config.get('dataDir');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'b-word-'));
  config.set('dataDir', root);
  const wire: string[] = [];
  const socket: any = { id: 'b', emit: (_e: string, d: unknown) => { wire.push(String(d)); return true; }, on: () => socket };
  const session: any = { nodeId: 1, currentConf: 1, user: { secLevel: 10 }, bulletinContext: {} };
  // No bulletin screens on this board: the security-screen lookup finds none.
  setDisplayFileCommandsDependencies({
    displayScreen: jest.fn() as any, findSecurityScreen: (() => null) as any, confScreenDir: '', db: {}, hasKeysFile: () => false,
  });
  try {
    handleBulletinInput(socket, session, 'abc');
    const out = wire.join('');
    expect(out).not.toContain('Invalid bulletin number');
    expect(out.startsWith('\r\nSorry there is no bulletin #0\r\n\r\nWhich Bulletin (?)=List, (Enter)=none? ')).toBe(true);
  } finally {
    config.set('dataDir', previous);
    fs.rmSync(root, { recursive: true, force: true });
  }
});
