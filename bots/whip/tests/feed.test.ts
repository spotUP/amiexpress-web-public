/**
 * formatWhipEvent: every WHIP door event type formats to one Discord line;
 * anything else (other doors, other bbs:event types, unknown events) is null.
 * Pure function tests only — no Discord, no sockets.
 */
import assert from 'assert';
import { formatWhipEvent, startFeedResilient, type BbsEventPayload, type FeedDeps } from '../src/feed';

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

function resilientDeps(over: Partial<FeedDeps> = {}): FeedDeps & {
  logins: () => number;
  posts: string[];
  disconnect: () => void;
} {
  let logins = 0;
  const posts: string[] = [];
  let drop: ((reason: string) => void) | null = null;
  return {
    apiUrl: 'https://board.test',
    bbsUser: 'bridge',
    bbsPassword: 'pw',
    post: async (line: string) => { posts.push(line); },
    login: async () => { logins++; return `token-${logins}`; },
    connect: (_url: string, _token: string, onEvent: (p: BbsEventPayload) => void, onDisconnect?: (r: string) => void) => {
      drop = (reason: string) => onDisconnect?.(reason);
      void onEvent;
      return { close: () => { drop = null; } };
    },
    ...over,
    logins: () => logins,
    posts,
    disconnect: () => drop?.('transport close'),
  };
}

const FAST = { initialDelayMs: 1, maxDelayMs: 2 };

export async function resilientSurvivesLoginFailures(): Promise<void> {
  let attempts = 0;
  const deps = resilientDeps({
    login: async () => {
      attempts++;
      if (attempts < 3) throw new Error('board booting');
      return 'token';
    },
  });
  const states: string[] = [];
  const feed = startFeedResilient(deps, { ...FAST, onState: (s) => states.push(s) });
  try {
    await new Promise((r) => setTimeout(r, 30));
    assert.strictEqual(attempts, 3, 'two failures then a login');
    assert.ok(states.includes('live'), 'reaches live');
    assert.ok(states.includes('retrying'), 'retrying seen on the way');
  } finally { feed.stop(); }
}

export async function resilientReconnectsAfterADrop(): Promise<void> {
  const deps = resilientDeps();
  const states: string[] = [];
  const feed = startFeedResilient(deps, { ...FAST, onState: (s) => states.push(s) });
  try {
    await new Promise((r) => setTimeout(r, 10));
    assert.strictEqual(deps.logins(), 1, 'one login to go live');
    deps.disconnect();
    await new Promise((r) => setTimeout(r, 20));
    assert.strictEqual(deps.logins(), 2, 'a drop re-logs-in for a fresh token');
    assert.ok(states.includes('retrying'), 'drop surfaces as retrying');
  } finally { feed.stop(); }
}

export async function resilientStopEndsTheLoop(): Promise<void> {
  let logins = 0;
  const deps = resilientDeps({
    login: async () => { logins++; throw new Error('always down'); },
  });
  const feed = startFeedResilient(deps, FAST);
  await new Promise((r) => setTimeout(r, 20));
  const seen = logins;
  assert.ok(seen >= 1, 'it tried while down');
  feed.stop();
  await new Promise((r) => setTimeout(r, 20));
  assert.strictEqual(logins, seen, 'no further attempts after stop');
}
