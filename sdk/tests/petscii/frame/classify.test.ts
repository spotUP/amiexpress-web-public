import { looksLikeAsciiArt, positionsCursorAbsolutely, hasTabularGutters, classifyRow, contentWidth, rowText, isRuleRow, columnParts, hasColumnStructure } from '../../../petscii/frame/classify';
import { textToFrame } from '../../../petscii/frame/types';

const row = (s: string) => textToFrame([s], 80, 1).cells[0];

describe('looksLikeAsciiArt (port of web/backend/src/utils/ascii-art.util.ts)', () => {
  it('whitespace, pure symbols, deep indent and heavy punctuation are art', () => {
    expect(looksLikeAsciiArt('')).toBe(true);
    expect(looksLikeAsciiArt('   ')).toBe(true);
    expect(looksLikeAsciiArt('---')).toBe(true);
    expect(looksLikeAsciiArt('+-+-+')).toBe(true);
    expect(looksLikeAsciiArt(' '.repeat(33) + 'text')).toBe(true);
    expect(looksLikeAsciiArt('    -|-')).toBe(true);
    expect(looksLikeAsciiArt('.------------------------------------..--------------------------------------.')).toBe(true);
    expect(looksLikeAsciiArt('|__|_____|_____|__| cOLORWALL v1.3 (w) bY sHADOW mAN/aFL `94 |__|_____|_____|__|')).toBe(true);
  });

  it('ordinary prose and help rows are not art', () => {
    expect(looksLikeAsciiArt('Below are the available AmiExpress commands with brief descriptions.')).toBe(false);
    expect(looksLikeAsciiArt('Enter command you want HELP with [press <RETURN> to quit]->')).toBe(false);
    expect(looksLikeAsciiArt('files   browse a door\'s own files on disk')).toBe(false);
  });

  it('the artChars >= 8 branch (>= 8 of |_/\\-() with ratio < 0.8) is reachable on its own', () => {
    // 'a-b-c-d-e-f-g-h-i': 8 dashes (artChars), (letters+digits)/length = 9/17
    // ~= 0.53 - clears the punctuationRatio>=0.6 branch (0.47<0.6) and the
    // dead-by-construction symbolCount>=3&&ratio<0.4 branch (0.53 is not
    // <0.4), so this line reaches the artChars branch specifically.
    expect(looksLikeAsciiArt('a-b-c-d-e-f-g-h-i')).toBe(true);
  });
});

describe('positionsCursorAbsolutely (port)', () => {
  it('matches CUP/HVP/CUU-CUB/CHA/VPA/CNL/CPL and bare home, not SGR', () => {
    expect(positionsCursorAbsolutely('\x1b[9;3Hfiles')).toBe(true);
    expect(positionsCursorAbsolutely('\x1b[5;1f-')).toBe(true);
    expect(positionsCursorAbsolutely('\x1b[3AX')).toBe(true);
    expect(positionsCursorAbsolutely('\x1b[HX')).toBe(true);
    expect(positionsCursorAbsolutely('\x1b[2Jx')).toBe(true);   // erase display, clearing before a paint
    expect(positionsCursorAbsolutely('\x1b[u')).toBe(true);     // restore cursor, resuming a paint
    expect(positionsCursorAbsolutely('\x1b[0;37;40mplain')).toBe(false);
    expect(positionsCursorAbsolutely('')).toBe(false);
  });
});

describe('hasTabularGutters', () => {
  it('needs two runs of two or more spaces inside the text', () => {
    expect(hasTabularGutters('?   - Show the current conf menu  B   - Bulletins')).toBe(true);
    expect(hasTabularGutters('| Handle: Sysop                      || Location: Local Console              |')).toBe(true);
    expect(hasTabularGutters('one  gap only')).toBe(false);
    expect(hasTabularGutters('   leading and trailing spaces do not count   ')).toBe(false);
  });
});

/**
 * A horizontal rule survives truncation: cut `.-----.` at 40 columns and what
 * is left is still a rule. That is what lets `crop` take a row `isCroppable`
 * refuses (its one-repeated-glyph test cannot see a rule, because a rule mixes
 * '-' with its corners).
 */
describe('isRuleRow', () => {
  it('every non-blank cell non-alphanumeric and not reverse', () => {
    expect(isRuleRow(row('.----------------------------------.'))).toBe(true);
    expect(isRuleRow(row('`----------------------------------\''))).toBe(true);
    expect(isRuleRow(row('|__|__|__|'))).toBe(true);
    expect(isRuleRow(row('|--+----------+-------+----|'))).toBe(true);
    expect(isRuleRow(row('   ---   ---   '))).toBe(true);
  });

  it('one letter or digit makes it content, and an empty row is not a rule', () => {
    // WHAT's junction rows draw their tees with the LETTER 'v'
    // (`|--v---------v----|`), so they are not rules by this definition and
    // they must not be: the test cannot tell that 'v' from a one-character
    // cell of content. They still cost one row - the ladder narrows them.
    expect(isRuleRow(row('|--v----------v-------v----|'))).toBe(false);
    expect(isRuleRow(row('|--+-------- 2 -------+----|'))).toBe(false);
    expect(isRuleRow(row('.--- WHAT ---.'))).toBe(false);
    expect(isRuleRow(row(''))).toBe(false);
    expect(isRuleRow(row('   '))).toBe(false);
  });

  it('a reverse-video block is paint, not a rule: cropping it would drop colour', () => {
    const cells = row('----------');
    (cells[3] as any).rvs = true;
    expect(isRuleRow(cells)).toBe(false);
  });
});

describe('columnParts / hasColumnStructure', () => {
  const texts = (cells: ReturnType<typeof row>) => columnParts(cells).map((p) => p.map((c) => c.ch).join(''));

  it("splits on '|' cells when there are two or more, dropping the outer border parts", () => {
    expect(texts(row('|Nd| Username | Status |'))).toEqual(['Nd', 'Username', 'Status']);
    expect(texts(row('| one column only |'))).toEqual(['one column only']);
    expect(hasColumnStructure(row('| one column only |'))).toBe(true);
  });

  it('falls back to interior runs of two-or-more blanks, leading indent excluded', () => {
    expect(texts(row('  [U] - UPLOAD  [D] - DOWNLOAD  [RZ] - ZMODEM'))).toEqual(['[U] - UPLOAD', '[D] - DOWNLOAD', '[RZ] - ZMODEM']);
    expect(texts(row('Sysop            Local Console              1234 calls   ratio 1:3')))
      .toEqual(['Sysop', 'Local Console', '1234 calls', 'ratio 1:3']);
  });

  it('one gutter, one pipe, prose and a blank row have no column structure', () => {
    expect(columnParts(row('one  gap only'))).toEqual([]);
    expect(columnParts(row('a | b'))).toEqual([]);
    expect(columnParts(row('the quick brown fox jumps over the lazy dog'))).toEqual([]);
    expect(columnParts(row(''))).toEqual([]);
    expect(hasColumnStructure(row('one  gap only'))).toBe(false);
  });

  it('keeps the cells themselves, so a part carries its colours', () => {
    const cells = row('|ab| cd |');
    (cells[1] as any).fg = 7;
    expect(columnParts(cells)[0][0]).toMatchObject({ ch: 'a', fg: 7 });
  });
});

describe('classifyRow', () => {
  it('blank / bordered / art / prose', () => {
    expect(classifyRow(row(''))).toBe('blank');
    expect(classifyRow(row('==============================================================================='))).toBe('art');
    // Was 'table' before Phase 3 Task 2: a row with column structure and
    // alphanumeric content is now 'bordered', ahead of the art test, so the
    // ladder can narrow it instead of splitting it in half.
    expect(classifyRow(row('Sysop            Local Console              1234 calls   ratio 1:3'))).toBe('bordered');
    expect(classifyRow(row('?   - Show the current conf menu  B   - Bulletins'))).toBe('bordered');
    expect(classifyRow(row('| WHAT: Transfer Activities v2.0 [REL 2] |'))).toBe('bordered');
    expect(classifyRow(row('Below are the available AmiExpress commands with brief descriptions.'))).toBe('prose');
  });

  it('a row with no column structure still classifies as ART, not TABLE (see classify.ts doc comment)', () => {
    expect(classifyRow(row('      uSeR nAME: Sysop                  dOWNLoADeD tODaY: 0 bYTeS'))).toBe('art');
    // Was 'art' before Phase 3 Task 2: two gutters make it bordered.
    expect(classifyRow(row('  ND#/Calls    User/PhoneNumber                Location/Action'))).toBe('bordered');
  });

  it('a reverse-video space is content, not blank', () => {
    const cells = row('');
    (cells[3] as any).rvs = true;
    expect(classifyRow(cells)).not.toBe('blank');
    expect(contentWidth(cells)).toBe(4);
  });

  it('rowText and contentWidth trim trailing blanks only', () => {
    expect(rowText(row('  ab  '))).toBe('  ab');
    expect(contentWidth(row('  ab  '))).toBe(4);
    expect(contentWidth(row(''))).toBe(0);
  });
});
