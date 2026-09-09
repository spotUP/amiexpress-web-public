/**
 * formatWhipEvent: every WHIP door event type formats to one Discord line;
 * anything else (other doors, other bbs:event types, unknown events) is null.
 * Pure function tests only — no Discord, no sockets.
 */
import assert from 'assert';
import { formatWhipEvent, type BbsEventPayload } from '../src/feed';

const WHIP_EVENT_TYPES = [
  'project_created',
  'project_updated',
  'project_deleted',
  'task_created',
  'task_updated',
  'task_deleted',
  'task_moved',
  'task_completed',
  'achievement_unlocked',
];

function whipPayload(eventType: string, message = 'Did a thing'): BbsEventPayload {
  return {
    type: 'custom_door_event',
    username: 'sysop',
    nodeId: 1,
    timestamp: 1234567890,
    data: { doorName: 'WHIP', eventType, message },
  };
}

export async function eachWhipEventTypeFormats(): Promise<void> {
  for (const eventType of WHIP_EVENT_TYPES) {
    const line = formatWhipEvent(whipPayload(eventType, `Message for ${eventType}`));
    assert.ok(typeof line === 'string', `${eventType} should format`);
    assert.ok(line.includes('sysop'), `${eventType} line names the user`);
    assert.ok(line.includes(`Message for ${eventType}`), `${eventType} line carries the message`);
    assert.ok(line.includes('WHIP'), `${eventType} line names the door`);
  }
}

export async function doorNameMatchIsCaseInsensitive(): Promise<void> {
  const payload = whipPayload('task_completed');
  (payload.data as Record<string, unknown>)['doorName'] = 'whip';
  assert.ok(formatWhipEvent(payload) !== null, 'lowercase whip door still formats');
}

export async function nonWhipDoorReturnsNull(): Promise<void> {
  const payload = whipPayload('score');
  (payload.data as Record<string, unknown>)['doorName'] = 'CARDLOBBY';
  (payload.data as Record<string, unknown>)['eventType'] = 'score';
  assert.strictEqual(formatWhipEvent(payload), null);
}

export async function nonCustomDoorEventReturnsNull(): Promise<void> {
  for (const type of ['door_activity', 'user_login', 'upload', 'command']) {
    assert.strictEqual(
      formatWhipEvent({ type, username: 'sysop', nodeId: 1, timestamp: 1, data: {} }),
      null,
      `${type} should not format`
    );
  }
}

export async function unknownWhipEventTypeReturnsNull(): Promise<void> {
  assert.strictEqual(formatWhipEvent(whipPayload('party_started')), null);
}

export async function missingMessageReturnsNull(): Promise<void> {
  const payload = whipPayload('task_completed');
  delete (payload.data as Record<string, unknown>)['message'];
  assert.strictEqual(formatWhipEvent(payload), null);
}

export async function emptyPayloadReturnsNull(): Promise<void> {
  assert.strictEqual(formatWhipEvent(null), null);
  assert.strictEqual(formatWhipEvent(undefined), null);
}
