/**
 * "all users with higher security level than 30 does not have unlimited time
 * in the bbs" - the sysop, 2026-09-14.
 *
 * They did not, and the board was right. express.e:3025-3035 (findAcsLevel)
 * rounds a caller's level down to a multiple of five and walks DOWN until an
 * ACS file exists, then reads THAT FILE AND NO OTHER. Permissions do not
 * inherit upward - a higher level exists so that it can differ, including by
 * granting less. On this board only ACS.30.info carried
 * ACS.OVERRIDE_TIMELIMIT, so callers at 30-49 had unlimited time and callers
 * at 50, 60 and 255 - served by their own files - did not.
 *
 * The Security page renders one level at a time, so none of that was visible.
 * This is the rule it now shows.
 */
import { describe, expect, it } from 'vitest';
import { flagCoverage } from '../src/pages/acs-flag-coverage';

const LEVELS = [10, 20, 30, 50, 60, 255];
const TIMELIMIT = 'ACS.OVERRIDE_TIMELIMIT';

/** The live board on the day it was reported: level 30 and nothing else. */
const grants = {
  10: { 'ACS.DOWNLOAD': true },
  20: { 'ACS.DOWNLOAD': true },
  30: { [TIMELIMIT]: true },
  50: { 'ACS.DOWNLOAD': true },
  60: { 'ACS.DOWNLOAD': true },
  255: { 'ACS.SYSOP_COMMANDS': true },
};

describe('a permission granted on one level', () => {
  it('names the higher levels that do not have it', () => {
    const coverage = flagCoverage(TIMELIMIT, LEVELS, grants, 30, true);

    expect(coverage.granted).toEqual([30]);
    expect(coverage.missingAbove).toEqual([50, 60, 255]);
  });

  it('says nothing about levels below the one being edited', () => {
    // 10 and 20 lack it too, but a level below cannot serve a caller who is
    // above it - findAcsLevel only ever walks down.
    const coverage = flagCoverage(TIMELIMIT, LEVELS, grants, 30, true);

    expect(coverage.missingAbove).not.toContain(10);
    expect(coverage.missingAbove).not.toContain(20);
  });

  it('is clear once every higher level has it too', () => {
    const fixed = { ...grants, 50: { [TIMELIMIT]: true }, 60: { [TIMELIMIT]: true }, 255: { [TIMELIMIT]: true } };
    const coverage = flagCoverage(TIMELIMIT, LEVELS, fixed, 30, true);

    expect(coverage.missingAbove).toEqual([]);
    expect(coverage.granted).toEqual([30, 50, 60, 255]);
  });

  it('reads the form rather than the disk for the level being edited', () => {
    // Ticking the box has to raise the warning immediately; waiting for a save
    // is how the sysop finds out a day later.
    const coverage = flagCoverage(TIMELIMIT, LEVELS, { ...grants, 30: {} }, 30, true);

    expect(coverage.granted).toEqual([30]);
    expect(coverage.missingAbove).toEqual([50, 60, 255]);
  });

  it('untick on the edited level takes it out of the granted list', () => {
    const coverage = flagCoverage(TIMELIMIT, LEVELS, grants, 30, false);

    expect(coverage.granted).toEqual([]);
  });

  it('survives a level whose file could not be parsed', () => {
    const coverage = flagCoverage(TIMELIMIT, LEVELS, undefined, 30, true);

    expect(coverage.granted).toEqual([30]);
    expect(coverage.missingAbove).toEqual([50, 60, 255]);
  });

  it('orders the levels numerically, not as the directory listed them', () => {
    const coverage = flagCoverage(TIMELIMIT, [255, 60, 30, 50], grants, 30, true);

    expect(coverage.missingAbove).toEqual([50, 60, 255]);
  });
});
