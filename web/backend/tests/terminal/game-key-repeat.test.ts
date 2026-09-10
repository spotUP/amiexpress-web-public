/**
 * Game-mode key identity: Shift must not strand a repeat.
 *
 * Sysop 2026-09-10: typing "Li" in the WHIP title filled it with L for
 * ever. Press 'L' (shift held) then release shift before the letter: the
 * keyup arrives as 'l', and tracking by character strands the timer and
 * the held set on 'L'. Identity is the physical key (ev.code); a repeat
 * timer with no fresh edge for GAME_KEY_SILENCE_MS is orphaned and stops.
 *
 * The helpers live in the terminal package; this suite runs them under the
 * backend jest (the terminal package has no runner of its own).
 */
import { trackKeyId, repeatAlive, GAME_KEY_SILENCE_MS } from '@amiexpress/terminal/utils/key-overrides';

describe('trackKeyId', () => {
  it('meets shift-released keyup with its keydown', () => {
    expect(trackKeyId({ key: 'L', code: 'KeyL' })).toBe('KeyL');
    expect(trackKeyId({ key: 'l', code: 'KeyL' })).toBe('KeyL');
    expect(trackKeyId({ key: 'l', code: 'KeyL' })).toBe(trackKeyId({ key: 'L', code: 'KeyL' }));
  });
  it('falls back to the character without a code', () => {
    expect(trackKeyId({ key: 'Enter' })).toBe('Enter');
  });
});

describe('repeatAlive', () => {
  it('a held key with fresh edges stays alive, a silent one dies', () => {
    const now = 100000;
    expect(repeatAlive(now - 500, now)).toBe(true);
    expect(repeatAlive(now - GAME_KEY_SILENCE_MS - 1, now)).toBe(false);
  });
});
