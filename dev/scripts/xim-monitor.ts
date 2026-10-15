#!/usr/bin/env npx tsx
/**
 * XIM Door State Monitor - Real-time monitoring of all active door sessions
 *
 * Shows current state of all running doors with live updates.
 *
 * Usage:
 *   npx tsx dev/scripts/xim-monitor.ts [options]
 *
 * Options:
 *   --refresh N        Refresh interval in seconds (default: 2)
 *   --file PATH       Custom log file path
 *
 * Examples:
 *   npm run xim:monitor              # Monitor with 2s refresh
 *   npm run xim:monitor -- --refresh 1  # Faster refresh
 */

import * as fs from 'fs';
import * as readline from 'readline';

interface XIMLogEntry {
  timestamp: string;
  level: 'debug' | 'info' | 'warn' | 'error';
  direction: 'send' | 'receive';
  door: string;
  node: number;
  message: {
    type: string;
    typeCode: number;
    param?: number;
    dataLen?: number;
  };
}

interface DoorState {
  door: string;
  node: number;
  state: 'initializing' | 'running' | 'waiting' | 'terminated' | 'error';
  startTime: Date;
  lastActivity: Date;
  messagesSent: number;
  messagesReceived: number;
  lastMessage: string;
  lastDirection: 'send' | 'receive';
  errors: number;
  warnings: number;
}

class XIMMonitor {
  private logFile: string;
  private refreshInterval: number = 2000; // milliseconds
  private states = new Map<string, DoorState>();
  private lastReadPosition = 0;

  constructor() {
    this.parseArgs();
    this.logFile = process.env.XIM_LOG_FILE || 'logs/xim-debug.json';
  }

  private parseArgs() {
    const args = process.argv.slice(2);
    for (let i = 0; i < args.length; i++) {
      switch (args[i]) {
        case '--refresh':
          this.refreshInterval = parseInt(args[++i], 10) * 1000;
          break;
        case '--file':
          this.logFile = args[++i];
          break;
        case '--help':
          this.printHelp();
          process.exit(0);
      }
    }
  }

  private printHelp() {
    console.log(`
XIM Door State Monitor - Real-time monitoring of all active door sessions

Usage:
  npx tsx dev/scripts/xim-monitor.ts [options]

Options:
  --refresh N        Refresh interval in seconds (default: 2)
  --file PATH       Custom log file path
  --help            Show this help

Examples:
  npx tsx dev/scripts/xim-monitor.ts              # Monitor with 2s refresh
  npx tsx dev/scripts/xim-monitor.ts --refresh 1  # Faster refresh

Environment:
  XIM_LOG_FILE        Default log file path (default: logs/xim-debug.json)

Controls:
  Ctrl+C             Exit monitor
`);
  }

  async run() {
    if (!fs.existsSync(this.logFile)) {
      console.error(`[ERROR] Log file not found: ${this.logFile}`);
      console.error('Make sure XIM_DEBUG_JSON=1 is set when running the backend.');
      process.exit(1);
    }

    // Clear screen and hide cursor
    process.stdout.write('\x1b[2J\x1b[?25l');

    // Initial read
    await this.updateStates();
    this.display();

    // Setup interval
    setInterval(async () => {
      await this.updateStates();
      this.display();
    }, this.refreshInterval);

    // Cleanup on exit
    process.on('SIGINT', () => {
      process.stdout.write('\x1b[?25h'); // Show cursor
      process.exit(0);
    });
  }

  private async updateStates() {
    // Check if file exists and get current size
    if (!fs.existsSync(this.logFile)) return;

    const stats = fs.statSync(this.logFile);
    const currentSize = stats.size;

    // If file was rotated or truncated
    if (currentSize < this.lastReadPosition) {
      this.lastReadPosition = 0;
      this.states.clear();
    }

    // Read new data only
    if (currentSize > this.lastReadPosition) {
      const stream = fs.createReadStream(this.logFile, {
        start: this.lastReadPosition,
        end: currentSize,
      });

      const rl = readline.createInterface({
        input: stream,
        crlfDelay: Infinity,
      });

      for await (const line of rl) {
        if (line.trim()) {
          try {
            const entry: XIMLogEntry = JSON.parse(line);
            if (entry.door !== 'SYSTEM') {
              this.processEntry(entry);
            }
          } catch (err) {
            // Ignore invalid JSON
          }
        }
      }

      this.lastReadPosition = currentSize;
    }

    // Update states based on activity
    this.updateActivityStates();
  }

  private processEntry(entry: XIMLogEntry) {
    const key = `${entry.door}-${entry.node}`;
    let state = this.states.get(key);

    if (!state) {
      state = {
        door: entry.door,
        node: entry.node,
        state: 'initializing',
        startTime: new Date(entry.timestamp),
        lastActivity: new Date(entry.timestamp),
        messagesSent: 0,
        messagesReceived: 0,
        lastMessage: entry.message.type,
        lastDirection: entry.direction,
        errors: 0,
        warnings: 0,
      };
      this.states.set(key, state);
    }

    // Update state
    state.lastActivity = new Date(entry.timestamp);
    state.lastMessage = entry.message.type;
    state.lastDirection = entry.direction;

    if (entry.direction === 'send') {
      state.messagesSent++;
    } else {
      state.messagesReceived++;
    }

    if (entry.level === 'error') {
      state.errors++;
      state.state = 'error';
    } else if (entry.level === 'warn') {
      state.warnings++;
    }

    // Update state based on message type
    if (entry.message.type === 'JH_INIT') {
      state.state = 'initializing';
    } else if (entry.message.type === 'JH_SM' && state.state === 'initializing') {
      state.state = 'running';
    } else if (entry.message.type === 'JH_TERMINATE') {
      state.state = 'terminated';
    } else if (entry.message.type === 'TIMEOUT') {
      state.state = 'waiting';
    }
  }

  private updateActivityStates() {
    const now = Date.now();
    const INACTIVE_THRESHOLD = 10000; // 10 seconds

    for (const [key, state] of this.states) {
      const timeSinceActivity = now - state.lastActivity.getTime();

      // Remove terminated sessions after 30 seconds
      if (state.state === 'terminated' && timeSinceActivity > 30000) {
        this.states.delete(key);
        continue;
      }

      // Mark as waiting if no activity
      if (state.state === 'running' && timeSinceActivity > INACTIVE_THRESHOLD) {
        state.state = 'waiting';
      }
    }
  }

  private display() {
    // Move cursor to top-left
    process.stdout.write('\x1b[H');

    const now = new Date();

    // Header
    console.log('\x1b[1;36m╔═══════════════════════════════════════════════════════════════════════════════╗\x1b[0m');
    console.log('\x1b[1;36m║                        XIM Door State Monitor                                  ║\x1b[0m');
    console.log('\x1b[1;36m╚═══════════════════════════════════════════════════════════════════════════════╝\x1b[0m');
    console.log(`\x1b[0;37mTime: ${now.toTimeString().split(' ')[0]}  |  Refresh: ${this.refreshInterval / 1000}s  |  Active Doors: ${this.states.size}\x1b[0m`);
    console.log('');

    if (this.states.size === 0) {
      console.log('  \x1b[0;33mNo active door sessions\x1b[0m');
      console.log('');
      console.log('  Waiting for doors to start...');
      console.log('');
      return;
    }

    // Table header
    console.log('\x1b[1;37m  DOOR              NODE  STATE          UPTIME    MSGS    LAST ACTIVITY\x1b[0m');
    console.log('  ─────────────────────────────────────────────────────────────────────────────');

    // Sort by most recent activity
    const sorted = Array.from(this.states.values()).sort((a, b) =>
      b.lastActivity.getTime() - a.lastActivity.getTime()
    );

    for (const state of sorted) {
      this.displayDoorState(state);
    }

    console.log('');

    // Summary stats
    const totalSent = Array.from(this.states.values()).reduce((sum, s) => sum + s.messagesSent, 0);
    const totalReceived = Array.from(this.states.values()).reduce((sum, s) => sum + s.messagesReceived, 0);
    const totalErrors = Array.from(this.states.values()).reduce((sum, s) => sum + s.errors, 0);

    console.log(`  Total Messages: ${totalSent + totalReceived}  (Sent: ${totalSent}, Received: ${totalReceived})  Errors: ${totalErrors}`);
    console.log('');
    console.log('  \x1b[0;37mPress Ctrl+C to exit\x1b[0m');

    // Clear rest of screen
    process.stdout.write('\x1b[J');
  }

  private displayDoorState(state: DoorState) {
    const stateColor = this.getStateColor(state.state);
    const stateIcon = this.getStateIcon(state.state);
    const uptime = this.formatUptime(Date.now() - state.startTime.getTime());
    const activity = this.formatActivity(Date.now() - state.lastActivity.getTime());
    const msgCount = `${state.messagesSent}↑/${state.messagesReceived}↓`;

    let line = '  ';
    line += state.door.padEnd(16);
    line += '  ';
    line += `N${state.node}`.padEnd(4);
    line += '  ';
    line += `${stateColor}${stateIcon} ${state.state.padEnd(11)}\x1b[0m`;
    line += '  ';
    line += uptime.padEnd(8);
    line += '  ';
    line += msgCount.padEnd(8);
    line += '  ';
    line += activity;

    if (state.errors > 0) {
      line += ` \x1b[1;31m[${state.errors} ERR]\x1b[0m`;
    } else if (state.warnings > 0) {
      line += ` \x1b[1;33m[${state.warnings} WARN]\x1b[0m`;
    }

    console.log(line);

    // Show last message details
    const arrow = state.lastDirection === 'send' ? '→' : '←';
    console.log(`      \x1b[0;37m${arrow} ${state.lastMessage}\x1b[0m`);
  }

  private getStateColor(state: string): string {
    switch (state) {
      case 'running': return '\x1b[1;32m'; // Bright green
      case 'initializing': return '\x1b[0;36m'; // Cyan
      case 'waiting': return '\x1b[1;33m'; // Bright yellow
      case 'error': return '\x1b[1;31m'; // Bright red
      case 'terminated': return '\x1b[0;37m'; // Gray
      default: return '\x1b[0;37m';
    }
  }

  private getStateIcon(state: string): string {
    switch (state) {
      case 'running': return '●';
      case 'initializing': return '○';
      case 'waiting': return '◐';
      case 'error': return '✗';
      case 'terminated': return '◯';
      default: return '?';
    }
  }

  private formatUptime(ms: number): string {
    const seconds = Math.floor(ms / 1000);
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ${seconds % 60}s`;
    const hours = Math.floor(minutes / 60);
    return `${hours}h ${minutes % 60}m`;
  }

  private formatActivity(ms: number): string {
    const seconds = Math.floor(ms / 1000);
    if (seconds < 1) return 'now';
    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.floor(seconds / 60);
    return `${minutes}m ago`;
  }
}

// Run monitor
const monitor = new XIMMonitor();
monitor.run().catch((err) => {
  process.stdout.write('\x1b[?25h'); // Show cursor
  console.error('Error:', err);
  process.exit(1);
});
