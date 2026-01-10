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
import { spawn, ChildProcess } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';

const PROJECT_ROOT = path.resolve(__dirname, '../..');
const PID_FILE = path.join(PROJECT_ROOT, '.watch-doors.pid');
const DEBOUNCE_MS = 1000; // Wait 1s after last change before restarting

let backendProcess: ChildProcess | null = null;
let restartTimer: NodeJS.Timeout | null = null;
let isRestarting = false;
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

function startBackend() {
  if (isShuttingDown) return;

  log('\n-> Starting backend...', colors.cyan);

  backendProcess = spawn('npx', ['tsx', 'src/index.ts'], {
    cwd: path.join(PROJECT_ROOT, 'web/backend'),
    stdio: 'inherit',
    env: { ...process.env },
    // Don't detach - we want children to die with parent
    detached: false,
  });

  backendProcess.on('exit', (code) => {
    if (!isRestarting && !isShuttingDown) {
      if (code === 0) {
        log('[OK] Backend exited cleanly', colors.green);
      } else {
        log(`[ERROR] Backend crashed with code ${code}`, colors.red);
      }
    }
    backendProcess = null;
  });

  backendProcess.on('error', (err) => {
    log(`[ERROR] Backend spawn error: ${err.message}`, colors.red);
    backendProcess = null;
  });

  log('[OK] Backend started (PID: ' + backendProcess.pid + ')', colors.green);
}

function stopBackend(): Promise<void> {
  return new Promise((resolve) => {
    if (!backendProcess) {
      resolve();
      return;
    }

    log('-> Stopping backend...', colors.yellow);

    const pid = backendProcess.pid;
    let resolved = false;

    const cleanup = () => {
      if (!resolved) {
        resolved = true;
        backendProcess = null;
        log('[OK] Backend stopped', colors.green);
        resolve();
      }
    };

    backendProcess.once('exit', cleanup);

    // Try graceful shutdown first
    try {
      backendProcess.kill('SIGTERM');
    } catch {
      cleanup();
      return;
    }

    // Force kill after 3 seconds
    setTimeout(() => {
      if (backendProcess && pid) {
        log('[WARN] Force killing backend...', colors.yellow);
        try {
          backendProcess.kill('SIGKILL');
        } catch {
          // Process already gone
        }
        // Ensure we resolve even if exit event doesn't fire
        setTimeout(cleanup, 500);
      }
    }, 3000);
  });
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
  if (isRestarting || isShuttingDown) {
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

// Watch door directories
watcher = watch(
  [
    'Doors/**/*.{ts,js}',
    'sdk/doors/**/*.{ts,js}',
  ],
  {
    cwd: PROJECT_ROOT,
    ignored: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.git/**',
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
log('   Doors/**/*.{ts,js}', colors.gray);
log('   sdk/doors/**/*.{ts,js}', colors.gray);
log('\n-> Backend will auto-restart when door files change', colors.cyan);
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
