/**
 * What the code list shows, and what a picked code becomes.
 *
 * The token tests are the ones that matter: a code written with the wrong
 * terminator prints its own letters at the caller, and the picker is the thing
 * that decides the terminator.
 */
import { describe, expect, it } from 'vitest';
import {
  groupMciCodes, filterMciCodes, describeMciUsage, buildMciToken,
  screenHasEnablingTilde, withEnablingTilde, insertMciToken,
  type MciCodeShape,
} from '../pages/screen-mci';

function code(over: Partial<MciCodeShape> = {}): MciCodeShape {
  return {
    code: 'N', summary: 'The caller\'s handle', family: 'user',
    argument: { kind: 'none' }, takesWidth: true, terminator: '|',
    source: 'express.e:5292', handledBy: 'dispatch', uses: 0, files: 0,
    ...over,
  };
}

describe('the code list', () => {
  it('keeps the families in the catalog\'s order and drops the empty ones', () => {
    const sections = groupMciCodes(
      [code({ code: 'N', family: 'user' }), code({ code: 'CC_', family: 'include' })],
      [
        { family: 'include', label: 'Screens and commands' },
        { family: 'colour', label: 'Colour' },
        { family: 'user', label: 'The caller' },
      ],
    );

    expect(sections.map(s => s.family)).toEqual(['include', 'user']);
    expect(sections[0].codes[0].code).toBe('CC_');
  });

  it('searches the summary, because nobody knows the code is called ~TR', () => {
    const codes = [
      code({ code: 'TR', summary: 'Time remaining this call, in minutes' }),
      code({ code: 'N', summary: 'The caller\'s handle' }),
    ];

    expect(filterMciCodes(codes, 'time remaining').map(c => c.code)).toEqual(['TR']);
    expect(filterMciCodes(codes, '~').map(c => c.code)).toEqual([]);
    expect(filterMciCodes(codes, '  ')).toHaveLength(2);
  });

  it('says plainly when a code has never been used here', () => {
    expect(describeMciUsage({ uses: 0, files: 0 })).toBe('Never used on this board');
    expect(describeMciUsage({ uses: 1, files: 1 })).toBe('Used in 1 file');
    expect(describeMciUsage({ uses: 179, files: 179 })).toBe('Used in 179 files');
    expect(describeMciUsage({ uses: 345, files: 179 })).toBe('Used 345 times, in 179 files');
  });

  it('shows the background colours as eight choices and eight aliases', () => {
    // express.e dispatches b0-b7 and z0-z7 on the SAME arms. Sixteen rows in
    // the list would tell a designer there are sixteen backgrounds.
    const colours = [
      ...Array.from({ length: 8 }, (_, n) => code({ code: `b${n}`, family: 'colour' })),
      ...Array.from({ length: 8 }, (_, n) => code({ code: `z${n}`, family: 'colour', aliasOf: `b${n}` })),
    ];
    const [section] = groupMciCodes(colours, [{ family: 'colour', label: 'Colour' }]);

    expect(section.codes).toHaveLength(16);
    expect(section.codes.filter(c => !c.aliasOf).map(c => c.code))
      .toEqual(['b0', 'b1', 'b2', 'b3', 'b4', 'b5', 'b6', 'b7']);
    expect(section.codes.filter(c => c.aliasOf).map(c => c.aliasOf))
      .toEqual(['b0', 'b1', 'b2', 'b3', 'b4', 'b5', 'b6', 'b7']);
  });
});

describe('the text a picked code becomes', () => {
  it('writes a bare code with its terminator', () => {
    expect(buildMciToken(code({ code: 'f', takesWidth: false }))).toBe('~f|');
  });

  it('writes an argument code with the argument in front of the terminator', () => {
    const cc = code({ code: 'CC_', takesWidth: false, argument: { kind: 'command' } });
    expect(buildMciToken(cc, 'gwall')).toBe('~CC_gwall|');
  });

  it('uses the DOUBLE pipe the parser demands for ~SM_, ~SX_ and ~XC_', () => {
    const sm = code({ code: 'SM_', takesWidth: false, terminator: '||', argument: { kind: 'menu' } });
    expect(buildMciToken(sm, 'MAIN')).toBe('~SM_MAIN||');
  });

  it('uses the PERIOD the parser demands for ~CL, ~CD, ~ML and ~MD', () => {
    const cl = code({ code: 'CL', takesWidth: false, terminator: '.' });
    expect(buildMciToken(cl)).toBe('~CL.');
  });

  it('puts a width between the tilde and the code, where express.e reads it', () => {
    expect(buildMciToken(code({ code: 'N' }), undefined, 20)).toBe('~20N|');
  });

  it('writes the literal tilde as a doubled one', () => {
    expect(buildMciToken(code({ code: '~', takesWidth: false, terminator: '' }))).toBe('~~');
  });

  it('refuses a width on a code with no value to truncate', () => {
    expect(() => buildMciToken(code({ code: 'f', takesWidth: false }), undefined, 20))
      .toThrow(/no value to truncate/);
  });

  it('refuses a width below one column', () => {
    expect(() => buildMciToken(code({ code: 'N' }), undefined, 0)).toThrow(/starts at 1/);
  });

  it('refuses an argument code with nothing chosen', () => {
    const cc = code({ code: 'CC_', takesWidth: false, argument: { kind: 'command' } });
    expect(() => buildMciToken(cc, '   ')).toThrow(/needs/);
  });

  it('refuses a terminator change that is not one character', () => {
    const d = code({ code: 'D', takesWidth: false, terminator: '', argument: { kind: 'char', label: 'New terminator' } });
    expect(buildMciToken(d, '.')).toBe('~D.');
    expect(() => buildMciToken(d, '..')).toThrow(/exactly one character/);
  });
});

describe('the tilde that switches MCI on', () => {
  it('is the first character of the first line, or the codes are just text', () => {
    expect(screenHasEnablingTilde('~\r\nart\r\n')).toBe(true);
    expect(screenHasEnablingTilde('~SS_x|\r\nart')).toBe(true);
    expect(screenHasEnablingTilde('art\r\n~CC_gwall|')).toBe(false);
    expect(screenHasEnablingTilde('\r\n~CC_gwall|')).toBe(false);
    expect(screenHasEnablingTilde('')).toBe(false);
  });

  it('is added on a line of its own, in the file\'s own line ending', () => {
    expect(withEnablingTilde('art\r\nmore\r\n')).toBe('~\r\nart\r\nmore\r\n');
    expect(withEnablingTilde('art\nmore\n')).toBe('~\nart\nmore\n');
  });

  it('is not added twice', () => {
    expect(withEnablingTilde('~\r\nart\r\n')).toBe('~\r\nart\r\n');
  });
});

describe('where a code lands', () => {
  it('goes under the enabling tilde, never above it', () => {
    expect(insertMciToken('~\r\nart\r\n', '~f|', 'above')).toBe('~\r\n~f|\r\nart\r\n');
  });

  it('goes on the first line when there is no enabling tilde yet', () => {
    expect(insertMciToken('art\r\n', '~f|', 'above')).toBe('~f|\r\nart\r\n');
  });

  it('goes on its own line at the end', () => {
    expect(insertMciToken('~\r\nart\r\n', '~SP|', 'below')).toBe('~\r\nart\r\n~SP|\r\n');
    expect(insertMciToken('~\r\nart', '~SP|', 'below')).toBe('~\r\nart\r\n~SP|\r\n');
  });

  it('goes exactly at the cursor when that is what was asked for', () => {
    expect(insertMciToken('abcd', '~N|', 'cursor', 2)).toBe('ab~N|cd');
    expect(insertMciToken('abcd', '~N|', 'cursor', 99)).toBe('abcd~N|');
  });
});
