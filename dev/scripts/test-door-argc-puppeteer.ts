#!/usr/bin/env node

/**
 * Test GetAnswer door with argc/argv restoration using Puppeteer
 *
 * This test:
 * 1. Opens BBS in browser
 * 2. Logs in as sysop
 * 3. Executes GA (GetAnswer) door
 * 4. Captures backend logs to see:
 *    - "Restored D0 (argc): 2"
 *    - "DOOR MESSAGE RECEIVED"
 *    - What's blocking the door now
 */

const puppeteer = require('puppeteer');
const { spawn } = require('child_process');
const fs = require('fs');

const BBS_URL = 'http://localhost:5173';
const BACKEND_LOG = '/tmp/backend-door-test.log';

console.log('=== GetAnswer Door Test with argc/argv Fix ===\n');

// Clear old log
if (fs.existsSync(BACKEND_LOG)) {
  fs.unlinkSync(BACKEND_LOG);
}

// Start backend
console.log('Starting backend...');
const backendProcess = spawn('bash', ['-c',
  `cd web/backend && npm run dev 2>&1 | tee ${BACKEND_LOG}`
]);

// Start frontend
console.log('Starting frontend...');
const frontendProcess = spawn('bash', ['-c',
  `cd web/frontend && npm run dev 2>&1`
]);

let logBuffer = '';
backendProcess.stdout.on('data', (data) => {
  const line = data.toString();
  logBuffer += line;

  // Show critical messages
  if (line.match(/Restored D0|DOOR MESSAGE|argc|argv|stuck|PC=0x9/)) {
    console.log('[BACKEND]', line.trim());
  }
});

async function testDoor() {
  let browser;

  try {
    console.log('Waiting for backend and frontend to start...');
    await new Promise(resolve => setTimeout(resolve, 10000));

    console.log('Launching browser...');
    browser = await puppeteer.launch({
      headless: false,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();

    // Listen for console messages from BBS
    page.on('console', msg => {
      const text = msg.text();
      if (text.includes('door') || text.includes('GetAnswer')) {
        console.log('[BBS CONSOLE]', text);
      }
    });

    console.log('Navigating to BBS...');
    await page.goto(BBS_URL, { waitUntil: 'networkidle2' });

    await new Promise(resolve => setTimeout(resolve, 2000));

    console.log('Answering ANSI prompt with A...');
    await page.keyboard.type('A');
    await page.keyboard.press('Enter');
    await new Promise(resolve => setTimeout(resolve, 1000));

    console.log('Continuing past BBSTITLE...');
    await page.keyboard.press('Enter');
    await new Promise(resolve => setTimeout(resolve, 1000));

    console.log('Logging in as sysop...');

    // Type username
    await page.keyboard.type('sysop');
    await page.keyboard.press('Enter');
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Type password
    await page.keyboard.type('sysop');
    await page.keyboard.press('Enter');

    console.log('Waiting for bulletins...');
    await new Promise(resolve => setTimeout(resolve, 2000));

    console.log('Continuing past bulletins...');
    await page.keyboard.press('Enter');
    await new Promise(resolve => setTimeout(resolve, 1000));

    console.log('Waiting for conference scan and main menu...');
    await new Promise(resolve => setTimeout(resolve, 2000));

    console.log('Continuing to menu...');
    await page.keyboard.press('Enter');
    await new Promise(resolve => setTimeout(resolve, 1000));

    console.log('Launching GetAnswer door (GA command)...');
    await page.keyboard.type('GA');
    await page.keyboard.press('Enter');

    console.log('\nDoor launched! Monitoring backend logs for 90 seconds...');
    console.log('Watching for:');
    console.log('  1. "Restored D0 (argc): 2" - argc/argv restored');
    console.log('  2. "DOOR MESSAGE RECEIVED" - Door sent message');
    console.log('  3. "stuck" or "PC=0x..." - Where door is now\n');

    // Wait and monitor logs
    await new Promise(resolve => setTimeout(resolve, 90000));

    console.log('\n=== Test Complete ===\n');

    // Analyze what we captured
    console.log('Checking captured logs...\n');

    const logs = fs.readFileSync(BACKEND_LOG, 'utf8');

    const hasArgcRestore = logs.includes('Restored D0 (argc): 2');
    const hasArgvRestore = logs.includes('Restored A0 (argv): 0x0f0000');
    const hasDoorMessage = logs.includes('DOOR MESSAGE RECEIVED');
    const hasStuck = logs.match(/stuck.*PC=(0x[0-9a-f]+)/i);
    const hasIteration60k = logs.match(/Iteration 60000.*PC=(0x[0-9a-f]+)/);

    console.log('Results:');
    console.log(`  ✓ argc restored: ${hasArgcRestore ? 'YES' : 'NO'}`);
    console.log(`  ✓ argv restored: ${hasArgvRestore ? 'YES' : 'NO'}`);
    console.log(`  ✓ Door sent message: ${hasDoorMessage ? 'YES' : 'NO'}`);

    if (hasStuck) {
      console.log(`  ✗ Door stuck at: ${hasStuck[1]}`);
    } else if (hasIteration60k) {
      console.log(`  ✗ Door reached 60k iterations at: ${hasIteration60k[1]}`);
    }

    console.log('\nFull backend log saved to:', BACKEND_LOG);
    console.log('To view: cat', BACKEND_LOG, '| grep -E "Restored|DOOR|stuck|PC=0x9"\n');

    if (!hasDoorMessage) {
      console.log('[WARNING]  Door did not send messages. Next steps:');
      console.log('   1. Check where door is stuck now');
      console.log('   2. Verify argc/argv were actually restored');
      console.log('   3. Look for other register corruption');
      console.log('   4. Check if door needs more initialization\n');
    }

  } catch (error) {
    console.error('Test error:', error);
  } finally {
    if (browser) {
      await browser.close();
    }
    backendProcess.kill();
    frontendProcess.kill();
    process.exit(0);
  }
}

testDoor();
