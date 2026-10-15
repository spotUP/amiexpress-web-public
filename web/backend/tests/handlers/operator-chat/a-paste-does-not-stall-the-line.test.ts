/**
 * "the first character gets visible directly and then there is a long pause
 * when i paste" - the sysop, 2026-09-13, on the fix for the paste being
 * dropped entirely.
 *
 * The drop was fixed by feeding each pasted character back through the chat
 * branch as though it had been typed. Correct, and slow: every character paid
 * for the whole command-handler preamble, an awaited emit to the sysop room,
 * and its OWN socket frame. A pasted line went out as one frame per character.
 *
 * The line model is still per character - it wraps at column 78 and tracks the
 * colour change, so it has to be - but the wire sees one frame per run.
 */
process.env.SKIP_DB_INIT = '1';

import { callerTypedRun, callerTypedChar } from '../../../src/handlers/operator-chat/chat-stream';
import { registerConnectionEmitter } from '../../../src/server/session-emitter-registry';
import { userSessions } from '../../../src/server/session-manager';

let n = 0;
function caller() {
  const frames: string[] = [];
  const session: any = {
    user: { id: `u-caller-${n++}`, username: 'Caller', secLevel: 50 },
    nodeId: 1, connectionType: 'web', tempData: {},
  };
  registerConnectionEmitter(session, {
    emit: (e: string, d: unknown) => { if (e === 'ansi-output') frames.push(String(d)); },
  } as any);
  userSessions.set(session.user.id, session);
  return { session, frames };
}

describe('a pasted run', () => {
  it('reaches the caller in ONE frame, not one per character', () => {
    const c = caller();
    callerTypedRun({}, c.session, 'tell me about fairlight');
    expect(c.frames).toHaveLength(1);
    expect(c.frames[0]).toContain('tell me about fairlight');
  });

  it('puts the same characters on the screen as typing them would', () => {
    const run = caller();
    callerTypedRun({}, run.session, 'hello');

    const typed = caller();
    for (const ch of 'hello') callerTypedChar({}, typed.session, ch);

    const visible = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, '');
    // Asserted non-empty first: two silent paths compare equal and prove
    // nothing, which is how this test passed while emitting nothing at all.
    expect(visible(run.frames.join(''))).toBe('hello');
    expect(visible(run.frames.join(''))).toBe(visible(typed.frames.join('')));
    // One frame against one per character - the whole point of the change.
    expect(run.frames).toHaveLength(1);
    expect(typed.frames.length).toBe(5);
    // And no more bytes than typing it would have cost.
    expect(run.frames.join('').length).toBeLessThanOrEqual(typed.frames.join('').length);
  });

  it('says nothing at all for an empty run', () => {
    const c = caller();
    callerTypedRun({}, c.session, '');
    expect(c.frames).toHaveLength(0);
  });

  it('still colours the caller, so a paste after the bot is not left cyan', () => {
    const c = caller();
    callerTypedRun({}, c.session, 'hi');
    expect(c.frames[0]).toMatch(/\x1b\[\d+m/);
  });
});
