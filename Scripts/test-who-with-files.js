#!/usr/bin/env node
const puppeteer = require('puppeteer');

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function testWHODoor() {
  console.log('🧪 WHO Door Test (with user.data files)\n');

  const browser = await puppeteer.launch({
    headless: false,
    defaultViewport: { width: 1280, height: 900 },
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  try {
    const page = await browser.newPage();

    console.log('📡 Connecting to BBS...');
    await page.goto('http://localhost:5173', { waitUntil: 'networkidle2' });
    await sleep(1500);

    console.log('🎨 ANSI graphics');
    await page.keyboard.type('A');
    await page.keyboard.press('Enter');
    await sleep(750);

    console.log('👤 Login: sysop');
    await page.keyboard.type('sysop');
    await page.keyboard.press('Enter');
    await sleep(750);

    console.log('🔐 Password');
    await page.keyboard.type('sysop');
    await page.keyboard.press('Enter');
    await sleep(1500);

    console.log('📋 Skipping prompts...');
    await page.keyboard.press('Enter');
    await sleep(750);
    await page.keyboard.press('Enter');
    await sleep(2000);

    console.log('\n🚪 Running WHO door...');
    await page.keyboard.type('WHO');
    await page.keyboard.press('Enter');
    await sleep(4000);

    const terminalText = await page.evaluate(() => {
      const termRows = document.querySelector('.xterm-rows');
      return termRows ? termRows.textContent : '';
    });

    console.log('\n📋 Terminal output (last 800 chars):');
    console.log('═'.repeat(70));
    console.log(terminalText.substring(Math.max(0, terminalText.length - 800)));
    console.log('═'.repeat(70));

    // Check if WHO produced output
    if (terminalText.includes('Node') || terminalText.includes('User') || terminalText.includes('sysop')) {
      console.log('\n[OK] WHO door appears to be working!');
    } else {
      console.log('\n[WARNING]  WHO door may not be working - no expected output found');
    }

    console.log('\n⏸️  Keeping browser open for 2 minutes for inspection...');
    await sleep(120000);

  } catch (error) {
    console.error('[ERROR] Error:', error);
  } finally {
    await browser.close();
  }
}

testWHODoor();
