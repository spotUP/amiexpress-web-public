/**
 * Level 1.5 character sets (ETSI EN 300 706, levels plan E1-E4): the Latin
 * G0 national option sub-sets, G2, the G2 column-4 diacritics, and the one
 * rule every character the renderer draws goes through - `displayable`.
 *
 * Tables transcribed from ccextractor's telxcc.c (G0_LATIN_NATIONAL_SUBSETS,
 * G0_LATIN_NATIONAL_SUBSETS_MAP, G2), a working decoder, and checked against
 * the standard's Table 36 / Table 33 / Annex.
 */
import { TELETEXT_FONT_RANGES } from '../../teletext-font-coverage';
import type { NationalSubset } from '../model/types';

/** The thirteen G0 positions a national option sub-set replaces (s.15.2, Table 36). */
export const NATIONAL_POSITIONS = [
  0x23, 0x24, 0x40, 0x5b, 0x5c, 0x5d, 0x5e, 0x5f, 0x60, 0x7b, 0x7c, 0x7d, 0x7e,
] as const;

/**
 * Each Latin sub-set's thirteen characters, in NATIONAL_POSITIONS order,
 * indexed as ccextractor indexes them (what DESIGNATION_TO_SUBSET returns).
 */
export const LATIN_SUBSETS: readonly string[] = [
  '£$@«½»^#-¼¦¾÷', // 0 English
  'éïàëêùî#èâôûç', // 1 French
  '#¤ÉÄÖÅÜ_éäöåü', // 2 Swedish/Finnish/Hungarian
  '#ůčťžýířéáěúš', // 3 Czech/Slovak
  '#$§ÄÖÜ^_°äöüß', // 4 German
  'ç$¡áéíóú¿üñèà', // 5 Portuguese/Spanish
  '£$é°ç»^#ùàòèì', // 6 Italian
  '#¤ŢÂŞĂÎıţâşăî', // 7 Rumanian
  '#ńąŻŚŁćóężśłź', // 8 Polish
  'TğİŞÖÇÜĞışöçü', // 9 Turkish
  '#ËČĆŽĐŠëčćžđš', // 10 Serbian/Croatian/Slovenian
  '#õŠÄÖžÜÕšäöžü', // 11 Estonian
  '#$ŠėęŽčūšąųžį', // 12 Lettish/Lithuanian
];

const ENGLISH = 0;
const __ = -1;
/**
 * Default G0/G2 designation + national option (7 bits: family in bits 3-6,
 * C12-C14 in bits 0-2, C12 lowest; Table 33) -> LATIN_SUBSETS index. -1 is a
 * non-Latin family (Cyrillic, Greek, Arabic, Hebrew) or a reserved code.
 */
export const DESIGNATION_TO_SUBSET: readonly number[] = [
  0, 1, 2, 3, 4, 5, 6, 7, // family 0: Western Europe
  8, 1, 2, 3, 4, __, 6, __, // family 1: Polish in place of English
  0, 1, 2, 9, 4, 5, 6, __, // family 2: Turkish in place of Czech
  __, __, __, __, __, 10, __, 7, // family 3: Serbian/Croatian/Slovenian, Rumanian
  __, __, 11, 3, 4, __, 12, __, // family 4: Estonian, Lettish/Lithuanian
  __, __, __, __, __, __, __, __, // family 5
  __, __, __, 9, __, __, __, __, // family 6: Turkish
];

/** C12-C14 (C12 = bit 0) -> the model's sub-set name: family 0 of DESIGNATION_TO_SUBSET. */
export const SUBSET_BY_C_BITS: readonly NationalSubset[] = [
  'english', 'french', 'swedish_finnish', 'czech_slovak',
  'german', 'portuguese_spanish', 'italian', 'undefined',
];

/**
 * The thirteen characters a designation puts in NATIONAL_POSITIONS, or null
 * for the plain primary G0.
 *
 * English is deliberately null. Its row exists in the standard (# -> £,
 * { -> ¼ and so on), but index 0 is also what a page that declares no
 * sub-set decodes to, and this board's own pages are written in plain
 * ASCII - substituting there would turn every '#' into '£' on pages that
 * never asked. A non-Latin family also stays on the plain primary G0 (its
 * Cyrillic/Greek/Arabic/Hebrew G0 is not modelled; levels plan open item).
 */
export function nationalTable(designation: number | null | undefined): string | null {
  if (designation === null || designation === undefined) return null;
  const at = DESIGNATION_TO_SUBSET[designation & 0x7f] ?? -1;
  return at <= ENGLISH ? null : LATIN_SUBSETS[at];
}

/** A sub-set name's designation in family 0 (C12-C14), or null when it names none. */
export function designationForSubset(subset: string | undefined): number | null {
  const at = SUBSET_BY_C_BITS.indexOf(subset as NationalSubset);
  return at < 0 || subset === 'undefined' ? null : at;
}

/** G0 code -> character, through the national table when one is in force. */
export function g0Char(charCode: number, table: string | null): string {
  if (charCode < 0x20 || charCode > 0x7e) return ' '; // 0x7F = DEL
  if (table) {
    const at = NATIONAL_POSITIONS.indexOf(charCode as (typeof NATIONAL_POSITIONS)[number]);
    if (at !== -1) return table[at];
  }
  return String.fromCharCode(charCode);
}

/** G2 Latin (Table 38 / Annex), 0x20-0x7F; column 4 as spacing accents. */
const G2_LATIN =
  ' ¡¢£$¥#§¤‘“«←↑→↓' +
  '°±²³×µ¶·÷’”»¼½¾¿' +
  ' `´ˆ˜¯˘˙¨ ˚¸_˝˛ˇ' +
  '―¹®©™♪€‰α   ⅛⅜⅝⅞' +
  'ΩÆĐªĦ ĲĿŁØŒºÞŦŊŉ' +
  'ĸæđðħıĳŀłøœßþŧŋ ';

export function g2Char(charCode: number): string {
  return charCode >= 0x20 && charCode <= 0x7f ? G2_LATIN[charCode - 0x20] : ' ';
}

/**
 * G2 column 4 (0x40-0x4F) as combining marks, by the low nibble an X/26
 * mode 0x11-0x1F carries (s.12.3.1, Table 29). 0, 9 and C put no mark.
 */
const DIACRITIC_MARKS: readonly (string | null)[] = [
  null, '̀', '́', '̂', '̃', '̄', '̆', '̇',
  '̈', null, '̊', '̧', null, '̋', '̨', '̌',
];

/**
 * A G0 letter with a G2 diacritic: the precomposed character where Unicode
 * has one (NFC to a single code point), else the base letter alone.
 */
export function composeDiacritic(base: string, diacritic: number): string {
  const mark = DIACRITIC_MARKS[diacritic & 0x0f];
  if (!mark) return base;
  const composed = (base + mark).normalize('NFC');
  return [...composed].length === 1 ? composed : base;
}

/** Does TeletextUPR draw this code point? (Private Use Area is the renderer's own business.) */
export function teletextFontHas(cp: number): boolean {
  let lo = 0;
  let hi = TELETEXT_FONT_RANGES.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const [first, last] = TELETEXT_FONT_RANGES[mid];
    if (cp < first) hi = mid - 1;
    else if (cp > last) lo = mid + 1;
    else return true;
  }
  return false;
}

/**
 * The nearest character when the precomposed one cannot be drawn and has no
 * plain base letter under it. Order: the font's own neighbour first, then a
 * Latin-1 / ASCII stand-in.
 */
const NEAREST: Record<string, string> = {
  '‘': "'", '’': "'", '“': '"', '”': '"', '―': '-', '—': '-',
  '←': '<', '↑': '^', '→': '>', '↓': 'v', '™': 'T', '♪': '#',
  '€': 'E', '‰': '%', 'α': 'a', 'Ω': 'O', '⅛': '/', '⅜': '/',
  '⅝': '/', '⅞': '/', 'Đ': 'Ð', 'đ': 'd', 'Ħ': 'H',
  'ħ': 'h', 'ı': 'i', 'ĸ': 'k', 'Ŀ': 'L', 'ŀ': 'l', 'Ł': 'L',
  'ł': 'l', 'ŉ': 'n', 'Ŋ': 'N', 'ŋ': 'n', 'Œ': 'O', 'œ': 'o',
  'Ŧ': 'T', 'ŧ': 't', 'Þ': 'P', 'þ': 'p', 'º': 'o', 'Ĳ': 'I',
  'ĳ': 'i', 'ˆ': '^', '˜': '~', '˘': '´', '˙': '·',
  '˚': '°', '˝': '"', '˛': '¸', 'ˇ': '^', '¨': '"',
  '¯': '-', '¸': ',', '´': "'",
};

/** Where a character is going: a TeletextUPR session, or a Latin-1 terminal (telnet ANSI, Amiga). */
export type CharTarget = 'teletext' | 'latin1';

function drawable(ch: string, target: CharTarget): boolean {
  const cp = ch.codePointAt(0)!;
  if (cp >= 0x20 && cp <= 0x7e) return true;
  return target === 'teletext' ? teletextFontHas(cp) : cp >= 0xa0 && cp <= 0xff;
}

/**
 * The one gate every text character passes on its way out: the character
 * itself when the target draws it, else its base letter, else its nearest
 * stand-in. Teletext mode never emits a code point the font lacks.
 */
export function displayable(ch: string, target: CharTarget): string {
  if (drawable(ch, target)) return ch;
  const base = ch.normalize('NFD')[0];
  if (base !== ch && drawable(base, target)) return base;
  const near = NEAREST[ch];
  if (near !== undefined) return drawable(near, target) ? near : displayable(near, target);
  return '?';
}
