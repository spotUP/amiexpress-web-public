/**
 * The `?`s a C64 caller saw in a file description, and where they came from.
 *
 * Reported live 2026-09-07: "i got some ?'s in some file_ids". Measured over
 * every DIR file on the board - eleven characters in total that the PETSCII
 * encoder has no glyph for, and NOT ONE of them was Amiga art:
 *
 *   Conf2/DIR1   E2 80 93 / E2 80 98  - a UTF-8 en dash and curly quote,
 *                already decoded as latin1 upstream, so the file holds three
 *                latin1 characters where it meant one
 *   Conf3/DIR1   EF BF BD x6          - U+FFFD replacement characters, art
 *                destroyed by a UTF-8 round trip before this session
 *
 * The second is unrecoverable and this cannot help it. The first is what the
 * board keeps DOING, and that is what these tests pin: text is folded into the
 * Amiga's own repertoire at the moment it becomes an Amiga file's bytes.
 */
import { buildDirEntryLine } from '../../src/utils/dir-file.util';
import { looksLikeMojibake, repairMojibake, toAmigaText } from '../../src/utils/amiga-text.util';

/** The exact bytes on the live board, as a latin1-decoded string. */
const LIVE_MOJIBAKE = 'Tracked Music \u00e2\u0080\u0093 Head-Noddin\u00e2\u0080\u0098 Beats';

describe('the live case', () => {
  it('recognises what Conf2/DIR1 actually holds', () => {
    expect(looksLikeMojibake(LIVE_MOJIBAKE)).toBe(true);
  });

  it('reads it back as the text somebody typed', () => {
    expect(repairMojibake(LIVE_MOJIBAKE)).toBe('Tracked Music \u2013 Head-Noddin\u2018 Beats');
  });

  it('writes it as something a C64 can draw', () => {
    // An en dash is a hyphen here, and a curly quote an apostrophe. Both are
    // in the repertoire; neither is a `?`.
    expect(toAmigaText(LIVE_MOJIBAKE)).toBe("Tracked Music - Head-Noddin' Beats");
  });
});

describe('what must NOT be touched', () => {
  it('leaves real Amiga art alone', () => {
    // Topaz's high half is art, not mojibake: 0xAC, 0xA6, 0xB7 and friends are
    // exactly what a DIR file is supposed to carry.
    const art = '\u00ac\u00a6\u00b7 /\\/ \u00ac\u00a6\u00b7';
    expect(looksLikeMojibake(art)).toBe(false);
    expect(toAmigaText(art)).toBe(art);
  });

  it('leaves plain ASCII alone', () => {
    const line = "A door from the Outlaws (v2.1) - coded by sNoW";
    expect(toAmigaText(line)).toBe(line);
  });

  it('keeps the ESC of an ANSI sequence, which DIR files really carry', () => {
    // Conf2/DIR1 has one: a colour code inside a description.
    expect(toAmigaText('in the world\u001b[36m')).toBe('in the world\u001b[36m');
  });

  it('refuses a repair that would introduce a replacement character', () => {
    // A false positive must leave the text exactly as it was.
    const notUtf8 = '\u00c3 \u0080 alone';
    expect(toAmigaText(notUtf8)).not.toContain('\ufffd');
  });
});

describe('the transliterations', () => {
  it('folds the punctuation a repertoire without it cannot hold', () => {
    expect(toAmigaText('\u2018quoted\u2019 \u201cdouble\u201d \u2026 \u2022 \u2122'))
      .toBe("'quoted' \"double\" ... * (tm)");
  });

  it('marks a character that has no byte here at all', () => {
    expect(toAmigaText('caf\u00e9 \u4e2d')).toBe('caf\u00e9 ?');
  });

  it('drops C1 controls, which are never text', () => {
    expect(toAmigaText('a\u0093b')).toBe('ab');
  });
});

describe('the DIR entry the board writes', () => {
  it('carries no UTF-8 into a latin1 file', () => {
    const line = buildDirEntryLine('DEMO.LHA', 40960, new Date(2026, 8, 7), LIVE_MOJIBAKE, 'P');
    expect(line).toContain("Head-Noddin' Beats");
    // Nothing outside the Amiga's repertoire survives to the disk.
    expect(/[^\u0000-\u00ff]/.test(line)).toBe(false);
  });
});
