/**
 * A REPAINT DOES NOT THROW THE CALLER'S HISTORY AWAY.
 *
 * "users reported that via telnet scrollback is mangled by screen clears and
 * its the same with the web ui" (the sysop, 2026-09-24), who could then
 * scroll back "a few lines" at best on the live board.
 *
 * `ESC[2J` erases the viewport and pushes NOTHING into the scrollback - that
 * is what the sequence means, in xterm.js and in every real terminal - so
 * every menu the board redrew threw the last screen away. Scrolling the old
 * screen off the top instead puts it in the history of every client, telnet
 * included, and needs nothing from the client at all.
 *
 * A C64 is the exception: no scrollback to keep, a one-byte clear, and forty
 * columns where thirty scrolled rows would be thirty rows of nothing.
 */
import { clearScreenFor, SCROLL_CLEAR_LINES, AnsiUtil } from '../../src/utils/ansi.util';

const HARD_CLEAR = '\x1b[2J';

describe('the clear an ANSI caller gets', () => {
  it('scrolls the old screen into his history instead of erasing it', () => {
    const cls = clearScreenFor({});

    expect(cls).not.toContain(HARD_CLEAR);
    expect(cls.split('\r\n').length - 1).toBe(SCROLL_CLEAR_LINES);
  });

  it('scrolls further than one screen, so nothing survives on the glass', () => {
    // Twenty-five rows is the tallest screen the board draws.
    expect(SCROLL_CLEAR_LINES).toBeGreaterThan(25);
  });

  it('leaves the cursor at the top, where a clear leaves it', () => {
    expect(clearScreenFor({}).endsWith('\x1b[H')).toBe(true);
  });

  it('is the same clear AnsiUtil has always offered', () => {
    expect(clearScreenFor({})).toBe(AnsiUtil.clearScreen());
  });
});

describe('the clear a C64 gets', () => {
  it('is the hard one, because there is no history to keep', () => {
    expect(clearScreenFor({ petsciiMode: true })).toContain(HARD_CLEAR);
  });

  it('is the hard one for teletext too', () => {
    expect(clearScreenFor({ texttvMode: true })).toContain(HARD_CLEAR);
  });

  it('never sends a C64 thirty rows of scrolling', () => {
    expect(clearScreenFor({ petsciiMode: true })).not.toContain('\r\n\r\n');
  });
});
