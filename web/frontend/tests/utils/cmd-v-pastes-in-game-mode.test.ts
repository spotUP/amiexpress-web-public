/**
 * Cmd+V in a game-mode door pastes, it does not type a v.
 *
 * LiveChat runs in game mode, where the window keydown listener sends every
 * key to the door and cancels the browser default. Cmd+V went to the door as
 * key-down 'v' and the browser paste event never fired (sysop, 2026-11-06:
 * "it just types a v"). The listener now asks browserOwnsChord first.
 */
import { describe, it, expect } from 'vitest';
import { browserOwnsChord } from '../../../../packages/terminal/src/utils/key-overrides';

describe('browserOwnsChord', () => {
  it('gives Cmd+V, Cmd+C and Cmd+R to the browser', () => {
    expect(browserOwnsChord({ key: 'v', code: 'KeyV', metaKey: true })).toBe(true);
    expect(browserOwnsChord({ key: 'c', code: 'KeyC', metaKey: true })).toBe(true);
    expect(browserOwnsChord({ key: 'r', code: 'KeyR', metaKey: true })).toBe(true);
  });
  it('keeps plain keys and Ctrl chords as game keys', () => {
    expect(browserOwnsChord({ key: 'v', code: 'KeyV' })).toBe(false);
    expect(browserOwnsChord({ key: 'v', code: 'KeyV', ctrlKey: true })).toBe(false);
    expect(browserOwnsChord({ key: 'ArrowLeft', code: 'ArrowLeft', shiftKey: true })).toBe(false);
  });
});
