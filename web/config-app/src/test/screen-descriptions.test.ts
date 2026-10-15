/**
 * A screen's name is not what a sysop is looking for.
 *
 * "I can't see the screen files that are shown when i join a conference?" -
 * they were right there, as CONF_BULL and MENU. Nothing on the page said that
 * CONF_BULL is the bulletin a caller meets on joining, or that JOINCONF is the
 * list shown when they type J with no number. The catalogue name is what the
 * board calls the file; the description is what the sysop is actually asking
 * about.
 */
import { describe, expect, it } from 'vitest';
import { SCREEN_DESCRIPTIONS, describeScreen } from '../pages/screen-descriptions';

describe('what each screen is for', () => {
  it('says when a conference join screen is shown', () => {
    expect(describeScreen('CONF_BULL')).toMatch(/join/i);
    expect(describeScreen('JOINCONF')).toMatch(/join/i);
    expect(describeScreen('CONF_JOINMSGBASE')).toMatch(/message base/i);
  });

  it('describes the screens a caller meets before logging on', () => {
    expect(describeScreen('BBSTITLE')).toMatch(/connect|first/i);
    expect(describeScreen('LOGON')).toMatch(/log(s|ged)? on|login/i);
  });

  it('answers for a screen it has never heard of, rather than showing nothing', () => {
    expect(describeScreen('SOMETHING_NEW')).toBe('');
  });

  it('covers every screen the board can display', async () => {
    // The catalogue lives in the backend; this is the list it answers with.
    // A screen added there without a description here shows an empty column,
    // which is the state this file exists to end.
    // The TABLE, not the resolver: screen-resolution reads files, so importing
    // it here dragged fs and path into a browser app's type-check.
    const { SCREEN_DIR_MAP } = await import('@bbs/screens/screen-tables');

    const missing = Object.keys(SCREEN_DIR_MAP).filter(name => !SCREEN_DESCRIPTIONS[name]);
    expect(missing, `No description for: ${missing.join(', ')}`).toEqual([]);
  });
});
