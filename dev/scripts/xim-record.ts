#!/usr/bin/env npx tsx
/**
 * XIM Session Recorder
 *
 * Records live XIM sessions with precise timing for later replay.
 * Captures real user interactions for debugging and regression testing.
 *
 * Usage:
 *   npm run xim:record -- --door WHO --output who-session.json
 *   npm run xim:record -- --door WHO --duration 60
 *   npm run xim:record -- --all
 *
 * Recording Format:
 * {
 *   "version": "1.0",
 *   "door": "WHO",
 *   "recorded": "2025-12-29T10:30:00.000Z",
 *   "duration": 45.123,
 *   "messageCount": 25,
 *   "description": "Auto-recorded session",
 *   "messages": [
 *     {
 *       "type": "JH_INIT",
 *       "param": 0,
 *       "data": "",
 *       "delay": 0,
 *       "timestamp": "2025-12-29T10:30:00.000Z",
 *       "comment": "Door initialization"
 *     },
 *     ...
 *   ]
 * }
 *
 * Features:
 * - Real-time recording from xim-debug.json
 * - Precise timing capture (millisecond accuracy)
 * - Automatic file naming with timestamps
 * - Session metadata (door, duration, message count)
 * - Compatible with xim:replay:real for playback
 * - Recording status display
 */

import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';

const XIM_LOG_FILE = path.join(process.cwd(), 'logs', 'xim-debug.json');
const RECORDINGS_DIR = path.join(process.cwd(), 'dev', 'scripts', 'test-sequences', 'recordings');

// XIM message type codes to names
const XIM_TYPE_NAMES: Record<number, string> = {
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

interface XIMLogEntry {
  timestamp: string;
  door: string;
  node: number;
  direction: 'send' | 'receive';
  type: number;
  typeName: string;
  param: number;
  dataLen: number;
  data: string;
}

interface RecordedMessage {
  type: string;
  param: number;
  data: string;
  delay: number;
  timestamp: string;
  comment: string;
}

interface Recording {
  version: string;
  door: string;
  recorded: string;
  duration: number;
  messageCount: number;
  description: string;
  messages: RecordedMessage[];
}

class XIMRecorder {
  private doorFilter: string | null = null;
  private outputFile: string | null = null;
  private duration: number = 0; // 0 = record until stopped
  private recordAll: boolean = false;
  private recording: Recording | null = null;
  private startTime: number = 0;
  private lastMessageTime: number = 0;
  private messageCount: number = 0;
  private recordingActive: boolean = false;
  private fileWatcher: fs.FSWatcher | null = null;
  private lastFileSize: number = 0;

  constructor() {
    this.parseArgs();
  }

  private parseArgs() {
    const args = process.argv.slice(2);

    for (let i = 0; i < args.length; i++) {
      switch (args[i]) {
        case '--door':
          this.doorFilter = args[++i];
          break;
        case '--output':
          this.outputFile = args[++i];
          break;
        case '--duration':
          this.duration = parseInt(args[++i], 10);
          break;
        case '--all':
          this.recordAll = true;
          break;
        case '--help':
          this.printHelp();
          process.exit(0);
      }
    }

    // Validate
    if (!this.doorFilter && !this.recordAll) {
      console.error('Error: Must specify --door NAME or --all');
      console.error('Run with --help for usage');
      process.exit(1);
    }
  }

  private printHelp() {
    console.log(`
XIM Session Recorder

Usage:
  npm run xim:record -- [options]

Options:
  --door NAME       Door name to record (e.g., WHO, RTW)
  --output FILE     Output file path (default: auto-generated)
  --duration N      Record for N seconds (default: until Ctrl+C)
  --all             Record all doors (separate files per door)
  --help            Show this help

Examples:
  # Record WHO door until stopped
  npm run xim:record -- --door WHO

  # Record WHO door for 60 seconds
  npm run xim:record -- --door WHO --duration 60

  # Record to specific file
  npm run xim:record -- --door WHO --output my-recording.json

  # Record all doors
  npm run xim:record -- --all

Output:
  Recordings saved to: dev/scripts/test-sequences/recordings/

  Format: {door}-{timestamp}.json
  Example: WHO-2025-12-29-103045.json

  Compatible with xim:replay:real for playback:
    npm run xim:replay:real -- --sequence recordings/WHO-2025-12-29-103045.json
`);
  }

  async run() {
    try {
      console.log('\x1b[1;36m╔═══════════════════════════════════════════════════════════════╗\x1b[0m');
      console.log('\x1b[1;36m║              XIM Session Recorder                              ║\x1b[0m');
      console.log('\x1b[1;36m╚═══════════════════════════════════════════════════════════════╝\x1b[0m\n');

      // Ensure recordings directory exists
      if (!fs.existsSync(RECORDINGS_DIR)) {
        fs.mkdirSync(RECORDINGS_DIR, { recursive: true });
        console.log(`  Created recordings directory: ${RECORDINGS_DIR}\n`);
      }

      // Check if XIM log exists
      if (!fs.existsSync(XIM_LOG_FILE)) {
        console.error(`  \x1b[1;31m✗ Error\x1b[0m: XIM log not found: ${XIM_LOG_FILE}`);
        console.error('  \x1b[0;33mStart servers first: ./dev/scripts/start-servers.sh\x1b[0m\n');
        process.exit(1);
      }

      // Display recording info
      console.log('  \x1b[1;37mRecording Configuration:\x1b[0m');
      if (this.recordAll) {
        console.log('    Mode: Record all doors');
      } else {
        console.log(`    Door: ${this.doorFilter}`);
      }
      if (this.duration > 0) {
        console.log(`    Duration: ${this.duration} seconds`);
      } else {
        console.log('    Duration: Until stopped (Ctrl+C)');
      }
      if (this.outputFile) {
        console.log(`    Output: ${this.outputFile}`);
      } else {
        console.log('    Output: Auto-generated filename');
      }
      console.log('');

      // Start recording
      await this.startRecording();

      // Wait for duration or Ctrl+C
      await this.waitForCompletion();

      // Save recording
      await this.stopRecording();

    } catch (err: any) {
      console.error('\x1b[1;31m[ERROR]\x1b[0m', err.message);
      process.exit(1);
    }
  }

  private async startRecording(): Promise<void> {
    console.log('  \x1b[1;32m● Recording started\x1b[0m');
    console.log('  \x1b[0;37mWaiting for messages...\x1b[0m');
    console.log('  \x1b[0;33mPress Ctrl+C to stop recording\x1b[0m\n');

    this.recordingActive = true;
    this.startTime = Date.now();
    this.lastMessageTime = this.startTime;
    this.messageCount = 0;

    // Initialize recording
    this.recording = {
      version: '1.0',
      door: this.doorFilter || 'ALL',
      recorded: new Date().toISOString(),
      duration: 0,
      messageCount: 0,
      description: `Auto-recorded session: ${this.doorFilter || 'all doors'}`,
      messages: [],
    };

    // Get current file size
    const stats = fs.statSync(XIM_LOG_FILE);
    this.lastFileSize = stats.size;

    // Watch for new log entries
    this.fileWatcher = fs.watch(XIM_LOG_FILE, async (eventType) => {
      if (eventType === 'change') {
        await this.processNewMessages();
      }
    });

    // Also poll every 100ms to catch rapid messages
    const pollInterval = setInterval(() => {
      if (this.recordingActive) {
        this.processNewMessages();
      } else {
        clearInterval(pollInterval);
      }
    }, 100);
  }

  private async processNewMessages(): Promise<void> {
    try {
      const stats = fs.statSync(XIM_LOG_FILE);
      if (stats.size <= this.lastFileSize) {
        return; // No new data
      }

      // Read new data
      const stream = fs.createReadStream(XIM_LOG_FILE, {
        start: this.lastFileSize,
        encoding: 'utf-8',
      });

      let buffer = '';
      for await (const chunk of stream) {
        buffer += chunk;
      }

      this.lastFileSize = stats.size;

      // Parse new messages
      const lines = buffer.split('\n').filter(line => line.trim());
      for (const line of lines) {
        try {
          const entry: XIMLogEntry = JSON.parse(line);
          await this.processMessage(entry);
        } catch (err) {
          // Skip malformed lines
        }
      }
    } catch (err) {
      // Ignore read errors (file might be being written to)
    }
  }

  private async processMessage(entry: XIMLogEntry): Promise<void> {
    if (!this.recording) return;

    // Filter by door if specified
    if (this.doorFilter && entry.door !== this.doorFilter) {
      return;
    }

    // Only record messages TO the door (direction: send)
    // These are user inputs and backend commands
    if (entry.direction !== 'send') {
      return;
    }

    // Calculate delay from last message
    const currentTime = new Date(entry.timestamp).getTime();
    const delay = this.lastMessageTime === this.startTime
      ? 0
      : currentTime - this.lastMessageTime;

    this.lastMessageTime = currentTime;

    // Create recorded message
    const typeName = XIM_TYPE_NAMES[entry.type] || `UNKNOWN_${entry.type}`;
    const recordedMessage: RecordedMessage = {
      type: typeName,
      param: entry.param,
      data: entry.data,
      delay,
      timestamp: entry.timestamp,
      comment: this.generateComment(entry),
    };

    this.recording.messages.push(recordedMessage);
    this.messageCount++;

    // Display progress
    this.displayProgress(recordedMessage);
  }

  private generateComment(entry: XIMLogEntry): string {
    const typeName = XIM_TYPE_NAMES[entry.type] || `UNKNOWN_${entry.type}`;

    switch (entry.type) {
      case 0: // JH_INIT
        return 'Door initialization';
      case 1: // JH_SM
        return `Send message: "${entry.data}"`;
      case 2: // JH_STAT
        return 'Status request';
      case 3: // JH_TERMINATE
        return 'Terminate door';
      case 4: // JH_HK
        if (entry.param === 13) return 'Press Enter';
        if (entry.param === 27) return 'Press Escape';
        if (entry.param === 81 || entry.param === 113) return 'Press Q to quit';
        return `Press ${entry.data || String.fromCharCode(entry.param)}`;
      case 5: // JH_GNS
        return 'Get next string';
      default:
        return `${typeName} message`;
    }
  }

  private displayProgress(message: RecordedMessage): void {
    const elapsed = ((Date.now() - this.startTime) / 1000).toFixed(1);
    const delayStr = message.delay > 0 ? ` +${message.delay}ms` : '';
    console.log(`  \x1b[0;32m[${elapsed}s]\x1b[0m ${message.type}${delayStr} | ${message.comment}`);
  }

  private async waitForCompletion(): Promise<void> {
    return new Promise((resolve) => {
      // Handle Ctrl+C
      process.on('SIGINT', () => {
        console.log('\n  \x1b[0;33mStopping recording...\x1b[0m\n');
        resolve();
      });

      // Handle duration timeout
      if (this.duration > 0) {
        setTimeout(() => {
          console.log('\n  \x1b[0;33mDuration reached, stopping recording...\x1b[0m\n');
          resolve();
        }, this.duration * 1000);
      }
    });
  }

  private async stopRecording(): Promise<void> {
    this.recordingActive = false;

    if (this.fileWatcher) {
      this.fileWatcher.close();
      this.fileWatcher = null;
    }

    if (!this.recording) {
      console.log('  \x1b[0;31mNo recording to save\x1b[0m\n');
      return;
    }

    // Finalize recording
    this.recording.duration = (Date.now() - this.startTime) / 1000;
    this.recording.messageCount = this.messageCount;

    // Generate output filename if not specified
    let outputPath: string;
    if (this.outputFile) {
      outputPath = this.outputFile;
    } else {
      const timestamp = new Date().toISOString().replace(/:/g, '-').replace(/\..+/, '').replace('T', '-');
      const door = this.doorFilter || 'ALL';
      const filename = `${door}-${timestamp}.json`;
      outputPath = path.join(RECORDINGS_DIR, filename);
    }

    // Save recording
    fs.writeFileSync(outputPath, JSON.stringify(this.recording, null, 2), 'utf-8');

    // Display summary
    console.log('  \x1b[1;37mRecording Summary:\x1b[0m');
    console.log(`    Door: ${this.recording.door}`);
    console.log(`    Duration: ${this.recording.duration.toFixed(2)} seconds`);
    console.log(`    Messages: ${this.recording.messageCount}`);
    console.log(`    File: ${outputPath}`);
    console.log('');

    console.log('  \x1b[1;32m✓ Recording saved successfully\x1b[0m');
    console.log('');

    console.log('  \x1b[1;37mReplay this recording:\x1b[0m');
    console.log(`    npm run xim:replay:real -- --sequence ${path.relative(process.cwd(), outputPath)}`);
    console.log('');
  }
}

// Run
const recorder = new XIMRecorder();
recorder.run().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
