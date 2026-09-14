/**
 * What a board sends to a caller whose terminal has eight pens.
 *
 * "amiexpress can only show 8 colors on the amiga... it CAN show 16 colors if
 * ibmcon device is used but that was not common practice", and "the amiga did
 * not use ice colors either" (sysop, 2026-09-14). Art drawn on a PC reaches
 * for the aixterm codes - ESC[90m..ESC[97m for bright text, ESC[100m..107m
 * for the iCE backgrounds - and an Amiga terminal that never heard of them
 * either ignores the sequence or prints it into the art.
 */

import { foldAnsiToEightPens, eightPen, foldSgrParameter } from '../../engines/ui/ansi/eight-pens';

describe('sixteen-colour art folds onto eight pens', () => {
  it('brings a bright foreground down to its pen', () => {
    expect(foldAnsiToEightPens('\x1b[93mX')).toBe('\x1b[33mX');
    expect(foldAnsiToEightPens('\x1b[90mX')).toBe('\x1b[30mX');
    expect(foldAnsiToEightPens('\x1b[97mX')).toBe('\x1b[37mX');
  });

  it('brings an iCE background down too, because the Amiga had none', () => {
    expect(foldAnsiToEightPens('\x1b[104mX')).toBe('\x1b[44mX');
    expect(foldAnsiToEightPens('\x1b[107mX')).toBe('\x1b[47mX');
  });

  it('folds every parameter of a compound sequence', () => {
    expect(foldAnsiToEightPens('\x1b[1;93;104mX')).toBe('\x1b[1;33;44mX');
  });

  it('leaves bold alone - it is how art asks for bright, and the Amiga has it', () => {
    // ESC[1;33m is bold yellow on an Amiga and bright yellow on a PC. That is
    // the medium, not a fault, and rewriting it would take the bold away from
    // a terminal that can show it.
    expect(foldAnsiToEightPens('\x1b[1;33mX')).toBe('\x1b[1;33mX');
  });

  it('returns text with no bright codes byte-identical', () => {
    const art = '\x1b[0;32mGreen\x1b[1;36m Cyan\x1b[0m\r\n\x1b[7mReverse\x1b[0m';
    expect(foldAnsiToEightPens(art)).toBe(art);
  });

  it('leaves text with no escapes at all alone', () => {
    expect(foldAnsiToEightPens('Just a line of prose.')).toBe('Just a line of prose.');
  });

  it('does not touch sequences that are not SGR', () => {
    // Cursor moves, clears, save/restore: a colour fold has no business in them.
    const positioned = '\x1b[2J\x1b[10;40H\x1b[93mX\x1b[s\x1b[u';
    expect(foldAnsiToEightPens(positioned)).toBe('\x1b[2J\x1b[10;40H\x1b[33mX\x1b[s\x1b[u');
  });

  it('leaves ESC[m, the short reset, as it found it', () => {
    expect(foldAnsiToEightPens('\x1b[mX')).toBe('\x1b[mX');
  });

  it('keeps blink, reverse and the resets', () => {
    expect(foldAnsiToEightPens('\x1b[5;7;93mX')).toBe('\x1b[5;7;33mX');
    expect(foldAnsiToEightPens('\x1b[0m')).toBe('\x1b[0m');
  });

  it('agrees with the studio about which pen a colour lands on', () => {
    // The preview collapses a Cell's 0-15 index; this collapses an SGR
    // parameter. Bright yellow is yellow in both, and that is the point.
    expect(eightPen(11)).toBe(3);
    expect(eightPen(12)).toBe(4);
    expect(eightPen(3)).toBe(3);
    expect(foldSgrParameter(93)).toBe(33);
    expect(foldSgrParameter(33)).toBe(33);
    expect(foldSgrParameter(1)).toBe(1);
  });
});
