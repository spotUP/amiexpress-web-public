import { animationsAllowed } from '../../src/services/user-settings/animations';
import { wipeEffectsEnabled } from '../../src/utils/screen-wipe.util';

describe('animationsAllowed', () => {
  it('allows animations by default', () => {
    expect(animationsAllowed(null)).toBe(true);
    expect(animationsAllowed(undefined)).toBe(true);
    expect(animationsAllowed({})).toBe(true);
    expect(animationsAllowed({ user: { noAnimations: false } })).toBe(true);
  });

  it('turns them off when the caller set W row 23 to OFF', () => {
    expect(animationsAllowed({ user: { noAnimations: true } })).toBe(false);
    expect(animationsAllowed({ user: { noAnimations: true }, runningDoorIsGame: false })).toBe(false);
  });

  it('keeps them inside a game door', () => {
    expect(animationsAllowed({ user: { noAnimations: true }, runningDoorIsGame: true })).toBe(true);
  });
});

describe('wipeEffectsEnabled asks the animations gate', () => {
  it('plays no wipe for a caller who turned animations off', () => {
    expect(wipeEffectsEnabled({ user: { noAnimations: true } })).toBe(false);
    expect(wipeEffectsEnabled({ user: { noAnimations: false } })).toBe(true);
  });

  it('plays the wipe inside a game door', () => {
    expect(wipeEffectsEnabled({ user: { noAnimations: true }, runningDoorIsGame: true })).toBe(true);
  });
});
