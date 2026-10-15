/**
 * Bot health endpoint: shape, state transitions, and 404 elsewhere.
 */
import assert from 'assert';
import * as http from 'http';
import { createHealthState, startHealthServer, toHealth } from '../src/health';

function get(port: number, path: string): Promise<{ status: number; body: any }> {
  return new Promise((resolve, reject) => {
    http.get({ port, path }, (res) => {
      let raw = '';
      res.on('data', (c) => { raw += c; });
      res.on('end', () => resolve({ status: res.statusCode ?? 0, body: JSON.parse(raw) }));
    }).once('error', reject);
  });
}

export async function reportsLivenessShape(): Promise<void> {
  const state = createHealthState();
  const server = await startHealthServer('whip', state, 0);
  try {
    const port = (server.address() as any).port;
    const { status, body } = await get(port, '/health');
    assert.strictEqual(status, 200);
    assert.strictEqual(body.status, 'ok');
    assert.strictEqual(body.bot, 'whip');
    assert.strictEqual(body.discordReady, false);
    assert.strictEqual(body.feed.enabled, false);
    assert.strictEqual(body.feed.lastEventAt, null);
    assert.ok(typeof body.uptimeSec === 'number');
    assert.ok(typeof body.startedAt === 'string');
  } finally {
    server.close();
  }
}

export async function reflectsStateChanges(): Promise<void> {
  const state = createHealthState();
  state.discordReady = true;
  state.feedEnabled = true;
  state.lastFeedEventAt = '2026-09-09T00:00:00.000Z';
  const body = toHealth('whip', state);
  assert.strictEqual(body.discordReady, true);
  assert.strictEqual(body.feed.enabled, true);
  assert.strictEqual(body.feed.lastEventAt, '2026-09-09T00:00:00.000Z');
}

export async function answers404OffRoute(): Promise<void> {
  const server = await startHealthServer('whip', createHealthState(), 0);
  try {
    const port = (server.address() as any).port;
    const { status } = await get(port, '/nope');
    assert.strictEqual(status, 404);
  } finally {
    server.close();
  }
}
