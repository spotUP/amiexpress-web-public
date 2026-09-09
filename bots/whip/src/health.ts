/**
 * Bot health endpoint (bot plugin Phase 0).
 *
 * A tiny http listener answering GET /health with the bot's liveness state.
 * It doubles as the compose healthcheck and the admin status probe, so it
 * reports the same three facts both need: is Discord connected, is the feed
 * configured, and when did the feed last see board activity.
 *
 * Plain node:http on purpose: no framework dependency for one route.
 */

import * as http from 'http';

export interface BotHealth {
  status: 'ok';
  bot: string;
  startedAt: string;
  uptimeSec: number;
  discordReady: boolean;
  feed: {
    enabled: boolean;
    lastEventAt: string | null;
  };
}

export interface HealthState {
  startedAt: number;
  discordReady: boolean;
  feedEnabled: boolean;
  lastFeedEventAt: string | null;
}

export function createHealthState(): HealthState {
  return { startedAt: Date.now(), discordReady: false, feedEnabled: false, lastFeedEventAt: null };
}

export function toHealth(botId: string, state: HealthState): BotHealth {
  return {
    status: 'ok',
    bot: botId,
    startedAt: new Date(state.startedAt).toISOString(),
    uptimeSec: Math.floor((Date.now() - state.startedAt) / 1000),
    discordReady: state.discordReady,
    feed: { enabled: state.feedEnabled, lastEventAt: state.lastFeedEventAt },
  };
}

/** Start the listener. Resolves with the server once bound. */
export function startHealthServer(
  botId: string,
  state: HealthState,
  port: number
): Promise<http.Server> {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      if (req.method === 'GET' && (req.url ?? '/').split('?')[0] === '/health') {
        const body = JSON.stringify(toHealth(botId, state));
        res.writeHead(200, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) });
        res.end(body);
        return;
      }
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end('{"error":"not found"}');
    });
    server.once('error', reject);
    server.listen(port, () => resolve(server));
  });
}
