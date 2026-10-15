/**
 * What the phone sends is what the game does.
 *
 * Reported repeatedly from a phone: "I keep swiping down but it always
 * registers as soft drop instead of hard drop", and "it often rotates when I
 * swipe down".
 *
 * Both were the same thing. The gesture surface sent Space for a hard drop,
 * and this door's DEFAULT key map gives space to ROTATE 180 - so the swipe
 * spun the piece, and the only thing that actually dropped it was the drag's
 * own per-row ArrowDowns. Chasing it as a gesture-tuning problem could never
 * have fixed it, because the gesture was firing correctly all along.
 *
 * A phone has no keyboard to bind, so the two sides have to agree. This test
 * is that agreement: it reads the keys the surface really sends and asks the
 * door what it would really do with them.
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import { keyToAction, DEFAULT_KEYS } from '../../../../Doors/grandmaster/input/config';

const scheme = readFileSync(
  join(__dirname, '..', '..', '..', '..', 'web', 'frontend', 'src', 'components', 'mobile', 'gesture-scheme.ts'),
  'utf8'
);

/** The key the gesture surface sends for a named gesture. */
function gestureKey(name: string): string {
  const block = scheme.slice(scheme.indexOf('export const GESTURE_KEYS'));
  const match = block.match(new RegExp(`${name}: \\{ key: '([^']*)', code: '([^']*)' \\}`));
  if (!match) throw new Error(`no gesture key for ${name}`);
  // The door sees a key NAME, as blessed reports it - 'enter', not 'Enter'.
  return match[1].toLowerCase();
}

describe('the keys the phone sends', () => {
  it('hard drops when the player swipes down fast', () => {
    expect(keyToAction(gestureKey('hardDrop'), DEFAULT_KEYS)).toBe('hard_drop');
  });

  it('rotates on a tap', () => {
    expect(keyToAction(gestureKey('rotate'), DEFAULT_KEYS)).toBe('rotate_cw');
  });

  it('holds on a swipe up', () => {
    expect(keyToAction(gestureKey('hold'), DEFAULT_KEYS)).toBe('hold');
  });

  it('soft drops on a drag down', () => {
    expect(keyToAction('down', DEFAULT_KEYS)).toBe('soft_drop');
  });

  it('moves sideways on a drag across', () => {
    expect(keyToAction('left', DEFAULT_KEYS)).toBe('left');
    expect(keyToAction('right', DEFAULT_KEYS)).toBe('right');
  });
});

describe('the collision that caused it', () => {
  it('space is rotate-180 in this door, so it must not be the hard drop key', () => {
    // Pinning the actual cause: if someone moves the gesture back to space,
    // this fails loudly instead of silently spinning the piece.
    expect(keyToAction('space', DEFAULT_KEYS)).toBe('rotate_180');
    expect(gestureKey('hardDrop')).not.toBe(' ');
    expect(gestureKey('hardDrop')).not.toBe('space');
  });
});

describe('when a player has rebound their keys', () => {
  it('still hard drops from the phone', () => {
    // A keyboard player's map must not take the phone's hard drop away.
    // TOUCH_FALLBACK covers the gesture keys that nothing else claimed.
    const rebound = { ...DEFAULT_KEYS, hardDrop: ['q'] };

    expect(keyToAction(gestureKey('hardDrop'), rebound)).toBe('hard_drop');
  });

  it('but a deliberate binding still wins', () => {
    // Someone who moves Enter off hard drop and onto hold has said what they
    // want, and the fallback must not take it back.
    const rebound = { ...DEFAULT_KEYS, hardDrop: ['up'], hold: ['enter', 'c'] };

    expect(keyToAction('enter', rebound)).toBe('hold');
  });
});
