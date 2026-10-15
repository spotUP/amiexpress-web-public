/**
 * Mute, Ignore and Block do what they say (Doors/livechat/core/mute-list.ts).
 *
 * From the audit of what was declared but never implemented: all three
 * context-menu entries printed a confirmation and did NOTHING -
 *
 *   "Muted bob - their messages will be hidden"     (bob's messages kept coming)
 *   "Ignoring bob - you won't receive DMs from them" (the DMs kept coming)
 *   "Blocked bob - they cannot contact you"          (bob could contact you)
 *
 * A moderation control that claims to work and does not is worse than one
 * that admits it is missing: the user stops watching for the thing they
 * asked to be rid of.
 */

import {
  createMuteList,
  toggleMute,
  muteLevel,
  hidesRoomMessages,
  hidesDirectMessages,
  serializeMuteList,
  deserializeMuteList,
  muteMessage,
} from '../../../../Doors/livechat/core/mute-list';

describe('the three levels differ', () => {
  it('mute hides room messages but not DMs', () => {
    const list = createMuteList();
    toggleMute(list, 'bob', 'mute');

    expect(hidesRoomMessages(list, 'bob')).toBe(true);
    expect(hidesDirectMessages(list, 'bob')).toBe(false);
  });

  it('ignore hides DMs as well', () => {
    const list = createMuteList();
    toggleMute(list, 'bob', 'ignore');

    expect(hidesRoomMessages(list, 'bob')).toBe(true);
    expect(hidesDirectMessages(list, 'bob')).toBe(true);
  });

  it('block hides everything', () => {
    const list = createMuteList();
    toggleMute(list, 'bob', 'block');

    expect(hidesRoomMessages(list, 'bob')).toBe(true);
    expect(hidesDirectMessages(list, 'bob')).toBe(true);
  });

  it('leaves everyone else alone', () => {
    const list = createMuteList();
    toggleMute(list, 'bob', 'block');

    expect(hidesRoomMessages(list, 'alice')).toBe(false);
    expect(hidesDirectMessages(list, 'alice')).toBe(false);
  });
});

describe('toggling', () => {
  it('lifts a level by choosing it again', () => {
    // The only obvious way back from the same menu.
    const list = createMuteList();
    toggleMute(list, 'bob', 'mute');

    expect(toggleMute(list, 'bob', 'mute')).toBeNull();
    expect(hidesRoomMessages(list, 'bob')).toBe(false);
  });

  it('upgrades from mute to block without a detour', () => {
    const list = createMuteList();
    toggleMute(list, 'bob', 'mute');

    expect(toggleMute(list, 'bob', 'block')).toBe('block');
    expect(muteLevel(list, 'bob')).toBe('block');
  });

  it('treats a name as the same person whatever its case', () => {
    const list = createMuteList();
    toggleMute(list, 'Bob', 'mute');

    expect(hidesRoomMessages(list, 'bob')).toBe(true);
    expect(hidesRoomMessages(list, 'BOB')).toBe(true);
  });

  it('ignores an empty name', () => {
    const list = createMuteList();

    expect(toggleMute(list, '   ', 'mute')).toBeNull();
    expect(list.size).toBe(0);
  });
});

describe('surviving a restart', () => {
  it('round-trips through prefs', () => {
    const list = createMuteList();
    toggleMute(list, 'bob', 'block');
    toggleMute(list, 'carol', 'mute');

    const back = deserializeMuteList(serializeMuteList(list));

    expect(muteLevel(back, 'bob')).toBe('block');
    expect(muteLevel(back, 'carol')).toBe('mute');
  });

  it('shrugs off nonsense in the saved data', () => {
    const back = deserializeMuteList({ bob: 'banana', carol: 'mute', dave: 42 });

    expect(muteLevel(back, 'bob')).toBeNull();
    expect(muteLevel(back, 'carol')).toBe('mute');
    expect(muteLevel(back, 'dave')).toBeNull();
  });

  it('shrugs off no saved data at all', () => {
    expect(deserializeMuteList(undefined).size).toBe(0);
    expect(deserializeMuteList(null).size).toBe(0);
    expect(deserializeMuteList('nope').size).toBe(0);
  });
});

describe('what the user is told', () => {
  it('does not claim block stops them sending', () => {
    // There is no server-side block yet. Saying "they cannot contact you"
    // was the original lie; the wording must stay honest until there is.
    const text = muteMessage('bob', 'block');

    expect(text).not.toContain('cannot contact you');
    expect(text).toContain('does not yet stop them sending');
  });

  it('describes mute as room-only', () => {
    expect(muteMessage('bob', 'mute')).toContain('room messages');
  });

  it('says when someone is unmuted', () => {
    expect(muteMessage('bob', null)).toContain('no longer hidden');
  });
});
