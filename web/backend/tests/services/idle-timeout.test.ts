/**
 * The input timeout, which this port had a config field for and no code.
 *
 * `idle_timeout` sat in the config file, the database, the admin UI and the
 * Amiga export while nothing read it, and `ACSPermission.NO_TIMEOUT` was
 * declared and never checked - so a caller who walked away held his node
 * until the process restarted, and the account that is meant to be allowed to
 * sit there was in exactly the same position as everyone else.
 *
 * WHAT IS PINNED, and it is express's arithmetic rather than a round number:
 *
 *   express.e:2193-2197  a timeout of 120s or more waits (timeout - 60),
 *                        then bells, then waits 60 more
 *   express.e:2224-2229  the bell is the whole warning - `sendBELL()`,
 *                        `timeout:=60`, and back into the read
 *   express.e:2232-2234  any keystroke puts the whole timeout back
 *   express.e:2184-2186  ACS_NO_TIMEOUT or the board's NO_TIMEOUT toggle
 *                        means no timeout at all, not a longer one
 *   express.e:2187-2188  otherwise the node's OVERRIDE_TIMEOUT replaces it
 *   express.e:7402-7404  a transfer answers for its own line
 */
process.env.SKIP_DB_INIT = '1';

jest.mock('../../src/services/bbs-config-file.service', () => ({
  getBoardConfig: jest.fn(() => ({ idle_timeout: 5, no_timeout: false })),
}));
jest.mock('../../src/utils/node-tooltypes.util', () => ({
  nodeTooltype: jest.fn(() => undefined),
  nodeFlag: jest.fn(() => false),
}));

import {
  armIdleTimeout,
  disarmIdleTimeout,
  idleTimeoutSecondsFor,
  isIdleTimeoutArmed,
  noteCallerActivity,
  EXPRESS_INPUT_TIMEOUT_SECONDS,
  TIMEOUT_BELL,
} from '../../src/services/idle-timeout.service';
import { getBoardConfig } from '../../src/services/bbs-config-file.service';
import { nodeTooltype } from '../../src/utils/node-tooltypes.util';

const boardConfig = getBoardConfig as unknown as jest.Mock;
const tooltype = nodeTooltype as unknown as jest.Mock;

/** ACS index 85 is NO_TIMEOUT; 'T' there is the grant. */
const NO_TIMEOUT_INDEX = 85;
const withNoTimeout = { secLevel: 255, securityFlags: 'F'.repeat(NO_TIMEOUT_INDEX) + 'T' };
const ordinaryUser = { secLevel: 30, securityFlags: 'F'.repeat(90) };

function makeSocket() {
  const wire: string[] = [];
  return {
    wire,
    hangUps: 0,
    emit(event: string, data?: unknown) {
      if (event === 'ansi-output') wire.push(String(data ?? ''));
      return true;
    },
    disconnect(this: { hangUps: number }) {
      this.hangUps++;
      return true;
    },
  };
}

beforeEach(() => {
  jest.useFakeTimers();
  boardConfig.mockReturnValue({ idle_timeout: 5, no_timeout: false });
  tooltype.mockReturnValue(undefined);
});

afterEach(() => {
  jest.useRealTimers();
  jest.clearAllMocks();
});

describe('how long a caller may sit at a prompt', () => {
  it('reads the board minutes, in seconds', () => {
    expect(idleTimeoutSecondsFor({ nodeId: 1, user: ordinaryUser })).toBe(300);
  });

  it('falls back to express INPUT_TIMEOUT when the board never set one', () => {
    boardConfig.mockReturnValue({});
    expect(idleTimeoutSecondsFor({ nodeId: 1, user: ordinaryUser }))
      .toBe(EXPRESS_INPUT_TIMEOUT_SECONDS);
  });

  it("gives the node's OVERRIDE_TIMEOUT precedence over the board's minutes", () => {
    tooltype.mockImplementation((_node: number, key: string) =>
      key === 'OVERRIDE_TIMEOUT' ? '90' : undefined);
    expect(idleTimeoutSecondsFor({ nodeId: 3, user: ordinaryUser })).toBe(90);
  });

  it('answers 0 - never - for ACS.NO_TIMEOUT, whatever the node says', () => {
    tooltype.mockImplementation((_node: number, key: string) =>
      key === 'OVERRIDE_TIMEOUT' ? '90' : undefined);
    expect(idleTimeoutSecondsFor({ nodeId: 3, user: withNoTimeout })).toBe(0);
  });

  it("answers 0 for the board's own NO_TIMEOUT toggle", () => {
    boardConfig.mockReturnValue({ idle_timeout: 5, no_timeout: true });
    expect(idleTimeoutSecondsFor({ nodeId: 1, user: ordinaryUser })).toBe(0);
  });
});

describe('a caller who stops typing', () => {
  it('hears a bell a minute before the line goes, and then loses it', () => {
    const socket = makeSocket();
    const session = { nodeId: 1, user: ordinaryUser };

    armIdleTimeout(socket, session);

    // 239s: nothing at all. The first leg is 300 - 60.
    jest.advanceTimersByTime(239_000);
    expect(socket.wire).toEqual([]);
    expect(socket.hangUps).toBe(0);

    // 240s: express.e:2225's sendBELL(), and the line is still up.
    jest.advanceTimersByTime(1_000);
    expect(socket.wire).toEqual([TIMEOUT_BELL]);
    expect(socket.hangUps).toBe(0);

    // 299s: still his.
    jest.advanceTimersByTime(59_000);
    expect(socket.hangUps).toBe(0);

    // 300s: gone.
    jest.advanceTimersByTime(1_000);
    expect(socket.hangUps).toBe(1);
    expect(isIdleTimeoutArmed(session)).toBe(false);
  });

  it('gets the whole timeout back on one keystroke', () => {
    const socket = makeSocket();
    const session = { nodeId: 1, user: ordinaryUser };

    armIdleTimeout(socket, session);
    jest.advanceTimersByTime(200_000);
    noteCallerActivity(session);

    // 240s after the arm - when the bell would have rung - nothing.
    jest.advanceTimersByTime(40_000);
    expect(socket.wire).toEqual([]);

    // 240s after the KEYSTROKE, it rings.
    jest.advanceTimersByTime(200_000);
    expect(socket.wire).toEqual([TIMEOUT_BELL]);
    expect(socket.hangUps).toBe(0);
  });

  it('under two minutes there is no warning and no bell - express.e:2193', () => {
    tooltype.mockImplementation((_node: number, key: string) =>
      key === 'OVERRIDE_TIMEOUT' ? '60' : undefined);
    const socket = makeSocket();

    armIdleTimeout(socket, { nodeId: 2, user: ordinaryUser });

    jest.advanceTimersByTime(59_000);
    expect(socket.hangUps).toBe(0);
    jest.advanceTimersByTime(1_000);
    expect(socket.wire).toEqual([]);
    expect(socket.hangUps).toBe(1);
  });
});

describe('the wiring, not just the service', () => {
  it("restarts the clock from the input pipeline every transport shares", () => {
    // classifyTerminalInput is what server/socket-handlers.ts and
    // server/transport-session.ts both call for a chunk of caller input
    // (TP-8). If the stamp were not called from there, this suite would still
    // be green and no caller's keystroke would keep his line - which is the
    // whole class of defect Phase 0 is about.
    const { classifyTerminalInput } = require('../../src/server/terminal-input');
    const socket = makeSocket();
    const session: any = { nodeId: 1, user: ordinaryUser };

    armIdleTimeout(socket, session);
    jest.advanceTimersByTime(200_000);

    classifyTerminalInput(session, 'a');

    // The bell would have rung 40s from here on the original clock.
    jest.advanceTimersByTime(40_000);
    expect(socket.wire).toEqual([]);

    // It rings 240s after the keystroke instead.
    jest.advanceTimersByTime(200_000);
    expect(socket.wire).toEqual([TIMEOUT_BELL]);
  });
});

describe('who is never timed out', () => {
  it('a caller with ACS.NO_TIMEOUT is not even armed', () => {
    const socket = makeSocket();
    const session = { nodeId: 1, user: withNoTimeout };

    armIdleTimeout(socket, session);

    expect(isIdleTimeoutArmed(session)).toBe(false);
    jest.advanceTimersByTime(3_600_000);
    expect(socket.hangUps).toBe(0);
  });

  it('a running transfer keeps the line even while nobody types', () => {
    const socket = makeSocket();
    const session = { nodeId: 1, user: ordinaryUser, transferRawActive: true };

    armIdleTimeout(socket, session);
    jest.advanceTimersByTime(600_000);

    expect(socket.hangUps).toBe(0);

    // ...and when the transfer ends, the clock is running again.
    session.transferRawActive = false;
    jest.advanceTimersByTime(300_000);
    expect(socket.hangUps).toBe(1);
  });

  it('a session that has been released is not hung up later', () => {
    const socket = makeSocket();
    const session = { nodeId: 1, user: ordinaryUser };

    armIdleTimeout(socket, session);
    disarmIdleTimeout(session);
    jest.advanceTimersByTime(600_000);

    expect(socket.hangUps).toBe(0);
    expect(socket.wire).toEqual([]);
  });
});
