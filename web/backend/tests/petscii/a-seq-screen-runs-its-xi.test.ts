/**
 * A `.seq` screen runs its `~XI` the way a `.txt` one does. The PETSCII
 * pre-pass took `~XISUBSCAN` out of the art and nobody ran it, so the join
 * bulletin's SUBSCAN digest never reached a C64 caller; the ANSI bull20 ran
 * it. Driven through displayScreen, the function the join calls.
 */
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';

process.env.SKIP_DB_INIT = '1';

const processCommand = jest.fn(async () => true);
jest.mock('../../src/handlers/command.handler', () => ({
  processCommand: (...a: unknown[]) => (processCommand as any)(...a),
}));

import { displayScreen } from '../../src/handlers/screen.handler';

function writeSeq(bytes: Buffer): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'seq-xi-'));
  const file = path.join(dir, 'BULL20.SEQ');
  fs.writeFileSync(file, bytes);
  return file;
}

const socket = () => ({ id: `seq-xi-${Math.random()}`, emit: () => true, on: () => undefined }) as any;
const session = (): any => ({ petsciiMode: true, nodeId: 0, currentConf: 1, currentConfName: 'Amiga', user: { username: 'spot' } });

test('a C64 bulletin runs its ~XISUBSCAN line', async () => {
  const s = session();
  const file = writeSeq(Buffer.concat([Buffer.from([0x7e, 0x20, 0x0e]), Buffer.from('HI\r~XISUBSCAN\r', 'latin1')]));

  expect(await displayScreen(socket(), s, file)).toBe(true);
  await s.pendingScreenCommand;

  expect(processCommand).toHaveBeenCalledWith(expect.anything(), s, 'SUBSCAN', '', true);
});

test('a .seq that pauses keeps its ~XI for after the pause', async () => {
  const s = session();
  const file = writeSeq(Buffer.from('~ HI~SP~XISUBSCAN\r', 'latin1'));
  processCommand.mockClear();

  await displayScreen(socket(), s, file);

  expect(s.queuedScreenCommands).toEqual(['SUBSCAN']);
  expect(processCommand).not.toHaveBeenCalled();
});
