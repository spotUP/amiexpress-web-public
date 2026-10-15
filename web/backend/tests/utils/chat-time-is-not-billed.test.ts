/**
 * Time spent in sysop chat is not charged against the caller's time limit.
 *
 * express.e:543-553 is explicit about it:
 *
 *     IF (currTime-lastTimeUpdate)>0
 *       IF(chatFlag=0)
 *         loggedOnUser.timeUsed:=loggedOnUser.timeUsed+(currTime-lastTimeUpdate)
 *         timeLimit:=timeLimit-(currTime-lastTimeUpdate)
 *       ELSE
 *         IF loggedOnUser.chatLimit>0
 *           loggedOnUser.chatRemain:=loggedOnUser.chatRemain-(currTime-lastTimeUpdate)
 *         ENDIF
 *       ENDIF
 *
 * Ours billed it regardless, with the divergence written in the source as
 * "For now, always update - chat time tracking can be added later". A caller
 * the sysop keeps talking to therefore paid for the sysop's conversation, and
 * a long chat could log them off.
 *
 * `session.inChat` is this board's chatFlag (index.ts:575, and what
 * terminal-input.ts:246 routes on). This board stores chat time as chatUsed
 * counting up where express.e keeps chatRemain counting down - the same
 * quantity from the other end, so the daily reset is chatUsed := 0 where
 * express.e writes chatRemain := chatLimit.
 */
jest.mock('../../src/handlers/screen.handler', () => ({
  displayScreen: jest.fn().mockResolvedValue(false),
}));

import { updateTimeUsed } from '../../src/utils/time-tracking.util';
import { BBSSession } from '../../src/index';

const AT = 1640000000000; // fixed clock, ms

function sessionAt(seconds: number, userOver: Partial<any> = {}): BBSSession {
  return {
    user: {
      username: 'testuser',
      secLevel: 5,
      timeLimit: 3600,
      timeTotal: 3600,
      timeUsed: 0,
      chatLimit: 600,
      chatUsed: 0,
      ...userOver,
    },
    logonTime: seconds,
    lastTimeUpdate: seconds,
  } as any;
}

describe('time spent in chat', () => {
  const socket = { emit: jest.fn() } as any;
  const realNow = Date.now;
  afterEach(() => { Date.now = realNow; });

  function tick(session: BBSSession, seconds: number): void {
    Date.now = jest.fn(() => AT + seconds * 1000);
    updateTimeUsed(socket, session);
  }

  it('is not charged to the caller time limit', () => {
    const session = sessionAt(Math.floor(AT / 1000));
    (session as any).inChat = true;

    tick(session, 120);

    expect(session.user!.timeUsed).toBe(0);
  });

  it('is charged to the chat allowance instead', () => {
    const session = sessionAt(Math.floor(AT / 1000));
    (session as any).inChat = true;

    tick(session, 120);

    expect(session.user!.chatUsed).toBe(120);
  });

  it('is not charged anywhere when the caller has no chat allowance', () => {
    // express.e:548 - the chat clock only runs for a user with chatLimit>0.
    const session = sessionAt(Math.floor(AT / 1000), { chatLimit: 0 });
    (session as any).inChat = true;

    tick(session, 120);

    expect(session.user!.timeUsed).toBe(0);
    expect(session.user!.chatUsed).toBe(0);
  });

  it('still advances lastTimeUpdate, so the chat is not billed twice over', () => {
    const session = sessionAt(Math.floor(AT / 1000));
    (session as any).inChat = true;

    tick(session, 120);
    (session as any).inChat = false;
    tick(session, 180);

    // 120s of chat, then 60s out of chat. Only the 60 is the caller's.
    expect(session.user!.timeUsed).toBe(60);
    expect(session.user!.chatUsed).toBe(120);
  });

  it('bills the caller normally when not in chat', () => {
    const session = sessionAt(Math.floor(AT / 1000));

    tick(session, 90);

    expect(session.user!.timeUsed).toBe(90);
    expect(session.user!.chatUsed).toBe(0);
  });

  it('gives the chat allowance back on a new day, as express.e:537 does', () => {
    const session = sessionAt(Math.floor(AT / 1000));
    session.user!.chatUsed = 300;
    session.user!.timeUsed = 1200;

    tick(session, 60 * 60 * 26); // past midnight

    expect(session.user!.chatUsed).toBe(0);
    expect(session.user!.timeUsed).toBe(0);
  });
});
