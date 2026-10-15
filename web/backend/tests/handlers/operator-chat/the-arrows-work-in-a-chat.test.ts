/**
 * "arrow keys and backspace needs to work in chats too" - the sysop,
 * 2026-09-13. Backspace already did; the arrows were dropped on purpose:
 *
 *   // Arrow keys mean nothing in a chat.
 *
 * True to express, whose chat has no line editor at all - characters go onto
 * the shared line as pressed and backspace rubs out the last one
 * (6143-6152). But a caller who typoes the first word of a long question
 * should not have to rub out the line to fix it.
 *
 * THE MODEL IS THE CONSTRAINT, and what these tests really pin: chatCharBytes
 * appends and chatBackspaceBytes truncates, and the line's own `text` is what
 * keeps the shared line wrapping at 78 columns. Every edit is said in those
 * two primitives, so the model cannot drift from the screen.
 */
import { chatLineEditKey } from '../../../src/handlers/operator-chat/chat-stream';

const session = () => ({}) as any;

/** What the model believes is on the line. */
const modelText = (cs: any) => (cs.line?.text ?? '');

/** Replay a whole sequence, the way the chat branch does. */
function type(cs: any, keys: string[]) {
  let buffer = '';
  let cursor = 0;
  let bytes = '';
  for (const key of keys) {
    const edit = chatLineEditKey(cs, buffer, cursor, key);
    if (!edit) continue;
    buffer = edit.buffer;
    cursor = edit.cursor;
    bytes += edit.bytes;
  }
  return { buffer, cursor, bytes };
}

describe('the arrows in a chat', () => {
  it('move the cursor without changing a word', () => {
    const cs = session();
    const r = type(cs, [...'hello', '\x1b[D', '\x1b[D']);
    expect(r.buffer).toBe('hello');
    expect(r.cursor).toBe(3);
  });

  it('let a typo at the start be fixed without rubbing out the line', () => {
    const cs = session();
    // "helo" -> go back and put the missing l in.
    const r = type(cs, [...'helo', '\x1b[D', '\x1b[D', 'l']);
    expect(r.buffer).toBe('hello');
    expect(r.cursor).toBe(3);
    // What the model thinks is on the line is what the caller typed.
    expect(modelText(cs)).toBe('hello');
  });

  it('backspace in the middle takes the character before the cursor', () => {
    const cs = session();
    const r = type(cs, [...'hello', '\x1b[D', '\x7f']);
    expect(r.buffer).toBe('helo');
    expect(r.cursor).toBe(3);
    expect(modelText(cs)).toBe('helo');
  });

  it('stops at both ends instead of running off', () => {
    const cs = session();
    const left = type(cs, ['a', '\x1b[D', '\x1b[D', '\x1b[D']);
    expect(left.cursor).toBe(0);
    const cs2 = session();
    const right = type(cs2, ['a', '\x1b[C', '\x1b[C']);
    expect(right.cursor).toBe(1);
  });

  it('Home and End jump to the ends', () => {
    const cs = session();
    const home = type(cs, [...'hello', '\x1b[H']);
    expect(home.cursor).toBe(0);
    const back = chatLineEditKey(cs, home.buffer, home.cursor, '\x1b[F');
    expect(back!.cursor).toBe(5);
  });

  it('up and down are swallowed, not typed into the message', () => {
    const cs = session();
    const r = type(cs, [...'hi', '\x1b[A', '\x1b[B']);
    expect(r.buffer).toBe('hi');
  });

  it('leaves a key it does not own for the chat branch to route', () => {
    // Return and CTRL-C are the branch's own business.
    expect(chatLineEditKey(session(), 'hi', 2, '\r')).toBeNull();
    expect(chatLineEditKey(session(), 'hi', 2, '\x03')).toBeNull();
  });

  it('keeps the model exactly equal to the buffer, however it was edited', () => {
    const cs = session();
    const r = type(cs, [
      ...'the quick brown',
      '\x1b[H',
      ...'A ',
      '\x1b[F',
      '!',
    ]);
    expect(r.buffer).toBe('A the quick brown!');
    // The one invariant that matters: no second way of counting the line.
    expect(modelText(cs)).toBe(r.buffer);
  });
});
