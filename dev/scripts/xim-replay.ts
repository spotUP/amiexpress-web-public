#!/usr/bin/env npx tsx
/**
 * XIM Message Replay Tool - Send test XIM messages to doors
 *
 * Useful for testing door responses without manual interaction.
 *
 * Usage:
 *   npx tsx dev/scripts/xim-replay.ts [options]
 *
 * Options:
 *   --type TYPE       Message type (JH_INIT, JH_HK, etc.)
 *   --param N         Message parameter
 *   --data TEXT       Message data/text
 *   --door NAME       Door name
 *   --node N          Node number (default: 1)
 *   --sequence FILE   Replay sequence from JSON file
 *   --interactive     Interactive mode
 *
 * Examples:
 *   # Send JH_INIT to WHO door
 *   npm run xim:replay -- --type JH_INIT --param 1 --door WHO
 *
 *   # Send keystroke
 *   npm run xim:replay -- --type JH_HK --param 65 --data "A" --door WHO
 *
 *   # Replay sequence from file
 *   npm run xim:replay -- --sequence test-sequence.json
 *
 *   # Interactive mode
 *   npm run xim:replay -- --interactive
 */

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
  delay?: number; // milliseconds before sending
}

interface ReplaySequence {
  door: string;
  node: number;
  description?: string;
  messages: ReplayMessage[];
}

class XIMReplay {
  private messageType: string | null = null;
  private param: number = 0;
  private data: string = '';
  private doorName: string | null = null;
  private nodeId: number = 1;
  private sequenceFile: string | null = null;
  private interactive: boolean = false;

  constructor() {
    this.parseArgs();
  }

  private parseArgs() {
    const args = process.argv.slice(2);

    for (let i = 0; i < args.length; i++) {
      switch (args[i]) {
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
XIM Message Replay Tool - Send test XIM messages to doors

Usage:
  npx tsx dev/scripts/xim-replay.ts [options]

Options:
  --type TYPE       Message type (JH_INIT, JH_HK, etc.)
  --param N         Message parameter
  --data TEXT       Message data/text
  --door NAME       Door name
  --node N          Node number (default: 1)
  --sequence FILE   Replay sequence from JSON file
  --interactive     Interactive mode
  --help            Show this help

Message Types:
  JH_INIT (0)       - Initialize door
  JH_SM (1)         - Send message (text to user)
  JH_STAT (2)       - Status request
  JH_TERMINATE (3)  - Terminate door
  JH_HK (4)         - Hot key (keystroke from user)
  JH_GNS (5)        - Get next string
  JH_PROMPT (6)     - Prompt user
  JH_MORE (7)       - More prompt
  JH_REQUEST (8)    - Request data
  JH_IGNORE (9)     - Ignore input
  JH_SMPTR (10)     - Send message pointer

Examples:
  # Send JH_INIT to WHO door
  npx tsx dev/scripts/xim-replay.ts --type JH_INIT --param 1 --door WHO

  # Send keystroke 'A'
  npx tsx dev/scripts/xim-replay.ts --type JH_HK --param 65 --data "A" --door WHO

  # Replay sequence from file
  npx tsx dev/scripts/xim-replay.ts --sequence test-sequence.json

  # Interactive mode
  npx tsx dev/scripts/xim-replay.ts --interactive

Sequence File Format (JSON):
  {
    "door": "WHO",
    "node": 1,
    "description": "Test WHO door startup",
    "messages": [
      { "type": "JH_INIT", "param": 1, "delay": 0 },
      { "type": "JH_HK", "param": 13, "data": "\\r", "delay": 1000 }
    ]
  }
`);
  }

  async run() {
    this.printHeader();

    if (this.interactive) {
      await this.runInteractive();
    } else if (this.sequenceFile) {
      await this.runSequence();
    } else if (this.messageType && this.doorName) {
      await this.sendSingleMessage();
    } else {
      console.error('[ERROR] Missing required arguments.');
      console.error('Use --help for usage information.');
      process.exit(1);
    }
  }

  private printHeader() {
    console.log('\x1b[1;36m╔═══════════════════════════════════════════════════════════════╗\x1b[0m');
    console.log('\x1b[1;36m║                    XIM Message Replay Tool                     ║\x1b[0m');
    console.log('\x1b[1;36m╚═══════════════════════════════════════════════════════════════╝\x1b[0m\n');
  }

  private async sendSingleMessage() {
    if (!this.messageType || !this.doorName) {
      console.error('[ERROR] --type and --door are required');
      process.exit(1);
    }

    const typeCode = XIM_TYPES[this.messageType];
    if (typeCode === undefined) {
      console.error(`[ERROR] Invalid message type: ${this.messageType}`);
      console.error('Valid types:', Object.keys(XIM_TYPES).join(', '));
      process.exit(1);
    }

    console.log(`\x1b[1;37mSending Message:\x1b[0m`);
    console.log(`  Door: ${this.doorName}`);
    console.log(`  Node: ${this.nodeId}`);
    console.log(`  Type: ${this.messageType} (${typeCode})`);
    console.log(`  Param: ${this.param}`);
    if (this.data) {
      console.log(`  Data: "${this.data}"`);
    }
    console.log('');

    const buffer = this.createMessage(typeCode, this.param, this.data);
    console.log(`  Hex: \x1b[0;37m${buffer.toString('hex').match(/.{1,8}/g)?.join(' ')}\x1b[0m`);
    console.log('');

    // NOTE: This is a mock implementation. In a real implementation, you would:
    // 1. Connect to the backend via WebSocket/HTTP
    // 2. Send the message to the appropriate door session
    // 3. Wait for and display the response

    console.log('\x1b[1;33m[NOTE] This is a demonstration tool.\x1b[0m');
    console.log('\x1b[1;33mActual message sending requires backend API integration.\x1b[0m');
    console.log('');
    console.log('\x1b[0;32mMessage prepared successfully.\x1b[0m');
    console.log('');
  }

  private async runSequence() {
    if (!this.sequenceFile) return;

    const fs = require('fs');
    if (!fs.existsSync(this.sequenceFile)) {
      console.error(`[ERROR] Sequence file not found: ${this.sequenceFile}`);
      process.exit(1);
    }

    const sequence: ReplaySequence = JSON.parse(fs.readFileSync(this.sequenceFile, 'utf-8'));

    console.log(`\x1b[1;37mReplaying Sequence:\x1b[0m`);
    console.log(`  File: ${this.sequenceFile}`);
    console.log(`  Door: ${sequence.door}`);
    console.log(`  Node: ${sequence.node}`);
    if (sequence.description) {
      console.log(`  Description: ${sequence.description}`);
    }
    console.log(`  Messages: ${sequence.messages.length}`);
    console.log('');

    for (let i = 0; i < sequence.messages.length; i++) {
      const msg = sequence.messages[i];

      // Wait for delay
      if (msg.delay && msg.delay > 0) {
        console.log(`  \x1b[0;37m[Waiting ${msg.delay}ms...]\x1b[0m`);
        await this.sleep(msg.delay);
      }

      const typeCode = XIM_TYPES[msg.type];
      if (typeCode === undefined) {
        console.error(`  [ERROR] Invalid message type: ${msg.type}`);
        continue;
      }

      console.log(`  \x1b[1;37m[${i + 1}/${sequence.messages.length}]\x1b[0m → ${msg.type}`);
      if (msg.param !== undefined) {
        console.log(`    Param: ${msg.param}`);
      }
      if (msg.data) {
        console.log(`    Data: "${msg.data}"`);
      }

      const buffer = this.createMessage(typeCode, msg.param || 0, msg.data || '');
      console.log(`    Hex: \x1b[0;37m${buffer.toString('hex').match(/.{1,8}/g)?.join(' ')}\x1b[0m`);
      console.log('');
    }

    console.log('\x1b[1;33m[NOTE] This is a demonstration tool.\x1b[0m');
    console.log('\x1b[1;33mActual message sending requires backend API integration.\x1b[0m');
    console.log('');
    console.log('\x1b[0;32mSequence replay prepared successfully.\x1b[0m');
    console.log('');
  }

  private async runInteractive() {
    const readline = require('readline');
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    console.log('\x1b[1;37mInteractive Mode\x1b[0m');
    console.log('Type messages to send. Type "help" for commands or "exit" to quit.\n');

    const prompt = () => {
      rl.question('\x1b[0;36m> \x1b[0m', async (input: string) => {
        const trimmed = input.trim();

        if (trimmed === 'exit' || trimmed === 'quit') {
          rl.close();
          return;
        }

        if (trimmed === 'help') {
          this.printInteractiveHelp();
          prompt();
          return;
        }

        if (trimmed === '') {
          prompt();
          return;
        }

        // Parse command: TYPE [PARAM] [DATA]
        const parts = trimmed.split(' ');
        const type = parts[0].toUpperCase();
        const param = parts.length > 1 ? parseInt(parts[1], 10) : 0;
        const data = parts.length > 2 ? parts.slice(2).join(' ') : '';

        const typeCode = XIM_TYPES[type];
        if (typeCode === undefined) {
          console.log(`\x1b[1;31mUnknown message type: ${type}\x1b[0m`);
          console.log('Valid types:', Object.keys(XIM_TYPES).join(', '));
        } else {
          const buffer = this.createMessage(typeCode, param, data);
          console.log(`\x1b[0;32m✓ ${type} (${typeCode}) param=${param}\x1b[0m`);
          console.log(`  ${buffer.toString('hex').match(/.{1,8}/g)?.join(' ')}`);
        }

        console.log('');
        prompt();
      });
    };

    prompt();
  }

  private printInteractiveHelp() {
    console.log('\n\x1b[1;37mInteractive Commands:\x1b[0m');
    console.log('  TYPE [PARAM] [DATA]  - Send message (e.g., "JH_HK 65 A")');
    console.log('  help                 - Show this help');
    console.log('  exit                 - Exit interactive mode');
    console.log('');
    console.log('\x1b[1;37mMessage Types:\x1b[0m');
    for (const [name, code] of Object.entries(XIM_TYPES)) {
      console.log(`  ${name.padEnd(15)} ${code}`);
    }
    console.log('');
  }

  private createMessage(typeCode: number, param: number, data: string): Buffer {
    const dataBuffer = Buffer.from(data, 'utf-8');
    const dataLen = dataBuffer.length;

    const buffer = Buffer.alloc(12 + dataLen);
    buffer.writeUInt32BE(typeCode, 0);
    buffer.writeUInt32BE(param, 4);
    buffer.writeUInt32BE(dataLen, 8);
    if (dataLen > 0) {
      dataBuffer.copy(buffer, 12);
    }

    return buffer;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Run replay tool
const replay = new XIMReplay();
replay.run().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
