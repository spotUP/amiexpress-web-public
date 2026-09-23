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
