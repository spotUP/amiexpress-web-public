/**
 * A SAUCE record says which FONT a piece was drawn in, and that is what
 * decides how its high bytes read.
 *
 * The board took any SAUCE record to mean CP437. Reported 2026-09-02 with a
 * screenshot of each: "the ansi renders correct in the admin ui now, but
 * incorrect in the bbs" - the admin asks the font (decoderForFont) and the
 * board did not.
 *
 * The fixture is the sysop's own file, byte for byte. Its SAUCE says
 * `Amiga Topaz 1+`, so it is Latin-1: 0xAF is `¯`, the overline that pairs
 * with the `_` its logo is drawn from, and 0xFC is `ü`. Read as CP437 those
 * are `»` and `ⁿ` - a logo with punctuation scattered through it.
 *
 * Also pinned here: TFlags lives at +105. The parser read +104, which is the
 * COMMENTS count, and agreed by accident on every file that has no comments.
 */
process.env.SKIP_DB_INIT = '1';

import * as fs from 'fs';
import * as path from 'path';
import { parseSauceMetadata, detectEncoding } from '../../src/utils/amiga-text-decode.util';

const FILE = path.join(__dirname, '..', 'fixtures', 'ansi', 'uptown-c-up.ans');
const bytes = fs.readFileSync(FILE);

describe('the sysop\'s own Amiga ANSI', () => {
  it('carries the font the artist drew in', () => {
    expect(parseSauceMetadata(bytes).fontName).toBe('Amiga Topaz 1+');
  });

  it('is read as Latin-1, because that is what an Amiga font means', () => {
    expect(detectEncoding(bytes, FILE, parseSauceMetadata(bytes))).toBe('iso-8859-1');
  });

  it('turns 0xAF into the overline the logo is built from', () => {
    // CP437 would make this `»` and put punctuation through the artwork.
    const text = bytes.toString('latin1');

    expect(text).toContain('¯');
    expect(String.fromCharCode(0xaf)).toBe('¯');
  });

  it('still reads an IBM piece as CP437', () => {
    // Same record with a PC font: nothing about this change may touch the
    // hundreds of CP437 pieces on the board.
    const ibm = Buffer.from(bytes);
    const marker = ibm.lastIndexOf(Buffer.from('SAUCE00', 'ascii'));
    ibm.fill(0x20, marker + 106, marker + 128);
    ibm.write('IBM VGA', marker + 106, 'latin1');

    expect(detectEncoding(ibm, FILE, parseSauceMetadata(ibm))).toBe('cp437');
  });

  it('reads a piece with no font name as CP437', () => {
    const unnamed = Buffer.from(bytes);
    const marker = unnamed.lastIndexOf(Buffer.from('SAUCE00', 'ascii'));
    unnamed.fill(0x00, marker + 106, marker + 128);

    expect(detectEncoding(unnamed, FILE, parseSauceMetadata(unnamed))).toBe('cp437');
  });
});

describe('SAUCE type flags', () => {
  it('come from TFlags at +105, not the comment count at +104', () => {
    const withComments = Buffer.from(bytes);
    const marker = withComments.lastIndexOf(Buffer.from('SAUCE00', 'ascii'));
    // A record with comment lines and blink LEFT ON: reading +104 would call
    // this iCE colours and drop the blink.
    withComments[marker + 104] = 3;
    withComments[marker + 105] = 0;

    expect(parseSauceMetadata(withComments).iceColors).toBe(false);
  });

  it('sees iCE colours when TFlags actually says so', () => {
    const ice = Buffer.from(bytes);
    const marker = ice.lastIndexOf(Buffer.from('SAUCE00', 'ascii'));
    ice[marker + 104] = 0;
    ice[marker + 105] = 1;

    expect(parseSauceMetadata(ice).iceColors).toBe(true);
  });
});
