/**
 * Test GetAnswer door with natural polling loop behavior using Puppeteer
 * Monitors memory changes, library calls, and natural loop exit
 */

const puppeteer = require('puppeteer');

(async () => {
  console.log('Launching browser...\n');

  const browser = await puppeteer.launch({
    headless: false,
    defaultViewport: { width: 1200, height: 800 }
  });

  const page = await browser.newPage();

  // Monitor console output from backend
  page.on('console', msg => {
    const text = msg.text();
    // Filter for our monitoring messages
    if (text.includes('POLLING LOOP DETECTED') ||
        text.includes('MEMORY CHANGE DETECTED') ||
        text.includes('LIBRARY CALL IN POLLING') ||
        text.includes('Sending startup message') ||
        text.includes('Door execution complete')) {
      console.log(`[BROWSER] ${text}`);
    }
  });

  console.log('Navigating to BBS...\n');
  await page.goto('http://localhost:5173');

  // Wait for terminal to be ready
  await page.waitForSelector('.xterm', { timeout: 10000 });
  console.log('Terminal loaded\n');

  await new Promise(resolve => setTimeout(resolve, 2000));

  // Select ANSI
  console.log('Selecting ANSI graphics...');
  await page.keyboard.type('a');
  await new Promise(resolve => setTimeout(resolve, 1000));

  // Login as sysop
  console.log('Logging in as sysop...');
  await page.keyboard.type('sysop');
  await page.keyboard.press('Enter');
  await new Promise(resolve => setTimeout(resolve, 2000));

  // Press any key for password (empty)
  await page.keyboard.press('Enter');
  await new Promise(resolve => setTimeout(resolve, 3000));

  // Launch door
  console.log('Launching DOOR command...\n');
  await page.keyboard.type('DOOR');
  await page.keyboard.press('Enter');

  console.log('=== Door should start executing ===');
  console.log('=== Monitoring for: ===');
  console.log('  1. Memory changes at 0x2001');
  console.log('  2. Library calls during polling loop');
  console.log('  3. Natural timeout completion at ~1,165 iterations\n');

  // Wait for door to complete (60 seconds max)
  console.log('Waiting up to 60 seconds for door execution...\n');
  await new Promise(resolve => setTimeout(resolve, 60000));

  console.log('\n=== Test complete - Check backend logs for results ===');

  await browser.close();
})();
