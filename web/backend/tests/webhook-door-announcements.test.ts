/**
 * Door announcements reach Discord and Slack, not just LiveChat.
 *
 * The board routed exactly three door event names to webhooks - 'score',
 * 'score_submitted' and 'match_result' - as three hardcoded strings inside
 * emitCustomDoorEvent. Anything else a door said reached LiveChat and stopped
 * there, which is why "a table is open, come and play" could not leave the
 * building (sysop, 2026-09-02).
 *
 * The SDK's announcer (sdk/core/announce.ts) emits door_opened and
 * door_started; this pins that the board knows those names, routes them to
 * their own trigger, and still routes scores to theirs.
 */

export {};

const sent: Array<{ trigger: string; data: any }> = [];

jest.mock('../src/services/webhook.service', () => ({
  webhookService: {
    sendWebhook: (trigger: string, data: any) => { sent.push({ trigger, data }); },
  },
  WebhookTrigger: {
    DOOR_SCORE: 'door_score',
    DOOR_ANNOUNCEMENT: 'door_announcement',
  },
}));

import { bbsEventEmitter } from '../src/services/bbs-event-emitter';

function emit(eventType: string, message = 'something happened'): void {
  (bbsEventEmitter as any).emitCustomDoorEvent({
    username: 'spot', userId: '1', gdprConsented: true, nodeId: 1,
    doorName: 'CARDLOBBY', eventType, message, data: { tableId: 1 },
    timestamp: Date.now(),
  });
}

describe('door events that reach webhooks', () => {
  beforeEach(() => { sent.length = 0; });

  it('routes an open table and a started game to the announcement trigger', () => {
    emit('door_opened', 'UNO table #1 is open (10) - 1/4 seats taken');
    emit('door_started', 'UNO at table #1 has started');

    expect(sent.map((s) => s.trigger)).toEqual(['door_announcement', 'door_announcement']);
    expect(sent[0].data.door).toBe('CARDLOBBY');
    expect(sent[0].data.message).toContain('is open');
    expect(sent[0].data.tableId).toBe(1);
  });

  it('still routes scores and match results to the score trigger', () => {
    emit('score');
    emit('score_submitted');
    emit('match_result');

    expect(sent.map((s) => s.trigger)).toEqual(['door_score', 'door_score', 'door_score']);
  });

  it('leaves an unmapped event in LiveChat', () => {
    // A door can emit anything; only the names the board maps go out.
    emit('project_created');
    emit('achievement_unlocked');

    expect(sent).toHaveLength(0);
  });

  it('carries the identity the PII policy needs', () => {
    emit('door_opened');

    expect(sent[0].data.username).toBe('spot');
    expect(sent[0].data.userId).toBe('1');
    expect(sent[0].data.gdprConsented).toBe(true);
  });
});
