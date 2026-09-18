import { checkBoardRules, boardRulesReason } from '../../petscii/board-rules';
import { writeSeq } from '../../petscii/seq-writer';
import {
  blankSurface, conformToBoard, typeChar, setBackground, setCharsetBank,
} from '../../petscii/editor-surface';

const LOWER = 0x0e;
const UPPER = 0x8e;
const BG = 0x02;
const BLACK = 0x90;
const BLUE = 0x1f;

describe('the two rules a C64 board runs', () => {
  it('passes a screen that selects the lowercase bank and leaves the ground black', () => {
    expect(checkBoardRules([LOWER, 0x48, 0x49])).toEqual([]);
  });

  it('refuses art drawn in the graphics bank, and says where it starts', () => {
    const [violation, ...rest] = checkBoardRules([LOWER, 0x48, UPPER, 0x49, 0x4a]);
    expect(rest).toEqual([]);
    expect(violation.rule).toBe('graphics-bank');
    expect(violation.cells).toBe(2);
    expect(violation.row).toBe(0);
    expect(violation.column).toBe(1);
    expect(violation.reason).toMatch(/lowercase bank/);
  });

  it('counts a file that never selects a bank as the graphics bank - a C64 powers on there', () => {
    expect(checkBoardRules([0x48, 0x49])[0]?.rule).toBe('graphics-bank');
  });

  it('spares a file that flips the bank but draws nothing under it', () => {
    expect(checkBoardRules([LOWER, 0x48, UPPER])).toEqual([]);
  });

  it('ignores blanks: a space is the same glyph in either bank', () => {
    expect(checkBoardRules([UPPER, 0x20, 0x20, LOWER, 0x48])).toEqual([]);
  });

  it('refuses a non-black background, and names the colour it asked for', () => {
    const [violation] = checkBoardRules([LOWER, BG, BLUE, 0x48]);
    expect(violation.rule).toBe('non-black-background');
    expect(violation.color).toBe(6);
    expect(violation.reason).toMatch(/black screen/);
  });

  it('still refuses a background the file blacks again afterwards - the caller saw it', () => {
    const rules = checkBoardRules([LOWER, BG, BLUE, 0x48, BG, BLACK]);
    expect(rules.map(v => v.rule)).toEqual(['non-black-background']);
  });

  it('does not read a colour byte that follows nothing as a background', () => {
    expect(checkBoardRules([LOWER, BLUE, 0x48])).toEqual([]);
  });

  it('reports both rules when a file breaks both', () => {
    const rules = checkBoardRules([UPPER, BG, BLUE, 0x48]);
    expect(rules.map(v => v.rule)).toEqual(['graphics-bank', 'non-black-background']);
    expect(boardRulesReason(rules)).toMatch(/lowercase bank.*black screen/s);
  });

  it('passes what the editor itself writes: a conformed surface round-trips clean', () => {
    const { surface } = typeChar(conformToBoard(blankSurface()), 0, 0, 0x48, 14, false);
    expect(checkBoardRules(writeSeq(surface))).toEqual([]);
  });

  it('catches what the editor would write if the surface were not held to the rules', () => {
    const drawn = typeChar(conformToBoard(blankSurface()), 0, 0, 0x48, 14, false).surface;
    const wrong = setBackground(setCharsetBank(drawn, 0), 6);
    const rules = checkBoardRules(writeSeq(wrong, { declareBackground: true }));
    expect(rules.map(v => v.rule).sort()).toEqual(['graphics-bank', 'non-black-background']);
  });
});
