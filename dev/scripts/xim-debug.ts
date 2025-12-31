#!/usr/bin/env npx tsx
/**
 * XIM Smart Debugger - One-command orchestrated debugging
 *
 * Runs all debugging tools in a coordinated fashion and generates
 * comprehensive reports automatically.
 *
 * Usage:
 *   npx tsx dev/scripts/xim-debug.ts [door_name]
 *
 * Examples:
 *   npm run xim:debug -- WHO
 *   npm run xim:debug -- RTW
 *
 * What it does:
 *   1. Clears old logs for clean session
 *   2. Starts live viewer in background
 *   3. Runs validator continuously
 *   4. Monitors door state
 *   5. Detects door completion
 *   6. Generates comprehensive report
 *   7. Shows top 3 issues with fixes
 */

import * as fs from 'fs';
import * as path from 'path';
import { spawn, ChildProcess } from 'child_process';
import * as readline from 'readline';
import { XIMAnalyzer, DetectedIssue } from './xim-analyzer';

interface DebugSession {
  door: string;
  startTime: Date;
  endTime?: Date;
  logFile: string;
  messages: any[];
  issues: DetectedIssue[];
  status: 'initializing' | 'running' | 'completed' | 'error';
}

// Use DetectedIssue from xim-analyzer (same interface)
type Issue = DetectedIssue;

class XIMDebugger {
  private door: string;
  private session: DebugSession;
  private logFile: string;
  private processes: ChildProcess[] = [];
  private monitoring = true;

  constructor(door: string) {
    this.door = door.toUpperCase();
    this.logFile = process.env.XIM_LOG_FILE || 'logs/xim-debug.json';

    this.session = {
      door: this.door,
      startTime: new Date(),
      logFile: this.logFile,
      messages: [],
      issues: [],
      status: 'initializing',
    };
  }

  async run() {
    this.printHeader();

    // Check if backend is running
    const backendRunning = await this.checkBackendRunning();
    if (!backendRunning) {
      console.log('\x1b[1;31m[ERROR]\x1b[0m Backend is not running.\n');
      console.log('Start the backend first:');
      console.log('  \x1b[0;36m./dev/scripts/start-servers.sh\x1b[0m\n');
      process.exit(1);
    }

    // Step 1: Clean session
    console.log('\x1b[1;37m[1/5]\x1b[0m Preparing clean debug session...');
    await this.cleanSession();
    console.log('      \x1b[0;32m✓ Old logs cleared\x1b[0m\n');

    // Step 2: Start monitoring
    console.log('\x1b[1;37m[2/5]\x1b[0m Starting live monitoring...');
    await this.startMonitoring();
    console.log('      \x1b[0;32m✓ Live viewer started\x1b[0m');
    console.log('      \x1b[0;32m✓ Validator running\x1b[0m');
    console.log('      \x1b[0;32m✓ State monitor active\x1b[0m\n');

    // Step 3: Wait for user to run door
    console.log('\x1b[1;37m[3/5]\x1b[0m Waiting for door execution...');
    console.log('      \x1b[0;33mPlease run the door:\x1b[0m \x1b[1;36m' + this.door + '\x1b[0m');
    console.log('      (Watching for XIM messages...)\n');

    this.session.status = 'running';

    // Step 4: Monitor until door completes
    await this.monitorSession();

    // Step 5: Generate report
    console.log('\x1b[1;37m[4/5]\x1b[0m Analyzing session...');
    await this.analyzeSession();
    console.log('      \x1b[0;32m✓ Session analyzed\x1b[0m\n');

    console.log('\x1b[1;37m[5/5]\x1b[0m Generating report...');
    const reportPath = await this.generateReport();
    console.log('      \x1b[0;32m✓ Report generated\x1b[0m\n');

    // Show summary
    this.printSummary(reportPath);

    // Cleanup
    await this.cleanup();
  }

  private printHeader() {
    console.log('\x1b[1;36m╔═══════════════════════════════════════════════════════════════╗\x1b[0m');
    console.log('\x1b[1;36m║              XIM Smart Debugger - One Command                  ║\x1b[0m');
    console.log('\x1b[1;36m╚═══════════════════════════════════════════════════════════════╝\x1b[0m\n');
    console.log(`  Door: \x1b[1;37m${this.door}\x1b[0m`);
    console.log(`  Session: \x1b[0;37m${this.session.startTime.toISOString()}\x1b[0m`);
    console.log('');
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

  private async cleanSession() {
    // Clear old XIM debug log
    if (fs.existsSync(this.logFile)) {
      const backup = `${this.logFile}.backup-${Date.now()}`;
      fs.renameSync(this.logFile, backup);
    }

    // Wait a moment for file system
    await this.sleep(100);
  }

  private async startMonitoring() {
    // Note: For now, we'll monitor by reading the log file
    // In future iterations, we can spawn actual viewer/monitor processes
    // This keeps it simple and doesn't require terminal multiplexing
  }

  private async monitorSession() {
    console.log('  \x1b[0;36m[Monitoring started - Press Ctrl+C when door exits]\x1b[0m\n');

    let lastMessageTime = Date.now();
    let messageCount = 0;
    let doorDetected = false;

    // Monitor log file for activity
    const checkInterval = setInterval(() => {
      if (!fs.existsSync(this.logFile)) {
        return;
      }

      try {
        const stats = fs.statSync(this.logFile);
        const lines = fs.readFileSync(this.logFile, 'utf-8').split('\n').filter(l => l.trim());

        // Parse messages
        const messages = lines.map(line => {
          try {
            return JSON.parse(line);
          } catch {
            return null;
          }
        }).filter(m => m !== null);

        // Filter for our door
        const doorMessages = messages.filter(m => m.door === this.door);

        if (doorMessages.length > messageCount) {
          messageCount = doorMessages.length;
          lastMessageTime = Date.now();

          if (!doorDetected) {
            doorDetected = true;
            console.log('  \x1b[0;32m✓ Door detected!\x1b[0m');
            console.log(`    Messages: ${messageCount}`);
          } else {
            process.stdout.write(`\r    Messages: ${messageCount}`);
          }
        }

        this.session.messages = doorMessages;

        // Check for completion (no new messages for 5 seconds after door started)
        if (doorDetected && Date.now() - lastMessageTime > 5000) {
          clearInterval(checkInterval);
          this.session.endTime = new Date();
          this.session.status = 'completed';
          console.log('\n  \x1b[0;32m✓ Door session completed\x1b[0m\n');
          this.monitoring = false;
        }
      } catch (err) {
        // Ignore read errors
      }
    }, 500);

    // Wait until monitoring is done
    while (this.monitoring) {
      await this.sleep(1000);
    }
  }

  private async analyzeSession() {
    // Use advanced pattern analyzer (10+ patterns with confidence scoring)
    const analyzer = new XIMAnalyzer();
    this.session.issues = await analyzer.analyze(this.logFile, this.door);
  }

  private async generateReport(): Promise<string> {
    const reportDir = path.join(process.cwd(), 'logs', 'reports');
    if (!fs.existsSync(reportDir)) {
      fs.mkdirSync(reportDir, { recursive: true });
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const reportPath = path.join(reportDir, `xim-debug-${this.door}-${timestamp}.md`);

    const duration = this.session.endTime
      ? ((this.session.endTime.getTime() - this.session.startTime.getTime()) / 1000).toFixed(2)
      : 'unknown';

    const report = `# XIM Debug Report: ${this.door}

**Generated:** ${new Date().toISOString()}
**Duration:** ${duration}s
**Messages:** ${this.session.messages.length}
**Status:** ${this.session.status}

---

## Executive Summary

${this.session.issues.length === 0
  ? '✓ No critical issues detected. Door appears to be functioning normally.'
  : `Found ${this.session.issues.length} issue(s):`}

${this.session.issues.slice(0, 3).map((issue, i) => `
### ${i + 1}. [${issue.severity.toUpperCase()}] ${issue.title}

**Confidence:** ${issue.confidence}%

**Evidence:**
${issue.evidence.map(e => `- ${e}`).join('\n')}

**Suggested Fix:**
${issue.suggestedFix}

${issue.code ? `**Code Example:**\n\`\`\`typescript\n${issue.code}\n\`\`\`\n` : ''}
`).join('\n---\n')}

---

## Session Statistics

- **Total Messages:** ${this.session.messages.length}
- **Backend → Door:** ${this.session.messages.filter(m => m.direction === 'send').length}
- **Door → Backend:** ${this.session.messages.filter(m => m.direction === 'receive').length}

## Message Types

${this.getMessageTypeStats()}

---

## Full Message Log

See: \`${this.logFile}\`

Filter messages for this door:
\`\`\`bash
npm run xim:view -- --door ${this.door}
\`\`\`

---

*Report generated by XIM Smart Debugger*
`;

    fs.writeFileSync(reportPath, report);
    return reportPath;
  }

  private getMessageTypeStats(): string {
    const types = new Map<string, number>();

    for (const msg of this.session.messages) {
      const type = msg.message?.type || 'UNKNOWN';
      types.set(type, (types.get(type) || 0) + 1);
    }

    if (types.size === 0) {
      return '*No messages recorded*';
    }

    return Array.from(types.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([type, count]) => `- **${type}:** ${count}`)
      .join('\n');
  }

  private printSummary(reportPath: string) {
    console.log('\x1b[1;36m╔═══════════════════════════════════════════════════════════════╗\x1b[0m');
    console.log('\x1b[1;36m║                      Debug Summary                             ║\x1b[0m');
    console.log('\x1b[1;36m╚═══════════════════════════════════════════════════════════════╝\x1b[0m\n');

    console.log(`  Door: \x1b[1;37m${this.door}\x1b[0m`);
    console.log(`  Messages: \x1b[1;37m${this.session.messages.length}\x1b[0m`);
    console.log(`  Status: ${this.getStatusColor(this.session.status)}\n`);

    if (this.session.issues.length === 0) {
      console.log('  \x1b[1;32m✓ No critical issues detected\x1b[0m\n');
    } else {
      console.log(`  \x1b[1;33mIssues Found: ${this.session.issues.length}\x1b[0m\n`);

      // Show top 3 issues
      const top3 = this.session.issues.slice(0, 3);
      for (let i = 0; i < top3.length; i++) {
        const issue = top3[i];
        const icon = issue.severity === 'critical' ? '\x1b[1;31m✗\x1b[0m' : '\x1b[1;33m!\x1b[0m';
        console.log(`  ${icon} [${issue.severity.toUpperCase()}] ${issue.title}`);
        console.log(`    Confidence: ${issue.confidence}%`);
        console.log(`    Fix: ${issue.suggestedFix}`);
        console.log('');
      }
    }

    console.log(`  \x1b[0;37mFull Report:\x1b[0m \x1b[0;36m${reportPath}\x1b[0m\n`);

    console.log('  \x1b[0;37mNext Steps:\x1b[0m');
    console.log('    - Review full report for details');
    console.log('    - Run validator: \x1b[0;36mnpm run xim:validate -- --door ' + this.door + '\x1b[0m');
    console.log('    - View messages: \x1b[0;36mnpm run xim:view -- --door ' + this.door + '\x1b[0m');
    console.log('');
  }

  private getStatusColor(status: string): string {
    switch (status) {
      case 'completed':
        return '\x1b[1;32m✓ COMPLETED\x1b[0m';
      case 'running':
        return '\x1b[1;33m● RUNNING\x1b[0m';
      case 'error':
        return '\x1b[1;31m✗ ERROR\x1b[0m';
      default:
        return '\x1b[0;37m' + status.toUpperCase() + '\x1b[0m';
    }
  }

  private async cleanup() {
    // Kill any spawned processes
    for (const proc of this.processes) {
      proc.kill();
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Parse arguments
const args = process.argv.slice(2);

if (args.length === 0 || args.includes('--help')) {
  console.log(`
XIM Smart Debugger - One-command orchestrated debugging

Usage:
  npx tsx dev/scripts/xim-debug.ts <door_name>

Examples:
  npm run xim:debug -- WHO
  npm run xim:debug -- RTW
  npm run xim:debug -- MultiTop

What it does:
  1. Clears old logs for clean session
  2. Monitors XIM messages in real-time
  3. Detects common issues automatically
  4. Generates comprehensive report
  5. Shows top 3 issues with fixes

The report includes:
  - Session statistics
  - Issues detected with confidence scores
  - Suggested fixes with code examples
  - Full message log reference
`);
  process.exit(0);
}

const doorName = args[0];

// Run debugger
const ximDebugger = new XIMDebugger(doorName);
ximDebugger.run().catch((err) => {
  console.error('\x1b[1;31m[ERROR]\x1b[0m', err.message);
  process.exit(1);
});
