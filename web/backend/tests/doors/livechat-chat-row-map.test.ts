/**
 * Finding the message under a click (Doors/livechat/ui/chat-row-map.ts).
 *
 * From the audit of what was declared but never implemented: the chat
 * context menu offers Pin, Delete and React on a message, and every one of
 * them printed a placeholder. They could not have worked - the right-click
 * handler called `showContextMenu(x, y, 'chat')` with no target, so the menu
 * knew a click had happened and nothing about what was under it.
 *
 * Rows are not messages: a long message wraps, the log scrolls, and typing
 * previews sit below the last message.
 */

import {
  visibleLength,
  wrappedHeight,
  messageIndexAtRow,
  totalRows,
} from '../../../../Doors/livechat/ui/chat-row-map';

const WIDTH = 20;

/** Three short messages, one per row. */
const SHORT = ['first', 'second', 'third'];

describe('measuring a line', () => {
  it('ignores colour tags', () => {
    // A tagged line is not wider than the text you can see.
    expect(visibleLength('{red-fg}hello{/red-fg}')).toBe(5);
  });

  it('gives an empty line one row', () => {
    expect(wrappedHeight('', WIDTH)).toBe(1);
  });

  it('gives a line that exactly fills the width one row', () => {
    expect(wrappedHeight('x'.repeat(WIDTH), WIDTH)).toBe(1);
  });

  it('wraps a longer line', () => {
    expect(wrappedHeight('x'.repeat(WIDTH + 1), WIDTH)).toBe(2);
    expect(wrappedHeight('x'.repeat(WIDTH * 3), WIDTH)).toBe(3);
  });

  it('measures a tagged line by what it shows, not what it stores', () => {
    const line = `{cyan-fg}${'x'.repeat(WIDTH)}{/cyan-fg}`;

    expect(wrappedHeight(line, WIDTH)).toBe(1);
  });
});

describe('the message under a row', () => {
  it('finds each of a set of short messages', () => {
    expect(messageIndexAtRow(SHORT, WIDTH, 0, 0)).toBe(0);
    expect(messageIndexAtRow(SHORT, WIDTH, 0, 1)).toBe(1);
    expect(messageIndexAtRow(SHORT, WIDTH, 0, 2)).toBe(2);
  });

  it('counts a wrapped message once, on every row it covers', () => {
    // Both rows of the long message belong to the same message.
    const lines = ['short', 'x'.repeat(WIDTH * 2), 'after'];

    expect(messageIndexAtRow(lines, WIDTH, 0, 0)).toBe(0);
    expect(messageIndexAtRow(lines, WIDTH, 0, 1)).toBe(1);
    expect(messageIndexAtRow(lines, WIDTH, 0, 2)).toBe(1);
    expect(messageIndexAtRow(lines, WIDTH, 0, 3)).toBe(2);
  });

  it('follows the log when it has scrolled', () => {
    // Row 0 on screen is not message 0 once the log has scrolled.
    expect(messageIndexAtRow(SHORT, WIDTH, 2, 0)).toBe(2);
    expect(messageIndexAtRow(SHORT, WIDTH, 1, 1)).toBe(2);
  });

  it('finds nothing below the last message', () => {
    // The typing previews live down there, and they are not messages
    // anybody can pin.
    expect(messageIndexAtRow(SHORT, WIDTH, 0, 3)).toBeNull();
    expect(messageIndexAtRow(SHORT, WIDTH, 0, 99)).toBeNull();
  });

  it('finds nothing above the top', () => {
    expect(messageIndexAtRow(SHORT, WIDTH, 0, -1)).toBeNull();
  });

  it('finds nothing in an empty log', () => {
    expect(messageIndexAtRow([], WIDTH, 0, 0)).toBeNull();
  });
});

describe('how far the log can scroll', () => {
  it('counts wrapped rows, not messages', () => {
    const lines = ['short', 'x'.repeat(WIDTH * 3)];

    expect(totalRows(lines, WIDTH)).toBe(4);
  });
});
