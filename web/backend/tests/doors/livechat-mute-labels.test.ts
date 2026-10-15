/**
 * The mute menu has to say what it will do.
 *
 * Muting worked - choosing the same level again lifts it - but the context
 * menu was built from a fixed array that never consulted the mute list, so
 * it always read "Mute User", "Ignore", "Block". Nothing on screen said who
 * was muted, and the way back looked exactly like the way in (reported for
 * all three levels in turn, 2026-08-26).
 */

import {
  createMuteList,
  toggleMute,
  muteMenuLabels,
  muteLevelForLabel,
} from '../../../../Doors/livechat/core/mute-list';

describe('mute menu labels', () => {
  it('offers the plain actions for somebody untouched', () => {
    expect(muteMenuLabels(createMuteList(), 'dino')).toEqual([
      'Mute User',
      'Ignore',
      'Block',
    ]);
  });

  it('inverts the level actually in force', () => {
    const list = createMuteList();
    toggleMute(list, 'dino', 'mute');

    expect(muteMenuLabels(list, 'dino')).toEqual(['Unmute User', 'Ignore', 'Block']);
  });

  it('inverts ignore', () => {
    const list = createMuteList();
    toggleMute(list, 'dino', 'ignore');

    expect(muteMenuLabels(list, 'dino')).toEqual(['Mute User', 'Unignore', 'Block']);
  });

  it('inverts block', () => {
    const list = createMuteList();
    toggleMute(list, 'dino', 'block');

    expect(muteMenuLabels(list, 'dino')).toEqual(['Mute User', 'Ignore', 'Unblock']);
  });

  it('inverts only one entry at a time', () => {
    // Somebody ignored is not also muted; offering "Unmute" for them would
    // claim a state they are not in.
    const list = createMuteList();
    toggleMute(list, 'dino', 'ignore');

    expect(muteMenuLabels(list, 'dino').filter(l => l.startsWith('Un'))).toHaveLength(1);
  });

  it('shows the plain actions again once the level is lifted', () => {
    const list = createMuteList();
    toggleMute(list, 'dino', 'block');
    toggleMute(list, 'dino', 'block');

    expect(muteMenuLabels(list, 'dino')).toEqual(['Mute User', 'Ignore', 'Block']);
  });

  it('labels each user from their own state', () => {
    const list = createMuteList();
    toggleMute(list, 'dino', 'mute');

    expect(muteMenuLabels(list, 'spot')).toEqual(['Mute User', 'Ignore', 'Block']);
  });
});

describe('reading a label back', () => {
  it('maps both directions of every entry to its level', () => {
    expect(muteLevelForLabel('Mute User')).toBe('mute');
    expect(muteLevelForLabel('Unmute User')).toBe('mute');
    expect(muteLevelForLabel('Ignore')).toBe('ignore');
    expect(muteLevelForLabel('Unignore')).toBe('ignore');
    expect(muteLevelForLabel('Block')).toBe('block');
    expect(muteLevelForLabel('Unblock')).toBe('block');
  });

  it('refuses anything that is not a mute entry', () => {
    // The same switch handles every menu item; a wrong match here would
    // mute somebody for choosing "Whois".
    expect(muteLevelForLabel('Whois')).toBeNull();
    expect(muteLevelForLabel('View Profile')).toBeNull();
    expect(muteLevelForLabel('')).toBeNull();
  });

  it('round-trips what the menu built', () => {
    const list = createMuteList();
    toggleMute(list, 'dino', 'ignore');

    const labels = muteMenuLabels(list, 'dino');
    expect(labels.map(muteLevelForLabel)).toEqual(['mute', 'ignore', 'block']);
  });
});
