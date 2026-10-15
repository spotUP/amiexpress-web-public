/**
 * THE LOGOFF ART REACHES THE CALLER BEFORE THE LINE DROPS.
 *
 * Sysop, 2026-09-14, twice: "damnit... got a cut off logoff logo now again"
 * and then "logoff is still cut off" - the logo's first rows drawn, the rest
 * missing, with "Click... NO CARRIER" sitting right underneath it.
 *
 * TWO WRITERS, ONE WIRE. Screen art is written with `emitText`, which batches
 * into the ANSI buffer and flushes on a 16 ms timer
 * (`utils/ansi-buffer.util.ts`). The goodbye lines are written with a direct
 * `socket.emit('ansi-output', ...)`, which goes out immediately. So the last
 * unflushed chunk of the art was still sitting in the buffer when NO CARRIER
 * overtook it and the client - told to disconnect in the same breath - closed
 * the socket on top of it. The caller saw the first rows and the goodbye, and
 * nothing in between.
 *
 * What this pins is the ORDER ON THE WIRE, not the presence of a flush call:
 * every byte of the art must be emitted before the first goodbye byte.
 */

import { BBSState } from '../../src/constants/bbs-states';

jest.mock('../../src/utils/file-flag.util', () => ({
  FileFlagManager: class { save() {} list() { return []; } },
}));

import {
  handleGoodbyeCommand,
  setSystemCommandsDependencies,
} from '../../src/handlers/commands/system-commands.handler';
import { emitText } from '../../src/utils/output.util';

/** A socket that records the wire in order, and buffers like the real one. */
function makeSocket() {
  const wire: string[] = [];
  return {
    wire,
    emit(event: string, payload: any) {
      if (event === 'ansi-output' && typeof payload === 'string') wire.push(payload);
    },
    disconnect() {},
    // The buffer registers a disconnect listener to release itself.
    on() {},
    id: 'test-socket',
  };
}

function makeSession(): any {
  return {
    state: BBSState.LOGGEDON,
    nodeId: 1,
    user: { id: 'u1', bbsName: 'Test BBS' },
    shortcuts: new Set<string>(),
    flagManager: { save() {} },
  };
}

describe('the logoff art reaches the caller', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    setSystemCommandsDependencies({
      // The real screen path writes art through emitText - the buffered
      // writer. Three rows is enough: the bug loses whatever the 16 ms timer
      // has not carried yet.
      displayScreen: async (socket: any) => {
        emitText(socket, 'ROW-ONE\r\n');
        emitText(socket, 'ROW-TWO\r\n');
        emitText(socket, 'ROW-THREE\r\n');
        return true;
      },
      findSecurityScreen: () => null,
    });
  });
  afterEach(() => { jest.useRealTimers(); jest.restoreAllMocks(); });

  test('every row of the art is on the wire before NO CARRIER', async () => {
    const socket = makeSocket();
    await handleGoodbyeCommand(socket as any, makeSession());

    const sent = socket.wire.join('');
    const carrierAt = sent.indexOf('NO CARRIER');
    expect(carrierAt).toBeGreaterThanOrEqual(0);

    for (const row of ['ROW-ONE', 'ROW-TWO', 'ROW-THREE']) {
      const at = sent.indexOf(row);
      expect(at).toBeGreaterThanOrEqual(0);       // the row arrived at all
      expect(at).toBeLessThan(carrierAt);          // and arrived before the goodbye
    }
  });

  // express.e:8187 displayScreen(SCREEN_LOGOFF) and nothing else: a board
  // with no LOGOFF screen says nothing. The port printed an invented
  // 'Thank you for calling <bbs>' in its place.
  test('a board without a LOGOFF screen prints no invented goodbye', async () => {
    setSystemCommandsDependencies({
      displayScreen: async () => false,
      findSecurityScreen: () => null,
    });
    const socket = makeSocket();
    await handleGoodbyeCommand(socket as any, makeSession());
    const sent = socket.wire.join('');
    expect(sent).toContain('NO CARRIER');
    expect(sent).not.toContain('Thank you for calling');
  });
});
