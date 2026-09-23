/**
 * "MAIN PROMPT BEHAVE WEIRD, MAKING A EMPTY RETURN EACH SECOND TIME"
 * (a caller over telnet, relayed by the sysop 2026-09-23).
 *
 * A telnet client ends a line with CR LF or CR NUL (RFC 854). The NUL half
 * was already stripped in the transport; the LF was not, and the dispatcher
 * splits a chunk into single keystrokes - so both bytes arrived at the
 * prompt, and every prompt on this board submits on `\r` OR `\n`. One press
 * of RETURN was two: the command, and then an empty line at whatever the
 * command had opened.
 */
import { commandPieces } from '../../src/server/terminal-input';

describe('a telnet caller pressing RETURN', () => {
  it('submits once, not twice', () => {
    expect(commandPieces('\r\n')).toEqual(['\r']);
  });

  it('submits his command once, with the RETURN after it', () => {
    expect(commandPieces('W\r\n')).toEqual(['W', '\r']);
  });

  it('leaves a lone LF alone - that is a Unix client\'s RETURN', () => {
    expect(commandPieces('\n')).toEqual(['\n']);
  });

  it('collapses every line of a pasted block, not just the first', () => {
    expect(commandPieces('a\r\nb\r\n')).toEqual(['a', '\r', 'b', '\r']);
  });

  it('still hands an escape sequence over whole', () => {
    expect(commandPieces('\x1b[A')).toEqual(['\x1b[A']);
  });
});

/**
 * And when the two bytes arrive in DIFFERENT packets, which is what made the
 * report read as "each second time": a client that flushes between CR and LF,
 * or a network that splits the segment, leaves the collapse above nothing to
 * see.
 */
import { swallowTelnetLineFeed } from '../../src/server/terminal-input';

describe('a RETURN split across two packets', () => {
  const session = () => ({}) as any;

  it('is still one RETURN', () => {
    const s = session();
    expect(swallowTelnetLineFeed(s, '\r')).toBe('\r');
    expect(swallowTelnetLineFeed(s, '\n')).toBe('');
  });

  it('leaves the LF alone when no CR came before it', () => {
    expect(swallowTelnetLineFeed(session(), '\n')).toBe('\n');
  });

  it('only swallows the LF that FOLLOWS, not a later one', () => {
    const s = session();
    swallowTelnetLineFeed(s, '\r');
    expect(swallowTelnetLineFeed(s, 'W')).toBe('W');
    expect(swallowTelnetLineFeed(s, '\n')).toBe('\n');
  });

  it('keeps each caller\'s latch to himself', () => {
    const a = session();
    const b = session();
    swallowTelnetLineFeed(a, '\r');
    expect(swallowTelnetLineFeed(b, '\n')).toBe('\n');
  });

  it('holds the latch across a chunk that ENDS in CR', () => {
    const s = session();
    expect(swallowTelnetLineFeed(s, 'W\r')).toBe('W\r');
    expect(swallowTelnetLineFeed(s, '\nX')).toBe('X');
  });
});
