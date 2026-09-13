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
import * as fs from 'fs';
import * as path from 'path';

const MAX_RESTARTS = 5;
const RESTART_DELAY_MS = 2000;

let child: ChildProcess | null = null;
let restarts = 0;

function entryPoint(backendRoot: string): { command: string; args: string[] } {
  const built = path.join(backendRoot, 'dist', 'scripts', 'texttv-sidecar-server.js');
  if (fs.existsSync(built)) return { command: process.execPath, args: [built] };
  const source = path.join(backendRoot, 'src', 'scripts', 'texttv-sidecar-server.ts');
  return { command: 'npx', args: ['tsx', source] };
}

export function startTextTvSidecar(backendRoot = process.cwd()): void {
  if (child) return;
  const { command, args } = entryPoint(backendRoot);
  child = spawn(command, args, {
    cwd: backendRoot,
    env: { ...process.env },
    stdio: ['ignore', 'inherit', 'inherit'],
  });
  child.on('exit', (code, signal) => {
    child = null;
    if (restarts >= MAX_RESTARTS) {
      console.warn(
        `[texttv-sidecar] gave up after ${MAX_RESTARTS} restarts (last exit ${code ?? signal}); ` +
          'the TEXTTV door will report that Text-TV did not answer',
      );
      return;
    }
    restarts += 1;
    console.warn(`[texttv-sidecar] exited (${code ?? signal}), restart ${restarts}/${MAX_RESTARTS}`);
    setTimeout(() => startTextTvSidecar(backendRoot), RESTART_DELAY_MS).unref?.();
  });
}

export function stopTextTvSidecar(): void {
  if (!child) return;
  child.kill();
  child = null;
}
