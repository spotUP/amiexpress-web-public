/**
 * FILE_ID.DIZ art must survive being displayed.
 *
 * sanitizeForTags() stripped every character outside \x20-\x7e, which
 * deleted the high-bit glyphs Amiga scene art is drawn with. Each deletion
 * shortens that line by one column, so a rectangular 44-column box loses its
 * right-hand border on exactly the lines that used one - reported from the
 * live BBS as "many file_id's break like this".
 *
 * Real example, $CP-ST14.LZX: all 13 lines are exactly 44 columns and the
 * border is drawn with 0xA1 and 0xF7. The BBS speaks ISO-8859-1/Amiga, so
 * those bytes are display characters, not noise.
 */
import { sanitizeForTags } from '../../../../Doors/door-manager/ViewManager';

describe('DOORMAN sanitizeForTags: Amiga charset', () => {
  it('keeps high-bit characters so art keeps its width', () => {
    const line = '¡/\\__  /     /  ___/ / CoConut /X-DeeSign  ¡';
    expect(line).toHaveLength(44);
    expect(sanitizeForTags(line)).toHaveLength(44);
    expect(sanitizeForTags(line)).toContain('¡');
  });

  it('keeps every line of a real DIZ rectangular', () => {
    const diz = [
      '   __________________                       ',
      '.-/   __/   __/  __ /\\---------------------.',
      '¡/\\__  /     /  ___/ / CoConut /X-DeeSign  ¡',
      '/_____/_____/___/\\_\\/    released today    !',
      '\\_____\\_____\\___\\/-------------------------÷',
      '|                                          ¡',
    ].join('\n');

    const widths = sanitizeForTags(diz).split('\n').map(l => l.length);
    expect(widths).toEqual([44, 44, 44, 44, 44, 44]);
  });

  it('still escapes blessed tag braces', () => {
    // The reason this function exists: an unescaped { would be parsed as
    // markup and swallow part of the art.
    expect(sanitizeForTags('a{b}c')).toBe('a\\{b\\}c');
  });

  it('still removes control characters that would corrupt the screen', () => {
    // An ESC in catalog text could move the cursor or set colours.
    expect(sanitizeForTags('a\x1b[31mb')).toBe('a[31mb');
    expect(sanitizeForTags('a\x07b')).toBe('ab');
  });

  it('leaves newlines alone', () => {
    expect(sanitizeForTags('one\ntwo').split('\n')).toHaveLength(2);
  });
});
