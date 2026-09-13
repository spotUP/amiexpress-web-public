/**
 * F17: the admin's bot-health probe was unbounded in both directions.
 *
 * `raw += c` read whatever the bot sent into a string with no cap, and http's
 * `timeout` option is SOCKET-IDLE time, not total time - so a bot that
 * dribbled one byte a second held the probe, and the admin's bot page behind
 * it, open for as long as it liked. A bot is a separate process the sysop
 * installed; it must not be able to decide how much memory or how much time
 * the board spends asking whether it is alive.
 */
import * as http from 'http';
import type { AddressInfo } from 'net';
import { probeBotHealth, HEALTH_BODY_CAP_BYTES, type PluginManifest } from '../../src/services/plugin.service';

const manifestFor = (port: number): PluginManifest => ({
  id: 'testbot',
  name: 'Test Bot',
  version: '0.0.0',
  description: 'a bot that misbehaves',
  composeService: '127.0.0.1',
  healthPort: port,
  healthPath: '/health',
  nav: { path: '/x', label: 'X', icon: 'bot', minLevel: 255 },
  configSchema: [],
});

function serve(handler: http.RequestListener): Promise<{ port: number; close: () => Promise<void> }> {
  return new Promise((resolve) => {
    const server = http.createServer(handler);
    server.listen(0, '127.0.0.1', () => {
      const port = (server.address() as AddressInfo).port;
      resolve({
        port,
        close: () => new Promise<void>((done) => { server.closeAllConnections?.(); server.close(() => done()); }),
      });
    });
  });
}

describe('the bot health probe is bounded', () => {
  it('gives up on a body too large to be a health answer instead of reading it all', async () => {
    let sent = 0;
    const chunk = 'x'.repeat(64 * 1024);
    const s = await serve((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      const pump = (): void => {
        // A bot that answers forever. Without a cap this fills the heap.
        while (sent < 64 * 1024 * 1024 && res.write(chunk)) sent += chunk.length;
        if (sent < 64 * 1024 * 1024 && !res.writableEnded) res.once('drain', pump);
      };
      pump();
    });
    try {
      const health = await probeBotHealth(manifestFor(s.port), 2000);
      expect(health).toBeNull();
      // The cap is what stopped it, not the server running out of things to say.
      expect(sent).toBeLessThan(64 * 1024 * 1024);
    } finally {
      await s.close();
    }
  }, 20000);

  it('gives up on a bot that dribbles for ever, which the socket-idle timeout never would', async () => {
    const timers: NodeJS.Timeout[] = [];
    const s = await serve((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.write('{');
      // One byte every 200ms: the socket is never idle for the 1000ms the
      // http `timeout` option watches, so that timeout never fires.
      const t = setInterval(() => { if (!res.writableEnded) res.write(' '); }, 200);
      timers.push(t as unknown as NodeJS.Timeout);
    });
    try {
      const began = Date.now();
      const health = await probeBotHealth(manifestFor(s.port), 1000);
      const took = Date.now() - began;
      expect(health).toBeNull();
      // Two hosts are tried in turn, so the whole probe is bounded by twice
      // the deadline plus the second host's refusal.
      expect(took).toBeLessThan(4000);
    } finally {
      for (const t of timers) clearInterval(t);
      await s.close();
    }
  }, 20000);

  it('still reads an ordinary health answer', async () => {
    const s = await serve((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, feedState: 'live' }));
    });
    try {
      const health = await probeBotHealth(manifestFor(s.port), 2000);
      expect(health).toMatchObject({ ok: true, feedState: 'live' });
    } finally {
      await s.close();
    }
  }, 20000);

  it('ships a cap far below anything that could hurt the board', () => {
    expect(HEALTH_BODY_CAP_BYTES).toBeGreaterThan(1024);
    expect(HEALTH_BODY_CAP_BYTES).toBeLessThanOrEqual(1024 * 1024);
  });
});
