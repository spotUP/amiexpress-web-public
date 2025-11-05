#!/usr/bin/env node

/**
 * Test GetAnswer door with fixed WriteStr() parameters
 * Now that A0/D1 parameters are correct, let's see if output works
 */

const puppeteer = require('puppeteer');

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function testGetAnswerFixed() {
  console.log('=== GetAnswer Test - Fixed WriteStr() ===\n');
  console.log('Testing with corrected A0/D1 parameters');
  console.log('Door should display: "GetAnswer v1.2..."\n');

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

    // Login
    console.log('Logging in as sysop...');
    await page.keyboard.type('sysop');
    await page.keyboard.press('Enter');
    await sleep(750);

    await page.keyboard.type('sysop');
    await page.keyboard.press('Enter');
    await sleep(1500);

    // Skip screens
    await page.keyboard.press('Enter');
    await sleep(500);
    await page.keyboard.press('Enter');
    await sleep(500);

    // Execute GA command
    console.log('\n=== EXECUTING GA COMMAND ===');
    await page.keyboard.type('GA');
    await page.keyboard.press('Enter');

    // Wait for door output
    console.log('Waiting 5 seconds for door execution...');
    await sleep(5000);

    // Check screen
    const finalText = await page.evaluate(() => document.body.innerText);
    console.log('\n=== Screen Output ===');
    const lines = finalText.split('\n');
    const lastLines = lines.slice(-30).join('\n');
    console.log(lastLines);

    // Check if we see the door output
    if (lastLines.includes('GetAnswer') || lastLines.includes('Agamemnon')) {
      console.log('\n✓ SUCCESS: Door output detected!');
      console.log('✓ WriteStr() fix is working!');
    } else {
      console.log('\n⚠ No door output visible yet');
      console.log('Check backend logs for AEDoor.library calls');
    }

    console.log('\n=== Test Complete ===');

  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await browser.close();
  }
}

testGetAnswerFixed().catch(console.error);
