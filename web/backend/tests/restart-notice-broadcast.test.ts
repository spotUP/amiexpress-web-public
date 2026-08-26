/**
 * Regression tests for the deploy restart notice.
 *
 * The symptom this guards: a deploy used to drop every connected session with
 * no warning. The notice now goes out first - but writing it as raw ANSI to a
 * session whose screen a door owns paints it across the door's UI, which is
 * the same class of fault that put duplicate chat lines over LiveChat.
 */

import { LoggedOnSubState } from '../src/constants/bbs-states';
import {
  broadcastRestartNotice,
  startRestartCountdown,
  restartNoticeText,
  NOTICE_MARKS,
  type RestartNoticeDeps,
} from '../src/services/restart-notice.service';

interface Emitted { socketId: string; event: string; payload: any }

function makeIo(recorded: Emitted[]) {
  return {
    to(socketId: string) {
      return {
        emit(event: string, payload: any) {
          recorded.push({ socketId, event, payload });
        },
      };
    },
  };
}

function makeDeps(sessionsByNode: Record<string, any>, socketByNode: Record<number, string>): RestartNoticeDeps {
  return {
    sessions: new Map(Object.entries(sessionsByNode)),
    getSocketIdByNodeId: (nodeId: number) => socketByNode[nodeId],
  };
}

describe('broadcastRestartNotice', () => {
  it('sends a structured system:notice - and no raw ANSI - to a session running a door', () => {
    const recorded: Emitted[] = [];
    const deps = makeDeps({ '1': { doorInputHandler: () => {} } }, { 1: 'socket-1' });

    const counts = broadcastRestartNotice(makeIo(recorded), 60, deps);

    expect(counts).toEqual({ doors: 1, terminals: 0 });
    expect(recorded).toHaveLength(1);
    expect(recorded[0].socketId).toBe('socket-1');
    expect(recorded[0].event).toBe('system:notice');
    expect(recorded[0].payload).toMatchObject({ kind: 'restart', seconds: 60 });
    expect(recorded.some((e) => e.event === 'ansi-output')).toBe(false);
  });

  it('sends an ANSI banner to a plain terminal session', () => {
    const recorded: Emitted[] = [];
    const deps = makeDeps({ '2': {} }, { 2: 'socket-2' });

    const counts = broadcastRestartNotice(makeIo(recorded), 30, deps);

    expect(counts).toEqual({ doors: 0, terminals: 1 });
    expect(recorded[0].event).toBe('ansi-output');
    expect(String(recorded[0].payload)).toContain('restarting in 30 seconds');
  });

  it('does NOT treat a session that merely RAN a door as door-owned', () => {
    // currentDoorName is attribution, not liveness, and no exit path clears
    // it. Measured live: a plain web connect ran FRONTEND at the login screen
    // and stayed "in a door" for ever after, so a BBS terminal user would get
    // a structured event they cannot render instead of the visible banner.
    const recorded: Emitted[] = [];
    const exitedDoorSession = {
      currentDoorName: 'FRONTEND',
      clientDoorActive: false,
      subState: LoggedOnSubState.DISPLAY_MENU,
    };
    const deps = makeDeps({ '1': exitedDoorSession }, { 1: 'socket-1' });

    const counts = broadcastRestartNotice(makeIo(recorded), 60, deps);

    expect(counts).toEqual({ doors: 0, terminals: 1 });
    expect(recorded[0].event).toBe('ansi-output');
  });

  it('treats a session whose subState is DOOR_RUNNING as door-owned', () => {
    const recorded: Emitted[] = [];
    const deps = makeDeps({ '1': { subState: LoggedOnSubState.DOOR_RUNNING } }, { 1: 'socket-1' });

    expect(broadcastRestartNotice(makeIo(recorded), 60, deps)).toEqual({ doors: 1, terminals: 0 });
    expect(recorded[0].event).toBe('system:notice');
  });

  it('treats clientDoorActive and doorInputHandler as door-owned too', () => {
    const recorded: Emitted[] = [];
    const deps = makeDeps(
      { '1': { clientDoorActive: true }, '2': { doorInputHandler: () => {} }, '3': {} },
      { 1: 'a', 2: 'b', 3: 'c' },
    );

    const counts = broadcastRestartNotice(makeIo(recorded), 10, deps);

    expect(counts).toEqual({ doors: 2, terminals: 1 });
  });

  it('skips sessions with no live socket rather than emitting to undefined', () => {
    const recorded: Emitted[] = [];
    const deps = makeDeps({ '1': {}, '2': {} }, { 1: 'socket-1' });

    const counts = broadcastRestartNotice(makeIo(recorded), 60, deps);

    expect(counts).toEqual({ doors: 0, terminals: 1 });
    expect(recorded).toHaveLength(1);
    expect(recorded[0].socketId).toBe('socket-1');
  });

  it('reaches every connected session, not just the first', () => {
    const recorded: Emitted[] = [];
    const deps = makeDeps(
      { '1': {}, '2': { doorInputHandler: () => {} }, '3': {} },
      { 1: 'a', 2: 'b', 3: 'c' },
    );

    broadcastRestartNotice(makeIo(recorded), 5, deps);

    expect(recorded.map((e) => e.socketId).sort()).toEqual(['a', 'b', 'c']);
  });
});

describe('restartNoticeText', () => {
  it('says "1 second" rather than "1 seconds"', () => {
    expect(restartNoticeText(1)).toContain('in 1 second.');
  });
});

describe('startRestartCountdown', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('fires the first notice immediately and the rest on schedule', () => {
    const recorded: Emitted[] = [];
    const deps = makeDeps({ '1': {} }, { 1: 'socket-1' });

    startRestartCountdown(makeIo(recorded), 60, deps);

    // 60s mark goes out at once - nobody should learn about the restart only
    // five seconds before it happens.
    expect(recorded).toHaveLength(1);
    expect(recorded[0].payload).toContain('in 60 seconds');

    jest.advanceTimersByTime(60_000);
    expect(recorded).toHaveLength(NOTICE_MARKS.length);
    expect(String(recorded[recorded.length - 1].payload)).toContain('in 5 seconds');
  });

  it('drops marks longer than the countdown', () => {
    const recorded: Emitted[] = [];
    const deps = makeDeps({ '1': {} }, { 1: 'socket-1' });

    startRestartCountdown(makeIo(recorded), 10, deps);
    jest.advanceTimersByTime(10_000);

    const seconds = recorded.map((e) => (e.payload.seconds ?? null));
    // ANSI path carries the text, not the payload object - assert on text.
    const texts = recorded.map((e) => String(e.payload));
    expect(texts.some((t) => t.includes('in 60 seconds'))).toBe(false);
    expect(texts.some((t) => t.includes('in 10 seconds'))).toBe(true);
    expect(texts.some((t) => t.includes('in 5 seconds'))).toBe(true);
    expect(seconds).toBeDefined();
  });
});
