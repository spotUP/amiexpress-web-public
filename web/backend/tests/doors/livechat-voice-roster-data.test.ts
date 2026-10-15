/**
 * Voice channel membership, without a socket.
 *
 * Every one of these covers a way the roster used to stay empty, which is
 * why the sidebar read `Voice (0)` for a channel people were talking in.
 */

import {
  seedRoster,
  addParticipant,
  removeParticipant,
  setSpeaking,
  channelDisplayName,
} from '../../../../Doors/livechat/features/voice-roster';

describe('voice roster', () => {
  describe('seedRoster', () => {
    it('keeps the participants the server listed on join', () => {
      const roster = seedRoster(
        'general',
        [{ userId: 7, username: 'guest' }],
        { userId: 1, username: 'spot' }
      );

      expect(roster.participants.map(p => p.username).sort()).toEqual(['guest', 'spot']);
    });

    it('includes us, who the join reply leaves out', () => {
      // The reply lists who was already there; alone in a channel that is
      // an empty list, and the roster used to come out empty with it.
      const roster = seedRoster('general', [], { userId: 1, username: 'spot' });

      expect(roster.participants).toHaveLength(1);
      expect(roster.participants[0].username).toBe('spot');
    });

    it('does not list us twice when the server already included us', () => {
      const roster = seedRoster(
        'general',
        [{ userId: '1', username: 'spot' }],
        { userId: 1, username: 'spot' }
      );

      expect(roster.participants).toHaveLength(1);
    });

    it('does not list somebody twice when the server repeats them', () => {
      const roster = seedRoster(
        'voice',
        [{ userId: 2, username: 'guest' }, { userId: '2', username: 'guest' }],
        { userId: 1, username: 'spot' }
      );

      expect(roster.participants).toHaveLength(2);
    });

    it('recognises itself when the server uses string ids', () => {
      // The door coerces ids with parseInt, so its own id can arrive as a
      // number while the server sends UUID strings. Mismatched, the roster
      // gained a second copy of the user: `voice (3)` for two people.
      const roster = seedRoster(
        'voice',
        [{ userId: '7ddd39a4-9a2b-485e-ba5a-8cfec20813dd', username: 'spot' }],
        { userId: '7ddd39a4-9a2b-485e-ba5a-8cfec20813dd', username: 'spot' }
      );

      expect(roster.participants).toHaveLength(1);
    });

    it('survives a missing participant list', () => {
      const roster = seedRoster('general', undefined, { userId: 1, username: 'spot' });
      expect(roster.participants).toHaveLength(1);
    });

    it('names the default channel Voice', () => {
      expect(seedRoster('default-voice', [], { userId: 1, username: 'spot' }).name).toBe('Voice');
      expect(channelDisplayName('general')).toBe('general');
    });
  });

  describe('addParticipant', () => {
    it('adds somebody who joins after us', () => {
      const roster = seedRoster('general', [], { userId: 1, username: 'spot' });

      expect(addParticipant(roster, { userId: 2, username: 'guest' })).toBe(true);
      expect(roster.participants).toHaveLength(2);
    });

    it('ignores a repeat announcement', () => {
      const roster = seedRoster('general', [], { userId: 1, username: 'spot' });
      addParticipant(roster, { userId: 2, username: 'guest' });

      expect(addParticipant(roster, { userId: '2', username: 'guest' })).toBe(false);
      expect(roster.participants).toHaveLength(2);
    });
  });

  describe('removeParticipant', () => {
    it('removes somebody who leaves, matching across id types', () => {
      const roster = seedRoster(
        'general',
        [{ userId: 2, username: 'guest' }],
        { userId: 1, username: 'spot' }
      );

      expect(removeParticipant(roster, 2)).toBe(true);
      expect(roster.participants.map(p => p.username)).toEqual(['spot']);
    });

    it('reports no change for somebody who was never here', () => {
      const roster = seedRoster('general', [], { userId: 1, username: 'spot' });
      expect(removeParticipant(roster, 99)).toBe(false);
    });
  });

  describe('setSpeaking', () => {
    it('marks a participant talking', () => {
      const roster = seedRoster(
        'general',
        [{ userId: 2, username: 'guest' }],
        { userId: 1, username: 'spot' }
      );

      expect(setSpeaking([roster], 2, true)).toBe(true);
      expect(roster.participants.find(p => p.username === 'guest')!.isSpeaking).toBe(true);
    });

    it('reports no change when the state is already right', () => {
      // Speaking status arrives many times a second; redrawing the sidebar
      // on every one of them would be pure churn.
      const roster = seedRoster('general', [], { userId: 1, username: 'spot' });
      setSpeaking([roster], 1, true);

      expect(setSpeaking([roster], 1, true)).toBe(false);
    });

    it('clears the mark when they stop', () => {
      const roster = seedRoster('general', [], { userId: 1, username: 'spot' });
      setSpeaking([roster], 1, true);

      expect(setSpeaking([roster], 1, false)).toBe(true);
      expect(roster.participants[0].isSpeaking).toBe(false);
    });

    it('leaves everyone else alone', () => {
      const roster = seedRoster(
        'general',
        [{ userId: 2, username: 'guest' }],
        { userId: 1, username: 'spot' }
      );
      setSpeaking([roster], 2, true);

      expect(roster.participants.find(p => p.username === 'spot')!.isSpeaking).toBe(false);
    });
  });
});
