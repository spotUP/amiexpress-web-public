#!/usr/bin/env npx tsx
/**
 * XIM Message Decoder - Decode raw XIM protocol messages
 *
 * Decodes XIM messages from hex, binary, or base64 format.
 * Useful for understanding door communication and debugging protocol issues.
 *
 * Usage:
 *   npx tsx dev/scripts/xim-decode.ts <hex_string>
 *   npx tsx dev/scripts/xim-decode.ts --file <path>
 *
 * Examples:
 *   npm run xim:decode "00000001 00000000 00000017 48656c6c6f"
 *   npm run xim:decode --type JH_INIT --param 123
 *   npm run xim:decode --help
 */

// XIM Message Type codes
const XIM_TYPES: Record<number, string> = {
  0: 'JH_INIT',
  1: 'JH_SM',
  2: 'JH_STAT',
  3: 'JH_TERMINATE',
  4: 'JH_HK',
  5: 'JH_GNS',
  6: 'JH_PROMPT',
  7: 'JH_MORE',
  8: 'JH_REQUEST',
  9: 'JH_IGNORE',
  10: 'JH_SMPTR',
};

interface DecodedMessage {
  type: string;
  typeCode: number;
  param: number;
  dataLen: number;
  data?: Buffer;
  dataText?: string;
  dataHex?: string;
  valid: boolean;
  errors: string[];
}

class XIMDecoder {
  private input: string = '';
  private fromFile: boolean = false;

  constructor() {
    this.parseArgs();
  }

  private parseArgs() {
    const args = process.argv.slice(2);

    if (args.length === 0 || args.includes('--help')) {
      this.printHelp();
      process.exit(0);
    }

    if (args[0] === '--file') {
      this.fromFile = true;
      this.input = args[1];
    } else if (args[0] === '--type') {
      // Create message from type
      const type = args[1];
      const param = args[3] ? parseInt(args[3], 10) : 0;
      const data = args[5] || '';
      this.encodeMessage(type, param, data);
      return;
    } else {
      this.input = args.join(' ');
    }
  }

  private printHelp() {
    console.log(`
XIM Message Decoder - Decode raw XIM protocol messages

Usage:
  npx tsx dev/scripts/xim-decode.ts <hex_string>
  npx tsx dev/scripts/xim-decode.ts --file <path>
  npx tsx dev/scripts/xim-decode.ts --type <TYPE> --param <N> --data <text>

Options:
  --file PATH         Read hex from file
  --type TYPE         Create message (JH_INIT, JH_SM, JH_HK, etc.)
  --param N           Message parameter
  --data TEXT         Message data/text
  --help              Show this help

Examples:
  # Decode hex string
  npx tsx dev/scripts/xim-decode.ts "00000001 00000000 00000017 48656c6c6f"

  # Create JH_INIT message
  npx tsx dev/scripts/xim-decode.ts --type JH_INIT --param 123

  # Create JH_SM message with text
  npx tsx dev/scripts/xim-decode.ts --type JH_SM --data "Hello from door"

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
`);
  }

  async run() {
    if (!this.input) {
      console.error('[ERROR] No input provided');
      process.exit(1);
    }

    let hexString: string;

    if (this.fromFile) {
      const fs = require('fs');
      hexString = fs.readFileSync(this.input, 'utf-8');
    } else {
      hexString = this.input;
    }

    const message = this.decode(hexString);
    this.display(message);
  }

  private decode(hexString: string): DecodedMessage {
    // Remove spaces and newlines
    const cleaned = hexString.replace(/[\s\n\r]/g, '');

    // Convert hex to buffer
    const buffer = Buffer.from(cleaned, 'hex');

    if (buffer.length < 12) {
      return {
        type: 'INVALID',
        typeCode: -1,
        param: 0,
        dataLen: 0,
        valid: false,
        errors: ['Message too short (min 12 bytes)'],
      };
    }

    // Read XIM message structure:
    // [0-3]   Type (4 bytes, big-endian)
    // [4-7]   Param (4 bytes, big-endian)
    // [8-11]  DataLen (4 bytes, big-endian)
    // [12+]   Data (optional)

    const typeCode = buffer.readUInt32BE(0);
    const param = buffer.readUInt32BE(4);
    const dataLen = buffer.readUInt32BE(8);

    const type = XIM_TYPES[typeCode] || `UNKNOWN_${typeCode}`;
    const errors: string[] = [];

    // Validate
    if (dataLen > 0 && buffer.length < 12 + dataLen) {
      errors.push(`Data length mismatch: expected ${dataLen}, got ${buffer.length - 12}`);
    }

    // Extract data
    let data: Buffer | undefined;
    let dataText: string | undefined;
    let dataHex: string | undefined;

    if (dataLen > 0) {
      data = buffer.slice(12, 12 + dataLen);
      dataHex = data.toString('hex');
      dataText = data.toString('utf-8');
    }

    return {
      type,
      typeCode,
      param,
      dataLen,
      data,
      dataText,
      dataHex,
      valid: errors.length === 0,
      errors,
    };
  }

  private display(msg: DecodedMessage) {
    console.log('\n\x1b[1;36m╔═══════════════════════════════════════════════════════════════╗\x1b[0m');
    console.log('\x1b[1;36m║                    XIM Message Decoder                         ║\x1b[0m');
    console.log('\x1b[1;36m╚═══════════════════════════════════════════════════════════════╝\x1b[0m\n');

    const validIcon = msg.valid ? '\x1b[1;32m✓\x1b[0m' : '\x1b[1;31m✗\x1b[0m';
    console.log(`  Valid: ${validIcon}`);
    console.log(`  Type: \x1b[1;37m${msg.type}\x1b[0m (0x${msg.typeCode.toString(16).padStart(8, '0')})`);
    console.log(`  Param: \x1b[1;37m${msg.param}\x1b[0m (0x${msg.param.toString(16).padStart(8, '0')})`);
    console.log(`  DataLen: \x1b[1;37m${msg.dataLen}\x1b[0m bytes`);

    if (msg.dataLen > 0) {
      console.log('');
      console.log(`  Data (hex): \x1b[0;37m${msg.dataHex}\x1b[0m`);
      console.log(`  Data (text): \x1b[1;37m"${msg.dataText}"\x1b[0m`);
    }

    if (msg.errors.length > 0) {
      console.log('');
      console.log('  \x1b[1;31mErrors:\x1b[0m');
      for (const err of msg.errors) {
        console.log(`    - ${err}`);
      }
    }

    console.log('');
  }

  private encodeMessage(typeStr: string, param: number, dataStr: string) {
    const typeCode = Object.entries(XIM_TYPES).find(([_, name]) => name === typeStr)?.[0];
    if (!typeCode) {
      console.error(`[ERROR] Unknown message type: ${typeStr}`);
      console.error('Valid types:', Object.values(XIM_TYPES).join(', '));
      process.exit(1);
    }

    const data = Buffer.from(dataStr, 'utf-8');
    const dataLen = data.length;

    const buffer = Buffer.alloc(12 + dataLen);
    buffer.writeUInt32BE(parseInt(typeCode), 0);
    buffer.writeUInt32BE(param, 4);
    buffer.writeUInt32BE(dataLen, 8);
    if (dataLen > 0) {
      data.copy(buffer, 12);
    }

    console.log('\n\x1b[1;36m╔═══════════════════════════════════════════════════════════════╗\x1b[0m');
    console.log('\x1b[1;36m║                    XIM Message Encoder                         ║\x1b[0m');
    console.log('\x1b[1;36m╚═══════════════════════════════════════════════════════════════╝\x1b[0m\n');

    console.log(`  Type: \x1b[1;37m${typeStr}\x1b[0m (${typeCode})`);
    console.log(`  Param: \x1b[1;37m${param}\x1b[0m`);
    console.log(`  DataLen: \x1b[1;37m${dataLen}\x1b[0m bytes`);
    console.log('');
    console.log(`  Hex: \x1b[0;37m${buffer.toString('hex').match(/.{1,8}/g)?.join(' ')}\x1b[0m`);
    console.log('');
  }
}

// Run decoder
const decoder = new XIMDecoder();
decoder.run().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
