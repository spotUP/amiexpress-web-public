#!/usr/bin/env node

/**
 * Test memory[0xac] fix for GetAnswer door
 *
 * This test verifies that writing the AEDoorPort0 address to memory[0xac]
 * fixes the WaitPort failure and allows the door to proceed.
 */

const puppeteer = require('puppeteer');

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function testMemoryFix() {
  console.log('=== Testing Memory[0xac] Fix ===\n');
  console.log('Expected results:');
  console.log('  1. Memory[0xac] written with port address (0xa0000)');
  console.log('  2. A0 register loads correct value from memory[0xac]');
  console.log('  3. WaitPort(0xa0000) succeeds (no "Port not found" errors)');
  console.log('  4. Door proceeds past iteration 1,165\n');

  const browser = await puppeteer.launch({
    headless: false,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
    defaultViewport: { width: 1280, height: 800 }
  });

  try {
    const page = await browser.newPage();

    console.log('1. Navigating to BBS...');
    await page.goto('http://localhost:5173', { waitUntil: 'networkidle2' });
    await sleep(2000);

    console.log('2. Answering ANSI prompt...');
    await page.keyboard.type('A');
    await page.keyboard.press('Enter');
    await sleep(1000);

    console.log('3. Logging in (sysop/sysop)...');
    await page.keyboard.type('sysop');
    await page.keyboard.press('Enter');
    await sleep(1000);

    await page.keyboard.type('sysop');
    await page.keyboard.press('Enter');
    await sleep(2000);

    console.log('4. Getting past screens...');
    await page.keyboard.press('Enter');
    await sleep(500);
    await page.keyboard.press('Enter');
    await sleep(500);

    console.log('5. Executing GA command...');
    await page.keyboard.type('GA');
    await page.keyboard.press('Enter');

    console.log('6. Waiting 45 seconds for door execution...');
    console.log('   (Check backend logs for progress)\n');

    // Wait for door to execute
    await sleep(45000);

    console.log('\n=== Test Complete ===');
    console.log('Check backend logs for:');
    console.log('  - "CRITICAL FIX: Writing port address to memory[0xac]"');
    console.log('  - "Memory[0xac] = 0xa0000"');
    console.log('  - "A0 REGISTER CHANGED" (should show A0 = 0xa0000, not garbage)');
    console.log('  - Count of "WaitPort: Port not found" (should be 0)');
    console.log('  - Door iteration count (should exceed 1,165)\n');

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await browser.close();
  }
}

testMemoryFix().catch(console.error);
