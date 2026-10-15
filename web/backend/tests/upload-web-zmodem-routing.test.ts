/**
 * Regression: U command on web clients must route through ZMODEM via
 * `startZmodemUpload`, not the dead HTTP-picker `show-file-upload`
 * path.
 *
 * Why this regression exists:
 *   Phase 4 ZMODEM unification (c67e50385) removed the BBS-user branch
 *   of `processFileUpload` in file-socket-handlers.ts. After that
 *   cleanup, any code path that still emitted `show-file-upload` →
 *   POST /api/upload → `file-upload-ready` would silently drop the
 *   uploaded file in `processFileUpload` (logged "unexpected
 *   invocation… Ignoring."). The frontend then waited forever for the
 *   next `show-file-upload` event and the UI appeared stuck after
 *   picking the first file in a batch.
 *
 *   `startBatchUploadTransfer` previously had a transport-gated branch
 *   that only ran ZMODEM for telnet/SSH and fell through to the dead
 *   HTTP-picker path for web.
 *
 * Driven through the real `handleCommand` at the "Okay:" prompt, on every
 * transport: the key that starts the transfer must reach `startZmodemUpload`
 * (recorded, not run) and nothing may put `show-file-upload` on the socket.
 */
process.env.SKIP_DB_INIT = '1';

const startZmodemUpload = jest.fn();
jest.mock('../src/handlers/commands/user-commands.handler', () => ({
  ...jest.requireActual('../src/handlers/commands/user-commands.handler'),
  startZmodemUpload: (...args: any[]) => startZmodemUpload(...args),
}));

import { handleCommand } from '../src/handlers/command.handler';
import { BBSState, LoggedOnSubState } from '../src/index';

let n = 0;
function atTheOkayPrompt(connectionType: string) {
  const events: string[] = [];
  const socket = {
    id: `zmodem-routing-${++n}`,
    emit: (event: string) => { events.push(event); return true; },
    on: () => {}, off: () => {}, removeListener: () => {},
  } as any;
  const session: any = {
    state: BBSState.LOGGEDON,
    subState: LoggedOnSubState.UPLOAD_OKAY_CONFIRM,
    connectionType,
    nodeId: 1,
    currentConf: 1,
    user: { id: 1, username: 'spot', secLevel: 100 },
    tempData: { uploadMode: true, uploadBatch: [], uploadCount: 1 },
  };
  return { socket, session, events };
}

describe('U-command web routing through ZMODEM (no HTTP picker)', () => {
  beforeEach(() => startZmodemUpload.mockReset());

  test.each(['web', 'telnet', 'ssh'])('%s: Enter at Okay hands the transfer to ZMODEM, never to the HTTP picker', async (transport) => {
    const { socket, session, events } = atTheOkayPrompt(transport);

    await handleCommand(socket, session, '\r');

    expect(startZmodemUpload).toHaveBeenCalledTimes(1);
    expect(startZmodemUpload.mock.calls[0][1]).toBe(session);
    expect(events).not.toContain('show-file-upload');
  });

  test('G sets goodbyeAfterTransfer before the hand-off (express.e:25657 parity)', async () => {
    // runPostUpload reads it to honour express.e modemOffHook().
    const { socket, session } = atTheOkayPrompt('web');
    let atHandOff: unknown;
    startZmodemUpload.mockImplementation((_s: any, sess: any) => { atHandOff = sess.tempData.goodbyeAfterTransfer; });

    await handleCommand(socket, session, 'G');

    expect(startZmodemUpload).toHaveBeenCalledTimes(1);
    expect(atHandOff).toBe(true);
  });

  test('Enter leaves the caller on after the transfer', async () => {
    const { socket, session } = atTheOkayPrompt('web');

    await handleCommand(socket, session, '\r');

    expect(session.tempData.goodbyeAfterTransfer).toBe(false);
  });
});
