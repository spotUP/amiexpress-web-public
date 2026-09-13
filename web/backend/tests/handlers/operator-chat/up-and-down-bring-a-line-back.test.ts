/**
 * "up/down doesnt work" - the sysop, after the arrows landed. They were
 * swallowed on purpose: a chat prompt is ONE line, so there is nothing above
 * it to move to. But a key that does nothing at all reads as broken, and
 * every terminal and shell means the same thing by up: give me the line I
 * typed before.
 *
 * Driven through callerEditedLine, which is the chat branch's one way in, so
 * what is asserted is what a caller actually gets.
 */
process.env.SKIP_DB_INIT = '1';

import { callerEditedLine } from '../../../src/handlers/operator-chat/chat-stream';
import { activeChatSessions } from '../../../src/handlers/operator-chat/chat-stream';
import { registerConnectionEmitter } from '../../../src/server/session-emitter-registry';
import { userSessions } from '../../../src/server/session-manager';

let n = 0;
function chatting(history: string[] = []) {
  const frames: string[] = [];
  const pageId = `page-${n++}`;
  const session: any = {
    user: { id: `u-${n}`, username: 'Caller', secLevel: 50 },
    nodeId: 1, connectionType: 'web',
    tempData: { pageId },
    chatHistory: [...history],
    chatHistoryAt: history.length,
  };
  registerConnectionEmitter(session, {
    emit: (e: string, d: unknown) => { if (e === 'ansi-output') frames.push(String(d)); },
  } as any);
  userSessions.set(session.user.id, session);
  activeChatSessions.set(pageId, { isTyping: {}, line: { text: '', lastSender: null } } as any);
  return { session, frames, pageId };
}

const UP = '\x1b[A';
const DOWN = '\x1b[B';
const visible = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, '');

describe('up and down in a chat', () => {
  it('bring back the line the caller sent before', () => {
    const c = chatting(['who is online?']);
    const r = callerEditedLine({}, c.session, '', 0, UP);
    expect(r).toEqual({ buffer: 'who is online?', cursor: 14 });
    expect(visible(c.frames.join(''))).toContain('who is online?');
  });

  it('walk further back, and forward again', () => {
    const c = chatting(['first', 'second']);
    let r = callerEditedLine({}, c.session, '', 0, UP)!;
    expect(r.buffer).toBe('second');
    r = callerEditedLine({}, c.session, r.buffer, r.cursor, UP)!;
    expect(r.buffer).toBe('first');
    r = callerEditedLine({}, c.session, r.buffer, r.cursor, DOWN)!;
    expect(r.buffer).toBe('second');
  });

  it('give the caller their own half-typed line back on the way down', () => {
    const c = chatting(['an older line']);
    let r = callerEditedLine({}, c.session, 'half typed', 10, UP)!;
    expect(r.buffer).toBe('an older line');
    r = callerEditedLine({}, c.session, r.buffer, r.cursor, DOWN)!;
    expect(r.buffer).toBe('half typed');
  });

  it('stop at the oldest line rather than emptying the prompt', () => {
    const c = chatting(['only one']);
    let r = callerEditedLine({}, c.session, '', 0, UP)!;
    r = callerEditedLine({}, c.session, r.buffer, r.cursor, UP)!;
    expect(r.buffer).toBe('only one');
  });

  it('do nothing at all when nothing has been sent yet', () => {
    const c = chatting([]);
    const r = callerEditedLine({}, c.session, 'typing', 6, UP);
    expect(r).toEqual({ buffer: 'typing', cursor: 6 });
    expect(c.frames.join('')).toBe('');
  });

  it('erase what was on the line, so the recalled one is not typed over it', () => {
    const c = chatting(['short']);
    // TYPED through the editor, so the line model knows what is on the screen -
    // it rubs out only what it believes is there, which is the whole point of
    // saying every edit in its own primitives.
    let buffer = '';
    let cursor = 0;
    for (const ch of 'a much longer line') {
      const r = callerEditedLine({}, c.session, buffer, cursor, ch)!;
      buffer = r.buffer; cursor = r.cursor;
    }
    c.frames.length = 0;

    callerEditedLine({}, c.session, buffer, cursor, UP);
    const bytes = c.frames.join('');
    // One rub-out per character that was there. \x08 spelled out: \b in a
    // regex is a WORD BOUNDARY, and matched the spaces instead.
    expect((bytes.match(/\x08 \x08/g) ?? []).length).toBe('a much longer line'.length);
    expect(visible(bytes)).toContain('short');
  });
});
