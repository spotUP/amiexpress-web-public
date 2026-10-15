#!/usr/bin/env npx tsx
/**
 * XIM Message Replay Tool - REAL Backend Integration
 *
 * Sends actual XIM messages to running door sessions via Socket.IO.
 * Requires backend running in development mode with XIM injection enabled.
 *
 * Usage:
 *   npx tsx dev/scripts/xim-replay-real.ts [options]
 *
 * Examples:
 *   # Send keystroke to WHO door
 *   npm run xim:replay:real -- --type JH_HK --param 65 --data "A" --door WHO
 *
 *   # Replay sequence from file
 *   npm run xim:replay:real -- --sequence test-who.json
 *
 *   # List active door sessions
 *   npm run xim:replay:real -- --list
 */

import { io, Socket } from 'socket.io-client';
import * as fs from 'fs';
import * as readline from 'readline';

const XIM_TYPES: Record<string, number> = {
  'JH_INIT': 0,
  'JH_SM': 1,
  'JH_STAT': 2,
  'JH_TERMINATE': 3,
  'JH_HK': 4,
  'JH_GNS': 5,
  'JH_PROMPT': 6,
  'JH_MORE': 7,
  'JH_REQUEST': 8,
  'JH_IGNORE': 9,
  'JH_SMPTR': 10,
};

interface ReplayMessage {
  type: string;
  param?: number;
  data?: string;
  delay?: number;
}

interface ReplaySequence {
  door: string;
  node?: number;
  description?: string;
  messages: ReplayMessage[];
}

interface InjectionResponse {
  success: boolean;
  error?: string;
  messagesSent?: number;
  doorState?: string;
}

class XIMReplayReal {
  private socket: Socket | null = null;
  private backendUrl: string = 'http://localhost:3001';
  private messageType: string | null = null;
  private param: number = 0;
  private data: string = '';
  private doorName: string | null = null;
  private nodeId?: number;
  private sequenceFile: string | null = null;
  private listSessions: boolean = false;
  private interactive: boolean = false;

  constructor() {
    this.parseArgs();
  }

  private parseArgs() {
    const args = process.argv.slice(2);

    for (let i = 0; i < args.length; i++) {
      switch (args[i]) {
        case '--url':
          this.backendUrl = args[++i];
          break;
        case '--type':
          this.messageType = args[++i];
          break;
        case '--param':
          this.param = parseInt(args[++i], 10);
          break;
        case '--data':
          this.data = args[++i];
          break;
        case '--door':
          this.doorName = args[++i];
          break;
        case '--node':
          this.nodeId = parseInt(args[++i], 10);
          break;
        case '--sequence':
          this.sequenceFile = args[++i];
          break;
        case '--list':
          this.listSessions = true;
          break;
        case '--interactive':
          this.interactive = true;
          break;
        case '--help':
          this.printHelp();
          process.exit(0);
      }
    }
  }

  private printHelp() {
    console.log(`
XIM Message Replay Tool - REAL Backend Integration

Usage:
  npx tsx dev/scripts/xim-replay-real.ts [options]

Options:
  --url URL         Backend URL (default: http://localhost:3001)
  --type TYPE       Message type (JH_INIT, JH_HK, etc.)
  --param N         Message parameter
  --data TEXT       Message data/text
  --door NAME       Door name (required)
  --node N          Node number (optional, auto-detects)
  --sequence FILE   Replay sequence from JSON file
  --list            List active door sessions
  --interactive     Interactive mode
  --help            Show this help

Message Types:
  ${Object.keys(XIM_TYPES).map(t => `${t} (${XIM_TYPES[t]})`).join('\n  ')}

Examples:
  # List active doors
  npm run xim:replay:real -- --list

  # Send keystroke 'Q' to quit WHO door
  npm run xim:replay:real -- --type JH_HK --param 81 --data "Q" --door WHO

  # Replay sequence from file
  npm run xim:replay:real -- --sequence test-who.json

  # Interactive mode
  npm run xim:replay:real -- --interactive

Sequence File Format (JSON):
{
  "door": "WHO",
  "description": "Test WHO door startup and quit",
  "messages": [
    { "type": "JH_HK", "param": 13, "data": "\\r", "delay": 0 },
    { "type": "JH_HK", "param": 81, "data": "Q", "delay": 1000 }
  ]
}

Requirements:
  - Backend must be running (./dev/scripts/start-servers.sh)
  - NODE_ENV=development (XIM injection only enabled in dev mode)
  - Door must be actively running on a node
`);
  }

  async run() {
    try {
      console.log('\x1b[1;36m╔═══════════════════════════════════════════════════════════════╗\x1b[0m');
      console.log('\x1b[1;36m║            XIM Message Replay - Real Backend                  ║\x1b[0m');
      console.log('\x1b[1;36m╚═══════════════════════════════════════════════════════════════╝\x1b[0m\n');

      // Connect to backend
      await this.connect();

      if (this.listSessions) {
        await this.listActiveSessions();
      } else if (this.sequenceFile) {
        await this.replaySequence();
      } else if (this.interactive) {
        await this.interactiveMode();
      } else if (this.messageType && this.doorName) {
        await this.sendSingleMessage();
      } else {
        console.error('Error: Must specify --list, --sequence, --interactive, or --type + --door');
        console.error('Run with --help for usage');
        process.exit(1);
      }

      this.disconnect();
    } catch (err: any) {
      console.error('\x1b[1;31m[ERROR]\x1b[0m', err.message);
      this.disconnect();
      process.exit(1);
    }
  }

  private async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      console.log(`  Connecting to backend: ${this.backendUrl}...`);

      this.socket = io(this.backendUrl, {
        transports: ['websocket'],
        reconnection: false,
      });

      this.socket.on('connect', () => {
        console.log('  \x1b[0;32m✓ Connected to backend\x1b[0m\n');
        resolve();
      });

      this.socket.on('connect_error', (err) => {
        reject(new Error(`Failed to connect to backend: ${err.message}`));
      });

      // Timeout after 5 seconds
      setTimeout(() => {
        if (!this.socket?.connected) {
          reject(new Error('Connection timeout'));
        }
      }, 5000);
    });
  }

  private disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      console.log('\n  \x1b[0;37mDisconnected from backend\x1b[0m\n');
    }
  }

  private async listActiveSessions(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.socket) {
        reject(new Error('Not connected'));
        return;
      }

      console.log('  \x1b[1;37mActive Door Sessions:\x1b[0m\n');

      this.socket.emit('xim:sessions', (response: any) => {
        if (response.error) {
          reject(new Error(response.error));
          return;
        }

        if (!response.sessions || response.sessions.length === 0) {
          console.log('  No active door sessions found.\n');
          console.log('  \x1b[0;33mStart a door first, then run this command.\x1b[0m\n');
          resolve();
          return;
        }

        response.sessions.forEach((session: any) => {
          const uptime = Math.floor(session.uptime / 1000);
          console.log(`  \x1b[1;37m${session.door}\x1b[0m`);
          console.log(`    Node: ${session.node}`);
          console.log(`    State: ${session.state}`);
          console.log(`    Uptime: ${uptime}s`);
          console.log('');
        });

        console.log(`  \x1b[0;37mTotal: ${response.sessions.length} active session(s)\x1b[0m\n`);
        resolve();
      });
    });
  }

  private async sendSingleMessage(): Promise<void> {
    if (!this.socket || !this.messageType || !this.doorName) {
      throw new Error('Missing required parameters');
    }

    console.log('  \x1b[1;37mSending Message:\x1b[0m');
    console.log(`    Door: ${this.doorName}`);
    console.log(`    Type: ${this.messageType}`);
    console.log(`    Param: ${this.param}`);
    if (this.data) console.log(`    Data: "${this.data}"`);
    if (this.nodeId) console.log(`    Node: ${this.nodeId}`);
    console.log('');

    return new Promise((resolve, reject) => {
      this.socket!.emit('xim:inject', {
        door: this.doorName,
        node: this.nodeId,
        messageType: this.messageType,
        param: this.param,
        data: this.data,
      }, (response: InjectionResponse) => {
        if (!response.success) {
          console.log(`  \x1b[1;31m✗ Failed\x1b[0m: ${response.error}\n`);
          reject(new Error(response.error || 'Unknown error'));
          return;
        }

        console.log(`  \x1b[1;32m✓ Success\x1b[0m`);
        console.log(`    Messages sent: ${response.messagesSent}`);
        if (response.doorState) {
          console.log(`    Door state: ${response.doorState}`);
        }
        console.log('');
        resolve();
      });
    });
  }

  private async replaySequence(): Promise<void> {
    if (!this.sequenceFile) {
      throw new Error('No sequence file specified');
    }

    if (!fs.existsSync(this.sequenceFile)) {
      throw new Error(`Sequence file not found: ${this.sequenceFile}`);
    }

    const content = fs.readFileSync(this.sequenceFile, 'utf-8');
    const sequence: ReplaySequence = JSON.parse(content);

    console.log('  \x1b[1;37mReplaying Sequence:\x1b[0m');
    console.log(`    File: ${this.sequenceFile}`);
    console.log(`    Door: ${sequence.door}`);
    if (sequence.description) console.log(`    Description: ${sequence.description}`);
    console.log(`    Messages: ${sequence.messages.length}`);
    console.log('');

    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < sequence.messages.length; i++) {
      const msg = sequence.messages[i];

      // Apply delay if specified
      if (msg.delay && msg.delay > 0) {
        console.log(`  \x1b[0;37m[${i + 1}/${sequence.messages.length}] Waiting ${msg.delay}ms...\x1b[0m`);
        await this.sleep(msg.delay);
      }

      console.log(`  \x1b[1;37m[${i + 1}/${sequence.messages.length}] ${msg.type}\x1b[0m (param=${msg.param || 0}${msg.data ? `, data="${msg.data}"` : ''})`);

      try {
        await this.injectMessage({
          door: sequence.door,
          node: sequence.node || this.nodeId,
          messageType: msg.type,
          param: msg.param || 0,
          data: msg.data || '',
        });

        console.log(`    \x1b[0;32m✓ Sent\x1b[0m`);
        successCount++;
      } catch (err: any) {
        console.log(`    \x1b[0;31m✗ Failed: ${err.message}\x1b[0m`);
        failCount++;
      }
    }

    console.log('');
    console.log('  \x1b[1;37mSequence Complete:\x1b[0m');
    console.log(`    Success: ${successCount}`);
    console.log(`    Failed: ${failCount}`);
    console.log('');
  }

  private async interactiveMode(): Promise<void> {
    console.log('  \x1b[1;37mInteractive Mode\x1b[0m');
    console.log('  Commands:');
    console.log('    list              - List active sessions');
    console.log('    send <door> <type> <param> [data]  - Send message');
    console.log('    quit              - Exit');
    console.log('');

    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: '> ',
    });

    rl.prompt();

    rl.on('line', async (line) => {
      const parts = line.trim().split(' ');
      const command = parts[0];

      if (command === 'quit' || command === 'exit') {
        rl.close();
        return;
      }

      if (command === 'list') {
        await this.listActiveSessions();
        rl.prompt();
        return;
      }

      if (command === 'send' && parts.length >= 3) {
        const door = parts[1];
        const type = parts[2];
        const param = parseInt(parts[3] || '0', 10);
        const data = parts.slice(4).join(' ');

        try {
          await this.injectMessage({
            door,
            messageType: type,
            param,
            data,
          });
          console.log('  \x1b[0;32m✓ Sent\x1b[0m');
        } catch (err: any) {
          console.log(`  \x1b[0;31m✗ Failed: ${err.message}\x1b[0m`);
        }

        rl.prompt();
        return;
      }

      console.log('  Unknown command. Type "help" for commands.');
      rl.prompt();
    });

    return new Promise((resolve) => {
      rl.on('close', () => {
        resolve();
      });
    });
  }

  private async injectMessage(request: {
    door: string;
    node?: number;
    messageType: string;
    param: number;
    data: string;
  }): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.socket) {
        reject(new Error('Not connected'));
        return;
      }

      this.socket.emit('xim:inject', request, (response: InjectionResponse) => {
        if (!response.success) {
          reject(new Error(response.error || 'Unknown error'));
          return;
        }
        resolve();
      });
    });
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Run
const replay = new XIMReplayReal();
replay.run().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
