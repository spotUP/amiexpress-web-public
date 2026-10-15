#!/usr/bin/env node

/**
 * Test What Door with Library Call Trapping
 *
 * This script:
 * 1. Connects to the BBS via browser
 * 2. Logs in as sysop
 * 3. Executes the WH (What) door
 * 4. Monitors backend logs for library trap messages
 */

const puppeteer = require('puppeteer');
const { spawn } = require('child_process');
const fs = require('fs');

const BBS_URL = 'http://localhost:5173';
const LOG_FILE = '/tmp/backend.log';

// Track if we've seen key library trap messages
const expectedMessages = {
  'Installing library call traps': false,
  'Installing Exec.library vectors': false,
  'Library trap detected': false,
  'Intercepted: OpenLibrary': false,
  'OpenLibrary called': false
};

// Tail backend logs
function tailLogs() {
  return new Promise((resolve) => {
    // Clear the log file first
    const logStream = fs.createReadStream(LOG_FILE);
    let buffer = '';

    logStream.on('data', (chunk) => {
      buffer += chunk.toString();
    });

    logStream.on('end', () => {
      console.log('\n=== Starting fresh log monitoring ===\n');

      // Now tail new logs
      const tail = spawn('tail', ['-f', LOG_FILE]);

      tail.stdout.on('data', (data) => {
        const line = data.toString();
        process.stdout.write(line);

        // Check for expected messages
        if (line.includes('Installing library call traps')) {
          expectedMessages['Installing library call traps'] = true;
        }
        if (line.includes('Installing Exec.library vectors')) {
          expectedMessages['Installing Exec.library vectors'] = true;
        }
        if (line.includes('Library trap detected')) {
          expectedMessages['Library trap detected'] = true;
        }
        if (line.includes('Intercepted: OpenLibrary')) {
          expectedMessages['Intercepted: OpenLibrary'] = true;
        }
        if (line.includes('OpenLibrary called') || line.includes('OpenLibrary(')) {
          expectedMessages['OpenLibrary called'] = true;
        }
      });

      // Return tail process so we can kill it later
      resolve(tail);
    });
  });
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function testWhatDoor() {
  console.log('=== What Door Test ===\n');

  // Start tailing logs
  console.log('Starting log monitor...');
  const tailProcess = await tailLogs();

  const browser = await puppeteer.launch({
    headless: false, // Show browser for debugging
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  try {
    const page = await browser.newPage();

    // Set viewport
    await page.setViewport({ width: 1280, height: 800 });

    console.log(`Navigating to ${BBS_URL}...`);
    await page.goto(BBS_URL, { waitUntil: 'networkidle2' });

    console.log('Waiting for terminal to connect...');
    await sleep(3000);

    // Check if we see login prompt
    const bodyText = await page.evaluate(() => document.body.innerText);
    console.log('\nCurrent screen:', bodyText.substring(0, 200));

    // CRITICAL: Answer ANSI prompt first!
    console.log('\nAnswering ANSI prompt with A');
    await page.keyboard.type('A');
    await page.keyboard.press('Enter');
    await sleep(1500);

    // Type sysop username
    console.log('Typing username: sysop');
    await page.keyboard.type('sysop');
    await page.keyboard.press('Enter');
    await sleep(1500);

    // Type password
    console.log('Typing password: sysop');
    await page.keyboard.type('sysop');
    await page.keyboard.press('Enter');
    await sleep(3000);

    // Should be at main menu now
    console.log('\n--- Should be at main menu ---');
    await sleep(1000);

    // Press Enter a few times to get past any screens
    console.log('Pressing Enter to get past screens...');
    await page.keyboard.press('Enter');
    await sleep(1000);
    await page.keyboard.press('Enter');
    await sleep(1000);

    // Execute WH command (What door)
    console.log('\n=== EXECUTING WH COMMAND (What Door) ===');
    await page.keyboard.type('WH');
    await page.keyboard.press('Enter');

    // Wait for door to execute and library traps to fire
    console.log('Waiting for door to execute and library traps to fire...');
    await sleep(5000);

    // Check screen content
    const finalText = await page.evaluate(() => document.body.innerText);
    console.log('\n=== Final Screen Content ===');
    console.log(finalText.substring(0, 500));

    // Give more time for logs to appear
    console.log('\nWaiting for final log messages...');
    await sleep(3000);

  } catch (error) {
    console.error('Error during test:', error);
  } finally {
    // Kill tail process
    console.log('\n\nStopping log monitor...');
    tailProcess.kill();

    await browser.close();

    // Print results
    console.log('\n=== TEST RESULTS ===\n');
    console.log('Expected Messages Found:');
    for (const [message, found] of Object.entries(expectedMessages)) {
      console.log(`  ${found ? '✓' : '✗'} ${message}`);
    }

    const totalFound = Object.values(expectedMessages).filter(v => v).length;
    const totalExpected = Object.keys(expectedMessages).length;

    console.log(`\nScore: ${totalFound}/${totalExpected} messages detected`);

    if (totalFound === totalExpected) {
      console.log('\n✓ SUCCESS: All library trap messages detected!');
    } else if (totalFound > 0) {
      console.log('\n[WARNING] PARTIAL: Some library trap messages detected');
    } else {
      console.log('\n✗ FAILURE: No library trap messages detected');
    }

    process.exit(totalFound === totalExpected ? 0 : 1);
  }
}

// Run test
testWhatDoor().catch(console.error);
