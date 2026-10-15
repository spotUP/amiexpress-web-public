/**
 * An emoji is not a command.
 *
 * Reported 2026-08-26: "some of the emojis in the emoji picker can't be sent
 * to the chat because of the characters they start with". The guess was
 * right. The catalogue contains `/!\`, and both places that decide between a
 * command and a message asked only `startsWith('/')`:
 *
 *   Doors/livechat/handlers/command.ts:40
 *   Doors/livechat/handlers/input-submit-handler.ts:86
 *
 * So picking that emoji into an empty input and pressing Enter ran the
 * command parser, which answered "Unknown command: /!\" and reported the
 * input as handled - and the message was never sent.
 *
 * A command is a slash followed by a NAME. Anything else is text somebody
 * wants to say.
 */

import { looksLikeCommand } from '../../../../Doors/livechat/handlers/command';
import { EMOJIS } from '../../../../Doors/livechat/utils/emojis';

describe('looksLikeCommand', () => {
  it('accepts a real command, with or without arguments', () => {
    expect(looksLikeCommand('/msg @dino hello')).toBe(true);
    expect(looksLikeCommand('/help')).toBe(true);
    expect(looksLikeCommand('/join general')).toBe(true);
    expect(looksLikeCommand('/ME waves')).toBe(true);
  });

  it('rejects text that merely begins with a slash', () => {
    expect(looksLikeCommand('/!\\')).toBe(false);
    expect(looksLikeCommand('/')).toBe(false);
    expect(looksLikeCommand('//')).toBe(false);
    expect(looksLikeCommand('/ hello')).toBe(false);
    expect(looksLikeCommand('/3 strikes')).toBe(false);
  });

  it('rejects anything not starting with a slash at all', () => {
    expect(looksLikeCommand('hello')).toBe(false);
    expect(looksLikeCommand('')).toBe(false);
    expect(looksLikeCommand('  /help')).toBe(false);
  });

  it('lets EVERY emoji in the catalogue be sent as a message', () => {
    // Data-driven on purpose: a new emoji added later must not silently
    // become unsendable because of its first character.
    const swallowed = EMOJIS
      .map(e => e.display || e.code)
      .filter(display => looksLikeCommand(display));

    expect(swallowed).toEqual([]);
  });

  it('lets every emoji be sent when it is followed by other text', () => {
    const swallowed = EMOJIS
      .map(e => `${e.display || e.code} and some words`)
      .filter(text => looksLikeCommand(text));

    expect(swallowed).toEqual([]);
  });
});
