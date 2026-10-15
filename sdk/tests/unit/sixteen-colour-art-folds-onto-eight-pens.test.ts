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
    // The bold goes with them: on eight pens it is not an attribute the
    // board can honour, and a terminal reading it as brightness would put
    // back the colour the fold had just taken out.
    expect(foldAnsiToEightPens('\x1b[1;93;104mX')).toBe('\x1b[33;44mX');
  });

  it('drops bold, because bold IS the sixteenth colour on this board', () => {
    // A census of the board's own art: zero aixterm codes in 23 files, and
    // 1320 `ESC[1;3Xm`. Sparing bold would spare every bright colour there
    // is here, and an eight-colour board would still send sixteen.
    expect(foldAnsiToEightPens('\x1b[1;33mX')).toBe('\x1b[33mX');
    expect(foldAnsiToEightPens('\x1b[0;1;36mX')).toBe('\x1b[0;36mX');
  });

  it('removes a bold that has nothing beside it, rather than leaving a reset', () => {
    // `ESC[1m` with the 1 taken out is `ESC[m` - which is `ESC[0m`, a reset,
    // and would strip the colour the art had already set.
    expect(foldAnsiToEightPens('\x1b[1mX')).toBe('X');
    expect(foldAnsiToEightPens('\x1b[32m\x1b[1mX')).toBe('\x1b[32mX');
  });

  it('keeps the other attributes it finds beside bold', () => {
    expect(foldAnsiToEightPens('\x1b[1;7mX')).toBe('\x1b[7mX');
  });

  it('returns text with no bright codes and no bold byte-identical', () => {
    const art = '\x1b[0;32mGreen\x1b[36m Cyan\x1b[0m\r\n\x1b[7mReverse\x1b[0m';
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
