/**
 * Arkanoid score -> webhook wiring (Doors/arkanoid/server.ts).
 *
 * The BBS broadcasts door events with eventType 'score_submitted' to
 * LiveChat and to any sysop-configured DOOR_SCORE webhook (Discord/Slack)
 * via bbs-event-emitter. Arkanoid's saveHighscore RPC used to only write
 * highscores.json; these tests pin that it now also emits the event -
 * and that persistence never depends on the event getting out.
 *
 * The hybrid RPC bridge calls handlers as handler(params, doorSessionObj)
 * where doorSessionObj.bbs is the BBSApi (door.handler.ts wires this), so
 * the second argument here mirrors production exactly.
 */

// jest.mock('fs') below auto-mocks the WHOLE 'fs' module for this file,
// including the copy 'bindings'/'better-sqlite3' use to find their native
// binary. tests/setup.ts opens a REAL sqlite database in a global beforeAll
// unless SKIP_DB_INIT=1, and with 'fs' mocked out from under it that open
// fails with "Could not locate the bindings file" - nothing to do with these
// tests, none of which touch the database.
//
// Saved and restored rather than just set: a Jest worker runs several test
// FILES in one process and process.env is not reset between them, so setting
// it unconditionally would skip the real DB init of whichever file runs next.
const __savedSkipDbInit = process.env.SKIP_DB_INIT;
process.env.SKIP_DB_INIT = '1';
afterAll(() => {
  if (__savedSkipDbInit === undefined) delete process.env.SKIP_DB_INIT;
  else process.env.SKIP_DB_INIT = __savedSkipDbInit;
});

jest.mock('fs');

import * as fs from 'fs';
import { saveHighscore } from '../../../../Doors/arkanoid/server';

const mockedFs = fs as jest.Mocked<typeof fs>;

function sessionWith(emit: jest.Mock | undefined) {
  return {
    user: { username: 'spot' },
    bbs: emit ? { emitCustomEvent: emit } : {},
  };
}

describe('arkanoid saveHighscore webhook emission', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    // No highscore file on disk - every test starts from an empty board.
    mockedFs.existsSync.mockReturnValue(false);
  });

  it('emits score_submitted with the score, level and rank', () => {
    const emit = jest.fn();

    const result = saveHighscore({ name: 'SPOT', score: 12500, level: 5 }, sessionWith(emit));

    expect(result.success).toBe(true);
    expect(emit).toHaveBeenCalledTimes(1);

    const [eventType, message, data] = emit.mock.calls[0];
    expect(eventType).toBe('score_submitted');
    expect(message).toContain('12,500');
    expect(message).toContain('Level: 5');
    expect(data).toMatchObject({ score: 12500, level: 5, name: 'SPOT', rank: 1 });
  });

  it('ranks the new score against the existing board', () => {
    mockedFs.existsSync.mockReturnValue(true);
    mockedFs.readFileSync.mockReturnValue(
      JSON.stringify([
        { name: 'AAA', score: 50000, level: 9, date: '2026-08-01' },
        { name: 'BBB', score: 20000, level: 7, date: '2026-08-02' },
      ]) as any
    );
    const emit = jest.fn();

    saveHighscore({ name: 'SPOT', score: 30000, level: 8 }, sessionWith(emit));

    expect(emit.mock.calls[0][2].rank).toBe(2);
  });

  it('still persists the score when no session is passed (native/test runs)', () => {
    expect(saveHighscore({ name: 'SPOT', score: 100, level: 1 }).success).toBe(true);
    expect(mockedFs.writeFileSync).toHaveBeenCalled();
  });

  it('still persists when the session has no emitCustomEvent (older BBSApi)', () => {
    expect(
      saveHighscore({ name: 'SPOT', score: 100, level: 1 }, sessionWith(undefined)).success
    ).toBe(true);
    expect(mockedFs.writeFileSync).toHaveBeenCalled();
  });

  it('still persists when the event emission throws', () => {
    const emit = jest.fn(() => {
      throw new Error('webhook service down');
    });

    const result = saveHighscore({ name: 'SPOT', score: 100, level: 1 }, sessionWith(emit));

    expect(result.success).toBe(true);
    expect(mockedFs.writeFileSync).toHaveBeenCalled();
  });
});
