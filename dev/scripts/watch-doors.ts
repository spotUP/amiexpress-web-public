#!/usr/bin/env npx tsx
/**
 * Door File Watcher - Auto-restart backend when doors change
 *
 * Watches for changes to TypeScript/JavaScript door files and automatically
 * restarts the backend server. This is the ONLY reliable way to reload doors
 * since Node.js ESM modules cannot be hot reloaded.
 *
 * Usage:
 *   npx tsx dev/scripts/watch-doors.ts
 *
 * Watches:
 *   - Doors/**\/*.{ts,js}     (TypeScript doors in Doors/)
 *   - sdk/doors/**\/*.{ts,js}  (SDK example doors)
 */

import { watch, FSWatcher } from 'chokidar';
import { ChildProcess } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import { startManaged, stopManaged, isAlive } from './lib/managed-process';

const PROJECT_ROOT = path.resolve(__dirname, '../..');
const PID_FILE = path.join(PROJECT_ROOT, '.watch-doors.pid');
const DEBOUNCE_MS = 1000; // Wait 1s after last change before restarting

let backendProcess: ChildProcess | null = null;
let restartTimer: NodeJS.Timeout | null = null;
let isRestarting = false;
let pendingRestart: string | null = null;
let isShuttingDown = false;
let watcher: FSWatcher | null = null;

// Check for existing instance and kill it
function checkAndKillExisting(): void {
  try {
    if (fs.existsSync(PID_FILE)) {
      const oldPid = parseInt(fs.readFileSync(PID_FILE, 'utf-8').trim(), 10);
      if (oldPid && !isNaN(oldPid)) {
        try {
          // Check if process exists
          process.kill(oldPid, 0);
          // Process exists, kill it
          console.log(`[WARN] Killing existing watch-doors process (PID: ${oldPid})`);
          process.kill(oldPid, 'SIGTERM');
          // Give it time to clean up
          const start = Date.now();
          while (Date.now() - start < 3000) {
            try {
              process.kill(oldPid, 0);
              // Still alive, wait
              const waitSync = (ms: number) => {
                const end = Date.now() + ms;
                while (Date.now() < end) { /* busy wait */ }
              };
              waitSync(100);
            } catch {
              // Process is gone
              break;
            }
          }
        } catch {
          // Process doesn't exist, ignore
        }
      }
      fs.unlinkSync(PID_FILE);
    }
  } catch {
    // Ignore errors
  }
}

// Write PID file
function writePidFile(): void {
  fs.writeFileSync(PID_FILE, process.pid.toString());
}

// Remove PID file
function removePidFile(): void {
  try {
    if (fs.existsSync(PID_FILE)) {
      fs.unlinkSync(PID_FILE);
    }
  } catch {
    // Ignore
  }
}

// ANSI colors
const colors = {
  reset: '\x1b[0m',
  cyan: '\x1b[0;36m',
  green: '\x1b[0;32m',
  yellow: '\x1b[0;33m',
  red: '\x1b[0;31m',
  gray: '\x1b[0;37m',
};

function log(msg: string, color = colors.reset) {
  console.log(`${color}${msg}${colors.reset}`);
}

// The backend is started through the LOCAL tsx binary, never `npx tsx`.
//
// npx is a wrapper process: spawning it makes the watcher's handle the
// wrapper, while the actual server runs as its child. Killing the wrapper
// leaves that child alive and re-parented to launchd - unstoppable by the
// watcher, still holding port 3001. 104 backends were found running at once
// that way, every one of them `node .../.bin/tsx src/index.ts` with no
// parent. Spawning the binary directly makes the handle the server itself.
function backendCommand(): { command: string; args: string[] } {
  const localTsx = path.join(PROJECT_ROOT, 'web/backend/node_modules/.bin/tsx');
  if (fs.existsSync(localTsx)) return { command: localTsx, args: ['src/index.ts'] };
  // No local install (a fresh checkout before npm install): npx is the only
  // way to run at all, and a wrapper that can orphan beats not starting.
  // Said out loud so the orphan risk is never silent.
  log('[WARN] web/backend has no local tsx - falling back to npx (a restart may orphan the backend)', colors.yellow);
  return { command: 'npx', args: ['tsx', 'src/index.ts'] };
}

function startBackend() {
  if (isShuttingDown) return;

  // Never overwrite a live handle: that loses the only reference able to
  // stop it, which is how an orphan is made.
  if (backendProcess?.pid && isAlive(backendProcess.pid)) {
    log('[WARN] Backend already running - not starting a second one', colors.yellow);
    return;
  }

  log('\n-> Starting backend...', colors.cyan);

  const { command, args } = backendCommand();
  backendProcess = startManaged({
    command,
    args,
    cwd: path.join(PROJECT_ROOT, 'web/backend'),
    env: { ...process.env },
    stdio: 'inherit',
  });

  // `spawned`, not `backendProcess`: by the time these fire, a restart may
  // have replaced the handle, and clearing it then would drop the live
  // backend's only reference.
  const spawned = backendProcess;

  spawned.on('exit', (code) => {
    if (!isRestarting && !isShuttingDown) {
      if (code === 0) {
        log('[OK] Backend exited cleanly', colors.green);
      } else {
        log(`[ERROR] Backend crashed with code ${code}`, colors.red);
      }
    }
    if (backendProcess === spawned) backendProcess = null;
  });

  spawned.on('error', (err) => {
    log(`[ERROR] Backend spawn error: ${err.message}`, colors.red);
    if (backendProcess === spawned) backendProcess = null;
  });

  log('[OK] Backend started (PID: ' + backendProcess.pid + ')', colors.green);
}

async function stopBackend(): Promise<void> {
  const proc = backendProcess;
  if (!proc) return;

  log('-> Stopping backend...', colors.yellow);

  // stopManaged is handed THE process to stop and signals its whole group.
  // The previous version armed a 3-second timer that killed whatever
  // `backendProcess` pointed at when it fired - which, after a graceful stop
  // that finished quickly, was the replacement backend already started in
  // the meantime. That orphaned one backend per restart.
  const { stopped } = await stopManaged(proc, {
    graceMs: 3000,
    onForce: () => log('[WARN] Force killing backend...', colors.yellow),
  });

  // Only clear the handle if it is still the process this call stopped.
  if (backendProcess === proc) backendProcess = null;

  if (stopped) {
    log('[OK] Backend stopped', colors.green);
  } else {
    log(`[ERROR] Backend ${proc.pid} survived SIGKILL - a new one will collide with it`, colors.red);
  }
}

// Comprehensive cleanup function
async function cleanup(): Promise<void> {
  if (isShuttingDown) return;
  isShuttingDown = true;

  log('\n-> Cleaning up...', colors.yellow);

  // Clear any pending restart
  if (restartTimer) {
    clearTimeout(restartTimer);
    restartTimer = null;
  }
  pendingRestart = null;

  // Close watcher
  if (watcher) {
    try {
      await watcher.close();
    } catch {
      // Ignore
    }
    watcher = null;
  }

  // Stop backend
  await stopBackend();

  // Remove PID file
  removePidFile();

  log('[OK] Cleanup complete', colors.green);
}

async function restartBackend(changedFile: string) {
  if (isShuttingDown) return;
  if (isRestarting) {
    // A change that lands mid-restart used to be dropped on the floor: the
    // restart in flight was already stopping a backend built from the
    // PREVIOUS state, so the new file never reached a running process and
    // the watcher looked like it had missed the edit. Remember it and run
    // one more restart when this one finishes.
    pendingRestart = changedFile;
    return;
  }

  isRestarting = true;
  log('\n----------------------------------------------------', colors.gray);
  log(`[CHANGE] ${path.relative(PROJECT_ROOT, changedFile)}`, colors.yellow);

  await stopBackend();

  // Small delay to ensure cleanup
  await new Promise(resolve => setTimeout(resolve, 500));

  startBackend();
  log('----------------------------------------------------\n', colors.gray);
  isRestarting = false;

  if (pendingRestart && !isShuttingDown) {
    const next = pendingRestart;
    pendingRestart = null;
    scheduleRestart(next);
  }
}

function scheduleRestart(changedFile: string) {
  if (isShuttingDown) return;

  if (restartTimer) {
    clearTimeout(restartTimer);
  }

  restartTimer = setTimeout(() => {
    restartBackend(changedFile);
  }, DEBOUNCE_MS);
}

// Kill any existing instance first
checkAndKillExisting();

// Write our PID file
writePidFile();

// Start initial backend
startBackend();

// Watch door directories AND backend source.
//
// Door files: TypeScript / compiled-JS for both Doors/ and sdk/doors/.
//   Triggers a restart when a sysop edits or rebuilds a door, since
//   Node ESM cannot hot-reload the door modules.
//
// Backend src: web/backend/src/**/*.ts. tsx itself doesn't watch
//   files in our usual launch line, so source edits to handlers,
//   services, utilities etc. would otherwise require a manual
//   kill-servers + start-servers cycle. Including the backend tree
//   here gives us tsx-watch-equivalent behaviour: edit a TS file,
//   the watcher debounces, then respawns the backend with the new
//   code. Excludes dist/ and tests so a `tsc --noEmit` or `npm
//   test` sweep doesn't bounce the server unnecessarily.
watcher = watch(
  [
    'Doors/**/*.{ts,js}',
    'sdk/doors/**/*.{ts,js}',
    'web/backend/src/**/*.ts',
  ],
  {
    cwd: PROJECT_ROOT,
    ignored: [
      '**/node_modules/**',
      // Don't ignore dist/ - hybrid doors need dist/ changes to trigger restart
      '**/.git/**',
      // Don't restart on test edits — they're isolated.
      '**/*.test.ts',
      '**/__tests__/**',
      // Don't restart on backend dist or build artifacts.
      '**/web/backend/dist/**',
    ],
    persistent: true,
    ignoreInitial: true,
  }
);

log('\n+---------------------------------------------------------------+', colors.cyan);
log('|           Door File Watcher - Auto Restart Mode              |', colors.cyan);
log('+---------------------------------------------------------------+', colors.cyan);
log(`\n-> Watcher PID: ${process.pid}`, colors.cyan);
log('-> Watching for door changes...', colors.cyan);
log('   Doors/**/*.{ts,js} (includes dist/)', colors.gray);
log('   sdk/doors/**/*.{ts,js}', colors.gray);
log('\n-> Backend will auto-restart when door files change', colors.cyan);
log('-> Includes compiled dist/ files for hybrid doors', colors.cyan);
log('-> Press Ctrl+C to stop\n', colors.cyan);

watcher
  .on('change', (filepath) => {
    const fullPath = path.join(PROJECT_ROOT, filepath);
    log(`  [MODIFIED] ${filepath}`, colors.yellow);
    scheduleRestart(fullPath);
  })
  .on('add', (filepath) => {
    const fullPath = path.join(PROJECT_ROOT, filepath);
    log(`  [ADDED] ${filepath}`, colors.green);
    scheduleRestart(fullPath);
  })
  .on('unlink', (filepath) => {
    const fullPath = path.join(PROJECT_ROOT, filepath);
    log(`  [DELETED] ${filepath}`, colors.red);
    scheduleRestart(fullPath);
  })
  .on('error', (error) => {
    log(`[ERROR] Watcher error: ${error.message}`, colors.red);
  });

// Graceful shutdown handlers
process.on('SIGINT', async () => {
  log('\n\n-> Received SIGINT, shutting down...', colors.yellow);
  await cleanup();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  log('\n\n-> Received SIGTERM, shutting down...', colors.yellow);
  await cleanup();
  process.exit(0);
});

process.on('SIGHUP', async () => {
  log('\n\n-> Received SIGHUP, shutting down...', colors.yellow);
  await cleanup();
  process.exit(0);
});

// Handle uncaught errors
process.on('uncaughtException', async (err) => {
  log(`\n[ERROR] Uncaught exception: ${err.message}`, colors.red);
  await cleanup();
  process.exit(1);
});

process.on('unhandledRejection', async (reason) => {
  log(`\n[ERROR] Unhandled rejection: ${reason}`, colors.red);
  await cleanup();
  process.exit(1);
});

// Cleanup on normal exit
process.on('exit', () => {
  // Synchronous cleanup only
  removePidFile();
});

// Handle parent process death (when terminal closes)
process.on('disconnect', async () => {
  log('\n-> Parent disconnected, shutting down...', colors.yellow);
  await cleanup();
  process.exit(0);
});
