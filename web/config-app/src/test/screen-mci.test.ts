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
  firstLineEnablesMci, canvasEnablesMci, textUnder, describeCarry,
  tokenEdit, tokenRemoval, splitToken,
  type MciCodeShape, type MciCanvas,
} from '../pages/screen-mci';
import { conferenceOfPath } from '../pages/ScreenFilesPage';

/** Rows of characters, which is all these functions need of a canvas. */
function canvasOf(...rows: string[]): MciCanvas {
  return rows.map(row => [...row].map(char => ({ char })));
}

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
    expect(firstLineEnablesMci('~')).toBe(true);
    expect(firstLineEnablesMci('~SS_x|')).toBe(true);
    expect(firstLineEnablesMci('art')).toBe(false);
    expect(firstLineEnablesMci('   ')).toBe(false);
    expect(firstLineEnablesMci('')).toBe(false);
  });

  it('is read off the canvas the sysop is drawing on', () => {
    expect(canvasEnablesMci(canvasOf('~', 'art'))).toBe(true);
    expect(canvasEnablesMci(canvasOf('art', '~CC_gwall|'))).toBe(false);
    expect(canvasEnablesMci([])).toBe(false);
  });
});

describe('what typing a code would paint over', () => {
  it('is nothing when the cells are blank', () => {
    expect(textUnder(canvasOf('~', '          '), 0, 1, 5)).toBe('');
  });

  it('is the art itself when they are not', () => {
    expect(textUnder(canvasOf('~', '####------'), 0, 1, 4)).toBe('####');
  });

  it('is empty past the end of a row, so the end of a line is always free', () => {
    expect(textUnder(canvasOf('~', 'ab'), 5, 1, 4)).toBe('');
    expect(textUnder(canvasOf('~'), 0, 9, 4)).toBe('');
  });
});

describe('what a replace costs', () => {
  const verdict = (over = {}) => ({
    path: 'Node1/LOGON.TXT', carried: [], lost: [], uploadHasCodes: false, ...over,
  });

  it('says plainly when the upload is the whole truth', () => {
    expect(describeCarry(verdict({ uploadHasCodes: true, carried: ['~CC_gwall|'] })))
      .toContain('codes of its own');
  });

  it('says there is nothing to keep when the screen has no codes', () => {
    expect(describeCarry(verdict())).toBe('This screen carries no codes, so there is nothing to keep');
  });

  it('counts the lines it would keep', () => {
    expect(describeCarry(verdict({ carried: ['~', '~CC_gwall|'] }))).toBe('2 lines of codes kept');
    expect(describeCarry(verdict({ carried: ['~CC_gwall|'] }))).toBe('1 line of codes kept');
  });

  it('names the lines it cannot place, because those are the ones a sysop must redo', () => {
    const text = describeCarry(verdict({
      carried: ['~'],
      lost: [{ text: '~CC_gwall|', line: 3 }, { text: '~SP', line: 9 }],
    }));

    expect(text).toContain('1 line of codes kept');
    expect(text).toContain('2 among the art cannot be placed (line 3, line 9)');
    expect(text).toContain('put them back');
  });

  it('is honest when nothing at all can be kept', () => {
    expect(describeCarry(verdict({ lost: [{ text: '~SP', line: 4 }] })))
      .toContain('No codes can be kept');
  });
});

describe('changing a code already in a screen', () => {
  it('pads a shorter replacement, so no tail of the old one is left as art', () => {
    // `~CC_a|` written over `~CC_gwall|` without padding reads `~CC_a|all|`.
    const edit = tokenEdit('~CC_a|', '~CC_gwall|'.length);

    expect(edit.text).toBe('~CC_a|    ');
    expect(edit.text).toHaveLength('~CC_gwall|'.length);
    expect(edit.overwrites).toBe(0);
  });

  it('says how many cells a longer replacement will eat', () => {
    const edit = tokenEdit('~CC_conference-top|', '~CC_a|'.length);

    expect(edit.text).toBe('~CC_conference-top|');
    expect(edit.overwrites).toBe('~CC_conference-top|'.length - '~CC_a|'.length);
  });

  it('replacing a code with one the same length disturbs nothing', () => {
    expect(tokenEdit('~CC_ctop|', '~CC_ctop|'.length)).toEqual({ text: '~CC_ctop|', overwrites: 0 });
  });

  it('removing a code returns its cells to spaces', () => {
    expect(tokenRemoval('~CC_gwall|'.length)).toBe('          ');
  });
});

describe('taking a written code apart', () => {
  const codes: MciCodeShape[] = [
    code({ code: 'CC_', argument: { kind: 'command' }, takesWidth: false, terminator: '|' }),
    code({ code: 'SS_', argument: { kind: 'screen' }, takesWidth: false, terminator: '|' }),
    code({ code: 'SR_', argument: { kind: 'screen' }, takesWidth: true, terminator: '|' }),
    code({ code: 'CL', argument: { kind: 'none' }, takesWidth: false, terminator: '.' }),
    code({ code: 'S', argument: { kind: 'none' }, takesWidth: true, terminator: '|' }),
  ];

  it('splits code, argument and terminator', () => {
    expect(splitToken('~CC_gwall|', codes)).toEqual({ code: 'CC_', argument: 'gwall', width: null });
  });

  it('reads the width prefix, which sits between the tilde and the code', () => {
    expect(splitToken('~5SR_BBS:Screens/flt/flt|', codes))
      .toEqual({ code: 'SR_', argument: 'BBS:Screens/flt/flt', width: 5 });
  });

  it('prefers the longest code, so SS_ is not read as S', () => {
    expect(splitToken('~SS_BBS:screens/uprough.txt|', codes)!.code).toBe('SS_');
  });

  it('handles a code whose terminator is a period', () => {
    expect(splitToken('~CL.', codes)).toEqual({ code: 'CL', argument: '', width: null });
  });

  it('keeps an argument that has no terminator on it', () => {
    // This board writes `~CC_gwall` with no pipe, and a sysop editing it
    // should see the argument, not the whole tail.
    expect(splitToken('~CC_gwall', codes)).toEqual({ code: 'CC_', argument: 'gwall', width: null });
  });

  it('answers nothing for something that is not a code it knows', () => {
    expect(splitToken('~ZZ_nonsense|', codes)).toBeNull();
    expect(splitToken('not a code', codes)).toBeNull();
  });

  it('round-trips through buildMciToken', () => {
    const written = '~CC_gwall|';
    const split = splitToken(written, codes)!;
    const entry = codes.find(c => c.code === split.code)!;

    expect(buildMciToken(entry, split.argument, split.width)).toBe(written);
  });
});

describe('naming the conference a file belongs to', () => {
  const confs = [
    { id: 1, name: 'Amiga Demoscene', dir: 'Conf2' },
    { id: 2, name: 'C64 Demoscene', dir: 'Conf3' },
  ];

  it('names it, because a directory number is not a conference number', () => {
    // express.e reads LOCATION.n from ConfConfig.info; on this board
    // conference 1 lives in Conf2. Parsing the digits out of the path would
    // report the wrong conference with total confidence.
    expect(conferenceOfPath('Conf2/bull20.txt', confs)).toBe('Amiga Demoscene (conference 1)');
    expect(conferenceOfPath('Conf3/bull20.txt', confs)).toBe('C64 Demoscene (conference 2)');
  });

  it('falls back to the directory rather than inventing a number', () => {
    expect(conferenceOfPath('Conf9/bull20.txt', confs)).toBe('Conf9');
  });

  it('says nothing for a file that is not in a conference', () => {
    expect(conferenceOfPath('Node1/LOGON.TXT', confs)).toBeNull();
    expect(conferenceOfPath('Screens/uprough.txt', confs)).toBeNull();
    expect(conferenceOfPath(null, confs)).toBeNull();
  });

  it('matches the directory case-insensitively, like the Amiga does', () => {
    expect(conferenceOfPath('conf2/bull20.txt', confs)).toBe('Amiga Demoscene (conference 1)');
  });
});
