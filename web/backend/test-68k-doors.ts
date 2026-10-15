/**
 * Comprehensive 68K Door Test Suite
 *
 * Tests all installed 68K doors and generates a report showing:
 * - Which doors work correctly
 * - Which doors fail and why
 * - Timeout/hang detection
 * - XIM message activity
 *
 * Usage: cd web/backend && npx tsx test-68k-doors.ts [--timeout=15] [--filter=pattern]
 */
import 'reflect-metadata';
import * as fs from 'fs';
import * as path from 'path';
import { AmigaDoorSession } from './src/amiga-emulation/AmigaDoorSession';

const BBS_ROOT = '~/Code/amiexpress-web';

interface DoorConfig {
  command: string;
  type: 'XIM' | 'SIM' | 'TIM';
  location: string;
  args?: string;
}

interface TestResult {
  command: string;
  type: string;
  location: string;
  status: 'PASS' | 'FAIL' | 'TIMEOUT' | 'SKIP' | 'NOT_FOUND';
  duration: number;
  output: string;
  error?: string;
  ximMessages?: number;
}

// Parse command line args
const args = process.argv.slice(2);
const timeoutArg = args.find(a => a.startsWith('--timeout='));
const filterArg = args.find(a => a.startsWith('--filter='));
const DOOR_TIMEOUT = timeoutArg ? parseInt(timeoutArg.split('=')[1]) * 1000 : 15000;
const FILTER = filterArg ? filterArg.split('=')[1].toLowerCase() : null;

/**
 * Parse .info file to extract door configuration
 */
function parseInfoFile(infoPath: string): { type?: string; location?: string } {
  try {
    const content = fs.readFileSync(infoPath);
    const text = content.toString('latin1');

    // Extract TYPE and LOCATION from the strings in the file
    const typeMatch = text.match(/TYPE=(\w+)/);
    const locationMatch = text.match(/LOCATION=([^\s\x00]+)/);

    return {
      type: typeMatch ? typeMatch[1] : undefined,
      location: locationMatch ? locationMatch[1] : undefined
    };
  } catch {
    return {};
  }
}

/**
 * Resolve Amiga-style path to filesystem path
 * Uses case-insensitive matching to handle Amiga's case-insensitive filesystem
 */
function resolveAmigaPath(amigaPath: string): string {
  if (!amigaPath) return '';

  // Handle DOORS: prefix (case-insensitive)
  let resolved = amigaPath.replace(/^DOORS:/i, 'Doors/');

  // Build full path
  let fullPath = path.join(BBS_ROOT, resolved);

  // Try to find the file case-insensitively
  fullPath = findCaseInsensitive(fullPath);

  // If still not found, try different extensions
  if (!fs.existsSync(fullPath)) {
    // Try with .020 extension (68020 version)
    const with020 = findCaseInsensitive(fullPath + '.020');
    if (fs.existsSync(with020)) {
      return with020;
    }
    // Try with .000 extension (68000 version)
    const with000 = findCaseInsensitive(fullPath + '.000');
    if (fs.existsSync(with000)) {
      return with000;
    }
  }

  return fullPath;
}

/**
 * Find a file path case-insensitively
 */
function findCaseInsensitive(targetPath: string): string {
  const parts = targetPath.split(path.sep);
  let currentPath = '';

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];

    // Handle root path
    if (i === 0) {
      if (part === '') {
        currentPath = '/';
      } else {
        currentPath = part;
      }
      continue;
    }

    const testPath = path.join(currentPath, part);

    // If exact match exists, use it
    if (fs.existsSync(testPath)) {
      currentPath = testPath;
      continue;
    }

    // Try case-insensitive match
    try {
      const entries = fs.readdirSync(currentPath);
      const match = entries.find(e => e.toLowerCase() === part.toLowerCase());
      if (match) {
        currentPath = path.join(currentPath, match);
      } else {
        // No match found, use original
        currentPath = testPath;
      }
    } catch {
      // Directory doesn't exist
      currentPath = testPath;
    }
  }

  return currentPath;
}

/**
 * Find all 68K doors from Commands/BBSCmd/*.info files
 */
function findAllDoors(): DoorConfig[] {
  const doors: DoorConfig[] = [];
  const cmdDir = path.join(BBS_ROOT, 'Commands/BBSCmd');

  if (!fs.existsSync(cmdDir)) {
    console.error('Commands/BBSCmd directory not found');
    return doors;
  }

  const files = fs.readdirSync(cmdDir).filter(f => f.endsWith('.info'));

  for (const file of files) {
    const infoPath = path.join(cmdDir, file);
    const config = parseInfoFile(infoPath);

    // Only include 68K doors (XIM, SIM, TIM)
    if (config.type && ['XIM', 'SIM', 'TIM'].includes(config.type.toUpperCase())) {
      const command = path.basename(file, '.info');

      // Skip if filter specified and doesn't match
      if (FILTER && !command.toLowerCase().includes(FILTER)) {
        continue;
      }

      doors.push({
        command,
        type: config.type.toUpperCase() as 'XIM' | 'SIM' | 'TIM',
        location: config.location || '',
        args: getDefaultArgs(command)
      });
    }
  }

  // Sort by command name
  doors.sort((a, b) => a.command.localeCompare(b.command));

  return doors;
}

/**
 * Get default arguments for specific doors
 */
function getDefaultArgs(command: string): string {
  const cmd = command.toUpperCase();

  // Doors that need specific arguments
  const defaultArgs: Record<string, string> = {
    'N': '1 S U',      // AquaScan newscan
    'NSU': '1 S U',    // AquaScan newscan
    'CS': '1 S',       // AquaScan conf scan
    'SCAN': '1 S',     // AquaScan scan
    'F': '1',          // AquaScan files
    'FR': '1',         // AquaScan file request
    'B': '',           // Bulls - no args
    'J': '1',          // JoinCnf - conference number
    'RTW': '',         // RTW - no args
    'S': '',           // Stats
    'MTOP': '',        // MultiTop
  };

  return defaultArgs[cmd] || '';
}

/**
 * Test a single door
 */
async function testDoor(door: DoorConfig): Promise<TestResult> {
  const startTime = Date.now();
  let output = '';

  // Check if location is specified
  if (!door.location || door.location.trim() === '') {
    return {
      command: door.command,
      type: door.type,
      location: door.location || '(empty)',
      status: 'NOT_FOUND',
      duration: 0,
      output: '',
      error: 'No LOCATION specified in .info file'
    };
  }

  // Resolve the door path
  const doorPath = resolveAmigaPath(door.location);

  // Check if door binary exists
  if (!doorPath || !fs.existsSync(doorPath)) {
    return {
      command: door.command,
      type: door.type,
      location: door.location,
      status: 'NOT_FOUND',
      duration: 0,
      output: '',
      error: `Door binary not found: ${doorPath || '(path resolution failed)'}`
    };
  }

  // Create mock socket
  const mockSocket = {
    emit: (event: string, data: any) => {
      if (event === 'ansi-output' && data?.text) {
        output += data.text;
      }
    },
    on: () => {},
    once: () => {},
    off: () => {},
    id: 'test-' + door.command,
    handshake: { auth: {} },
    data: {},
  };

  // Create door config
  const doorConfig = {
    executablePath: doorPath,
    doorType: door.type,
    args: door.args ? door.args.split(' ').filter(a => a) : [],
    timeout: Math.floor(DOOR_TIMEOUT / 1000),
    bbsSession: {
      nodeId: 1,
      userId: 1,
      username: 'spot',
      currentConf: 1,
      currentConference: 1,  // For BB_CONFNUM handler
      conferenceId: 1,       // Fallback
      bbsRoot: BBS_ROOT,
      inDoorManager: true,
    },
    assigns: {
      'BBS': BBS_ROOT,
      'DOORS': path.join(BBS_ROOT, 'Doors'),
      'Node0': path.join(BBS_ROOT, 'Node0'),
    },
  };

  try {
    // Create session
    const session = new AmigaDoorSession(mockSocket as any, doorConfig);

    // Run door with timeout
    await Promise.race([
      session.start(),
      new Promise<string>((_, reject) =>
        setTimeout(() => reject(new Error('TIMEOUT')), DOOR_TIMEOUT)
      )
    ]);

    const duration = Date.now() - startTime;

    // Check for success indicators in output
    const hasError = output.toLowerCase().includes('error') ||
                     output.toLowerCase().includes('failed') ||
                     output.toLowerCase().includes('not found');

    return {
      command: door.command,
      type: door.type,
      location: door.location,
      status: hasError ? 'FAIL' : 'PASS',
      duration,
      output: output.substring(0, 500),
    };

  } catch (err: any) {
    const duration = Date.now() - startTime;
    const isTimeout = err.message === 'TIMEOUT';

    return {
      command: door.command,
      type: door.type,
      location: door.location,
      status: isTimeout ? 'TIMEOUT' : 'FAIL',
      duration,
      output: output.substring(0, 500),
      error: err.message
    };
  }
}

/**
 * Generate report from test results
 */
function generateReport(results: TestResult[]): string {
  const timestamp = new Date().toISOString();
  const passed = results.filter(r => r.status === 'PASS');
  const failed = results.filter(r => r.status === 'FAIL');
  const timeout = results.filter(r => r.status === 'TIMEOUT');
  const notFound = results.filter(r => r.status === 'NOT_FOUND');
  const skipped = results.filter(r => r.status === 'SKIP');

  let report = `
================================================================================
                     68K DOOR TEST REPORT
================================================================================
Generated: ${timestamp}
Timeout: ${DOOR_TIMEOUT / 1000}s per door
Filter: ${FILTER || 'none'}

SUMMARY
-------
Total Doors:  ${results.length}
PASSED:       ${passed.length} (${Math.round(passed.length / results.length * 100)}%)
FAILED:       ${failed.length}
TIMEOUT:      ${timeout.length}
NOT FOUND:    ${notFound.length}
SKIPPED:      ${skipped.length}

================================================================================
                           PASSED DOORS
================================================================================
`;

  for (const r of passed) {
    report += `
[PASS] ${r.command} (${r.type})
  Location: ${r.location}
  Duration: ${r.duration}ms
  Output: ${r.output.substring(0, 100).replace(/\n/g, ' ').trim() || '(no output)'}
`;
  }

  report += `
================================================================================
                           FAILED DOORS
================================================================================
`;

  for (const r of failed) {
    report += `
[FAIL] ${r.command} (${r.type})
  Location: ${r.location}
  Duration: ${r.duration}ms
  Error: ${r.error || 'Unknown error'}
  Output: ${r.output.substring(0, 200).replace(/\n/g, ' ').trim() || '(no output)'}
`;
  }

  report += `
================================================================================
                          TIMEOUT DOORS
================================================================================
`;

  for (const r of timeout) {
    report += `
[TIMEOUT] ${r.command} (${r.type})
  Location: ${r.location}
  Duration: ${r.duration}ms (timeout at ${DOOR_TIMEOUT / 1000}s)
  Output: ${r.output.substring(0, 200).replace(/\n/g, ' ').trim() || '(no output)'}
`;
  }

  report += `
================================================================================
                        NOT FOUND DOORS
================================================================================
`;

  for (const r of notFound) {
    report += `
[NOT_FOUND] ${r.command} (${r.type})
  Location: ${r.location}
  Error: ${r.error}
`;
  }

  report += `
================================================================================
                        PRIORITY FIX LIST
================================================================================
The following doors should be fixed in priority order:

`;

  // Priority list: Timeouts first (likely fixable), then failures
  const priority = [...timeout, ...failed].slice(0, 20);
  let i = 1;
  for (const r of priority) {
    report += `${i}. ${r.command} (${r.type}) - ${r.status}: ${r.error || 'Check output'}\n`;
    i++;
  }

  report += `
================================================================================
                              END OF REPORT
================================================================================
`;

  return report;
}

/**
 * Main test runner
 */
async function main() {
  console.log('========================================');
  console.log('  68K Door Test Suite');
  console.log('========================================');
  console.log(`Timeout: ${DOOR_TIMEOUT / 1000}s per door`);
  if (FILTER) {
    console.log(`Filter: ${FILTER}`);
  }
  console.log('');

  // Find all 68K doors
  console.log('Scanning for 68K doors...');
  const doors = findAllDoors();
  console.log(`Found ${doors.length} 68K doors to test\n`);

  if (doors.length === 0) {
    console.log('No doors found. Check Commands/BBSCmd/*.info files.');
    return;
  }

  // Test each door
  const results: TestResult[] = [];

  for (let i = 0; i < doors.length; i++) {
    const door = doors[i];
    const progress = `[${i + 1}/${doors.length}]`;

    process.stdout.write(`${progress} Testing ${door.command} (${door.type})... `);

    try {
      const result = await testDoor(door);
      results.push(result);

      // Print result
      switch (result.status) {
        case 'PASS':
          console.log(`PASS (${result.duration}ms)`);
          break;
        case 'FAIL':
          console.log(`FAIL - ${result.error || 'check output'}`);
          break;
        case 'TIMEOUT':
          console.log(`TIMEOUT (${DOOR_TIMEOUT / 1000}s)`);
          break;
        case 'NOT_FOUND':
          console.log(`NOT FOUND`);
          break;
        case 'SKIP':
          console.log(`SKIP`);
          break;
      }
    } catch (err: any) {
      results.push({
        command: door.command,
        type: door.type,
        location: door.location,
        status: 'FAIL',
        duration: 0,
        output: '',
        error: err.message
      });
      console.log(`ERROR - ${err.message}`);
    }

    // Small delay between doors to allow cleanup
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  // Generate and save report
  console.log('\nGenerating report...');
  const report = generateReport(results);

  const reportPath = path.join(BBS_ROOT, 'logs', `68k-door-test-report-${Date.now()}.txt`);
  const latestPath = path.join(BBS_ROOT, 'logs', '68k-door-test-report-latest.txt');

  // Ensure logs directory exists
  const logsDir = path.join(BBS_ROOT, 'logs');
  if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
  }

  fs.writeFileSync(reportPath, report);
  fs.writeFileSync(latestPath, report);

  console.log(`\nReport saved to:\n  ${reportPath}\n  ${latestPath}`);

  // Print summary
  const passed = results.filter(r => r.status === 'PASS').length;
  const failed = results.filter(r => r.status === 'FAIL').length;
  const timeout = results.filter(r => r.status === 'TIMEOUT').length;
  const notFound = results.filter(r => r.status === 'NOT_FOUND').length;

  console.log('\n========================================');
  console.log('  SUMMARY');
  console.log('========================================');
  console.log(`PASSED:    ${passed}/${results.length}`);
  console.log(`FAILED:    ${failed}`);
  console.log(`TIMEOUT:   ${timeout}`);
  console.log(`NOT FOUND: ${notFound}`);
  console.log('========================================\n');
}

// Run tests
main().catch(console.error);
