/**
 * Keeps amiscan's parts (xvs.library virus database, xfdmaster, xpkmaster, the
 * boot block database) current, in a folder of the board's own.
 *
 * amiscan's docs/bbs.md: run `amiscan -update` daily as the board's user and
 * give the board its own parts folder with -libs, so an update by hand
 * elsewhere cannot change the board under it. The folder is
 * `<boardRoot>/AmiScan/`, on the data volume, which docker-entrypoint.sh
 * neither seeds nor wipes.
 *
 * The same shape as news-bulletins: fetch now, then every interval, unref'd,
 * never overlapped, never blocking startup. Nothing runs when the binary is
 * absent (a dev machine, a board that does not use amiscan).
 */
import { execFile } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { boardRoot } from '../utils/board-root.util';

export const AMISCAN_UPDATE_INTERVAL_MS = 24 * 60 * 60 * 1000;
const UPDATE_TIMEOUT_MS = 10 * 60 * 1000;

/** The parts folder amiscan reads with -libs. */
export function amiscanLibsDir(): string {
  return path.join(boardRoot(), 'AmiScan');
}

export function amiscanBinary(): string {
  return process.env.AMISCAN_BIN || '/usr/local/bin/amiscan';
}

export interface AmiscanUpdateDeps {
  binary: string;
  libsDir: string;
  /** Runs the binary; resolves with its combined output, rejects on a non-zero exit. */
  run: (binary: string, args: string[]) => Promise<string>;
  log: (line: string) => void;
}

export function defaultAmiscanUpdateDeps(): AmiscanUpdateDeps {
  return {
    binary: amiscanBinary(),
    libsDir: amiscanLibsDir(),
    run: (binary, args) =>
      new Promise((resolve, reject) => {
        execFile(binary, args, { timeout: UPDATE_TIMEOUT_MS }, (error, stdout, stderr) => {
          const output = `${stdout}${stderr}`;
          if (error) reject(new Error(output.trim().split('\n').pop() || error.message));
          else resolve(output);
        });
      }),
    log: (line) => console.log(line),
  };
}

/** One update run. Logs exactly one line. Never throws. */
export async function updateAmiscanParts(
  deps: AmiscanUpdateDeps = defaultAmiscanUpdateDeps(),
): Promise<'updated' | 'failed' | 'absent'> {
  if (!fs.existsSync(deps.binary)) return 'absent';
  try {
    fs.mkdirSync(deps.libsDir, { recursive: true });
    await deps.run(deps.binary, ['-update', '-libs', deps.libsDir]);
    deps.log(`[AmiScan] parts up to date in ${deps.libsDir}`);
    return 'updated';
  } catch (err) {
    deps.log(`[WARN] AmiScan: update failed: ${(err as Error).message}`);
    return 'failed';
  }
}

let running = false;

/** Update now and every interval after; returns null when there is no binary. */
export function startAmiscanUpdates(
  deps: AmiscanUpdateDeps = defaultAmiscanUpdateDeps(),
  intervalMs: number = AMISCAN_UPDATE_INTERVAL_MS,
): NodeJS.Timeout | null {
  if (!fs.existsSync(deps.binary)) return null;
  const tick = (): void => {
    if (running) return;
    running = true;
    updateAmiscanParts(deps).finally(() => { running = false; });
  };
  tick();
  const timer = setInterval(tick, intervalMs);
  timer.unref();
  return timer;
}
