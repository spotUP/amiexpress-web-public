#!/usr/bin/env ts-node
/**
 * Comprehensive Door Testing Script
 * Tests ALL installed doors and captures detailed execution information
 *
 * Usage:
 *   npx ts-node -P dev/scripts/tsconfig.json dev/scripts/test-all-doors.ts [options]
 *
 * Options:
 *   --timeout <ms>      Timeout per door in milliseconds (default: 5000)
 *   --output <file>     Output report file (default: /tmp/door-test-report.txt)
 *   --verbose           Show detailed output during testing
 *   --filter <pattern>  Only test doors matching pattern (e.g., "WHO,RTW,B")
 */

import * as fs from 'fs';
import * as path from 'path';
import { spawn } from 'child_process';
import { sessionLogManager } from '../../web/backend/src/services/SessionLogManager';
import { parseInfoFile } from '../../web/backend/src/utils/amiga-command-parser.util';

interface DoorTestResult {
  command: string;
  doorPath: string;
  type: string;
  status: 'SUCCESS' | 'TIMEOUT' | 'ERROR' | 'CRASH' | 'NOT_FOUND';
  duration: number;
  output: string;
  error: string;
  exitCode: number | null;
  signal: string | null;
  stdoutLines: number;
  stderrLines: number;
  timestamp: string;
}

interface TestOptions {
  timeout: number;
  outputFile: string;
  verbose: boolean;
  filter: string[];
}

class DoorTester {
  private results: DoorTestResult[] = [];
  private options: TestOptions;
  private startTime: number = 0;
  private sessionId: string;

  constructor(options: TestOptions) {
    this.options = options;
    // Create a session for test output
    this.sessionId = `door-test-${Date.now()}`;
    sessionLogManager.startSession(this.sessionId, undefined, 'Door Testing Script', 999);
  }

  /**
   * Log to both console and session log
   */
  private log(message: string, type: 'info' | 'success' | 'error' | 'warn' = 'info'): void {
    const colorCodes = {
      info: '\x1b[36m',    // Cyan
      success: '\x1b[32m', // Green
      error: '\x1b[31m',   // Red
      warn: '\x1b[33m'     // Yellow
    };
    const reset = '\x1b[0m';

    const coloredMessage = `${colorCodes[type]}${message}${reset}`;
    console.log(message); // Plain to console
    sessionLogManager.captureOutput(this.sessionId, coloredMessage + '\n'); // Colored to session log
  }

  /**
   * Scan for all installed doors
   */
  private scanDoors(): Array<{ command: string; path: string; type: string; doorType?: string }> {
    const doorsDir = path.join(process.cwd(), 'Doors');
    const doors: Array<{ command: string; path: string; type: string; doorType?: string }> = [];

    if (!fs.existsSync(doorsDir)) {
      console.log('[ERROR] Doors directory not found:', doorsDir);
      return doors;
    }

    // Scan door directories
    const doorEntries = fs.readdirSync(doorsDir, { withFileTypes: true });

    for (const entry of doorEntries) {
      if (!entry.isDirectory()) continue;

      const doorName = entry.name;
      const doorDir = path.join(doorsDir, doorName);

      // Look for executable with same name (case insensitive)
      const files = fs.readdirSync(doorDir);
      const executable = files.find(
        f => f.toLowerCase() === doorName.toLowerCase() && !f.includes('.')
      );

      if (executable) {
        const execPath = path.join(doorDir, executable);
        const stats = fs.statSync(execPath);

        if (stats.isFile()) {
          // Determine type by reading first few bytes
          const buf = Buffer.alloc(4);
          const fd = fs.openSync(execPath, 'r');
          fs.readSync(fd, buf, 0, 4, 0);
          fs.closeSync(fd);

          const magic = buf.readUInt32BE(0);
          const type = magic === 0x000003F3 ? '68K Amiga' : 'Unknown';

          // Read .info file to get door type (XIM, MAIN, DOOR, etc.)
          // .info files are in Commands/BBSCmd/ or Commands/SYSCmd/, not in Doors/
          // Door names in .info files may differ from folder names, so we need to match by LOCATION
          let doorType: string | undefined = undefined;
          const commandDirs = ['Commands/BBSCmd', 'Commands/SYSCmd'];

          for (const cmdDir of commandDirs) {
            // Try exact name match first
            const exactPath = path.join(process.cwd(), cmdDir, `${doorName.toUpperCase()}.info`);
            if (fs.existsSync(exactPath)) {
              try {
                const tooltypes = parseInfoFile(exactPath);
                doorType = tooltypes.get('TYPE');
                if (doorType) {
                  console.log(`[scanDoors] ${doorName}: TYPE=${doorType} (from ${cmdDir}/${doorName.toUpperCase()}.info)`);
                }
                break;
              } catch (err) {
                console.warn(`[scanDoors] Failed to read .info for ${doorName}:`, err);
              }
            }
          }

          // If not found by name, search all .info files and match by LOCATION
          if (!doorType) {
            for (const cmdDir of commandDirs) {
              const cmdDirPath = path.join(process.cwd(), cmdDir);
              if (fs.existsSync(cmdDirPath)) {
                const infoFiles = fs.readdirSync(cmdDirPath).filter(f => f.endsWith('.info'));
                for (const infoFile of infoFiles) {
                  const infoPath = path.join(cmdDirPath, infoFile);
                  try {
                    const tooltypes = parseInfoFile(infoPath);
                    const location = tooltypes.get('LOCATION');
                    if (location) {
                      // Normalize location path (BBS:doors/bytekiller/bytekiller -> Doors/bytekiller/bytekiller)
                      const normalizedLocation = location
                        .replace(/^BBS:/i, '')
                        .replace(/:/g, '/')
                        .toLowerCase();
                      const normalizedDoorPath = execPath.toLowerCase();

                      if (normalizedDoorPath.includes(normalizedLocation)) {
                        doorType = tooltypes.get('TYPE');
                        if (doorType) {
                          console.log(`[scanDoors] ${doorName}: TYPE=${doorType} (matched via LOCATION in ${cmdDir}/${infoFile})`);
                        }
                        break;
                      }
                    }
                  } catch (err) {
                    // Ignore parsing errors for individual files
                  }
                }
                if (doorType) break;
              }
            }
          }

          doors.push({
            command: doorName.toUpperCase(),
            path: execPath,
            type,
            doorType
          });
        }
      }
    }

    return doors;
  }

  /**
   * Test a single door
   */
  private async testDoor(
    command: string,
    doorPath: string,
    doorType: string,
    doorTypeFromInfo?: string
  ): Promise<DoorTestResult> {
    const testStart = Date.now();
    let output = '';
    let error = '';
    let exitCode: number | null = null;
    let signal: string | null = null;
    let status: DoorTestResult['status'] = 'SUCCESS';

    if (!fs.existsSync(doorPath)) {
      return {
        command,
        doorPath,
        type: doorType,
        status: 'NOT_FOUND',
        duration: 0,
        output: '',
        error: `Door executable not found: ${doorPath}`,
        exitCode: null,
        signal: null,
        stdoutLines: 0,
        stderrLines: 0,
        timestamp: new Date().toISOString()
      };
    }

    if (this.options.verbose) {
      console.log(`\n[TEST] ${command} (${doorType})`);
      console.log(`  Path: ${doorPath}`);
    }

    return new Promise((resolve) => {
      // Set up environment
      const env = {
        ...process.env,
        BBS_DATA_DIR: process.cwd(),
        AEDOOR_STDOUT: `/tmp/${command.toLowerCase()}_test.out`,
        AEDOOR_ROM: 'kickstart'
      };

      // Spawn door via run-amiga-door.js
      const args = [
        'web/backend/dist/scripts/run-amiga-door.js',
        doorPath,
        '1' // node ID
      ];

      // Add --doortype if specified in .info file
      if (doorTypeFromInfo) {
        args.push('--doortype', doorTypeFromInfo);
      }

      const child = spawn(
        'node',
        args,
        {
          env,
          timeout: this.options.timeout,
          cwd: process.cwd()
        }
      );

      let timedOut = false;
      const timeout = setTimeout(() => {
        timedOut = true;
        child.kill('SIGKILL');
      }, this.options.timeout);

      child.stdout?.on('data', (data) => {
        const chunk = data.toString();
        output += chunk;
        if (this.options.verbose) {
          process.stdout.write(chunk);
        }
      });

      child.stderr?.on('data', (data) => {
        const chunk = data.toString();
        error += chunk;
        if (this.options.verbose) {
          process.stderr.write(chunk);
        }
      });

      child.on('error', (err) => {
        error += `Process error: ${err.message}\n`;
        status = 'ERROR';
      });

      child.on('exit', (code, sig) => {
        clearTimeout(timeout);
        exitCode = code;
        signal = sig;

        if (timedOut) {
          status = 'TIMEOUT';
        } else if (code !== 0 && code !== null) {
          status = 'ERROR';
        } else if (signal) {
          status = 'CRASH';
        }

        const duration = Date.now() - testStart;
        const stdoutLines = output.split('\n').length;
        const stderrLines = error.split('\n').length;

        if (this.options.verbose) {
          console.log(`  Status: ${status}`);
          console.log(`  Duration: ${duration}ms`);
          console.log(`  Exit Code: ${exitCode}`);
          console.log(`  Signal: ${signal || 'none'}`);
          console.log(`  Output Lines: ${stdoutLines}`);
          console.log(`  Error Lines: ${stderrLines}`);
        }

        resolve({
          command,
          doorPath,
          type: doorType,
          status,
          duration,
          output,
          error,
          exitCode,
          signal,
          stdoutLines,
          stderrLines,
          timestamp: new Date().toISOString()
        });
      });
    });
  }

  /**
   * Run tests on all doors
   */
  async runTests(): Promise<void> {
    this.startTime = Date.now();

    this.log('===============================================');
    this.log('  AmiExpress-Web BBS - Door Test Suite');
    this.log('===============================================');
    this.log(`Timeout per door: ${this.options.timeout}ms`);
    this.log(`Output file: ${this.options.outputFile}`);
    this.log('');

    // Scan for doors
    const doors = this.scanDoors();
    this.log(`Found ${doors.length} doors to test\n`);

    if (doors.length === 0) {
      this.log('[WARNING] No doors found in Doors/ directory', 'warn');
      return;
    }

    // Filter doors if filter specified
    let doorsToTest = doors;
    if (this.options.filter.length > 0) {
      doorsToTest = doors.filter(d =>
        this.options.filter.some(f => d.command.toLowerCase().includes(f.toLowerCase()))
      );
      this.log(`Filtered to ${doorsToTest.length} doors: ${this.options.filter.join(', ')}\n`);
    }

    // Test each door
    for (let i = 0; i < doorsToTest.length; i++) {
      const door = doorsToTest[i];
      const typeInfo = door.doorType ? ` (TYPE=${door.doorType})` : '';
      this.log(`[${i + 1}/${doorsToTest.length}] Testing ${door.command}${typeInfo}...`, 'info');

      const result = await this.testDoor(door.command, door.path, door.type, door.doorType);
      this.results.push(result);

      // Brief status
      const statusSymbol = {
        'SUCCESS': '[OK]',
        'TIMEOUT': '[TIMEOUT]',
        'ERROR': '[ERROR]',
        'CRASH': '[CRASH]',
        'NOT_FOUND': '[NOT FOUND]'
      }[result.status];

      const statusType = result.status === 'SUCCESS' ? 'success' :
                        result.status === 'TIMEOUT' ? 'warn' : 'error';
      this.log(`  ${statusSymbol} ${result.duration}ms`, statusType);
    }

    this.log('\n===============================================');
    this.log('  Test Summary');
    this.log('===============================================');
    this.printSummary();
    this.saveReport();

    // End session
    sessionLogManager.endSession(this.sessionId);
  }

  /**
   * Print summary statistics
   */
  private printSummary(): void {
    const total = this.results.length;
    const success = this.results.filter(r => r.status === 'SUCCESS').length;
    const timeout = this.results.filter(r => r.status === 'TIMEOUT').length;
    const error = this.results.filter(r => r.status === 'ERROR').length;
    const crash = this.results.filter(r => r.status === 'CRASH').length;
    const notFound = this.results.filter(r => r.status === 'NOT_FOUND').length;

    this.log(`Total Doors Tested: ${total}`);
    this.log(`  [OK] Success:    ${success} (${((success / total) * 100).toFixed(1)}%)`, 'success');
    this.log(`  [TIMEOUT]:       ${timeout} (${((timeout / total) * 100).toFixed(1)}%)`, timeout > 0 ? 'warn' : 'info');
    this.log(`  [ERROR]:         ${error} (${((error / total) * 100).toFixed(1)}%)`, error > 0 ? 'error' : 'info');
    this.log(`  [CRASH]:         ${crash} (${((crash / total) * 100).toFixed(1)}%)`, crash > 0 ? 'error' : 'info');
    this.log(`  [NOT FOUND]:     ${notFound} (${((notFound / total) * 100).toFixed(1)}%)`, notFound > 0 ? 'warn' : 'info');

    const totalTime = Date.now() - this.startTime;
    this.log(`\nTotal Test Time: ${(totalTime / 1000).toFixed(2)}s`, 'success');
  }

  /**
   * Save detailed report to file
   */
  private saveReport(): void {
    let report = '';
    report += '================================================================\n';
    report += '  AmiExpress-Web BBS - Door Test Report\n';
    report += `  Generated: ${new Date().toISOString()}\n`;
    report += '================================================================\n\n';

    // Summary
    report += 'SUMMARY\n';
    report += '-------\n';
    const total = this.results.length;
    const byStatus = {
      'SUCCESS': this.results.filter(r => r.status === 'SUCCESS').length,
      'TIMEOUT': this.results.filter(r => r.status === 'TIMEOUT').length,
      'ERROR': this.results.filter(r => r.status === 'ERROR').length,
      'CRASH': this.results.filter(r => r.status === 'CRASH').length,
      'NOT_FOUND': this.results.filter(r => r.status === 'NOT_FOUND').length
    };

    Object.entries(byStatus).forEach(([status, count]) => {
      report += `${status.padEnd(12)}: ${count.toString().padStart(3)} (${((count / total) * 100).toFixed(1)}%)\n`;
    });
    report += `Total          : ${total}\n\n`;

    // Detailed results
    report += 'DETAILED RESULTS\n';
    report += '================\n\n';

    for (const result of this.results) {
      report += `Door: ${result.command}\n`;
      report += `  Path: ${result.doorPath}\n`;
      report += `  Type: ${result.type}\n`;
      report += `  Status: ${result.status}\n`;
      report += `  Duration: ${result.duration}ms\n`;
      report += `  Exit Code: ${result.exitCode}\n`;
      report += `  Signal: ${result.signal || 'none'}\n`;
      report += `  Output Lines: ${result.stdoutLines}\n`;
      report += `  Error Lines: ${result.stderrLines}\n`;
      report += `  Timestamp: ${result.timestamp}\n`;

      if (result.error) {
        report += '\n  ERRORS:\n';
        report += result.error.split('\n').map(line => `    ${line}`).join('\n');
        report += '\n';
      }

      if (result.output && result.stdoutLines > 0) {
        const outputPreview = result.output.substring(0, 500);
        report += '\n  OUTPUT PREVIEW (first 500 chars):\n';
        report += outputPreview.split('\n').map(line => `    ${line}`).join('\n');
        if (result.output.length > 500) {
          report += '\n    ... (truncated)\n';
        }
        report += '\n';
      }

      report += '\n' + '-'.repeat(60) + '\n\n';
    }

    // Failed doors section
    const failed = this.results.filter(r => r.status !== 'SUCCESS');
    if (failed.length > 0) {
      report += 'FAILED DOORS\n';
      report += '============\n\n';
      for (const result of failed) {
        report += `${result.command} - ${result.status}\n`;
        if (result.error) {
          const firstError = result.error.split('\n')[0];
          report += `  Error: ${firstError}\n`;
        }
      }
      report += '\n';
    }

    // Write report
    fs.writeFileSync(this.options.outputFile, report, 'utf8');
    this.log(`\nDetailed report saved to: ${this.options.outputFile}`, 'success');
  }
}

// Parse command line arguments
function parseArgs(): TestOptions {
  const args = process.argv.slice(2);
  const options: TestOptions = {
    timeout: 5000,
    outputFile: '/tmp/door-test-report.txt',
    verbose: false,
    filter: []
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '--timeout' && i + 1 < args.length) {
      options.timeout = parseInt(args[++i], 10);
    } else if (arg === '--output' && i + 1 < args.length) {
      options.outputFile = args[++i];
    } else if (arg === '--verbose') {
      options.verbose = true;
    } else if (arg === '--filter' && i + 1 < args.length) {
      options.filter = args[++i].split(',').map(s => s.trim());
    } else if (arg === '--help') {
      console.log('Usage: test-all-doors.ts [options]');
      console.log('');
      console.log('Options:');
      console.log('  --timeout <ms>      Timeout per door in milliseconds (default: 5000)');
      console.log('  --output <file>     Output report file (default: /tmp/door-test-report.txt)');
      console.log('  --verbose           Show detailed output during testing');
      console.log('  --filter <pattern>  Only test doors matching pattern (e.g., "WHO,RTW,B")');
      console.log('  --help              Show this help message');
      process.exit(0);
    }
  }

  return options;
}

// Main execution
async function main() {
  const options = parseArgs();
  const tester = new DoorTester(options);

  try {
    await tester.runTests();
    process.exit(0);
  } catch (error) {
    console.error('[FATAL] Test suite error:', error);
    process.exit(1);
  }
}

main();
