/**
 * Test All Registered Doors
 * Tests the 58 doors that have .info files in Commands/BBSCmd/
 */

const puppeteer = require('puppeteer');
const fs = require('fs');

// The 58 registered door commands (from backend logs)
const DOOR_COMMANDS = [
  'ARCL', 'ASSN', 'B', 'BBSC', 'BCR', 'BORD', 'BRE', 'CONFLIST', 'CTOP', 'DARK',
  'DEL', 'DKNS', 'DMAS', 'DMUD', 'ED', 'FALC', 'FHON', 'FISH', 'GA', 'GGAM',
  'GL', 'GWALL', 'GWAR', 'HACK', 'I', 'JUNK', 'LEGN', 'LINKMENU', 'LINKWALL',
  'LMON', 'LORD', 'LORD2', 'LUNA', 'MEGA', 'MMOT', 'MRC', 'MRCSTAT1', 'MRCSTAT2',
  'MZKL', 'NETR', 'NUKE', 'OLM', 'OOII', 'REQ', 'SENT', 'SIZE', 'STUPID',
  'TEOS', 'TEST', 'TESTRESTRICT', 'TLIST', 'TW2002', 'U', 'ULIST', 'USRP',
  'VSYS', 'WHAT', 'WHO'
];

const DOOR_WAIT_TIME = 5000; // 5 seconds per door

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function loginToBBS(page) {
  await page.goto('http://localhost:5173', { waitUntil: 'networkidle2' });
  await sleep(1500);

  await page.keyboard.type('A');
  await page.keyboard.press('Enter');
  await sleep(750);

  await page.keyboard.type('sysop');
  await page.keyboard.press('Enter');
  await sleep(750);

  await page.keyboard.type('sysop');
  await page.keyboard.press('Enter');
  await sleep(2000);

  await page.keyboard.press('Enter');
  await sleep(1000);
  await page.keyboard.press('Enter');
  await sleep(1000);
}

async function testDoor(page, command) {
  console.log(`\n  Testing: ${command}`);

  const result = {
    command: command,
    status: 'unknown',
    error: null,
    notes: [],
    duration: 0
  };

  const startTime = Date.now();

  try {
    const logSizeBefore = fs.statSync('/tmp/backend.log').size;

    await page.keyboard.type(command);
    await page.keyboard.press('Enter');
    await sleep(DOOR_WAIT_TIME);

    const logSizeAfter = fs.statSync('/tmp/backend.log').size;
    const logs = fs.readFileSync('/tmp/backend.log', 'utf8');
    const recentLogs = logs.slice(-10000);

    if (recentLogs.includes(`Starting door:`)) {
      result.notes.push('Launched');

      if (recentLogs.includes('STACK MISALIGNMENT')) {
        result.status = 'crash-stack';
        result.error = 'Stack misalignment';
      } else if (recentLogs.includes('invalid PC') || recentLogs.includes('CRITICAL: PC IN UNMAPPED')) {
        result.status = 'crash-pc';
        result.error = 'Invalid PC / unmapped memory';
      } else if (recentLogs.includes('Door session terminated')) {
        result.status = 'terminated';
      } else {
        result.status = 'running';
      }

      // Check file I/O
      if (recentLogs.includes('PROGDIR:')) result.notes.push('PROGDIR:');
      if (recentLogs.includes('Doors:')) result.notes.push('Doors:');
      if (recentLogs.includes('BBS:')) result.notes.push('BBS:');
      if (recentLogs.includes('dos.library') && recentLogs.includes('Open(')) {
        result.notes.push('File I/O');
      }

    } else {
      result.status = 'no-launch';
      result.error = 'Did not launch';
    }

    result.duration = Date.now() - startTime;

  } catch (error) {
    result.status = 'error';
    result.error = error.message;
    result.duration = Date.now() - startTime;
  }

  await page.keyboard.press('Enter');
  await sleep(500);

  return result;
}

async function testAllDoors() {
  console.log('═══════════════════════════════════════════════════════');
  console.log('  Testing 58 Registered Doors');
  console.log('  Commands from Commands/BBSCmd/*.info files');
  console.log('═══════════════════════════════════════════════════════\n');

  const results = [];

  const browser = await puppeteer.launch({
    headless: false,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });

  console.log('Logging in...');
  await loginToBBS(page);
  console.log('✓ Logged in\n');

  console.log(`Testing ${DOOR_COMMANDS.length} doors...\n`);

  for (let i = 0; i < DOOR_COMMANDS.length; i++) {
    const command = DOOR_COMMANDS[i];
    console.log(`[${i + 1}/${DOOR_COMMANDS.length}] ${command}`);

    const result = await testDoor(page, command);
    results.push(result);

    console.log(`  Status: ${result.status}`);
    if (result.error) console.log(`  Error: ${result.error}`);
    if (result.notes.length > 0) console.log(`  Notes: ${result.notes.join(', ')}`);
    console.log(`  Duration: ${result.duration}ms`);
  }

  await browser.close();

  // Generate report
  generateReport(results);

  console.log('\n═══════════════════════════════════════════════════════');
  console.log('  Testing Complete');
  console.log('═══════════════════════════════════════════════════════\n');
}

function generateReport(results) {
  const timestamp = new Date().toISOString().split('T')[0];
  const reportPath = `./Docs/DOOR_TEST_REPORT_${timestamp}.md`;

  let report = `# Door Test Report - ${timestamp}\n\n`;
  report += `## Summary\n\n`;
  report += `Tested: ${results.length} registered doors\n\n`;

  const statusCounts = {};
  results.forEach(r => {
    statusCounts[r.status] = (statusCounts[r.status] || 0) + 1;
  });

  report += `### Status Breakdown\n\n`;
  Object.keys(statusCounts).sort().forEach(status => {
    const count = statusCounts[status];
    const percentage = ((count / results.length) * 100).toFixed(1);
    report += `- **${status}**: ${count} doors (${percentage}%)\n`;
  });

  report += `\n---\n\n## Detailed Results\n\n`;

  const byStatus = {};
  results.forEach(r => {
    if (!byStatus[r.status]) byStatus[r.status] = [];
    byStatus[r.status].push(r);
  });

  Object.keys(byStatus).sort().forEach(status => {
    report += `### ${status.toUpperCase()} (${byStatus[status].length} doors)\n\n`;

    byStatus[status].forEach(r => {
      report += `**${r.command}**`;
      if (r.error) report += ` - ${r.error}`;
      if (r.notes.length > 0) report += ` (${r.notes.join(', ')})`;
      report += `\n`;
    });
    report += `\n`;
  });

  report += `\n---\n\n## Analysis\n\n`;

  const working = results.filter(r => r.status === 'terminated' || r.status === 'running');
  const crashing = results.filter(r => r.status.startsWith('crash-'));
  const fileIO = results.filter(r => r.notes.some(n => n.includes('PROGDIR') || n.includes('Doors') || n.includes('BBS')));

  report += `### Working Doors\n`;
  report += `${working.length} doors ran without crashing.\n\n`;
  if (working.length > 0) {
    working.forEach(d => report += `- ${d.command}\n`);
  }
  report += `\n`;

  report += `### Doors Using File I/O\n`;
  report += `${fileIO.length} doors attempted file operations.\n\n`;
  if (fileIO.length > 0) {
    fileIO.forEach(d => {
      const devices = d.notes.filter(n => n.includes(':') || n === 'File I/O');
      report += `- ${d.command}: ${devices.join(', ')}\n`;
    });
  }
  report += `\n`;

  report += `### Crashing Doors\n`;
  report += `${crashing.length} doors crashed (emulator issues).\n\n`;

  report += `\n---\n\n`;
  report += `**Generated:** ${new Date().toISOString()}\n`;
  report += `**Total Test Time:** ${results.reduce((sum, r) => sum + r.duration, 0)}ms\n`;

  fs.writeFileSync(reportPath, report);
  console.log(`\n✓ Report saved: ${reportPath}`);
}

testAllDoors().catch(error => {
  console.error('Test failed:', error);
  process.exit(1);
});
