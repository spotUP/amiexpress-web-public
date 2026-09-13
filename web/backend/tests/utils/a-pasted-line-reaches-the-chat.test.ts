/**
 * The splitter is no use if nothing calls it, so this drives the real chat
 * routing with a paste - the same shape the browser sends when the caller hits
 * paste: one event, the whole clipboard.
 */
process.env.SKIP_DB_INIT = '1';

const sent: string[] = [];
const exited: number[] = [];
jest.mock('../../src/handlers/chat/chat.handler', () => ({
  exitChat: () => { exited.push(1); },
  sendChatMessage: (_s: any, _sess: any, message: string) => { sent.push(message); },
}));

import { handleChatModeInput } from '../../src/utils/chat-mode-input.util';

const world = () => {
  const out: string[] = [];
  const socket = { emit: (_e: string, d: string) => out.push(d) };
  const session: any = { inChat: true, inputBuffer: '' };
  return { socket, session, out };
};

beforeEach(() => { sent.length = 0; exited.length = 0; });

describe('a pasted line in chat mode', () => {
  it('lands in the buffer instead of vanishing', () => {
    const w = world();
    handleChatModeInput(w.socket, w.session, 'tell me about fairlight');
    expect(w.session.inputBuffer).toBe('tell me about fairlight');
    // And the caller sees it, as if they had typed it.
    expect(w.out.join('')).toBe('tell me about fairlight');
  });

  it('sends when the paste carries its own return', () => {
    const w = world();
    handleChatModeInput(w.socket, w.session, 'hello there\r');
    expect(sent).toEqual(['hello there']);
    expect(w.session.inputBuffer).toBe('');
  });

  it('sends a line per line for a multi-line paste', () => {
    const w = world();
    handleChatModeInput(w.socket, w.session, 'first\rsecond\r');
    expect(sent).toEqual(['first', 'second']);
  });

  it('still leaves the chat on F1, which a split would have made impossible', () => {
    const w = world();
    handleChatModeInput(w.socket, w.session, '\x1b[OP');
    expect(exited).toHaveLength(1);
    expect(w.session.inputBuffer).toBe('');
  });

  it('still takes one typed character at a time', () => {
    const w = world();
    for (const ch of 'hi') handleChatModeInput(w.socket, w.session, ch);
    expect(w.session.inputBuffer).toBe('hi');
  });

  it('leaves a session that is not in chat mode alone', () => {
    const w = world();
    w.session.inChat = false;
    expect(handleChatModeInput(w.socket, w.session, 'paste')).toBe(false);
    expect(w.session.inputBuffer).toBe('');
  });
});
