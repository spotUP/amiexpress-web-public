/**
 * The door announcer.
 *
 * The board has carried webhooks for a long time - a table of subscriptions,
 * a PII policy, Discord and Slack formatting - and a bridge from doors to it
 * (`bbs.emitCustomEvent`). Four doors out of forty used the bridge, each with
 * its own guard and its own event names, and one door skipped the board
 * entirely and POSTed to Discord itself.
 *
 * What these pin is the contract: the event names the SDK emits are the ones
 * the board routes on (web/backend/src/services/bbs-event-emitter.ts), and a
 * door announcing into a host that cannot carry it keeps playing.
 */

import { createAnnouncer, ANNOUNCE_EVENT_TYPES } from '../../core/announce';

function host() {
  const calls: Array<{ type: string; message: string; data?: Record<string, unknown> }> = [];
  return {
    calls,
    bbs: {
      emitCustomEvent: (type: string, message: string, data?: Record<string, unknown>) => {
        calls.push({ type, message, data });
      },
    },
  };
}

describe('door announcements', () => {
  it('uses the event names the board routes to webhooks', () => {
    // These four strings are a contract with the backend's
    // WEBHOOK_EVENT_TRIGGERS map. A rename here without one there leaves the
    // announcement in LiveChat and out of Discord.
    expect(ANNOUNCE_EVENT_TYPES.opened).toBe('door_opened');
    expect(ANNOUNCE_EVENT_TYPES.started).toBe('door_started');
    expect(ANNOUNCE_EVENT_TYPES.finished).toBe('match_result');
    expect(ANNOUNCE_EVENT_TYPES.score).toBe('score');
  });

  it('passes each announcement to the host with its data', () => {
    const h = host();
    const announce = createAnnouncer(h.bbs);

    announce.opened('UNO table #1 is open', { tableId: 1, seats: 4 });
    announce.started('UNO at table #1 has started', { players: 2 });
    announce.finished('spot won UNO at table #1', { winner: 'spot' });

    expect(h.calls.map((call) => call.type)).toEqual(['door_opened', 'door_started', 'match_result']);
    expect(h.calls[0].message).toBe('UNO table #1 is open');
    expect(h.calls[0].data).toEqual({ tableId: 1, seats: 4 });
    expect(h.calls[2].data).toEqual({ winner: 'spot' });
  });

  it('writes a score message and keeps the number in the data', () => {
    const h = host();
    createAnnouncer(h.bbs).score(1234567, { level: 300 });

    expect(h.calls[0].type).toBe('score');
    expect(h.calls[0].message).toBe('scored 1,234,567');
    expect(h.calls[0].data).toEqual({ level: 300, score: 1234567 });
  });

  it('is a no-op on a host that cannot carry announcements', () => {
    // An older backend, a test harness, a door run from a script. The game
    // carries on; nothing throws.
    for (const bad of [undefined, null, {}, { emitCustomEvent: 'not a function' }]) {
      const announce = createAnnouncer(bad as any);
      expect(announce.available).toBe(false);
      expect(() => announce.opened('nobody hears this')).not.toThrow();
      expect(() => announce.score(10)).not.toThrow();
    }
  });

  it('survives a host that throws', () => {
    const announce = createAnnouncer({
      emitCustomEvent: () => { throw new Error('socket closed mid-hand'); },
    });

    expect(announce.available).toBe(true);
    expect(() => announce.finished('spot won')).not.toThrow();
  });
});
