/**
 * Membership is not presence.
 *
 * Reported twice, most recently 2026-08-26: "coffe and DiNO are still stale in
 * the chat". The live log shows why - room:joined carries the full membership
 * and nothing else:
 *
 *   Sending room:joined to !cyke : {"memberCount":6,"members":[
 *     {"username":"coffe"},{"username":"DiNO"},{"username":"Qwan"},
 *     {"username":"spot"},{"username":"Varin0x"},{"username":"!cyke"}]}
 *
 * db.getRoomMembers() returns everyone who has EVER joined the room, so the
 * door - which has no way of knowing better - marked every one of them
 * online, for ever. Only the server knows who currently holds a socket, so
 * only the server can answer this.
 */

import { withPresence } from '../../src/handlers/chat/group-chat.handler';

const MEMBERS = [
  { user_id: 'u-coffe', username: 'coffe', is_moderator: 0, is_muted: 0 },
  { user_id: 'u-dino', username: 'DiNO', is_moderator: 0, is_muted: 1 },
  { user_id: 'u-spot', username: 'spot', is_moderator: 1, is_muted: 0 },
];

/** Only spot is actually connected. */
const onlySpotOnline = (userId: string) => userId === 'u-spot';

describe('withPresence', () => {
  it('marks a member with no live socket as offline', () => {
    const out = withPresence(MEMBERS, onlySpotOnline);

    expect(out.find(m => m.username === 'coffe')?.is_online).toBe(false);
    expect(out.find(m => m.username === 'DiNO')?.is_online).toBe(false);
    expect(out.find(m => m.username === 'spot')?.is_online).toBe(true);
  });

  it('gives every member the field, so the door never has to guess', () => {
    // A missing field is what caused this: the door had nothing to read and
    // assumed the friendly answer.
    for (const m of withPresence(MEMBERS, onlySpotOnline)) {
      expect(typeof m.is_online).toBe('boolean');
    }
  });

  it('keeps the rest of the member payload intact', () => {
    const dino = withPresence(MEMBERS, onlySpotOnline).find(m => m.username === 'DiNO');

    expect(dino).toMatchObject({
      user_id: 'u-dino',
      username: 'DiNO',
      is_moderator: 0,
      is_muted: 1,
    });
  });

  it('compares ids as strings, so a numeric id still resolves', () => {
    const numeric = [{ user_id: 42, username: 'qwan', is_moderator: 0, is_muted: 0 }];
    const out = withPresence(numeric, (id) => id === '42');
    expect(out[0].is_online).toBe(true);
  });

  it('reports everyone offline when nobody is connected', () => {
    const out = withPresence(MEMBERS, () => false);
    expect(out.every(m => m.is_online === false)).toBe(true);
  });

  it('handles an empty room', () => {
    expect(withPresence([], () => true)).toEqual([]);
  });
});
