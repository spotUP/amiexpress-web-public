#!/usr/bin/env npx tsx
/**
 * XIM Message Flow Visualizer - Generate visual diagrams of XIM message sequences
 *
 * Creates ASCII art sequence diagrams showing message flow between backend and door.
 *
 * Usage:
 *   npx tsx dev/scripts/xim-flow.ts [options]
 *
 * Options:
 *   --door NAME         Show flow for specific door
 *   --node N           Show flow for specific node
 *   --last N           Show last N messages (default: 50)
 *   --file PATH        Custom log file path
 *   --format FORMAT    Output format: ascii, mermaid (default: ascii)
 *
 * Examples:
 *   npm run xim:flow              # Flow diagram for all doors
 *   npm run xim:flow -- --door WHO  # Flow for WHO door only
 *   npm run xim:flow -- --format mermaid  # Mermaid diagram format
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
    dataText?: string;
  };
}

class XIMFlowVisualizer {
  private logFile: string;
  private doorFilter: string | null = null;
  private nodeFilter: number | null = null;
  private lastMessages: number = 50;
  private format: 'ascii' | 'mermaid' = 'ascii';

  constructor() {
    this.parseArgs();
    this.logFile = process.env.XIM_LOG_FILE || 'logs/xim-debug.json';
  }

  private parseArgs() {
    const args = process.argv.slice(2);

    for (let i = 0; i < args.length; i++) {
      switch (args[i]) {
        case '--door':
          this.doorFilter = args[++i];
          break;
        case '--node':
          this.nodeFilter = parseInt(args[++i], 10);
          break;
        case '--last':
          this.lastMessages = parseInt(args[++i], 10);
          break;
        case '--file':
          this.logFile = args[++i];
          break;
        case '--format':
          const fmt = args[++i];
          if (fmt === 'ascii' || fmt === 'mermaid') {
            this.format = fmt;
          } else {
            console.error(`[ERROR] Invalid format: ${fmt}. Use 'ascii' or 'mermaid'`);
            process.exit(1);
          }
          break;
        case '--help':
          this.printHelp();
          process.exit(0);
      }
    }
  }

  private printHelp() {
    console.log(`
XIM Message Flow Visualizer - Generate visual diagrams of XIM message sequences

Usage:
  npx tsx dev/scripts/xim-flow.ts [options]

Options:
  --door NAME         Show flow for specific door
  --node N            Show flow for specific node
  --last N            Show last N messages (default: 50)
  --file PATH         Custom log file path
  --format FORMAT     Output format: ascii, mermaid (default: ascii)
  --help              Show this help

Examples:
  npx tsx dev/scripts/xim-flow.ts              # Flow diagram for all doors
  npx tsx dev/scripts/xim-flow.ts --door WHO   # Flow for WHO door only
  npx tsx dev/scripts/xim-flow.ts --format mermaid  # Mermaid diagram format

Environment:
  XIM_LOG_FILE        Default log file path (default: logs/xim-debug.json)
`);
  }

  async run() {
    if (!fs.existsSync(this.logFile)) {
      console.error(`[ERROR] Log file not found: ${this.logFile}`);
      console.error('Make sure XIM_DEBUG_JSON=1 is set when running the backend.');
      process.exit(1);
    }

    const entries = await this.loadEntries();

    if (entries.length === 0) {
      console.log('No messages found matching filters.');
      return;
    }

    if (this.format === 'ascii') {
      this.renderAscii(entries);
    } else {
      this.renderMermaid(entries);
    }
  }

  private async loadEntries(): Promise<XIMLogEntry[]> {
    const entries: XIMLogEntry[] = [];
    const fileStream = fs.createReadStream(this.logFile);
    const rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity,
    });

    for await (const line of rl) {
      if (line.trim()) {
        try {
          const entry: XIMLogEntry = JSON.parse(line);

          // Skip system messages
          if (entry.door === 'SYSTEM') continue;

          // Apply filters
          if (this.doorFilter && entry.door !== this.doorFilter) continue;
          if (this.nodeFilter !== null && entry.node !== this.nodeFilter) continue;

          entries.push(entry);
        } catch (err) {
          // Ignore invalid JSON
        }
      }
    }

    // Return last N messages
    return entries.slice(-this.lastMessages);
  }

  private renderAscii(entries: XIMLogEntry[]) {
    console.log('\x1b[1;36m╔═══════════════════════════════════════════════════════════════════════════════╗\x1b[0m');
    console.log('\x1b[1;36m║                          XIM Message Flow Diagram                              ║\x1b[0m');
    console.log('\x1b[1;36m╚═══════════════════════════════════════════════════════════════════════════════╝\x1b[0m');

    if (this.doorFilter) {
      console.log(`\x1b[0;37mDoor: ${this.doorFilter}\x1b[0m`);
    }
    if (this.nodeFilter !== null) {
      console.log(`\x1b[0;37mNode: ${this.nodeFilter}\x1b[0m`);
    }
    console.log(`\x1b[0;37mShowing: ${entries.length} messages\x1b[0m`);
    console.log('');

    // Draw legend
    console.log('  \x1b[1;37mBACKEND\x1b[0m                                  \x1b[1;37mDOOR\x1b[0m');
    console.log('  ───────────────────────────────────────────────────────');
    console.log('');

    for (const entry of entries) {
      this.renderAsciiMessage(entry);
    }

    console.log('  ───────────────────────────────────────────────────────');
    console.log('');
  }

  private renderAsciiMessage(entry: XIMLogEntry) {
    const time = this.formatTime(entry.timestamp);
    const msgType = entry.message.type;
    const param = entry.message.param !== undefined ? ` (${entry.message.param})` : '';
    const data = entry.message.dataText
      ? ` "${entry.message.dataText.substring(0, 20)}${entry.message.dataText.length > 20 ? '...' : ''}"`
      : '';

    const color = this.getMessageColor(entry);
    const reset = '\x1b[0m';

    if (entry.direction === 'send') {
      // Backend → Door
      console.log(`  ${time} ${color}${msgType}${param}${data}${reset}`);
      console.log(`           ${color}────────────────────────────→${reset}`);
    } else {
      // Door → Backend
      console.log(`  ${time}                     ${color}${msgType}${param}${data}${reset}`);
      console.log(`           ${color}←────────────────────────────${reset}`);
    }
    console.log('');
  }

  private renderMermaid(entries: XIMLogEntry[]) {
    console.log('```mermaid');
    console.log('sequenceDiagram');
    console.log('    participant Backend');
    console.log('    participant Door');
    console.log('');

    for (const entry of entries) {
      const msgType = entry.message.type;
      const param = entry.message.param !== undefined ? ` (${entry.message.param})` : '';
      const data = entry.message.dataText
        ? `: ${entry.message.dataText.substring(0, 30)}`
        : '';

      if (entry.direction === 'send') {
        console.log(`    Backend->>Door: ${msgType}${param}${data}`);
      } else {
        console.log(`    Door->>Backend: ${msgType}${param}${data}`);
      }

      // Add note for errors
      if (entry.level === 'error') {
        console.log(`    Note over Door: ERROR`);
      } else if (entry.level === 'warn') {
        console.log(`    Note over Door: WARNING`);
      }
    }

    console.log('```');
    console.log('');
    console.log('\x1b[0;37mCopy the above Mermaid diagram to:\x1b[0m');
    console.log('\x1b[0;36mhttps://mermaid.live/\x1b[0m');
    console.log('');
  }

  private getMessageColor(entry: XIMLogEntry): string {
    if (entry.level === 'error') return '\x1b[1;31m';
    if (entry.level === 'warn') return '\x1b[1;33m';
    if (entry.direction === 'send') return '\x1b[0;36m';
    return '\x1b[0;32m';
  }

  private formatTime(timestamp: string): string {
    const date = new Date(timestamp);
    const time = date.toTimeString().split(' ')[0];
    const ms = date.getMilliseconds().toString().padStart(3, '0');
    return `${time}.${ms}`;
  }
}

// Run visualizer
const visualizer = new XIMFlowVisualizer();
visualizer.run().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
