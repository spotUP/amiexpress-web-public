/**
 * The U command offers the caller his partial uploads, as express does.
 *
 * express runs `zresume := resumeStuff()` before the receive (express.e:19018),
 * on the uLFType=0 path - which is the U command. This port had it exactly
 * INVERTED: the RZ handler called resumeStuff (noting in a comment that this
 * was a deliberate divergence, since RZ is the de-facto entry point on
 * telnet/SSH) and U, the command express actually offers partials from, did
 * not call it at all.
 *
 * It matters now in a way it did not before: `cleanPlayPen` had no callers, so
 * `<conf>/PartUpload/` was always empty and resumeStuff had nothing to offer
 * whoever asked. With aborted uploads filed there, a caller who reconnects and
 * types U is offered the rest of his transfer instead of sending it again.
 */
process.env.SKIP_DB_INIT = '1';
process.env.SKIP_SERVER_START = '1';

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

describe('starting an upload with U', () => {
  function uploadModule() {
    jest.resetModules();
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'upload-board-'));
    process.env.BBS_ROOT = root;
    process.env.BBS_DATA_DIR = root;

    const startResumeStuff = jest.fn();
    jest.doMock('../../src/services/resume-stuff.service', () => ({
      startResumeStuff,
      // The real module exports more; the upload path only calls this one.
      ...jest.requireActual('../../src/services/resume-stuff.service'),
      startResumeStuff,
    }));

    const handler = require('../../src/handlers/commands/user-commands.handler');
    return { handler, startResumeStuff, root };
  }

  function socket() {
    return {
      id: 'u', emit: jest.fn(),
      on: jest.fn(function (this: unknown) { return this; }),
      join: jest.fn(function (this: unknown) { return this; }),
    } as any;
  }

  it('asks about partial uploads before receiving anything', () => {
    const { handler, startResumeStuff } = uploadModule();
    const session: any = { nodeId: 1, currentConf: 1, tempData: {}, user: { slotNumber: 3, username: 'spot' } };

    handler.startZmodemUpload(socket(), session);

    expect(startResumeStuff).toHaveBeenCalledTimes(1);
  });

  it('hands it the node playpen the receive will use', () => {
    const { handler, startResumeStuff } = uploadModule();
    const session: any = { nodeId: 4, currentConf: 1, tempData: {}, user: { slotNumber: 3, username: 'spot' } };

    handler.startZmodemUpload(socket(), session);

    const playpen = startResumeStuff.mock.calls[0][2] as string;
    expect(playpen).toContain('Node4');
  });

  it('does not start the receive until the resume step reports back', () => {
    // The whole point of the callback: express asks first, receives after.
    const { handler, startResumeStuff } = uploadModule();
    const session: any = { nodeId: 1, currentConf: 1, tempData: {}, user: { slotNumber: 3, username: 'spot' } };
    const s = socket();

    handler.startZmodemUpload(s, session);

    const output = s.emit.mock.calls
      .filter((c: unknown[]) => c[0] === 'ansi-output')
      .map((c: unknown[]) => String(c[1]))
      .join('');
    expect(output).not.toContain('Ready to receive');
    expect(typeof startResumeStuff.mock.calls[0][4]).toBe('function');
  });
});
