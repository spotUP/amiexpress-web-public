/**
 * A board that meets a live sidecar adopts it instead of fighting it.
 *
 * The TEXTTV door fetches from a SEPARATE process (the deadlock in
 * scripts/texttv-sidecar-server.ts). On a dev machine that process can
 * outlive its board: kill-servers.sh kills the backend with SIGKILL, and a
 * killed parent kills nothing, so the old sidecar keeps port 3002. Every
 * board started afterwards then failed to bind, spent its five restarts and
 * announced that Text-TV was down - while the orphan served pages perfectly
 * well the whole time (2026-09-13).
 */
process.env.SKIP_DB_INIT = '1';

import * as http from 'http';
import {
  createTextTvSidecar,
  processAlive,
  TEXTTV_SIDECAR_HEALTH_PATH,
} from '../../src/scripts/texttv-sidecar-server';
import { sidecarAnswers } from '../../src/services/texttv-sidecar';

function listen(server: http.Server): Promise<number> {
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve((server.address() as any).port));
  });
}

describe('the sidecar health probe', () => {
  test('says yes to a sidecar that is serving', async () => {
    const server = createTextTvSidecar(async () => ({ status: 200, body: '[]' }));
    const port = await listen(server);
    try {
      await expect(sidecarAnswers(port)).resolves.toBe(true);
    } finally {
      await new Promise((done) => server.close(done));
    }
  });

  test('says no to a closed port, rather than hanging', async () => {
    // Take a port and give it straight back, so nothing is listening on it.
    const server = http.createServer();
    const port = await listen(server);
    await new Promise((done) => server.close(done));

    const started = Date.now();
    await expect(sidecarAnswers(port)).resolves.toBe(false);
    expect(Date.now() - started).toBeLessThan(2000);
  });

  test('the health path answers without fetching a page', async () => {
    // A probe must not reach texttv.nu: the fetcher here throws, and the
    // health answer must arrive anyway.
    const server = createTextTvSidecar(async () => { throw new Error('the network was touched'); });
    const port = await listen(server);
    try {
      const body = await new Promise<string>((resolve, reject) => {
        http.get({ host: '127.0.0.1', port, path: TEXTTV_SIDECAR_HEALTH_PATH }, (res) => {
          let text = '';
          res.on('data', (c) => { text += c; });
          res.on('end', () => resolve(text));
        }).on('error', reject);
      });
      expect(JSON.parse(body).status).toBe('ok');
    } finally {
      await new Promise((done) => server.close(done));
    }
  });

  test('knows whether the board is still there', () => {
    // The sidecar watches the BOARD's pid, not its parent's: in dev it is
    // spawned through `npx tsx`, so the board can die with that wrapper
    // still standing and a ppid check would see nothing wrong.
    expect(processAlive(process.pid)).toBe(true);
    expect(processAlive(0)).toBe(false);
    expect(processAlive(-1)).toBe(false);
    // A pid that cannot plausibly be live. 0x7FFFFFFF is above every
    // platform's pid_max, so the kernel answers ESRCH.
    expect(processAlive(0x7fffffff)).toBe(false);
    // pid 1 is init: alive, and not ours - EPERM, which still means alive.
    expect(processAlive(1)).toBe(true);
  });

  test('a page request still goes through the page fetcher', async () => {
    const server = createTextTvSidecar(async (page) => ({ status: 200, body: `[{"num":"${page}"}]` }));
    const port = await listen(server);
    try {
      const body = await new Promise<string>((resolve, reject) => {
        http.get({ host: '127.0.0.1', port, path: '/api/texttv/100' }, (res) => {
          let text = '';
          res.on('data', (c) => { text += c; });
          res.on('end', () => resolve(text));
        }).on('error', reject);
      });
      expect(body).toContain('"num":"100"');
    } finally {
      await new Promise((done) => server.close(done));
    }
  });
});
