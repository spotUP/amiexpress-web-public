#!/usr/bin/env node

/**
 * Test Restrict door - uses AEDoor.library properly
 * This tests our complete AEDoor.library implementation
 */

const puppeteer = require('puppeteer');

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function testRestrictDoor() {
  console.log('=== Restrict Door Test (AEDoor.library) ===\n');
  console.log('This door uses proper AEDoor.library high-level functions');
  console.log('Testing: CreateComm, WriteStr, GetDT, SendCmd, DeleteComm\n');

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

    // Execute TestRestrict door directly
    console.log('\n=== EXECUTING TestRestrict Door ===');
    console.log('Running: DOOR TestRestrict');
    await page.keyboard.type('DOOR TestRestrict');
    await page.keyboard.press('Enter');

    // Wait for door to execute
    console.log('Waiting for door to execute (10 seconds)...');
    console.log('Check backend logs for AEDoor.library calls:');
    console.log('  - CreateComm()');
    console.log('  - WriteStr()');
    console.log('  - SendCmd()');
    console.log('  - GetDT()');
    console.log('  - DeleteComm()');
    console.log('');

    await sleep(10000);

    // Check final screen
    const finalText = await page.evaluate(() => document.body.innerText);
    console.log('\n=== Door Output ===');
    console.log(finalText.substring(Math.max(0, finalText.length - 1000)));

    console.log('\n=== Test Complete ===');
    console.log('Check /tmp/backend.log for detailed AEDoor.library trace');

  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await browser.close();
  }
}

testRestrictDoor().catch(console.error);
