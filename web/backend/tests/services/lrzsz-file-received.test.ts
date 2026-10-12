/**
 * express.e hands a received file to the background file check the moment the
 * file is whole (xprfclose 13921, zmuploadcompleted 16825 -> doBgCheck), while
 * the transfer is still running. The port only learned what rz had received
 * after rz exited, so there was nothing to start a background check on.
 *
 * A stand-in `rz` (a shell script) announces files on stderr as lrzsz does.
 */
process.env.SKIP_DB_INIT = '1';

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { LrzszTransferManager } from '../../src/services/lrzsz-transfer.service';

describe('a file received by rz is reported when it is whole, while rz goes on', () => {
  let dir: string;
  beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lrzsz-recv-')); });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  function fakeRz(body: string): string {
    const bin = path.join(dir, 'fake-rz.sh');
    fs.writeFileSync(bin, `#!/bin/sh\n${body}\n`, { mode: 0o755 });
    return bin;
  }

  function run(binary: string): Promise<{ events: string[] }> {
    const playpen = path.join(dir, 'Playpen');
    fs.mkdirSync(playpen);
    const events: string[] = [];
    return new Promise((resolve) => {
      const manager = new LrzszTransferManager({
        session: { nodeId: 1 } as never,
        transport: { type: 'ssh', send: () => undefined },
        direction: 'upload',
        paths: [playpen],
        binary,
        onFileReceived: (full) => events.push(`file:${path.basename(full)}:${fs.readFileSync(full, 'utf8').trim()}`),
        onComplete: () => { events.push('complete'); resolve({ events }); },
      });
      manager.start();
    });
  }

  it('reports each file once, in order, before the transfer completes', async () => {
    const bin = fakeRz([
      'echo "Receiving: ONE.TXT" >&2', 'echo one > ONE.TXT', 'sleep 0.4',
      'echo "Receiving: TWO.TXT" >&2', 'echo two > TWO.TXT', 'sleep 0.4',
    ].join('\n'));
    const { events } = await run(bin);
    expect(events).toEqual(['file:ONE.TXT:one', 'file:TWO.TXT:two', 'complete']);
  }, 20_000);

  it('does not report a file rz was still receiving when it failed', async () => {
    const bin = fakeRz([
      'echo "Receiving: ONE.TXT" >&2', 'echo one > ONE.TXT', 'sleep 0.4',
      'echo "Receiving: TWO.TXT" >&2', 'echo partial > TWO.TXT', 'sleep 0.4',
      'exit 1',
    ].join('\n'));
    const { events } = await run(bin);
    expect(events).toEqual(['file:ONE.TXT:one', 'complete']);
  }, 20_000);
});
