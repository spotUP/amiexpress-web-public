/**
 * What survives when a designer uploads new art over a screen.
 *
 * The screen is a program and the ANSI editor is not: PabloDraw output carries
 * no `~SS_` and no `~CC_`, so a replace used to write the buffer verbatim and
 * every code in the file was gone without a word. The menu still painted; the
 * keys stopped working.
 */

import { planMciCarry, applyMciCarry } from '../../src/screens/mci-carry';

const LOGON = [
  '~SS_BBS:bulletins/bull6.txt| ~SP',
  '\x1b[31mART LINE ONE',
  '\x1b[32mART LINE TWO',
  '~CC_gwall|',
  '',
].join('\r\n');

const NEW_ART = '\x1b[34mNEW ART\r\nSECOND ROW\r\n';

describe('what an upload would carry', () => {
  test('splits the old file into the codes above the art and the codes below it', () => {
    const plan = planMciCarry(LOGON, NEW_ART);

    expect(plan.head).toEqual(['~SS_BBS:bulletins/bull6.txt| ~SP']);
    expect(plan.tail).toEqual(['~CC_gwall|']);
    expect(plan.lost).toEqual([]);
    expect(plan.uploadHasCodes).toBe(false);
  });

  test('a code among the art is reported as lost, with the line it was on', () => {
    const withMiddle = [
      '~',
      '\x1b[31mART',
      'press ~CC_gwall| to shout',
      '\x1b[32mMORE ART',
      '',
    ].join('\r\n');

    const plan = planMciCarry(withMiddle, NEW_ART);

    expect(plan.lost).toEqual([{ text: '~CC_gwall|', line: 3 }]);
    expect(plan.head).toEqual(['~']);
  });

  test('carries nothing when the upload has codes of its own - the upload wins', () => {
    const plan = planMciCarry(LOGON, '~CC_gwall|\r\nNEW ART\r\n');

    expect(plan.uploadHasCodes).toBe(true);
    expect(plan.head).toEqual([]);
    expect(plan.tail).toEqual([]);
  });

  test('the bare enabling tilde counts as a code of the upload\'s own', () => {
    expect(planMciCarry(LOGON, '~\r\nNEW ART\r\n').uploadHasCodes).toBe(true);
  });

  test('a file that is nothing but codes is all head', () => {
    const plan = planMciCarry('~\r\n~CC_gwall|\r\n', NEW_ART);

    expect(plan.head).toEqual(['~', '~CC_gwall|']);
    expect(plan.tail).toEqual([]);
  });

  test('a line of codes beside other MCI tokens is still a line of codes', () => {
    // This board writes `~ ~3SR_bbs:Screens/logoff`; matching a single
    // pattern would read that as art.
    const plan = planMciCarry('~ ~3SR_bbs:Screens/logoff\r\nART\r\n', NEW_ART);

    expect(plan.head).toEqual(['~ ~3SR_bbs:Screens/logoff']);
  });

  test('art with no codes carries nothing and loses nothing', () => {
    const plan = planMciCarry('\x1b[31mJUST ART\r\n', NEW_ART);

    expect(plan).toMatchObject({ head: [], tail: [], lost: [], uploadHasCodes: false });
  });
});

describe('the bytes an upload actually writes', () => {
  test('above: the head leads, the art follows, the tail closes', () => {
    const plan = planMciCarry(LOGON, NEW_ART);

    expect(applyMciCarry(NEW_ART, plan, 'above')).toBe(
      '~SS_BBS:bulletins/bull6.txt| ~SP\r\n'
      + '\x1b[34mNEW ART\r\nSECOND ROW\r\n'
      + '~CC_gwall|\r\n'
    );
  });

  test('below: everything lands after the art, under a tilde that switches MCI on', () => {
    const plan = planMciCarry(LOGON, NEW_ART);

    // Without that first-line tilde the board parses no code in the file, so
    // the carry would have moved text rather than behaviour.
    expect(applyMciCarry(NEW_ART, plan, 'below')).toBe(
      '~\r\n'
      + '\x1b[34mNEW ART\r\nSECOND ROW\r\n'
      + '~SS_BBS:bulletins/bull6.txt| ~SP\r\n~CC_gwall|\r\n'
    );
  });

  test('none: the uploaded bytes are written exactly as they arrived', () => {
    const plan = planMciCarry(LOGON, NEW_ART);

    expect(applyMciCarry(NEW_ART, plan, 'none')).toBe(NEW_ART);
  });

  test('an upload with its own codes is written untouched whatever the placement', () => {
    const upload = '~CC_gwall|\r\nNEW ART\r\n';
    const plan = planMciCarry(LOGON, upload);

    expect(applyMciCarry(upload, plan, 'above')).toBe(upload);
    expect(applyMciCarry(upload, plan, 'below')).toBe(upload);
  });

  test('an old file with no codes leaves the upload alone', () => {
    const plan = planMciCarry('\x1b[31mJUST ART\r\n', NEW_ART);

    expect(applyMciCarry(NEW_ART, plan, 'above')).toBe(NEW_ART);
  });

  test('uses the upload\'s own line ending rather than the old file\'s', () => {
    const plan = planMciCarry(LOGON, '\x1b[34mNEW ART\n');

    expect(applyMciCarry('\x1b[34mNEW ART\n', plan, 'above'))
      .toBe('~SS_BBS:bulletins/bull6.txt| ~SP\n\x1b[34mNEW ART\n~CC_gwall|\n');
  });

  test('art that does not end in a newline still gets one before the tail', () => {
    const plan = planMciCarry(LOGON, 'NO TRAILING NEWLINE');

    expect(applyMciCarry('NO TRAILING NEWLINE', plan, 'above'))
      .toBe('~SS_BBS:bulletins/bull6.txt| ~SP\nNO TRAILING NEWLINE\n~CC_gwall|\n');
  });

  test('high-bit Amiga bytes in the art survive the carry unchanged', () => {
    const art = '\xa1\xb0\xdb ART \xdb\xb0\xa1\r\n';
    const plan = planMciCarry(LOGON, art);

    expect(applyMciCarry(art, plan, 'above')).toContain('\xa1\xb0\xdb ART \xdb\xb0\xa1');
  });
});

/**
 * Art from an ANSI editor carries a SAUCE record - 128 bytes at the very end,
 * conventionally preceded by an EOF (0x1A) - holding the title, author, group
 * and the FONT the piece was drawn in.
 *
 * Reported from real use: a screen replaced with a Moebius export rendered
 * `_SAUCE00 ...` as text on the canvas AND showed the wrong characters. One
 * cause for both. The carry appended its tail codes after the record, so it
 * was no longer the last 128 bytes; nothing found it, so nothing trimmed it,
 * and `decoderForFont` lost the `Amiga Topaz 1+` hint and fell back to CP437.
 *
 * Worse, invisibly: the board cuts a screen from the SAUCE marker onward, so
 * the codes placed below the art were thrown away at display time - the
 * dialog said "codes kept" and the board dropped them.
 */
describe('art that carries a SAUCE record', () => {
  /** A real 128-byte record: id, 99 bytes of fields, a 22-byte font name. */
  const sauce = (font = 'Amiga Topaz 1+') =>
    'SAUCE00' + '\0'.repeat(99) + font.padEnd(22, '\0');

  const upload = (font?: string) => `\x1b[34mNEW ART\r\n\x1a${sauce(font)}`;
  const installed = '~f\r\n\x1b[31mOLD ART\r\n~SP\r\n';

  test('leaves the record as the last 128 bytes of the file', () => {
    const art = upload();
    const written = applyMciCarry(art, planMciCarry(installed, art), 'above');

    expect(written.length - written.lastIndexOf('SAUCE00')).toBe(128);
  });

  test('keeps the EOF byte in front of it', () => {
    const art = upload();
    const written = applyMciCarry(art, planMciCarry(installed, art), 'above');

    expect(written[written.lastIndexOf('SAUCE00') - 1]).toBe('\x1a');
  });

  test('keeps the font name readable, so Amiga art is not decoded as CP437', () => {
    const art = upload();
    const written = applyMciCarry(art, planMciCarry(installed, art), 'above');

    expect(written.slice(-128)).toContain('Amiga Topaz 1+');
  });

  test('puts the carried codes BEFORE the record, where the board still reads them', () => {
    const art = upload();
    const written = applyMciCarry(art, planMciCarry(installed, art), 'above');

    // The board cuts from the marker; anything after it is gone.
    const shown = written.slice(0, written.lastIndexOf('\x1a'));
    expect(shown).toContain('~f');
    expect(shown).toContain('~SP');
  });

  test('the same holds when every code goes below the art', () => {
    const art = upload();
    const written = applyMciCarry(art, planMciCarry(installed, art), 'below');

    const shown = written.slice(0, written.lastIndexOf('\x1a'));
    expect(shown).toContain('~SP');
    expect(written.length - written.lastIndexOf('SAUCE00')).toBe(128);
  });

  test('art with no SAUCE is written exactly as before', () => {
    const art = '\x1b[34mNEW ART\r\n';
    const written = applyMciCarry(art, planMciCarry(installed, art), 'above');

    expect(written).toBe('~f\r\n\x1b[34mNEW ART\r\n~SP\r\n');
  });

  test('the word SAUCE00 inside the ART is not mistaken for a record', () => {
    // Only a record near the END of the file is one; a screen may legitimately
    // say the word.
    const art = 'SAUCE00 is a metadata format\r\n' + 'x'.repeat(600) + '\r\n';
    const written = applyMciCarry(art, planMciCarry(installed, art), 'above');

    expect(written.endsWith('~SP\r\n')).toBe(true);
  });
});
