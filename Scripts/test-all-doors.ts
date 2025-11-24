/**
 * Comprehensive Door Testing Script
 * Tests all doors and documents their status
 */

const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const DOOR_TEST_TIMEOUT = 15000; // 15 seconds per door
const DOOR_WAIT_TIME = 5000; // 5 seconds to observe door behavior

// List all door directories
function getAllDoors() {
  const doorsPath = path.join(__dirname, '..', 'Doors');
  const dirs = fs.readdirSync(doorsPath)
    .filter(name => {
      const fullPath = path.join(doorsPath, name);
      return fs.statSync(fullPath).isDirectory();
    })
    .sort();

  console.log(`Found ${dirs.length} door directories`);
  return dirs;
}

// Find executable in door directory
function findDoorExecutable(doorName) {
  const doorPath = path.join(__dirname, '..', 'Doors', doorName);

  // Common executable patterns
  const patterns = [
    doorName,
    doorName.toLowerCase(),
    doorName.toUpperCase(),
    `${doorName}.000`,
    `${doorName}.030`
  ];

  for (const pattern of patterns) {
    const fullPath = path.join(doorPath, pattern);
    if (fs.existsSync(fullPath)) {
      const stats = fs.statSync(fullPath);
      if (stats.isFile() && stats.size > 0) {
        return pattern;
      }
    }
  }

  // List all files to see what's there
  const files = fs.readdirSync(doorPath);
  const binaryFiles = files.filter(f => {
    const fullPath = path.join(doorPath, f);
    const stats = fs.statSync(fullPath);
    return stats.isFile() && !f.includes('.') && stats.size > 0;
  });

  if (binaryFiles.length > 0) {
    return binaryFiles[0];
  }

  return null;
}

// Sleep helper
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Login to BBS
async function loginToBBS(page) {
  await page.goto('http://localhost:5173', { waitUntil: 'networkidle2' });
  await sleep(1500);

  // ANSI prompt
  await page.keyboard.type('A');
  await page.keyboard.press('Enter');
  await sleep(750);

  // Username
  await page.keyboard.type('sysop');
  await page.keyboard.press('Enter');
  await sleep(750);

  // Password
  await page.keyboard.type('sysop');
  await page.keyboard.press('Enter');
  await sleep(2000);

  // Skip prompts
  await page.keyboard.press('Enter');
  await sleep(1000);
  await page.keyboard.press('Enter');
  await sleep(1000);
}

// Test a single door
async function testDoor(page, doorName, doorExecutable) {
  console.log(`\n  Testing: ${doorName} (${doorExecutable})`);

  const result = {
    name: doorName,
    executable: doorExecutable,
    status: 'unknown',
    error: null,
    notes: [],
    duration: 0
  };

  const startTime = Date.now();

  try {
    // Check backend logs before
    const logSizeBefore = fs.statSync('/tmp/backend.log').size;

    // Try to run door via command
    await page.keyboard.type(doorName.toUpperCase());
    await page.keyboard.press('Enter');
    await sleep(DOOR_WAIT_TIME);

    // Check backend logs after
    const logSizeAfter = fs.statSync('/tmp/backend.log').size;
    const logGrowth = logSizeAfter - logSizeBefore;

    // Read recent logs
    const logs = fs.readFileSync('/tmp/backend.log', 'utf8');
    const recentLogs = logs.slice(-10000); // Last 10KB

    // Check for door execution
    if (recentLogs.includes(`Starting door: `)) {
      result.notes.push('Door launched');

      // Check for errors
      if (recentLogs.includes('STACK MISALIGNMENT')) {
        result.status = 'crash-stack';
        result.error = 'Stack misalignment';
      } else if (recentLogs.includes('invalid PC')) {
        result.status = 'crash-invalid-pc';
        result.error = 'Invalid PC';
      } else if (recentLogs.includes('CRITICAL: PC IN UNMAPPED')) {
        result.status = 'crash-unmapped';
        result.error = 'PC in unmapped memory';
      } else if (recentLogs.includes('Door session terminated')) {
        result.status = 'terminated';
        result.notes.push('Terminated normally');
      } else {
        result.status = 'running';
        result.notes.push('May still be running');
      }

      // Check for file I/O operations
      if (recentLogs.includes('dos.library') && recentLogs.includes('Open(')) {
        result.notes.push('File I/O attempted');
      }
      if (recentLogs.includes('PROGDIR:')) {
        result.notes.push('Uses PROGDIR: device');
      }
      if (recentLogs.includes('Doors:')) {
        result.notes.push('Uses Doors: device');
      }
      if (recentLogs.includes('BBS:')) {
        result.notes.push('Uses BBS: device');
      }

    } else if (recentLogs.includes('Command not found') || recentLogs.includes('Unknown command')) {
      result.status = 'not-found';
      result.error = 'Command not recognized';
    } else {
      result.status = 'no-launch';
      result.error = 'Door did not launch';
    }

    result.duration = Date.now() - startTime;

  } catch (error) {
    result.status = 'error';
    result.error = error.message;
    result.duration = Date.now() - startTime;
  }

  // Return to menu
  await page.keyboard.press('Enter');
  await sleep(500);

  return result;
}

// Main test function
async function testAllDoors() {
  console.log('═══════════════════════════════════════════════════════');
  console.log('  Comprehensive Door Testing');
  console.log('  Testing all doors and documenting status');
  console.log('═══════════════════════════════════════════════════════\n');

  const doors = getAllDoors();
  const results = [];

  console.log('Starting browser...');
  const browser = await puppeteer.launch({
    headless: false,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });

  console.log('Logging in to BBS...');
  await loginToBBS(page);
  console.log('✓ Logged in\n');

  console.log(`Testing ${doors.length} doors...\n`);

  for (let i = 0; i < doors.length; i++) {
    const doorName = doors[i];
    const executable = findDoorExecutable(doorName);

    console.log(`[${i + 1}/${doors.length}] ${doorName}`);

    if (!executable) {
      results.push({
        name: doorName,
        executable: null,
        status: 'no-executable',
        error: 'No executable found',
        notes: [],
        duration: 0
      });
      console.log('  Status: No executable found');
      continue;
    }

    const result = await testDoor(page, doorName, executable);
    results.push(result);

    console.log(`  Status: ${result.status}`);
    if (result.error) {
      console.log(`  Error: ${result.error}`);
    }
    if (result.notes.length > 0) {
      console.log(`  Notes: ${result.notes.join(', ')}`);
    }
    console.log(`  Duration: ${result.duration}ms`);
  }

  await browser.close();

  // Generate report
  generateReport(results);

  console.log('\n═══════════════════════════════════════════════════════');
  console.log('  Testing Complete');
  console.log('═══════════════════════════════════════════════════════\n');
}

// Generate markdown report
function generateReport(results) {
  const timestamp = new Date().toISOString().split('T')[0];
  const reportPath = `./Docs/DOOR_TEST_REPORT_${timestamp}.md`;

  let report = `# Door Test Report - ${timestamp}\n\n`;
  report += `## Summary\n\n`;
  report += `Total doors tested: ${results.length}\n\n`;

  // Count by status
  const statusCounts = {};
  results.forEach(r => {
    statusCounts[r.status] = (statusCounts[r.status] || 0) + 1;
  });

  report += `### Status Breakdown\n\n`;
  Object.keys(statusCounts).sort().forEach(status => {
    const count = statusCounts[status];
    const percentage = ((count / results.length) * 100).toFixed(1);
    report += `- ${status}: ${count} (${percentage}%)\n`;
  });

  report += `\n---\n\n## Detailed Results\n\n`;

  // Group by status
  const byStatus = {};
  results.forEach(r => {
    if (!byStatus[r.status]) byStatus[r.status] = [];
    byStatus[r.status].push(r);
  });

  Object.keys(byStatus).sort().forEach(status => {
    report += `### ${status} (${byStatus[status].length} doors)\n\n`;

    byStatus[status].forEach(result => {
      report += `#### ${result.name}\n`;
      if (result.executable) {
        report += `- Executable: ${result.executable}\n`;
      }
      if (result.error) {
        report += `- Error: ${result.error}\n`;
      }
      if (result.notes.length > 0) {
        report += `- Notes: ${result.notes.join(', ')}\n`;
      }
      report += `- Duration: ${result.duration}ms\n`;
      report += `\n`;
    });
  });

  report += `\n---\n\n## Recommendations\n\n`;
  report += `Based on test results:\n\n`;

  const workingDoors = results.filter(r => r.status === 'terminated' || r.status === 'running');
  const crashingDoors = results.filter(r => r.status.startsWith('crash-'));
  const notFoundDoors = results.filter(r => r.status === 'no-executable' || r.status === 'not-found');

  if (workingDoors.length > 0) {
    report += `### Working Doors (${workingDoors.length})\n`;
    report += `These doors ran without crashing:\n`;
    workingDoors.forEach(d => report += `- ${d.name}\n`);
    report += `\n`;
  }

  if (crashingDoors.length > 0) {
    report += `### Crashing Doors (${crashingDoors.length})\n`;
    report += `These doors crash due to emulator issues:\n`;
    const byError = {};
    crashingDoors.forEach(d => {
      if (!byError[d.error]) byError[d.error] = [];
      byError[d.error].push(d.name);
    });
    Object.keys(byError).forEach(error => {
      report += `\n**${error}:**\n`;
      byError[error].forEach(name => report += `- ${name}\n`);
    });
    report += `\n`;
  }

  if (notFoundDoors.length > 0) {
    report += `### Not Found (${notFoundDoors.length})\n`;
    report += `These doors could not be launched:\n`;
    notFoundDoors.forEach(d => report += `- ${d.name}: ${d.error}\n`);
    report += `\n`;
  }

  report += `\n---\n\n`;
  report += `**Generated:** ${new Date().toISOString()}\n`;
  report += `**Test Duration:** ${results.reduce((sum, r) => sum + r.duration, 0)}ms total\n`;

  fs.writeFileSync(reportPath, report);
  console.log(`\n✓ Report saved to: ${reportPath}`);
}

// Run tests
testAllDoors().catch(error => {
  console.error('Test failed:', error);
  process.exit(1);
});
