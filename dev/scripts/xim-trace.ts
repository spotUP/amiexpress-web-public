#!/usr/bin/env npx tsx
/**
 * XIM Access Tracer - Trace file, library, and memory access from doors
 *
 * Analyzes XIM logs and backend logs to show comprehensive access patterns.
 *
 * Usage:
 *   npx tsx dev/scripts/xim-trace.ts [options]
 *
 * Options:
 *   --door NAME         Trace specific door only
 *   --type TYPE        Trace type: file, library, memory, all (default: all)
 *   --file PATH        Custom XIM log file path
 *   --backend PATH     Custom backend log file path
 *   --summary          Show summary only (no details)
 *
 * Examples:
 *   npm run xim:trace              # Trace all access types
 *   npm run xim:trace -- --door WHO --type file  # File access for WHO door
 *   npm run xim:trace -- --summary  # Summary only
 */

import * as fs from 'fs';
import * as readline from 'readline';

interface TraceEntry {
  timestamp: string;
  door: string;
  node: number;
  type: 'file' | 'library' | 'memory';
  operation: string;
  details: Record<string, any>;
}

interface TraceSummary {
  fileAccess: Map<string, number>;
  libraryAccess: Map<string, number>;
  memoryAccess: Map<string, number>;
  totalFiles: number;
  totalLibraries: number;
  totalMemory: number;
}

class XIMTracer {
  private ximLogFile: string;
  private backendLogFile: string;
  private doorFilter: string | null = null;
  private traceType: 'file' | 'library' | 'memory' | 'all' = 'all';
  private summaryOnly: boolean = false;

  private traces: TraceEntry[] = [];
  private summary: TraceSummary = {
    fileAccess: new Map(),
    libraryAccess: new Map(),
    memoryAccess: new Map(),
    totalFiles: 0,
    totalLibraries: 0,
    totalMemory: 0,
  };

  constructor() {
    this.parseArgs();
    this.ximLogFile = process.env.XIM_LOG_FILE || 'logs/xim-debug.json';
    this.backendLogFile = 'logs/backend.log';
  }

  private parseArgs() {
    const args = process.argv.slice(2);

    for (let i = 0; i < args.length; i++) {
      switch (args[i]) {
        case '--door':
          this.doorFilter = args[++i];
          break;
        case '--type':
          const type = args[++i];
          if (['file', 'library', 'memory', 'all'].includes(type)) {
            this.traceType = type as any;
          } else {
            console.error(`[ERROR] Invalid type: ${type}`);
            process.exit(1);
          }
          break;
        case '--file':
          this.ximLogFile = args[++i];
          break;
        case '--backend':
          this.backendLogFile = args[++i];
          break;
        case '--summary':
          this.summaryOnly = true;
          break;
        case '--help':
          this.printHelp();
          process.exit(0);
      }
    }
  }

  private printHelp() {
    console.log(`
XIM Access Tracer - Trace file, library, and memory access from doors

Usage:
  npx tsx dev/scripts/xim-trace.ts [options]

Options:
  --door NAME         Trace specific door only
  --type TYPE         Trace type: file, library, memory, all (default: all)
  --file PATH         Custom XIM log file path
  --backend PATH      Custom backend log file path
  --summary           Show summary only (no details)
  --help              Show this help

Examples:
  npx tsx dev/scripts/xim-trace.ts              # Trace all access types
  npx tsx dev/scripts/xim-trace.ts --door WHO --type file  # File access for WHO
  npx tsx dev/scripts/xim-trace.ts --summary    # Summary only

Environment:
  XIM_LOG_FILE        Default XIM log file path (default: logs/xim-debug.json)
`);
  }

  async run() {
    this.printHeader();

    // Check if log files exist
    if (!fs.existsSync(this.ximLogFile)) {
      console.error(`[ERROR] XIM log file not found: ${this.ximLogFile}`);
      console.error('Make sure XIM_DEBUG_JSON=1 is set when running the backend.');
      process.exit(1);
    }

    if (!fs.existsSync(this.backendLogFile)) {
      console.warn(`[WARN] Backend log file not found: ${this.backendLogFile}`);
      console.warn('Some traces may be incomplete.\n');
    }

    // Analyze logs
    await this.analyzeLogs();

    // Display results
    if (this.summaryOnly) {
      this.printSummary();
    } else {
      this.printTraces();
      this.printSummary();
    }
  }

  private printHeader() {
    console.log('\x1b[1;36m╔═══════════════════════════════════════════════════════════════╗\x1b[0m');
    console.log('\x1b[1;36m║                       XIM Access Tracer                        ║\x1b[0m');
    console.log('\x1b[1;36m╚═══════════════════════════════════════════════════════════════╝\x1b[0m');

    const filters: string[] = [];
    if (this.doorFilter) filters.push(`Door: ${this.doorFilter}`);
    if (this.traceType !== 'all') filters.push(`Type: ${this.traceType}`);

    if (filters.length > 0) {
      console.log(`\x1b[0;33mFilters: ${filters.join(', ')}\x1b[0m`);
    }
    console.log('');
  }

  private async analyzeLogs() {
    // Analyze XIM log
    await this.analyzeXIMLog();

    // Analyze backend log (if exists)
    if (fs.existsSync(this.backendLogFile)) {
      await this.analyzeBackendLog();
    }
  }

  private async analyzeXIMLog() {
    const fileStream = fs.createReadStream(this.ximLogFile);
    const rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity,
    });

    for await (const line of rl) {
      if (line.trim()) {
        try {
          const entry = JSON.parse(line);

          // Apply filters
          if (this.doorFilter && entry.door !== this.doorFilter) continue;
          if (entry.door === 'SYSTEM') continue;

          // Extract traces from XIM messages
          this.extractTracesFromXIM(entry);
        } catch (err) {
          // Ignore invalid JSON
        }
      }
    }
  }

  private async analyzeBackendLog() {
    const fileStream = fs.createReadStream(this.backendLogFile);
    const rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity,
    });

    for await (const line of rl) {
      // Extract file access traces
      if (this.traceType === 'all' || this.traceType === 'file') {
        this.extractFileAccess(line);
      }

      // Extract library access traces
      if (this.traceType === 'all' || this.traceType === 'library') {
        this.extractLibraryAccess(line);
      }

      // Extract memory access traces
      if (this.traceType === 'all' || this.traceType === 'memory') {
        this.extractMemoryAccess(line);
      }
    }
  }

  private extractTracesFromXIM(entry: any) {
    // XIM messages can indicate certain operations
    // This is a demonstration - actual implementation would parse specific message types

    if (entry.message.type === 'JH_REQUEST' && entry.message.dataText) {
      // Might be requesting file/data
      const trace: TraceEntry = {
        timestamp: entry.timestamp,
        door: entry.door,
        node: entry.node,
        type: 'file',
        operation: 'REQUEST',
        details: {
          data: entry.message.dataText,
        },
      };
      this.addTrace(trace);
    }
  }

  private extractFileAccess(line: string) {
    // Look for file operations in backend log
    const patterns = [
      /Open\((.*?)\)/,
      /Read\((.*?)\)/,
      /Write\((.*?)\)/,
      /Close\((.*?)\)/,
      /Lock\((.*?)\)/,
      /Examine\((.*?)\)/,
    ];

    for (const pattern of patterns) {
      const match = line.match(pattern);
      if (match) {
        const operation = match[0].split('(')[0];
        const filepath = match[1];

        // Try to extract door name from log line
        const doorMatch = line.match(/\[([A-Z_]+)\]/);
        const door = doorMatch ? doorMatch[1] : 'UNKNOWN';

        // Apply filter
        if (this.doorFilter && door !== this.doorFilter) continue;

        const trace: TraceEntry = {
          timestamp: new Date().toISOString(),
          door,
          node: 1, // Would need to parse from log
          type: 'file',
          operation,
          details: {
            path: filepath,
          },
        };
        this.addTrace(trace);
        break;
      }
    }
  }

  private extractLibraryAccess(line: string) {
    // Look for library calls
    const patterns = [
      /OpenLibrary\("(.*?)"/,
      /CloseLibrary\((.*?)\)/,
      /FindPort\("(.*?)"/,
      /CreatePort\("(.*?)"/,
    ];

    for (const pattern of patterns) {
      const match = line.match(pattern);
      if (match) {
        const operation = match[0].split('(')[0];
        const libName = match[1];

        const doorMatch = line.match(/\[([A-Z_]+)\]/);
        const door = doorMatch ? doorMatch[1] : 'UNKNOWN';

        if (this.doorFilter && door !== this.doorFilter) continue;

        const trace: TraceEntry = {
          timestamp: new Date().toISOString(),
          door,
          node: 1,
          type: 'library',
          operation,
          details: {
            library: libName,
          },
        };
        this.addTrace(trace);
        break;
      }
    }
  }

  private extractMemoryAccess(line: string) {
    // Look for memory operations
    const patterns = [
      /AllocMem\((\d+)/,
      /FreeMem\(0x([0-9a-fA-F]+)/,
      /CopyMem\(0x([0-9a-fA-F]+)/,
      /Read32\(0x([0-9a-fA-F]+)/,
      /Write32\(0x([0-9a-fA-F]+)/,
    ];

    for (const pattern of patterns) {
      const match = line.match(pattern);
      if (match) {
        const operation = match[0].split('(')[0];
        const value = match[1];

        const doorMatch = line.match(/\[([A-Z_]+)\]/);
        const door = doorMatch ? doorMatch[1] : 'UNKNOWN';

        if (this.doorFilter && door !== this.doorFilter) continue;

        const trace: TraceEntry = {
          timestamp: new Date().toISOString(),
          door,
          node: 1,
          type: 'memory',
          operation,
          details: {
            value,
          },
        };
        this.addTrace(trace);
        break;
      }
    }
  }

  private addTrace(trace: TraceEntry) {
    this.traces.push(trace);

    // Update summary
    if (trace.type === 'file') {
      const key = trace.details.path || 'UNKNOWN';
      this.summary.fileAccess.set(key, (this.summary.fileAccess.get(key) || 0) + 1);
      this.summary.totalFiles++;
    } else if (trace.type === 'library') {
      const key = trace.details.library || 'UNKNOWN';
      this.summary.libraryAccess.set(key, (this.summary.libraryAccess.get(key) || 0) + 1);
      this.summary.totalLibraries++;
    } else if (trace.type === 'memory') {
      const key = trace.operation;
      this.summary.memoryAccess.set(key, (this.summary.memoryAccess.get(key) || 0) + 1);
      this.summary.totalMemory++;
    }
  }

  private printTraces() {
    if (this.traces.length === 0) {
      console.log('  \x1b[0;33mNo traces found\x1b[0m\n');
      return;
    }

    console.log('\x1b[1;37m  ACCESS TRACES\x1b[0m');
    console.log('  ───────────────────────────────────────────────────────────');
    console.log('');

    // Group by door
    const byDoor = new Map<string, TraceEntry[]>();
    for (const trace of this.traces) {
      const list = byDoor.get(trace.door) || [];
      list.push(trace);
      byDoor.set(trace.door, list);
    }

    for (const [door, traces] of byDoor) {
      console.log(`  \x1b[1;36m${door}\x1b[0m (${traces.length} traces)`);
      console.log('');

      for (const trace of traces.slice(0, 20)) { // Show max 20 per door
        const time = this.formatTime(trace.timestamp);
        const color = this.getTraceColor(trace.type);
        const icon = this.getTraceIcon(trace.type);

        console.log(`    ${color}${icon} [${time}] ${trace.operation}\x1b[0m`);

        const details = Object.entries(trace.details);
        for (const [key, value] of details) {
          console.log(`       ${key}: ${value}`);
        }
        console.log('');
      }

      if (traces.length > 20) {
        console.log(`    \x1b[0;37m... and ${traces.length - 20} more\x1b[0m`);
        console.log('');
      }
    }
  }

  private printSummary() {
    console.log('\n\x1b[1;36m╔═══════════════════════════════════════════════════════════════╗\x1b[0m');
    console.log('\x1b[1;36m║                        Trace Summary                           ║\x1b[0m');
    console.log('\x1b[1;36m╚═══════════════════════════════════════════════════════════════╝\x1b[0m\n');

    // File access summary
    if (this.traceType === 'all' || this.traceType === 'file') {
      console.log('  \x1b[1;37mFile Access:\x1b[0m');
      console.log(`    Total: ${this.summary.totalFiles}`);

      if (this.summary.fileAccess.size > 0) {
        const sorted = Array.from(this.summary.fileAccess.entries())
          .sort((a, b) => b[1] - a[1]);
        for (const [path, count] of sorted.slice(0, 10)) {
          console.log(`      ${count}x  ${path}`);
        }
        if (sorted.length > 10) {
          console.log(`      ... and ${sorted.length - 10} more`);
        }
      }
      console.log('');
    }

    // Library access summary
    if (this.traceType === 'all' || this.traceType === 'library') {
      console.log('  \x1b[1;37mLibrary Access:\x1b[0m');
      console.log(`    Total: ${this.summary.totalLibraries}`);

      if (this.summary.libraryAccess.size > 0) {
        const sorted = Array.from(this.summary.libraryAccess.entries())
          .sort((a, b) => b[1] - a[1]);
        for (const [lib, count] of sorted) {
          console.log(`      ${count}x  ${lib}`);
        }
      }
      console.log('');
    }

    // Memory access summary
    if (this.traceType === 'all' || this.traceType === 'memory') {
      console.log('  \x1b[1;37mMemory Access:\x1b[0m');
      console.log(`    Total: ${this.summary.totalMemory}`);

      if (this.summary.memoryAccess.size > 0) {
        const sorted = Array.from(this.summary.memoryAccess.entries())
          .sort((a, b) => b[1] - a[1]);
        for (const [op, count] of sorted) {
          console.log(`      ${count}x  ${op}`);
        }
      }
      console.log('');
    }
  }

  private getTraceColor(type: string): string {
    switch (type) {
      case 'file': return '\x1b[0;36m';
      case 'library': return '\x1b[0;32m';
      case 'memory': return '\x1b[0;35m';
      default: return '\x1b[0;37m';
    }
  }

  private getTraceIcon(type: string): string {
    switch (type) {
      case 'file': return 'F';
      case 'library': return 'L';
      case 'memory': return 'M';
      default: return '?';
    }
  }

  private formatTime(timestamp: string): string {
    const date = new Date(timestamp);
    return date.toTimeString().split(' ')[0];
  }
}

// Run tracer
const tracer = new XIMTracer();
tracer.run().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
