/**
 * A RUN OF DASHES IS DRAWN AS A LINE ON A C64.
 *
 * The sysop, 2026-09-22, looking at JoinCnf on a C64: "petscii has better
 * characters than ---- etc to create solid lines". `-` is a hyphen in the
 * middle of its cell with a gap either side, so a rule drawn with it comes
 * out dotted; PETSCII's horizontal line meets its neighbours, and the
 * transducer already maps `U+2500` to it.
 *
 * What is pinned here is the LIMIT as much as the substitution: a hyphen in
 * a word stays a hyphen, a table's column ticks stay ticks, and an
 * eighty-column caller sees no change at all.
 */
import { solidifyRules, RULE_GLYPH } from '@amiexpress/bbs-door-sdk/petscii/frame';
import type { Cell } from '@amiexpress/bbs-door-sdk/petscii/frame';

import { adaptAnsiScreenToForty } from '../../src/screens/adapt-ansi-to-forty';

/** A row of cells from plain text, in the board's default pen. */
const row = (text: string): Cell[] =>
  [...text].map(ch => ({ ch, fg: 1, rvs: false } as Cell));

const textOf = (cells: readonly Cell[]): string => cells.map(c => c.ch).join('');

describe('a rule drawn with dashes', () => {
  it('becomes a line the C64 can join up', () => {
    expect(textOf(solidifyRules(row('+--------+')))).toBe(`+${RULE_GLYPH.repeat(8)}+`);
  });

  it('is drawn as a line wherever it sits in the row', () => {
    expect(textOf(solidifyRules(row('| ---- | ------ |'))))
      .toBe(`| ${RULE_GLYPH.repeat(4)} | ${RULE_GLYPH.repeat(6)} |`);
  });
});

describe('a dash that is punctuation', () => {
  it('is left alone, however the row is drawn', () => {
    for (const text of ['Up Rough - Internal', 'discord-bridge', 'Select Conference [1-14]', 'a -- b']) {
      expect(textOf(solidifyRules(row(text)))).toBe(text);
    }
  });

  it("keeps a table's column ticks, which are single dashes on purpose", () => {
    const rule = '===-===========================-======';

    expect(textOf(solidifyRules(row(rule)))).toBe(rule);
  });
});

describe('a reversed cell', () => {
  it('is a block in the pen colour, not a dash, and stays one', () => {
    const cells = row('----').map(c => ({ ...c, rvs: true }));

    expect(textOf(solidifyRules(cells))).toBe('----');
  });
});

describe('the board screen a C64 caller is served', () => {
  it('has its dashed rules drawn as lines', () => {
    const screen = adaptAnsiScreenToForty('\x1b[34m+------------------------------+\r\nHello - world\r\n');

    expect(screen).toContain(RULE_GLYPH);
    // ...and the sentence under it keeps its hyphen.
    expect(screen).toContain('Hello - world');
  });
});
