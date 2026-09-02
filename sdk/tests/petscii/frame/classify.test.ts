import { looksLikeAsciiArt, positionsCursorAbsolutely, hasTabularGutters, classifyRow, contentWidth, rowText } from '../../../petscii/frame/classify';
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
});

describe('positionsCursorAbsolutely (port)', () => {
  it('matches CUP/HVP/CUU-CUB/CHA/VPA/CNL/CPL and bare home, not SGR', () => {
    expect(positionsCursorAbsolutely('\x1b[9;3Hfiles')).toBe(true);
    expect(positionsCursorAbsolutely('\x1b[5;1f-')).toBe(true);
    expect(positionsCursorAbsolutely('\x1b[3AX')).toBe(true);
    expect(positionsCursorAbsolutely('\x1b[HX')).toBe(true);
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

describe('classifyRow', () => {
  it('blank / art / table / prose', () => {
    expect(classifyRow(row(''))).toBe('blank');
    expect(classifyRow(row('==============================================================================='))).toBe('art');
    expect(classifyRow(row('Sysop            Local Console              1234 calls   ratio 1:3'))).toBe('table');
    expect(classifyRow(row('?   - Show the current conf menu  B   - Bulletins'))).toBe('table');
    expect(classifyRow(row('Below are the available AmiExpress commands with brief descriptions.'))).toBe('prose');
  });

  it('the ported heuristics call most colon-labelled stat rows ART (indent >= 4 with 2 symbols, or 2 long gaps with 3 symbols) - so they split, not gutter; a pack pins better', () => {
    expect(classifyRow(row('      uSeR nAME: Sysop                  dOWNLoADeD tODaY: 0 bYTeS'))).toBe('art');
    expect(classifyRow(row('  ND#/Calls    User/PhoneNumber                Location/Action'))).toBe('art');
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
