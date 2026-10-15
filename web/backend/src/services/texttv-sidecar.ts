/**
 * Supervises the Text-TV proxy sidecar (scripts/texttv-sidecar-server.ts).
 *
 * The door must not fetch from the process that runs it - see that file's
 * header for the deadlock and the measurement. This starts the sidecar
 * beside the board and restarts it if it dies, with a ceiling so a
 * permanently broken sidecar cannot spin.
 *
 * Resolution follows the door runner's precedent (services/batch-scheduler.ts):
 * the built dist when it is there, the TypeScript through tsx when it is not,
 * so dev and the container both work without a second code path.
 */
import { spawn, ChildProcess } from 'child_process';
import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';
import {
  TEXTTV_SIDECAR_PORT,
  TEXTTV_SIDECAR_HEALTH_PATH,
} from '../scripts/texttv-sidecar-server';

const MAX_RESTARTS = 5;
const RESTART_DELAY_MS = 2000;
const HEALTH_TIMEOUT_MS = 500;

let child: ChildProcess | null = null;
let restarts = 0;

/**
 * Is a sidecar already answering on the port?
 *
 * Asked before spawning and again before counting a crash. A dev machine
 * can hold an ORPHAN from a previous board: `kill-servers.sh` kills the
 * backend with SIGKILL, and a killed parent kills nothing, so the old
 * sidecar keeps the port. Every board started afterwards then failed to
 * bind, spent its five restarts and announced that Text-TV was down - while
 * the orphan was serving pages perfectly well the whole time (2026-09-13).
 *
 * The orphan now exits on its own (see the sidecar's ppid watchdog); this
 * is the other half, so a board that meets one adopts it instead of
 * fighting it - and says which it did.
 */
export function sidecarAnswers(port = TEXTTV_SIDECAR_PORT): Promise<boolean> {
  return new Promise((resolve) => {
    const request = http.get(
      { host: '127.0.0.1', port, path: TEXTTV_SIDECAR_HEALTH_PATH, timeout: HEALTH_TIMEOUT_MS },
      (res) => {
        res.resume();
        resolve(res.statusCode === 200);
      },
    );
    request.on('timeout', () => { request.destroy(); resolve(false); });
    request.on('error', () => resolve(false));
  });
}

function entryPoint(backendRoot: string): { command: string; args: string[] } {
  const built = path.join(backendRoot, 'dist', 'scripts', 'texttv-sidecar-server.js');
  if (fs.existsSync(built)) return { command: process.execPath, args: [built] };
  const source = path.join(backendRoot, 'src', 'scripts', 'texttv-sidecar-server.ts');
  return { command: 'npx', args: ['tsx', source] };
}

export function startTextTvSidecar(backendRoot = process.cwd()): void {
  if (child) return;
  void sidecarAnswers().then((answering) => {
    if (answering) {
      // Someone else's sidecar, or our own from before a hard kill. Either
      // way the door has what it needs and a second one cannot bind.
      console.log(
        `[texttv-sidecar] one is already serving on 127.0.0.1:${TEXTTV_SIDECAR_PORT} - adopting it`,
      );
      return;
    }
    spawnSidecar(backendRoot);
  });
}

function spawnSidecar(backendRoot: string): void {
  if (child) return;
  const { command, args } = entryPoint(backendRoot);
  child = spawn(command, args, {
    cwd: backendRoot,
    // The board's own pid, so the sidecar can outlive nothing: see the
    // watchdog in the sidecar. `npx tsx` sits between us in dev, which is
    // why it cannot just watch its parent.
    env: { ...process.env, TEXTTV_SIDECAR_PARENT_PID: String(process.pid) },
    stdio: ['ignore', 'inherit', 'inherit'],
  });
  child.on('exit', (code, signal) => {
    child = null;
    void sidecarAnswers().then((answering) => {
      if (answering) {
        // It could not bind because the port was already served. That is not
        // a crash loop, and telling the sysop the door is down would be a
        // lie: the door is about to work.
        console.log(
          `[texttv-sidecar] did not start (exit ${code ?? signal}) - one is already serving ` +
            `on 127.0.0.1:${TEXTTV_SIDECAR_PORT}, adopting it`,
        );
        return;
      }
      if (restarts >= MAX_RESTARTS) {
        console.warn(
          `[texttv-sidecar] gave up after ${MAX_RESTARTS} restarts (last exit ${code ?? signal}); ` +
            'the TEXTTV door will report that Text-TV did not answer',
        );
        return;
      }
      restarts += 1;
      console.warn(`[texttv-sidecar] exited (${code ?? signal}), restart ${restarts}/${MAX_RESTARTS}`);
      setTimeout(() => spawnSidecar(backendRoot), RESTART_DELAY_MS).unref?.();
    });
  });
}

export function stopTextTvSidecar(): void {
  if (!child) return;
  child.kill();
  child = null;
}
