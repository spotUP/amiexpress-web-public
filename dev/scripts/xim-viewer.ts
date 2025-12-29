#!/usr/bin/env npx tsx
/**
 * XIM Log Viewer - Real-time XIM protocol message viewer
 *
 * Displays XIM messages in a unified, color-coded timeline.
 * Supports both live tail and historical log viewing.
 *
 * Usage:
 *   npx tsx dev/scripts/xim-viewer.ts [options]
 *
 * Options:
 *   --live, -l          Tail log in real-time
 *   --door NAME         Filter by door name
 *   --node N           Filter by node number
 *   --errors           Show only errors/warnings
 *   --stats            Show statistics summary
 *   --last N           Show last N messages (default: 100)
 *   --file PATH        Custom log file path
 *
 * Examples:
 *   npm run xim:view              # View last 100 messages
 *   npm run xim:view --live       # Live tail
 *   npm run xim:view --door WHO   # Filter by door
 *   npm run xim:view --errors     # Errors only
 */

import * as fs from 'fs';
import * as path from 'path';
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
    dataText?: string;
    dataHex?: string;
  };
  port?: string;
  duration?: number;
  error?: string;
  context?: Record<string, any>;
}

class XIMViewer {
  private logFile: string;
  private lastMessages: number = 100;
  private live: boolean = false;
  private doorFilter: string | null = null;
  private nodeFilter: number | null = null;
  private errorsOnly: boolean = false;
  private showStats: boolean = false;

  private messageCount = 0;
  private errorCount = 0;
  private doorCounts = new Map<string, number>();
  private typeCounts = new Map<string, number>();

  constructor() {
    this.parseArgs();
    this.logFile = process.env.XIM_LOG_FILE || 'logs/xim-debug.json';
  }

  private parseArgs() {
    const args = process.argv.slice(2);

    for (let i = 0; i < args.length; i++) {
      switch (args[i]) {
        case '--live':
        case '-l':
          this.live = true;
          break;
        case '--door':
          this.doorFilter = args[++i];
          break;
        case '--node':
          this.nodeFilter = parseInt(args[++i], 10);
          break;
        case '--errors':
          this.errorsOnly = true;
          break;
        case '--stats':
          this.showStats = true;
          break;
        case '--last':
          this.lastMessages = parseInt(args[++i], 10);
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
XIM Log Viewer - Real-time XIM protocol message viewer

Usage:
  npx tsx dev/scripts/xim-viewer.ts [options]

Options:
  --live, -l          Tail log in real-time
  --door NAME         Filter by door name
  --node N            Filter by node number
  --errors            Show only errors/warnings
  --stats             Show statistics summary
  --last N            Show last N messages (default: 100)
  --file PATH         Custom log file path
  --help              Show this help

Examples:
  npx tsx dev/scripts/xim-viewer.ts              # View last 100 messages
  npx tsx dev/scripts/xim-viewer.ts --live       # Live tail
  npx tsx dev/scripts/xim-viewer.ts --door WHO   # Filter by door
  npx tsx dev/scripts/xim-viewer.ts --errors     # Errors only

Environment:
  XIM_LOG_FILE        Default log file path (default: logs/xim-debug.json)
`);
  }

  async run() {
    if (!fs.existsSync(this.logFile)) {
      await this.handleMissingLogFile();
      return;
    }

    this.printHeader();

    if (this.live) {
      await this.tailLive();
    } else {
      await this.viewHistory();
    }

    if (this.showStats) {
      this.printStats();
    }
  }

  private async handleMissingLogFile() {
    console.log('\x1b[1;33m╔═══════════════════════════════════════════════════════════════╗\x1b[0m');
    console.log('\x1b[1;33m║              XIM Debug Logging Not Enabled                    ║\x1b[0m');
    console.log('\x1b[1;33m╚═══════════════════════════════════════════════════════════════╝\x1b[0m\n');

    console.log(`\x1b[0;37mLog file not found: ${this.logFile}\x1b[0m\n`);

    // Check if backend is running
    const backendRunning = await this.checkBackendRunning();

    if (backendRunning) {
      console.log('\x1b[1;31m[!]\x1b[0m Backend is running but XIM logging is NOT enabled.\n');
      console.log('\x1b[1;37mTo enable XIM logging:\x1b[0m\n');
      console.log('  1. Stop the backend:');
      console.log('     \x1b[0;36m./dev/scripts/kill-servers.sh\x1b[0m\n');
      console.log('  2. Start with XIM logging enabled:');
      console.log('     \x1b[0;36mXIM_DEBUG_JSON=1 ./dev/scripts/start-servers.sh\x1b[0m\n');
      console.log('  3. Run this command again:');
      console.log('     \x1b[0;36mnpm run xim:live\x1b[0m\n');
    } else {
      console.log('\x1b[1;33m[!]\x1b[0m Backend is not running.\n');
      console.log('\x1b[1;37mTo start with XIM logging:\x1b[0m\n');
      console.log('  \x1b[0;36mXIM_DEBUG_JSON=1 ./dev/scripts/start-servers.sh\x1b[0m\n');
      console.log('Then run this command again:\n');
      console.log('  \x1b[0;36mnpm run xim:live\x1b[0m\n');
    }

    console.log('\x1b[0;37mAlternatively, add to your shell profile:\x1b[0m');
    console.log('  \x1b[0;36mexport XIM_DEBUG_JSON=1\x1b[0m\n');

    process.exit(1);
  }

  private async checkBackendRunning(): Promise<boolean> {
    try {
      const { exec } = require('child_process');
      return new Promise((resolve) => {
        exec('lsof -ti:3001', (error: any, stdout: string) => {
          resolve(stdout.trim().length > 0);
        });
      });
    } catch (err) {
      return false;
    }
  }

  private printHeader() {
    const filters: string[] = [];
    if (this.doorFilter) filters.push(`Door: ${this.doorFilter}`);
    if (this.nodeFilter !== null) filters.push(`Node: ${this.nodeFilter}`);
    if (this.errorsOnly) filters.push('Errors Only');

    console.log('\x1b[1;36m╔═══════════════════════════════════════════════════════════════════════════════╗\x1b[0m');
    console.log('\x1b[1;36m║                           XIM Protocol Message Viewer                          ║\x1b[0m');
    console.log('\x1b[1;36m╚═══════════════════════════════════════════════════════════════════════════════╝\x1b[0m');
    if (filters.length > 0) {
      console.log(`\x1b[0;33mFilters: ${filters.join(', ')}\x1b[0m`);
    }
    console.log(`\x1b[0;37mLog File: ${this.logFile}\x1b[0m`);
    console.log('');
  }

  private async viewHistory() {
    const lines: string[] = [];
    const fileStream = fs.createReadStream(this.logFile);
    const rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity,
    });

    for await (const line of rl) {
      if (line.trim()) {
        lines.push(line);
      }
    }

    // Show last N messages
    const start = Math.max(0, lines.length - this.lastMessages);
    for (let i = start; i < lines.length; i++) {
      this.processLine(lines[i]);
    }
  }

  private async tailLive() {
    console.log('\x1b[0;36m[LIVE MODE] Watching for new messages... (Ctrl+C to stop)\x1b[0m\n');

    // Show last few messages first
    await this.viewHistory();

    // Now tail new messages
    let lastSize = fs.statSync(this.logFile).size;

    setInterval(() => {
      const currentSize = fs.statSync(this.logFile).size;
      if (currentSize > lastSize) {
        const stream = fs.createReadStream(this.logFile, {
          start: lastSize,
          end: currentSize,
        });

        const rl = readline.createInterface({
          input: stream,
          crlfDelay: Infinity,
        });

        rl.on('line', (line) => {
          if (line.trim()) {
            this.processLine(line);
          }
        });

        lastSize = currentSize;
      }
    }, 100); // Check every 100ms
  }

  private processLine(line: string) {
    try {
      const entry: XIMLogEntry = JSON.parse(line);

      // Apply filters
      if (this.doorFilter && entry.door !== this.doorFilter) return;
      if (this.nodeFilter !== null && entry.node !== this.nodeFilter) return;
      if (this.errorsOnly && entry.level !== 'error' && entry.level !== 'warn') return;

      // Update stats
      this.messageCount++;
      if (entry.level === 'error') this.errorCount++;
      this.doorCounts.set(entry.door, (this.doorCounts.get(entry.door) || 0) + 1);
      this.typeCounts.set(entry.message.type, (this.typeCounts.get(entry.message.type) || 0) + 1);

      // Display message
      this.displayMessage(entry);
    } catch (err) {
      // Ignore invalid JSON lines
    }
  }

  private displayMessage(entry: XIMLogEntry) {
    const time = this.formatTime(entry.timestamp);
    const arrow = entry.direction === 'send' ? '→' : '←';
    const color = this.getColor(entry.level, entry.direction);
    const reset = '\x1b[0m';

    let output = `${color}[${time}] ${arrow} `;
    output += `${entry.message.type.padEnd(14)} `;
    output += `| ${entry.door.padEnd(12)} `;
    output += `| N${entry.node}`;

    if (entry.message.param !== undefined) {
      output += ` | p=${entry.message.param}`;
    }

    if (entry.message.dataLen !== undefined) {
      output += ` | len=${entry.message.dataLen}`;
    }

    if (entry.message.dataText) {
      const preview = entry.message.dataText.replace(/\n/g, '\\n').substring(0, 40);
      output += ` | "${preview}${entry.message.dataText.length > 40 ? '...' : ''}"`;
    }

    if (entry.error) {
      output += ` | \x1b[1;31mERROR: ${entry.error}\x1b[0m`;
    }

    if (entry.context?.message) {
      output += ` | ${entry.context.message}`;
    }

    if (entry.duration) {
      output += ` | ${entry.duration}ms`;
    }

    output += reset;
    console.log(output);
  }

  private getColor(level: string, direction: string): string {
    if (level === 'error') return '\x1b[1;31m'; // Bright red
    if (level === 'warn') return '\x1b[1;33m'; // Bright yellow
    if (direction === 'send') return '\x1b[0;36m'; // Cyan
    return '\x1b[0;32m'; // Green
  }

  private formatTime(timestamp: string): string {
    const date = new Date(timestamp);
    const time = date.toTimeString().split(' ')[0];
    const ms = date.getMilliseconds().toString().padStart(3, '0');
    return `${time}.${ms}`;
  }

  private printStats() {
    console.log('\n\x1b[1;36m╔═══════════════════════════════════════════════════════════════╗\x1b[0m');
    console.log('\x1b[1;36m║                      Statistics Summary                       ║\x1b[0m');
    console.log('\x1b[1;36m╚═══════════════════════════════════════════════════════════════╝\x1b[0m');
    console.log(`  Total Messages: \x1b[1;37m${this.messageCount}\x1b[0m`);
    console.log(`  Errors: \x1b[1;31m${this.errorCount}\x1b[0m`);
    console.log('');

    if (this.doorCounts.size > 0) {
      console.log('  \x1b[1;37mMessages by Door:\x1b[0m');
      const sorted = Array.from(this.doorCounts.entries()).sort((a, b) => b[1] - a[1]);
      for (const [door, count] of sorted) {
        console.log(`    ${door.padEnd(15)} ${count}`);
      }
      console.log('');
    }

    if (this.typeCounts.size > 0) {
      console.log('  \x1b[1;37mMessages by Type:\x1b[0m');
      const sorted = Array.from(this.typeCounts.entries()).sort((a, b) => b[1] - a[1]);
      for (const [type, count] of sorted.slice(0, 10)) {
        console.log(`    ${type.padEnd(15)} ${count}`);
      }
      console.log('');
    }
  }
}

// Run viewer
const viewer = new XIMViewer();
viewer.run().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
