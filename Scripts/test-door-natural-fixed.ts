#!/usr/bin/env node

/**
 * Test GetAnswer door with natural polling loop behavior
 * Monitors memory changes, library calls, and natural timeout completion
 */

const puppeteer = require('puppeteer');

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function testDoorNaturalLoop() {
  console.log('=== Door Natural Loop Test ===\n');
  console.log('Monitoring for:');
  console.log('  1. Memory changes at 0x2001');
  console.log('  2. Library calls during polling loop');
  console.log('  3. Natural timeout completion (~1,165 iterations)\n');

  const browser = await puppeteer.launch({
    headless: false,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });

    console.log('Navigating to BBS...');
    await page.goto('http://localhost:5173', { waitUntil: 'networkidle2' });
    await sleep(1500);

    // Answer ANSI prompt
    console.log('Answering ANSI prompt with A');
    await page.keyboard.type('A');
    await page.keyboard.press('Enter');
    await sleep(750);

    // Type sysop username
    console.log('Typing username: sysop');
    await page.keyboard.type('sysop');
    await page.keyboard.press('Enter');
    await sleep(750);

    // Type password
    console.log('Typing password: sysop');
    await page.keyboard.type('sysop');
    await page.keyboard.press('Enter');
    await sleep(1500);

    // Press Enter to get past screens
    console.log('Pressing Enter to get past screens...');
    await page.keyboard.press('Enter');
    await sleep(500);
    await page.keyboard.press('Enter');
    await sleep(500);

    // Execute GA command (GetAnswer door directly)
    console.log('\n=== EXECUTING GA COMMAND (GetAnswer Door) ===');
    await page.keyboard.type('GA');
    await page.keyboard.press('Enter');

    // Wait for door to execute (60 seconds for natural timeout)
    console.log('Waiting up to 60 seconds for door execution...');
    console.log('(Door should naturally timeout at ~1,165 iterations)');
    console.log('Check backend logs for:');
    console.log('  - POLLING LOOP DETECTED');
    console.log('  - MEMORY CHANGE DETECTED');
    console.log('  - LIBRARY CALL IN POLLING LOOP');
    console.log('');

    await sleep(60000);

    // Check final screen
    const finalText = await page.evaluate(() => document.body.innerText);
    console.log('\n=== Final Screen ===');
    console.log(finalText.substring(0, 500));

    console.log('\n=== Test Complete ===');
    console.log('Check /tmp/backend.log for monitoring results');

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await browser.close();
  }
}

testDoorNaturalLoop().catch(console.error);
