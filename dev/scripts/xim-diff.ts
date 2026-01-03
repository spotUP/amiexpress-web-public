#!/usr/bin/env npx tsx
/**
 * XIM Session Diff - Compare two XIM debug sessions
 *
 * Compares message sequences, timing, and behavior between two door sessions.
 * Essential for regression testing and identifying what changed.
 *
 * Usage:
 *   npx tsx dev/scripts/xim-diff.ts <session1> <session2> [options]
 *
 * Examples:
 *   # Compare two log files
 *   npm run xim:diff -- logs/xim-debug-before.json logs/xim-debug-after.json
 *
 *   # Compare same door at different times
 *   npm run xim:diff -- --door WHO --before 2025-12-29T10:00 --after 2025-12-29T11:00
 *
 *   # Show only differences
 *   npm run xim:diff -- session1.json session2.json --changes-only
 *
 *   # Export to markdown
 *   npm run xim:diff -- session1.json session2.json --output diff-report.md
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

interface MessageDiff {
  index: number;
  type: 'missing' | 'extra' | 'changed' | 'same' | 'timing';
  message1?: XIMLogEntry;
  message2?: XIMLogEntry;
  timingDelta?: number;
  changes?: string[];
}

interface SessionComparison {
  session1: SessionInfo;
  session2: SessionInfo;
  totalMessages1: number;
  totalMessages2: number;
  differences: MessageDiff[];
  timingAnalysis: TimingAnalysis;
  summary: ComparisonSummary;
}

interface SessionInfo {
  file: string;
  door: string;
  startTime?: Date;
  endTime?: Date;
  duration?: number;
}

interface TimingAnalysis {
  averageTimingDelta: number;
  maxTimingDelta: number;
  minTimingDelta: number;
  slowestMessage1: { type: string; time: number } | null;
  slowestMessage2: { type: string; time: number } | null;
}

interface ComparisonSummary {
  identical: boolean;
  messageCountMatch: boolean;
  missingMessages: number;
  extraMessages: number;
  changedMessages: number;
  significantTimingDifferences: number;
}

class XIMSessionDiff {
  private session1Messages: XIMLogEntry[] = [];
  private session2Messages: XIMLogEntry[] = [];
  private doorFilter?: string;
  private changesOnly = false;
  private outputFile?: string;

  async compare(file1: string, file2: string): Promise<SessionComparison> {
    // Load both sessions
    this.session1Messages = await this.loadMessages(file1);
    this.session2Messages = await this.loadMessages(file2);

    if (this.session1Messages.length === 0 || this.session2Messages.length === 0) {
      throw new Error('One or both sessions are empty');
    }

    // Build comparison
    const differences = this.computeDifferences();
    const timingAnalysis = this.analyzeTimings();
    const summary = this.buildSummary(differences);

    const session1Info: SessionInfo = {
      file: file1,
      door: this.session1Messages[0]?.door || 'unknown',
      startTime: this.session1Messages[0] ? new Date(this.session1Messages[0].timestamp) : undefined,
      endTime: this.session1Messages[this.session1Messages.length - 1]
        ? new Date(this.session1Messages[this.session1Messages.length - 1].timestamp)
        : undefined,
    };

    const session2Info: SessionInfo = {
      file: file2,
      door: this.session2Messages[0]?.door || 'unknown',
      startTime: this.session2Messages[0] ? new Date(this.session2Messages[0].timestamp) : undefined,
      endTime: this.session2Messages[this.session2Messages.length - 1]
        ? new Date(this.session2Messages[this.session2Messages.length - 1].timestamp)
        : undefined,
    };

    if (session1Info.startTime && session1Info.endTime) {
      session1Info.duration = session1Info.endTime.getTime() - session1Info.startTime.getTime();
    }

    if (session2Info.startTime && session2Info.endTime) {
      session2Info.duration = session2Info.endTime.getTime() - session2Info.startTime.getTime();
    }

    return {
      session1: session1Info,
      session2: session2Info,
      totalMessages1: this.session1Messages.length,
      totalMessages2: this.session2Messages.length,
      differences,
      timingAnalysis,
      summary,
    };
  }

  private computeDifferences(): MessageDiff[] {
    const diffs: MessageDiff[] = [];
    const maxLen = Math.max(this.session1Messages.length, this.session2Messages.length);

    for (let i = 0; i < maxLen; i++) {
      const msg1 = this.session1Messages[i];
      const msg2 = this.session2Messages[i];

      if (!msg1 && msg2) {
        // Extra message in session 2
        diffs.push({
          index: i,
          type: 'extra',
          message2: msg2,
        });
      } else if (msg1 && !msg2) {
        // Missing message in session 2
        diffs.push({
          index: i,
          type: 'missing',
          message1: msg1,
        });
      } else if (msg1 && msg2) {
        // Both exist - check if same or changed
        const changes = this.detectChanges(msg1, msg2);
        const timingDelta = this.computeTimingDelta(msg1, msg2, i);

        if (changes.length > 0) {
          diffs.push({
            index: i,
            type: 'changed',
            message1: msg1,
            message2: msg2,
            changes,
            timingDelta,
          });
        } else if (Math.abs(timingDelta) > 100) {
          // Significant timing difference (>100ms)
          diffs.push({
            index: i,
            type: 'timing',
            message1: msg1,
            message2: msg2,
            timingDelta,
          });
        } else {
          // Identical
          if (!this.changesOnly) {
            diffs.push({
              index: i,
              type: 'same',
              message1: msg1,
              message2: msg2,
              timingDelta,
            });
          }
        }
      }
    }

    return diffs;
  }

  private detectChanges(msg1: XIMLogEntry, msg2: XIMLogEntry): string[] {
    const changes: string[] = [];

    if (msg1.message.type !== msg2.message.type) {
      changes.push(`Type: ${msg1.message.type} -> ${msg2.message.type}`);
    }

    if (msg1.direction !== msg2.direction) {
      changes.push(`Direction: ${msg1.direction} -> ${msg2.direction}`);
    }

    if (msg1.message.param !== msg2.message.param) {
      changes.push(`Param: ${msg1.message.param} -> ${msg2.message.param}`);
    }

    if (msg1.message.dataLen !== msg2.message.dataLen) {
      changes.push(`DataLen: ${msg1.message.dataLen} -> ${msg2.message.dataLen}`);
    }

    if (msg1.message.dataText !== msg2.message.dataText) {
      const text1 = msg1.message.dataText?.substring(0, 50) || '';
      const text2 = msg2.message.dataText?.substring(0, 50) || '';
      changes.push(`Data: "${text1}" -> "${text2}"`);
    }

    return changes;
  }

  private computeTimingDelta(msg1: XIMLogEntry, msg2: XIMLogEntry, index: number): number {
    // Compute relative timing within session
    const session1Start = new Date(this.session1Messages[0].timestamp).getTime();
    const session2Start = new Date(this.session2Messages[0].timestamp).getTime();

    const msg1Time = new Date(msg1.timestamp).getTime() - session1Start;
    const msg2Time = new Date(msg2.timestamp).getTime() - session2Start;

    return msg2Time - msg1Time;
  }

  private analyzeTimings(): TimingAnalysis {
    const deltas: number[] = [];
    const minLen = Math.min(this.session1Messages.length, this.session2Messages.length);

    for (let i = 0; i < minLen; i++) {
      const delta = this.computeTimingDelta(this.session1Messages[i], this.session2Messages[i], i);
      deltas.push(delta);
    }

    const avgDelta = deltas.length > 0
      ? deltas.reduce((sum, d) => sum + d, 0) / deltas.length
      : 0;

    const maxDelta = deltas.length > 0 ? Math.max(...deltas.map(Math.abs)) : 0;
    const minDelta = deltas.length > 0 ? Math.min(...deltas.map(Math.abs)) : 0;

    // Find slowest messages
    let slowest1: { type: string; time: number } | null = null;
    let slowest2: { type: string; time: number } | null = null;

    for (let i = 1; i < this.session1Messages.length; i++) {
      const time = new Date(this.session1Messages[i].timestamp).getTime() -
                   new Date(this.session1Messages[i - 1].timestamp).getTime();
      if (!slowest1 || time > slowest1.time) {
        slowest1 = { type: this.session1Messages[i].message.type, time };
      }
    }

    for (let i = 1; i < this.session2Messages.length; i++) {
      const time = new Date(this.session2Messages[i].timestamp).getTime() -
                   new Date(this.session2Messages[i - 1].timestamp).getTime();
      if (!slowest2 || time > slowest2.time) {
        slowest2 = { type: this.session2Messages[i].message.type, time };
      }
    }

    return {
      averageTimingDelta: avgDelta,
      maxTimingDelta: maxDelta,
      minTimingDelta: minDelta,
      slowestMessage1: slowest1,
      slowestMessage2: slowest2,
    };
  }

  private buildSummary(differences: MessageDiff[]): ComparisonSummary {
    const missingMessages = differences.filter(d => d.type === 'missing').length;
    const extraMessages = differences.filter(d => d.type === 'extra').length;
    const changedMessages = differences.filter(d => d.type === 'changed').length;
    const significantTimingDifferences = differences.filter(d =>
      d.type === 'timing' || (d.timingDelta && Math.abs(d.timingDelta) > 100)
    ).length;

    const messageCountMatch = this.session1Messages.length === this.session2Messages.length;
    const identical = missingMessages === 0 && extraMessages === 0 && changedMessages === 0;

    return {
      identical,
      messageCountMatch,
      missingMessages,
      extraMessages,
      changedMessages,
      significantTimingDifferences,
    };
  }

  private async loadMessages(logFile: string): Promise<XIMLogEntry[]> {
    if (!fs.existsSync(logFile)) {
      throw new Error(`Log file not found: ${logFile}`);
    }

    const messages: XIMLogEntry[] = [];
    const fileStream = fs.createReadStream(logFile);
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

          // Apply door filter if specified
          if (this.doorFilter && entry.door !== this.doorFilter) continue;

          messages.push(entry);
        } catch (err) {
          // Ignore invalid JSON
        }
      }
    }

    return messages;
  }

  setDoorFilter(door: string) {
    this.doorFilter = door;
  }

  setChangesOnly(changesOnly: boolean) {
    this.changesOnly = changesOnly;
  }

  setOutputFile(file: string) {
    this.outputFile = file;
  }

  renderComparison(comparison: SessionComparison) {
    console.log('\x1b[1;36m╔═══════════════════════════════════════════════════════════════╗\x1b[0m');
    console.log('\x1b[1;36m║                    XIM Session Diff                            ║\x1b[0m');
    console.log('\x1b[1;36m╚═══════════════════════════════════════════════════════════════╝\x1b[0m\n');

    // Session info
    console.log('  \x1b[1;37mSession 1:\x1b[0m');
    console.log(`    File: ${comparison.session1.file}`);
    console.log(`    Door: ${comparison.session1.door}`);
    console.log(`    Messages: ${comparison.totalMessages1}`);
    if (comparison.session1.duration) {
      console.log(`    Duration: ${comparison.session1.duration}ms`);
    }
    console.log('');

    console.log('  \x1b[1;37mSession 2:\x1b[0m');
    console.log(`    File: ${comparison.session2.file}`);
    console.log(`    Door: ${comparison.session2.door}`);
    console.log(`    Messages: ${comparison.totalMessages2}`);
    if (comparison.session2.duration) {
      console.log(`    Duration: ${comparison.session2.duration}ms`);
    }
    console.log('');

    // Summary
    console.log('  \x1b[1;37mSummary:\x1b[0m');
    if (comparison.summary.identical) {
      console.log('    \x1b[1;32m✓ Sessions are identical\x1b[0m');
    } else {
      console.log(`    ${comparison.summary.messageCountMatch ? '\x1b[0;32m✓' : '\x1b[0;31m✗'} Message count: ${comparison.totalMessages1} vs ${comparison.totalMessages2}\x1b[0m`);

      if (comparison.summary.missingMessages > 0) {
        console.log(`    \x1b[0;31m✗ ${comparison.summary.missingMessages} missing messages\x1b[0m`);
      }

      if (comparison.summary.extraMessages > 0) {
        console.log(`    \x1b[0;33m+ ${comparison.summary.extraMessages} extra messages\x1b[0m`);
      }

      if (comparison.summary.changedMessages > 0) {
        console.log(`    \x1b[0;33m~ ${comparison.summary.changedMessages} changed messages\x1b[0m`);
      }

      if (comparison.summary.significantTimingDifferences > 0) {
        console.log(`    \x1b[0;36mⓘ ${comparison.summary.significantTimingDifferences} timing differences (>100ms)\x1b[0m`);
      }
    }
    console.log('');

    // Timing analysis
    console.log('  \x1b[1;37mTiming Analysis:\x1b[0m');
    console.log(`    Average delta: ${Math.floor(comparison.timingAnalysis.averageTimingDelta)}ms`);
    console.log(`    Max delta: ${Math.floor(comparison.timingAnalysis.maxTimingDelta)}ms`);

    if (comparison.timingAnalysis.slowestMessage1) {
      console.log(`    Slowest (S1): ${comparison.timingAnalysis.slowestMessage1.type} (${comparison.timingAnalysis.slowestMessage1.time}ms)`);
    }

    if (comparison.timingAnalysis.slowestMessage2) {
      console.log(`    Slowest (S2): ${comparison.timingAnalysis.slowestMessage2.type} (${comparison.timingAnalysis.slowestMessage2.time}ms)`);
    }
    console.log('');

    // Show differences
    if (!comparison.summary.identical) {
      console.log('  \x1b[1;37mDifferences:\x1b[0m\n');

      const significantDiffs = comparison.differences.filter(d => d.type !== 'same');
      const displayCount = Math.min(significantDiffs.length, 20);

      for (let i = 0; i < displayCount; i++) {
        const diff = significantDiffs[i];
        this.renderDifference(diff);
      }

      if (significantDiffs.length > 20) {
        console.log(`\n  ... and ${significantDiffs.length - 20} more differences\n`);
      }
    }

    // Export to file if requested
    if (this.outputFile) {
      this.exportToMarkdown(comparison);
      console.log(`\n  \x1b[0;32m✓ Exported to ${this.outputFile}\x1b[0m\n`);
    }
  }

  private renderDifference(diff: MessageDiff) {
    const icon = {
      missing: '\x1b[0;31m-',
      extra: '\x1b[0;33m+',
      changed: '\x1b[0;36m~',
      timing: '\x1b[0;35mΔ',
      same: '\x1b[0;32m=',
    }[diff.type];

    console.log(`  ${icon} [${diff.index}]\x1b[0m`);

    if (diff.type === 'missing') {
      console.log(`      Missing: ${diff.message1!.message.type} (${diff.message1!.direction})`);
    } else if (diff.type === 'extra') {
      console.log(`      Extra: ${diff.message2!.message.type} (${diff.message2!.direction})`);
    } else if (diff.type === 'changed') {
      console.log(`      S1: ${diff.message1!.message.type} (${diff.message1!.direction})`);
      console.log(`      S2: ${diff.message2!.message.type} (${diff.message2!.direction})`);
      diff.changes?.forEach(change => {
        console.log(`          ${change}`);
      });
    } else if (diff.type === 'timing') {
      console.log(`      ${diff.message1!.message.type} timing delta: ${Math.floor(diff.timingDelta!)}ms`);
    }

    console.log('');
  }

  private exportToMarkdown(comparison: SessionComparison) {
    const lines: string[] = [];

    lines.push('# XIM Session Comparison Report\n');
    lines.push(`**Generated:** ${new Date().toISOString()}\n`);
    lines.push('---\n');

    // Session info
    lines.push('## Session 1\n');
    lines.push(`- **File:** ${comparison.session1.file}`);
    lines.push(`- **Door:** ${comparison.session1.door}`);
    lines.push(`- **Messages:** ${comparison.totalMessages1}`);
    if (comparison.session1.duration) {
      lines.push(`- **Duration:** ${comparison.session1.duration}ms`);
    }
    lines.push('');

    lines.push('## Session 2\n');
    lines.push(`- **File:** ${comparison.session2.file}`);
    lines.push(`- **Door:** ${comparison.session2.door}`);
    lines.push(`- **Messages:** ${comparison.totalMessages2}`);
    if (comparison.session2.duration) {
      lines.push(`- **Duration:** ${comparison.session2.duration}ms`);
    }
    lines.push('');

    // Summary
    lines.push('## Summary\n');
    if (comparison.summary.identical) {
      lines.push('✓ Sessions are identical\n');
    } else {
      lines.push(`- Message count match: ${comparison.summary.messageCountMatch ? 'YES' : 'NO'}`);
      lines.push(`- Missing messages: ${comparison.summary.missingMessages}`);
      lines.push(`- Extra messages: ${comparison.summary.extraMessages}`);
      lines.push(`- Changed messages: ${comparison.summary.changedMessages}`);
      lines.push(`- Timing differences: ${comparison.summary.significantTimingDifferences}\n`);
    }

    // Timing
    lines.push('## Timing Analysis\n');
    lines.push(`- Average delta: ${Math.floor(comparison.timingAnalysis.averageTimingDelta)}ms`);
    lines.push(`- Max delta: ${Math.floor(comparison.timingAnalysis.maxTimingDelta)}ms`);
    if (comparison.timingAnalysis.slowestMessage1) {
      lines.push(`- Slowest (S1): ${comparison.timingAnalysis.slowestMessage1.type} (${comparison.timingAnalysis.slowestMessage1.time}ms)`);
    }
    if (comparison.timingAnalysis.slowestMessage2) {
      lines.push(`- Slowest (S2): ${comparison.timingAnalysis.slowestMessage2.type} (${comparison.timingAnalysis.slowestMessage2.time}ms)`);
    }
    lines.push('');

    // Differences
    if (!comparison.summary.identical) {
      lines.push('## Differences\n');

      const significantDiffs = comparison.differences.filter(d => d.type !== 'same');

      for (const diff of significantDiffs) {
        lines.push(`### [${diff.index}] ${diff.type.toUpperCase()}\n`);

        if (diff.type === 'missing') {
          lines.push(`**Missing:** ${diff.message1!.message.type} (${diff.message1!.direction})\n`);
        } else if (diff.type === 'extra') {
          lines.push(`**Extra:** ${diff.message2!.message.type} (${diff.message2!.direction})\n`);
        } else if (diff.type === 'changed') {
          lines.push(`**S1:** ${diff.message1!.message.type} (${diff.message1!.direction})`);
          lines.push(`**S2:** ${diff.message2!.message.type} (${diff.message2!.direction})`);
          lines.push('');
          lines.push('**Changes:**');
          diff.changes?.forEach(change => {
            lines.push(`- ${change}`);
          });
          lines.push('');
        } else if (diff.type === 'timing') {
          lines.push(`**Timing delta:** ${Math.floor(diff.timingDelta!)}ms for ${diff.message1!.message.type}\n`);
        }
      }
    }

    fs.writeFileSync(this.outputFile!, lines.join('\n'));
  }
}

// CLI interface
if (require.main === module) {
  const args = process.argv.slice(2);

  if (args.length < 2 || args.includes('--help')) {
    console.log(`
XIM Session Diff - Compare two XIM debug sessions

Usage:
  npx tsx dev/scripts/xim-diff.ts <session1> <session2> [options]

Arguments:
  <session1>          First session log file
  <session2>          Second session log file

Options:
  --door NAME         Filter by specific door
  --changes-only      Show only differences (hide identical messages)
  --output FILE       Export comparison to markdown file
  --help              Show this help

Examples:
  npm run xim:diff -- logs/before.json logs/after.json
  npm run xim:diff -- session1.json session2.json --door WHO
  npm run xim:diff -- before.json after.json --changes-only
  npm run xim:diff -- s1.json s2.json --output comparison.md

Use cases:
  - Regression testing: Compare working vs broken sessions
  - Code changes: See impact of modifications
  - Timing analysis: Identify performance regressions
  - Protocol debugging: Verify message sequence consistency
`);
    process.exit(0);
  }

  const file1 = args[0];
  const file2 = args[1];
  let doorFilter: string | undefined;
  let changesOnly = false;
  let outputFile: string | undefined;

  for (let i = 2; i < args.length; i++) {
    if (args[i] === '--door') {
      doorFilter = args[++i];
    } else if (args[i] === '--changes-only') {
      changesOnly = true;
    } else if (args[i] === '--output') {
      outputFile = args[++i];
    }
  }

  const differ = new XIMSessionDiff();

  if (doorFilter) {
    differ.setDoorFilter(doorFilter);
  }

  if (changesOnly) {
    differ.setChangesOnly(true);
  }

  if (outputFile) {
    differ.setOutputFile(outputFile);
  }

  differ.compare(file1, file2).then(comparison => {
    differ.renderComparison(comparison);
  }).catch(err => {
    console.error('\x1b[1;31m[ERROR]\x1b[0m', err.message);
    process.exit(1);
  });
}
