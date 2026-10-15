/**
 * "it still takes a long time for pastes to arrive in the chat" - the sysop,
 * after two fixes of mine that were both DOWNSTREAM of the real split and
 * could never have run.
 *
 * splitInputForDispatch hands the command handler one character at a time.
 * That is right for a menu, a hot key and a line editor, all written against a
 * single keystroke - and it stood in front of the operator chat, whose branch
 * accumulates a pasted run and writes it as one frame. So a pasted line was
 * dispatched as N un-awaited calls, each paying for the handler's preamble and
 * its own emit to the sysop room, and it trickled onto the screen.
 */
import { chatTakesTheWholeChunk, commandPieces } from '../../src/server/terminal-input';
import { LoggedOnSubState } from '../../src/constants/bbs-states';

const CHAT = LoggedOnSubState.OPERATOR_CHAT_ACTIVE;

describe('who gets a pasted chunk whole', () => {
  it('the operator chat does', () => {
    expect(chatTakesTheWholeChunk(CHAT, 'tell me about fairlight')).toBe(true);
  });

  it('and nowhere else - a menu still reads one key at a time', () => {
    expect(chatTakesTheWholeChunk(LoggedOnSubState.READ_COMMAND, 'hello')).toBe(false);
    // The rule below is what a menu keeps getting.
    expect(commandPieces('hi')).toEqual(['h', 'i']);
  });

  it('not a single keystroke, which has nothing to gain', () => {
    expect(chatTakesTheWholeChunk(CHAT, 'a')).toBe(false);
    expect(chatTakesTheWholeChunk(CHAT, '\r')).toBe(false);
  });

  it('not an escape sequence - F1 and the arrows are single keys', () => {
    // Handed over whole, the chat branch would test \x1b[OP as text.
    expect(chatTakesTheWholeChunk(CHAT, '\x1b[OP')).toBe(false);
    expect(chatTakesTheWholeChunk(CHAT, '\x1b[D')).toBe(false);
  });

  it('not a stray mouse report, which is dropped rather than typed', () => {
    // xterm keeps DEC 1006 across a door exit; reaching the chat with one
    // would type `[<35;5;9;M` into the caller's message.
    expect(chatTakesTheWholeChunk(CHAT, '\x1b[<35;5;9;M')).toBe(false);
  });

  it('keeps the line breaks inside the chunk, for the branch to act on', () => {
    expect(chatTakesTheWholeChunk(CHAT, 'one\rtwo')).toBe(true);
  });
});
