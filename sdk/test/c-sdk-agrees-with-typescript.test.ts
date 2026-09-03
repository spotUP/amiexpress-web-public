/**
 * The C SDK's layout tiers and the TypeScript's are the same numbers.
 *
 * A C door and a TypeScript door on the same 40-column caller have to fold
 * the same way, or the board has two answers to one question. The plan calls
 * for a shared case table so the two "cannot drift in silence"; this is that,
 * in the cheapest honest form - the TypeScript reads the C header and
 * compares, so moving a constant on either side fails here.
 *
 * It is the same class of bug the menu keys and CI's door list were: two
 * things kept in agreement by hand.
 */

import { describe, it, expect } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';

import {
  BREAKPOINT_XXS,
  DEFAULT_GAP,
  DEFAULT_PADDING,
  MOBILE_GAP,
  MOBILE_PADDING,
  getCompactProfile,
  effectsAllowed,
  isCompactWidth,
} from '../engines/ui/blessed/core/responsive-constants';

const cRoot = path.resolve(__dirname, '..', 'c');

/** A `#define NAME value` from a C header. */
function cDefine(file: string, name: string): number {
  const source = fs.readFileSync(path.join(cRoot, file), 'utf8');
  const match = source.match(new RegExp(`#define\\s+${name}\\s+(-?\\d+)`));
  expect(match).toBeTruthy();
  return Number(match![1]);
}

describe('the C SDK', () => {
  it('exists at all - the rest of this file is meaningless otherwise', () => {
    expect(fs.existsSync(path.join(cRoot, 'include', 'ui_profile.h'))).toBe(true);
    expect(fs.existsSync(path.join(cRoot, 'include', 'ae_session.h'))).toBe(true);
  });

  it('breaks to the compact tier at the same width', () => {
    expect(cDefine('include/ui_profile.h', 'UI_BREAKPOINT_XXS'))
      .toBe(BREAKPOINT_XXS);
  });

  it('spends the same gap and padding in each tier', () => {
    const source = fs.readFileSync(path.join(cRoot, 'src', 'ui_profile.c'), 'utf8');
    const value = (name: string): number => {
      const match = source.match(new RegExp(`#define\\s+${name}\\s+(-?\\d+)`));
      expect(match).toBeTruthy();
      return Number(match![1]);
    };

    expect(value('UI_DEFAULT_GAP')).toBe(DEFAULT_GAP);
    expect(value('UI_DEFAULT_PADDING')).toBe(DEFAULT_PADDING);
    expect(value('UI_MOBILE_GAP')).toBe(MOBILE_GAP);
    expect(value('UI_MOBILE_PADDING')).toBe(MOBILE_PADDING);
  });

  it('falls back to the same screen a classic door assumed', () => {
    // 80x25 is what the C side answers when the board says nothing; the
    // TypeScript's own default terminal is the same size.
    expect(cDefine('include/ae_session.h', 'AE_DEFAULT_COLS')).toBe(80);
    expect(cDefine('include/ae_session.h', 'AE_DEFAULT_ROWS')).toBe(25);
  });

  it('agrees about which widths are compact, across the boundary', () => {
    // The TypeScript side, for the record this test exists to protect: the C
    // is tested in sdk/c/tests/test_ui_profile.c against these same widths.
    expect(isCompactWidth(40)).toBe(true);
    expect(isCompactWidth(41)).toBe(false);
    expect(effectsAllowed(40)).toBe(false);
    expect(effectsAllowed(80)).toBe(true);

    const narrow = getCompactProfile(40);
    expect(narrow.borders).toBe(false);
    expect(narrow.gap).toBe(MOBILE_GAP);

    const wide = getCompactProfile(80);
    expect(wide.borders).toBe(true);
    expect(wide.gap).toBe(DEFAULT_GAP);
  });
});
