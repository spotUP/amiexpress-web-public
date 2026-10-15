#!/usr/bin/env npx tsx
/**
 * XIM Protocol Validator - Validate XIM message structure and protocol compliance
 *
 * Analyzes XIM logs to detect protocol violations, malformed messages, and timing issues.
 *
 * Usage:
 *   npx tsx dev/scripts/xim-validate.ts [options]
 *
 * Options:
 *   --door NAME         Validate specific door only
 *   --file PATH        Custom log file path
 *   --strict           Enable strict validation (fail on warnings)
 *   --fix              Suggest fixes for detected issues
 *
 * Examples:
 *   npm run xim:validate              # Validate all doors
 *   npm run xim:validate -- --door WHO  # Validate WHO door only
 *   npm run xim:validate -- --strict   # Strict mode
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
    dataHex?: string;
  };
  context?: Record<string, any>;
}

interface ValidationIssue {
  severity: 'error' | 'warning' | 'info';
  message: string;
  entry?: XIMLogEntry;
  fix?: string;
}

interface DoorSession {
  door: string;
  node: number;
  startTime: string;
  lastMessageTime: string;
  messages: XIMLogEntry[];
  initialized: boolean;
  terminated: boolean;
}

class XIMValidator {
  private logFile: string;
  private doorFilter: string | null = null;
  private strict: boolean = false;
  private suggestFixes: boolean = false;

  private issues: ValidationIssue[] = [];
  private sessions = new Map<string, DoorSession>();

  // Valid XIM message types
  private readonly VALID_TYPES = new Set([
    'JH_INIT', 'JH_SM', 'JH_STAT', 'JH_TERMINATE', 'JH_HK',
    'JH_GNS', 'JH_PROMPT', 'JH_MORE', 'JH_REQUEST', 'JH_IGNORE', 'JH_SMPTR',
    'LOG_START', 'LOG_END', 'ERROR', 'WARNING', 'TIMEOUT'
  ]);

  // Expected message sequences
  private readonly INIT_SEQUENCE = ['JH_INIT', 'JH_SM'];

  // Timing thresholds (milliseconds)
  private readonly MAX_RESPONSE_TIME = 5000;
  private readonly WARN_RESPONSE_TIME = 2000;

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
        case '--file':
          this.logFile = args[++i];
          break;
        case '--strict':
          this.strict = true;
          break;
        case '--fix':
          this.suggestFixes = true;
          break;
        case '--help':
          this.printHelp();
          process.exit(0);
      }
    }
  }

  private printHelp() {
    console.log(`
XIM Protocol Validator - Validate XIM message structure and protocol compliance

Usage:
  npx tsx dev/scripts/xim-validate.ts [options]

Options:
  --door NAME         Validate specific door only
  --file PATH        Custom log file path
  --strict           Enable strict validation (fail on warnings)
  --fix              Suggest fixes for detected issues
  --help             Show this help

Examples:
  npx tsx dev/scripts/xim-validate.ts              # Validate all doors
  npx tsx dev/scripts/xim-validate.ts --door WHO   # Validate WHO door only
  npx tsx dev/scripts/xim-validate.ts --strict     # Strict mode

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

    this.printHeader();
    await this.validateLog();
    this.printResults();

    // Exit with error code if validation failed
    const hasErrors = this.issues.some(i => i.severity === 'error');
    const hasWarnings = this.issues.some(i => i.severity === 'warning');

    if (hasErrors || (this.strict && hasWarnings)) {
      process.exit(1);
    }
  }

  private printHeader() {
    console.log('\x1b[1;36m╔═══════════════════════════════════════════════════════════════╗\x1b[0m');
    console.log('\x1b[1;36m║                    XIM Protocol Validator                      ║\x1b[0m');
    console.log('\x1b[1;36m╚═══════════════════════════════════════════════════════════════╝\x1b[0m');
    if (this.doorFilter) {
      console.log(`\x1b[0;33mValidating Door: ${this.doorFilter}\x1b[0m`);
    }
    console.log(`\x1b[0;37mLog File: ${this.logFile}\x1b[0m`);
    console.log(`\x1b[0;37mMode: ${this.strict ? 'Strict' : 'Normal'}\x1b[0m`);
    console.log('');
  }

  private async validateLog() {
    const fileStream = fs.createReadStream(this.logFile);
    const rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity,
    });

    for await (const line of rl) {
      if (line.trim()) {
        try {
          const entry: XIMLogEntry = JSON.parse(line);

          // Apply filter
          if (this.doorFilter && entry.door !== this.doorFilter) continue;

          // Skip system messages
          if (entry.door === 'SYSTEM') continue;

          this.validateEntry(entry);
        } catch (err) {
          this.addIssue('error', `Invalid JSON in log file: ${line.substring(0, 50)}...`);
        }
      }
    }

    // Validate session completeness
    this.validateSessions();
  }

  private validateEntry(entry: XIMLogEntry) {
    const sessionKey = `${entry.door}-${entry.node}`;

    // Get or create session
    let session = this.sessions.get(sessionKey);
    if (!session) {
      session = {
        door: entry.door,
        node: entry.node,
        startTime: entry.timestamp,
        lastMessageTime: entry.timestamp,
        messages: [],
        initialized: false,
        terminated: false,
      };
      this.sessions.set(sessionKey, session);
    }

    session.messages.push(entry);
    session.lastMessageTime = entry.timestamp;

    // Validate message type
    if (!this.VALID_TYPES.has(entry.message.type)) {
      this.addIssue('warning', `Unknown message type: ${entry.message.type}`, entry,
        'Check if this is a valid XIM message type or a typo in the logger.');
    }

    // Validate message structure
    this.validateMessageStructure(entry);

    // Validate protocol sequence
    this.validateSequence(entry, session);

    // Validate timing
    this.validateTiming(entry, session);

    // Track session state
    if (entry.message.type === 'JH_INIT') {
      if (session.initialized) {
        this.addIssue('error', `Door ${entry.door} received JH_INIT twice`, entry,
          'Check if door is being restarted incorrectly.');
      }
      session.initialized = true;
    }

    if (entry.message.type === 'JH_TERMINATE') {
      session.terminated = true;
    }
  }

  private validateMessageStructure(entry: XIMLogEntry) {
    const msg = entry.message;

    // Check for invalid type codes
    if (msg.typeCode < 0 && !['ERROR', 'WARNING', 'TIMEOUT'].includes(msg.type)) {
      this.addIssue('error', `Invalid type code: ${msg.typeCode}`, entry);
    }

    // Check data length consistency
    if (msg.dataLen !== undefined && msg.dataLen > 0) {
      if (!msg.dataText && !msg.dataHex) {
        this.addIssue('warning', `Message has dataLen=${msg.dataLen} but no data`, entry,
          'Check if data was truncated or not properly logged.');
      }

      if (msg.dataHex && msg.dataLen * 2 !== msg.dataHex.length) {
        this.addIssue('error', `Data length mismatch: declared ${msg.dataLen}, actual ${msg.dataHex.length / 2}`, entry,
          'Check for buffer overrun or incorrect length field.');
      }
    }

    // Validate param field for specific message types
    if (msg.type === 'JH_INIT' && msg.param === undefined) {
      this.addIssue('warning', `JH_INIT missing param (user ID)`, entry);
    }

    if (msg.type === 'JH_HK' && msg.param === undefined) {
      this.addIssue('warning', `JH_HK missing param (key code)`, entry);
    }
  }

  private validateSequence(entry: XIMLogEntry, session: DoorSession) {
    // Check if door sends messages before initialization
    if (!session.initialized && entry.direction === 'receive' && entry.message.type !== 'ERROR') {
      if (entry.message.type !== 'JH_SM' || session.messages.length > 1) {
        this.addIssue('error', `Door ${entry.door} sent ${entry.message.type} before JH_INIT`, entry,
          'Door should wait for JH_INIT before sending messages.');
      }
    }

    // Check for proper initialization sequence
    if (entry.message.type === 'JH_INIT' && entry.direction === 'send') {
      const nextMsg = this.getNextMessage(session, entry);
      if (nextMsg && nextMsg.message.type !== 'JH_SM') {
        this.addIssue('warning', `Door did not respond to JH_INIT with JH_SM (got ${nextMsg.message.type})`, entry,
          'Typical sequence is: backend sends JH_INIT → door responds with JH_SM');
      }
    }

    // Check for messages after termination
    if (session.terminated && entry.message.type !== 'JH_TERMINATE' && entry.message.type !== 'LOG_END') {
      this.addIssue('warning', `Message sent after JH_TERMINATE: ${entry.message.type}`, entry);
    }
  }

  private validateTiming(entry: XIMLogEntry, session: DoorSession) {
    if (session.messages.length < 2) return;

    const prevMsg = session.messages[session.messages.length - 2];
    const timeDiff = new Date(entry.timestamp).getTime() - new Date(prevMsg.timestamp).getTime();

    // Check for response timeouts
    if (prevMsg.direction === 'send' && entry.direction === 'receive') {
      if (timeDiff > this.MAX_RESPONSE_TIME) {
        this.addIssue('error', `Door took ${timeDiff}ms to respond to ${prevMsg.message.type}`, entry,
          'Check if door is stuck in a loop or waiting on WaitPort() indefinitely.');
      } else if (timeDiff > this.WARN_RESPONSE_TIME) {
        this.addIssue('warning', `Slow response: ${timeDiff}ms for ${prevMsg.message.type}`, entry);
      }
    }

    // Check for rapid-fire messages (possible loop)
    if (entry.direction === prevMsg.direction && timeDiff < 10) {
      const rapidCount = session.messages.slice(-10).filter(m =>
        m.direction === entry.direction && m.message.type === entry.message.type
      ).length;

      if (rapidCount > 5) {
        this.addIssue('warning', `Rapid-fire messages detected: ${rapidCount} ${entry.message.type} in <100ms`, entry,
          'Possible infinite loop or missing delay in door code.');
      }
    }
  }

  private validateSessions() {
    for (const [key, session] of this.sessions) {
      // Check for incomplete sessions
      if (!session.initialized) {
        this.addIssue('error', `Door ${session.door} (N${session.node}) never received JH_INIT`,
          undefined, 'Check if door crashed before initialization or reply port was not found.');
      }

      if (session.initialized && !session.terminated) {
        this.addIssue('info', `Door ${session.door} (N${session.node}) session incomplete (no JH_TERMINATE)`);
      }

      // Check for very short sessions (likely crash)
      if (session.messages.length < 3 && session.initialized) {
        this.addIssue('warning', `Door ${session.door} (N${session.node}) has very short session (${session.messages.length} messages)`,
          undefined, 'Door may have crashed immediately after initialization.');
      }
    }
  }

  private getNextMessage(session: DoorSession, currentEntry: XIMLogEntry): XIMLogEntry | null {
    const currentIndex = session.messages.indexOf(currentEntry);
    return currentIndex >= 0 && currentIndex < session.messages.length - 1
      ? session.messages[currentIndex + 1]
      : null;
  }

  private addIssue(severity: ValidationIssue['severity'], message: string, entry?: XIMLogEntry, fix?: string) {
    this.issues.push({ severity, message, entry, fix });
  }

  private printResults() {
    const errors = this.issues.filter(i => i.severity === 'error');
    const warnings = this.issues.filter(i => i.severity === 'warning');
    const info = this.issues.filter(i => i.severity === 'info');

    console.log('\n\x1b[1;36m╔═══════════════════════════════════════════════════════════════╗\x1b[0m');
    console.log('\x1b[1;36m║                      Validation Results                        ║\x1b[0m');
    console.log('\x1b[1;36m╚═══════════════════════════════════════════════════════════════╝\x1b[0m\n');

    console.log(`  Sessions Validated: \x1b[1;37m${this.sessions.size}\x1b[0m`);
    console.log(`  Errors:   \x1b[1;31m${errors.length}\x1b[0m`);
    console.log(`  Warnings: \x1b[1;33m${warnings.length}\x1b[0m`);
    console.log(`  Info:     \x1b[0;36m${info.length}\x1b[0m`);
    console.log('');

    if (errors.length === 0 && warnings.length === 0 && info.length === 0) {
      console.log('  \x1b[1;32m✓ No issues found - protocol compliance OK\x1b[0m\n');
      return;
    }

    // Print errors
    if (errors.length > 0) {
      console.log('  \x1b[1;31m[ERRORS]\x1b[0m\n');
      for (const issue of errors) {
        this.printIssue(issue, '\x1b[1;31m');
      }
    }

    // Print warnings
    if (warnings.length > 0) {
      console.log('  \x1b[1;33m[WARNINGS]\x1b[0m\n');
      for (const issue of warnings) {
        this.printIssue(issue, '\x1b[1;33m');
      }
    }

    // Print info
    if (info.length > 0 && !this.strict) {
      console.log('  \x1b[0;36m[INFO]\x1b[0m\n');
      for (const issue of info) {
        this.printIssue(issue, '\x1b[0;36m');
      }
    }
  }

  private printIssue(issue: ValidationIssue, color: string) {
    console.log(`  ${color}•${' '}${issue.message}\x1b[0m`);

    if (issue.entry) {
      const time = new Date(issue.entry.timestamp).toTimeString().split(' ')[0];
      console.log(`    ${issue.entry.door} (N${issue.entry.node}) at ${time}`);
      console.log(`    ${issue.entry.direction === 'send' ? '→' : '←'} ${issue.entry.message.type}`);
    }

    if (this.suggestFixes && issue.fix) {
      console.log(`    \x1b[0;32mFix: ${issue.fix}\x1b[0m`);
    }

    console.log('');
  }
}

// Run validator
const validator = new XIMValidator();
validator.run().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
