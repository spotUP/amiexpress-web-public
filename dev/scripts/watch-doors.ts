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

import { watch } from 'chokidar';
import { spawn, ChildProcess } from 'child_process';
import * as path from 'path';

const PROJECT_ROOT = path.resolve(__dirname, '../..');
const DEBOUNCE_MS = 1000; // Wait 1s after last change before restarting

let backendProcess: ChildProcess | null = null;
let restartTimer: NodeJS.Timeout | null = null;
let isRestarting = false;

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
  log('\n→ Starting backend...', colors.cyan);

  backendProcess = spawn('npx', ['tsx', 'src/index.ts'], {
    cwd: path.join(PROJECT_ROOT, 'web/backend'),
    stdio: 'inherit',
    env: { ...process.env },
  });

  backendProcess.on('exit', (code) => {
    if (!isRestarting) {
      if (code === 0) {
        log('[OK] Backend exited cleanly', colors.green);
      } else {
        log(`[ERROR] Backend crashed with code ${code}`, colors.red);
      }
    }
  });

  log('[OK] Backend started (PID: ' + backendProcess.pid + ')', colors.green);
}

function stopBackend(): Promise<void> {
  return new Promise((resolve) => {
    if (!backendProcess) {
      resolve();
      return;
    }

    log('→ Stopping backend...', colors.yellow);

    backendProcess.once('exit', () => {
      backendProcess = null;
      log('[OK] Backend stopped', colors.green);
      resolve();
    });

    // Try graceful shutdown first
    backendProcess.kill('SIGTERM');

    // Force kill after 5 seconds
    setTimeout(() => {
      if (backendProcess) {
        log('[WARN] Force killing backend...', colors.yellow);
        backendProcess.kill('SIGKILL');
      }
    }, 5000);
  });
}

async function restartBackend(changedFile: string) {
  if (isRestarting) {
    return;
  }

  isRestarting = true;
  log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', colors.gray);
  log(`[CHANGE] ${path.relative(PROJECT_ROOT, changedFile)}`, colors.yellow);

  await stopBackend();

  // Small delay to ensure cleanup
  await new Promise(resolve => setTimeout(resolve, 500));

  startBackend();
  log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n', colors.gray);
  isRestarting = false;
}

function scheduleRestart(changedFile: string) {
  if (restartTimer) {
    clearTimeout(restartTimer);
  }

  restartTimer = setTimeout(() => {
    restartBackend(changedFile);
  }, DEBOUNCE_MS);
}

// Start initial backend
startBackend();

// Watch door directories
const watcher = watch(
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

log('\n╔═══════════════════════════════════════════════════════════════╗', colors.cyan);
log('║           Door File Watcher - Auto Restart Mode              ║', colors.cyan);
log('╚═══════════════════════════════════════════════════════════════╝', colors.cyan);
log('\n→ Watching for door changes...', colors.cyan);
log('  Doors/**/*.{ts,js}', colors.gray);
log('  sdk/doors/**/*.{ts,js}', colors.gray);
log('\n→ Backend will auto-restart when door files change', colors.cyan);
log('→ Press Ctrl+C to stop\n', colors.cyan);

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

// Graceful shutdown
process.on('SIGINT', async () => {
  log('\n\n→ Shutting down...', colors.yellow);
  await watcher.close();
  await stopBackend();
  log('[OK] Watcher stopped\n', colors.green);
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await watcher.close();
  await stopBackend();
  process.exit(0);
});
