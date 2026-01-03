#!/usr/bin/env npx tsx
/**
 * XIM Performance Profiler
 *
 * Analyzes door performance from XIM debug logs.
 * Identifies bottlenecks, slow operations, and optimization opportunities.
 *
 * Usage:
 *   npm run xim:perf
 *   npm run xim:perf -- --door WHO
 *   npm run xim:perf -- --baseline recordings/WHO-v1.json --current recordings/WHO-v2.json
 *   npm run xim:perf -- --report performance-report.md
 *
 * Metrics:
 * - Total execution time
 * - Message processing times
 * - Message throughput (messages/second)
 * - Average response time
 * - Slowest operations
 * - Time distribution by message type
 * - Performance comparison (before/after)
 *
 * Output:
 * - Console summary with color coding
 * - Detailed markdown report (optional)
 * - JSON export for CI/CD (optional)
 * - Performance graphs (ASCII)
 */

import * as fs from 'fs';
import * as path from 'path';

const XIM_LOG_FILE = path.join(process.cwd(), 'logs', 'xim-debug.json');

// XIM message type names
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

interface MessageTiming {
  type: string;
  timestamp: number;
  responseTime?: number;
  dataSize: number;
}

interface PerformanceMetrics {
  door: string;
  totalDuration: number;
  messageCount: number;
  throughput: number;
  avgResponseTime: number;
  maxResponseTime: number;
  minResponseTime: number;
  messageTimings: MessageTiming[];
  typeDistribution: Record<string, {
    count: number;
    totalTime: number;
    avgTime: number;
    maxTime: number;
    minTime: number;
  }>;
  slowestOperations: Array<{
    type: string;
    time: number;
    timestamp: string;
  }>;
}

class XIMPerformanceProfiler {
  private doorFilter: string | null = null;
  private baselineFile: string | null = null;
  private currentFile: string | null = null;
  private reportFile: string | null = null;
  private jsonOutput: boolean = false;

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
        case '--baseline':
          this.baselineFile = args[++i];
          break;
        case '--current':
          this.currentFile = args[++i];
          break;
        case '--report':
          this.reportFile = args[++i];
          break;
        case '--json':
          this.jsonOutput = true;
          break;
        case '--help':
          this.printHelp();
          process.exit(0);
      }
    }
  }

  private printHelp() {
    console.log(`
XIM Performance Profiler

Analyze door performance from XIM debug logs.

Usage:
  npm run xim:perf -- [options]

Options:
  --door NAME           Analyze specific door (e.g., WHO, RTW)
  --baseline FILE       Baseline recording for comparison
  --current FILE        Current recording for comparison
  --report FILE         Generate markdown report
  --json                Output JSON for CI/CD
  --help                Show this help

Examples:
  # Profile all doors
  npm run xim:perf

  # Profile specific door
  npm run xim:perf -- --door WHO

  # Compare two versions
  npm run xim:perf -- --baseline recordings/WHO-v1.json --current recordings/WHO-v2.json

  # Generate report
  npm run xim:perf -- --door WHO --report performance-report.md

  # JSON output for CI/CD
  npm run xim:perf -- --door WHO --json > performance.json

Metrics Tracked:
  - Total execution time
  - Message throughput (msg/sec)
  - Average response time
  - Slowest operations (top 10)
  - Time distribution by message type
  - Performance comparison (baseline vs current)

Output:
  - Console summary with color-coded metrics
  - Detailed markdown report (optional)
  - JSON export for automation (optional)
  - ASCII performance graphs
`);
  }

  async run() {
    try {
      console.log('\x1b[1;36m╔═══════════════════════════════════════════════════════════════╗\x1b[0m');
      console.log('\x1b[1;36m║           XIM Performance Profiler                             ║\x1b[0m');
      console.log('\x1b[1;36m╚═══════════════════════════════════════════════════════════════╝\x1b[0m\n');

      // Check if comparison mode
      if (this.baselineFile && this.currentFile) {
        await this.comparePerformance();
        return;
      }

      // Single analysis mode
      const metrics = await this.analyzePerformance();

      if (!metrics) {
        console.log('  \x1b[0;33mNo data to analyze\x1b[0m\n');
        return;
      }

      // Display results
      this.displayMetrics(metrics);

      // Generate report if requested
      if (this.reportFile) {
        this.generateReport(metrics);
      }

      // JSON output if requested
      if (this.jsonOutput) {
        console.log(JSON.stringify(metrics, null, 2));
      }

    } catch (err: any) {
      console.error('\x1b[1;31m[ERROR]\x1b[0m', err.message);
      process.exit(1);
    }
  }

  private async analyzePerformance(): Promise<PerformanceMetrics | null> {
    if (!fs.existsSync(XIM_LOG_FILE)) {
      console.error(`  \x1b[1;31m✗ Error\x1b[0m: XIM log not found: ${XIM_LOG_FILE}`);
      console.error('  \x1b[0;33mRun a door first to generate logs\x1b[0m\n');
      return null;
    }

    console.log('  \x1b[1;37mLoading XIM logs...\x1b[0m\n');

    // Load messages
    const messages = this.loadMessages(XIM_LOG_FILE);

    if (messages.length === 0) {
      console.log('  \x1b[0;33mNo messages found in log\x1b[0m\n');
      return null;
    }

    // Calculate metrics
    return this.calculateMetrics(messages, this.doorFilter || 'ALL');
  }

  private loadMessages(logFile: string): XIMLogEntry[] {
    const content = fs.readFileSync(logFile, 'utf-8');
    const lines = content.split('\n').filter(line => line.trim());

    const messages: XIMLogEntry[] = [];
    for (const line of lines) {
      try {
        const entry: XIMLogEntry = JSON.parse(line);

        // Filter by door if specified
        if (this.doorFilter && entry.door !== this.doorFilter) {
          continue;
        }

        messages.push(entry);
      } catch (err) {
        // Skip malformed lines
      }
    }

    return messages;
  }

  private calculateMetrics(messages: XIMLogEntry[], door: string): PerformanceMetrics {
    if (messages.length === 0) {
      throw new Error('No messages to analyze');
    }

    // Calculate total duration
    const firstTime = new Date(messages[0].timestamp).getTime();
    const lastTime = new Date(messages[messages.length - 1].timestamp).getTime();
    const totalDuration = (lastTime - firstTime) / 1000; // seconds

    // Track message timings
    const messageTimings: MessageTiming[] = [];
    const responseTimes: number[] = [];
    const typeDistribution: Record<string, any> = {};

    let lastSendTime = 0;
    let lastSendType = '';

    for (const msg of messages) {
      const timestamp = new Date(msg.timestamp).getTime();
      const typeName = XIM_TYPE_NAMES[msg.type] || `UNKNOWN_${msg.type}`;

      // Initialize type distribution
      if (!typeDistribution[typeName]) {
        typeDistribution[typeName] = {
          count: 0,
          totalTime: 0,
          avgTime: 0,
          maxTime: 0,
          minTime: Infinity,
          times: [],
        };
      }

      typeDistribution[typeName].count++;

      // Track response times (time between send and receive)
      if (msg.direction === 'send') {
        lastSendTime = timestamp;
        lastSendType = typeName;

        messageTimings.push({
          type: typeName,
          timestamp,
          dataSize: msg.dataLen,
        });
      } else if (msg.direction === 'receive' && lastSendTime > 0) {
        const responseTime = timestamp - lastSendTime;
        responseTimes.push(responseTime);

        // Update last send message timing
        const lastTiming = messageTimings[messageTimings.length - 1];
        if (lastTiming) {
          lastTiming.responseTime = responseTime;
        }

        // Update type distribution
        const typeKey = lastSendType;
        if (typeDistribution[typeKey]) {
          typeDistribution[typeKey].totalTime += responseTime;
          typeDistribution[typeKey].maxTime = Math.max(typeDistribution[typeKey].maxTime, responseTime);
          typeDistribution[typeKey].minTime = Math.min(typeDistribution[typeKey].minTime, responseTime);
          typeDistribution[typeKey].times.push(responseTime);
        }

        lastSendTime = 0;
        lastSendType = '';
      }
    }

    // Calculate averages
    for (const type in typeDistribution) {
      const dist = typeDistribution[type];
      if (dist.times.length > 0) {
        dist.avgTime = dist.totalTime / dist.times.length;
      }
      delete dist.times; // Remove raw times to save space
    }

    // Find slowest operations
    const slowestOperations = messageTimings
      .filter(t => t.responseTime !== undefined)
      .sort((a, b) => (b.responseTime || 0) - (a.responseTime || 0))
      .slice(0, 10)
      .map(t => ({
        type: t.type,
        time: t.responseTime || 0,
        timestamp: new Date(t.timestamp).toISOString(),
      }));

    // Calculate final metrics
    const avgResponseTime = responseTimes.length > 0
      ? responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length
      : 0;

    const maxResponseTime = responseTimes.length > 0
      ? Math.max(...responseTimes)
      : 0;

    const minResponseTime = responseTimes.length > 0
      ? Math.min(...responseTimes)
      : 0;

    return {
      door,
      totalDuration,
      messageCount: messages.length,
      throughput: totalDuration > 0 ? messages.length / totalDuration : 0,
      avgResponseTime,
      maxResponseTime,
      minResponseTime,
      messageTimings,
      typeDistribution,
      slowestOperations,
    };
  }

  private displayMetrics(metrics: PerformanceMetrics) {
    console.log('  \x1b[1;37mPerformance Summary:\x1b[0m');
    console.log(`    Door: ${metrics.door}`);
    console.log(`    Total Duration: ${metrics.totalDuration.toFixed(2)}s`);
    console.log(`    Messages: ${metrics.messageCount}`);
    console.log(`    Throughput: ${metrics.throughput.toFixed(2)} msg/sec`);
    console.log('');

    console.log('  \x1b[1;37mResponse Times:\x1b[0m');
    console.log(`    Average: ${(metrics.avgResponseTime).toFixed(2)}ms`);
    console.log(`    Maximum: ${(metrics.maxResponseTime).toFixed(2)}ms`);
    console.log(`    Minimum: ${(metrics.minResponseTime).toFixed(2)}ms`);
    console.log('');

    console.log('  \x1b[1;37mTop 10 Slowest Operations:\x1b[0m');
    metrics.slowestOperations.forEach((op, index) => {
      const color = op.time > 1000 ? '\x1b[0;31m' : op.time > 500 ? '\x1b[0;33m' : '\x1b[0;32m';
      console.log(`    ${index + 1}. ${color}${op.type}\x1b[0m - ${op.time.toFixed(2)}ms`);
    });
    console.log('');

    console.log('  \x1b[1;37mTime Distribution by Message Type:\x1b[0m');
    const sortedTypes = Object.entries(metrics.typeDistribution)
      .sort((a, b) => b[1].avgTime - a[1].avgTime);

    sortedTypes.forEach(([type, dist]) => {
      if (dist.count > 0) {
        const avgTime = dist.avgTime.toFixed(2);
        const color = dist.avgTime > 500 ? '\x1b[0;31m' : dist.avgTime > 100 ? '\x1b[0;33m' : '\x1b[0;32m';
        console.log(`    ${type.padEnd(15)} ${color}${avgTime}ms\x1b[0m avg (${dist.count} msgs, max: ${dist.maxTime.toFixed(2)}ms)`);
      }
    });
    console.log('');
  }

  private generateReport(metrics: PerformanceMetrics) {
    const report = this.buildMarkdownReport(metrics);
    fs.writeFileSync(this.reportFile!, report, 'utf-8');
    console.log(`  \x1b[1;32m✓ Report saved\x1b[0m: ${this.reportFile}\n`);
  }

  private buildMarkdownReport(metrics: PerformanceMetrics): string {
    return `# XIM Performance Report

**Door:** ${metrics.door}
**Generated:** ${new Date().toISOString()}

---

## Summary

| Metric | Value |
|--------|-------|
| Total Duration | ${metrics.totalDuration.toFixed(2)}s |
| Total Messages | ${metrics.messageCount} |
| Throughput | ${metrics.throughput.toFixed(2)} msg/sec |
| Avg Response Time | ${metrics.avgResponseTime.toFixed(2)}ms |
| Max Response Time | ${metrics.maxResponseTime.toFixed(2)}ms |
| Min Response Time | ${metrics.minResponseTime.toFixed(2)}ms |

---

## Top 10 Slowest Operations

| Rank | Message Type | Response Time | Timestamp |
|------|--------------|---------------|-----------|
${metrics.slowestOperations.map((op, i) =>
  `| ${i + 1} | ${op.type} | ${op.time.toFixed(2)}ms | ${op.timestamp} |`
).join('\n')}

---

## Time Distribution by Message Type

| Message Type | Count | Avg Time | Max Time | Min Time |
|--------------|-------|----------|----------|----------|
${Object.entries(metrics.typeDistribution)
  .sort((a, b) => b[1].avgTime - a[1].avgTime)
  .map(([type, dist]) =>
    `| ${type} | ${dist.count} | ${dist.avgTime.toFixed(2)}ms | ${dist.maxTime.toFixed(2)}ms | ${dist.minTime === Infinity ? 'N/A' : dist.minTime.toFixed(2) + 'ms'} |`
  ).join('\n')}

---

## Performance Analysis

### Throughput
- **${metrics.throughput.toFixed(2)} messages/second**
${metrics.throughput < 10 ? '- ⚠️ **LOW THROUGHPUT** - Door may be slow or waiting for input' : ''}
${metrics.throughput > 100 ? '- ✓ **HIGH THROUGHPUT** - Door is processing messages quickly' : ''}

### Response Times
- Average: ${metrics.avgResponseTime.toFixed(2)}ms
${metrics.avgResponseTime > 500 ? '- ⚠️ **SLOW RESPONSES** - Consider optimizing message handlers' : ''}
${metrics.avgResponseTime < 100 ? '- ✓ **FAST RESPONSES** - Good performance' : ''}

### Bottlenecks
${metrics.slowestOperations.length > 0 ? `
The slowest operation was **${metrics.slowestOperations[0].type}** at ${metrics.slowestOperations[0].time.toFixed(2)}ms.

${metrics.slowestOperations[0].time > 1000 ? '⚠️ This operation is very slow and should be optimized.' : ''}
` : 'No significant bottlenecks detected.'}

---

**Generated by XIM Performance Profiler**
`;
  }

  private async comparePerformance() {
    console.log('  \x1b[1;37mComparison Mode:\x1b[0m');
    console.log(`    Baseline: ${this.baselineFile}`);
    console.log(`    Current: ${this.currentFile}`);
    console.log('');

    // Load both recordings
    const baselineMessages = this.loadMessages(this.baselineFile!);
    const currentMessages = this.loadMessages(this.currentFile!);

    if (baselineMessages.length === 0 || currentMessages.length === 0) {
      console.error('  \x1b[1;31m✗ Error\x1b[0m: One or both recordings are empty\n');
      return;
    }

    // Calculate metrics for both
    const baselineMetrics = this.calculateMetrics(baselineMessages, 'Baseline');
    const currentMetrics = this.calculateMetrics(currentMessages, 'Current');

    // Display comparison
    this.displayComparison(baselineMetrics, currentMetrics);
  }

  private displayComparison(baseline: PerformanceMetrics, current: PerformanceMetrics) {
    console.log('  \x1b[1;37mPerformance Comparison:\x1b[0m\n');

    const comparisons = [
      {
        name: 'Total Duration',
        baseline: baseline.totalDuration,
        current: current.totalDuration,
        unit: 's',
        lowerIsBetter: true,
      },
      {
        name: 'Throughput',
        baseline: baseline.throughput,
        current: current.throughput,
        unit: ' msg/sec',
        lowerIsBetter: false,
      },
      {
        name: 'Avg Response Time',
        baseline: baseline.avgResponseTime,
        current: current.avgResponseTime,
        unit: 'ms',
        lowerIsBetter: true,
      },
      {
        name: 'Max Response Time',
        baseline: baseline.maxResponseTime,
        current: current.maxResponseTime,
        unit: 'ms',
        lowerIsBetter: true,
      },
    ];

    comparisons.forEach(comp => {
      const diff = comp.current - comp.baseline;
      const percentChange = (diff / comp.baseline) * 100;

      const improved = comp.lowerIsBetter ? diff < 0 : diff > 0;
      const color = improved ? '\x1b[0;32m' : '\x1b[0;31m';
      const symbol = improved ? '↓' : '↑';
      const sign = diff > 0 ? '+' : '';

      console.log(`    ${comp.name}:`);
      console.log(`      Baseline: ${comp.baseline.toFixed(2)}${comp.unit}`);
      console.log(`      Current:  ${comp.current.toFixed(2)}${comp.unit}`);
      console.log(`      Change:   ${color}${sign}${diff.toFixed(2)}${comp.unit} (${sign}${percentChange.toFixed(1)}%) ${symbol}\x1b[0m`);
      console.log('');
    });
  }
}

// Run
const profiler = new XIMPerformanceProfiler();
profiler.run().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
