/**
 * Text on its way into a file the AMIGA owns.
 *
 * A DIR file is latin1 - the Amiga's own repertoire, where 0xAC is the logical
 * NOT sign and the high half is Topaz's art. Two things arrive that are not:
 *
 * 1. REAL UTF-8, from a modern FILE_ID.DIZ or a web form. An en dash is three
 *    bytes there and none here.
 * 2. MOJIBAKE - UTF-8 that has already been decoded AS latin1 upstream, so the
 *    string holds three latin1 characters where it meant one dash. Measured on
 *    the live board: Conf2/DIR1 carries exactly that (E2 80 93), and it
 *    reaches a C64 caller as `?` because none of the three is a PETSCII glyph.
 *
 * Both end the same way - a byte the Amiga cannot mean and a C64 cannot draw -
 * so both are folded into the repertoire BEFORE they are written. Once a DIR
 * file holds them the original is unrecoverable: Conf3/DIR1 on the live board
 * holds six U+FFFD replacement characters where art used to be, and nothing
 * can say what they were.
 */

/**
 * Characters with NO BYTE in the Amiga's repertoire, and the nearest thing
 * that has one.
 *
 * Only code points ABOVE latin1 appear here, and that boundary is the whole
 * rule: `\u00b7`, `\u00ab`, `\u00a9` and the rest of the high half are REAL
 * AMIGA BYTES that Topaz draws and DIR art is built from. Folding those would
 * destroy the pictures this is meant to protect - which a test caught doing
 * exactly that to `\u00b7` before this comment existed.
 */
const TRANSLITERATIONS: ReadonlyArray<readonly [RegExp, string]> = [
  [/[\u2010-\u2015]/g, '-'],
  [/[\u2018\u2019\u201b]/g, "'"],
  [/[\u201c\u201d\u201f]/g, '"'],
  [/\u2026/g, '...'],
  [/\u2022/g, '*'],
  [/[\u2039\u203a]/g, "'"],
  [/\u2122/g, '(tm)'],
  [/[\u2190-\u21ff]/g, '-'],
  [/\ufffd/g, '?'],
];

/**
 * Does this string look like UTF-8 that was decoded as latin1?
 *
 * The signature is a UTF-8 lead byte followed by continuation bytes that
 * landed in the C1 block. Real Amiga art does not put C1 controls after a
 * letter, so this does not fire on it.
 */
export function looksLikeMojibake(text: string): boolean {
  return /[\u00c2-\u00df][\u0080-\u00bf]|[\u00e0-\u00ef][\u0080-\u00bf]{2}/.test(text);
}

/** Undo one latin1-decoding of UTF-8 bytes, when that is what happened. */
export function repairMojibake(text: string): string {
  if (!looksLikeMojibake(text)) return text;
  try {
    const repaired = Buffer.from(text, 'latin1').toString('utf8');
    // Only accept the repair when it introduced no replacement character: a
    // false positive must leave the text exactly as it was.
    return repaired.includes('\ufffd') ? text : repaired;
  } catch {
    return text;
  }
}

/**
 * Text an Amiga file can hold and a C64 can draw.
 *
 * Repairs a latin1-decoded UTF-8 string, transliterates the punctuation that
 * has no equivalent, and drops the controls that are not text - keeping tab
 * and the ESC of an ANSI sequence, which DIR files genuinely carry and the
 * transducer genuinely reads.
 */
export function toAmigaText(text: string): string {
  let out = repairMojibake(text);
  for (const [pattern, replacement] of TRANSLITERATIONS) out = out.replace(pattern, replacement);
  // Anything still outside latin1 has no byte here at all.
  out = out.replace(/[^\u0000-\u00ff]/g, '?');
  // C1 controls are never text; C0 keeps tab (09) and escape (1B).
  out = out.replace(/[\u0080-\u009f]/g, '');
  out = out.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001a\u001c-\u001f]/g, '');
  return out;
}
