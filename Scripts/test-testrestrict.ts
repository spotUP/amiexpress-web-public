#!/usr/bin/env node
/**
 * Test script for TESTRESTRICT door
 * Tests door command matching after fixing BBSCMD to Door conversion
 */

const puppeteer = require('puppeteer');

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function testTestRestrictCommand() {
  console.log('🧪 Testing TESTRESTRICT Command\n');
  console.log('[NOTE] This script will:');
  console.log('   1. Connect to BBS');
  console.log('   2. Select ANSI graphics');
  console.log('   3. Login as sysop');
  console.log('   4. Wait for main menu');
  console.log('   5. Execute TESTRESTRICT command');
  console.log('   6. Monitor backend logs for door execution\n');

  const browser = await puppeteer.launch({
    headless: false,
    defaultViewport: { width: 1280, height: 900 },
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  try {
    const page = await browser.newPage();

    // Monitor console output
    page.on('console', msg => {
      const text = msg.text();
      if (text.includes('Login successful') || text.includes('door') || text.includes('Door')) {
        console.log('[SERVER]  [BROWSER]', text);
      }
    });

    console.log('📡 Connecting to http://localhost:5173...');
    await page.goto('http://localhost:5173', { waitUntil: 'networkidle2' });
    await sleep(2000);

    console.log('🎨 Selecting ANSI graphics...');
    await page.keyboard.type('A');
    await page.keyboard.press('Enter');
    await sleep(1000);

    console.log('👤 Entering username: sysop...');
    await page.keyboard.type('sysop');
    await page.keyboard.press('Enter');
    await sleep(1000);

    console.log('🔐 Entering password...');
    await page.keyboard.type('sysop');
    await page.keyboard.press('Enter');
    await sleep(3000);

    console.log('📋 Pressing Enter for first prompt...');
    await page.keyboard.press('Enter');
    await sleep(2000);

    console.log('📋 Pressing Enter for second prompt...');
    await page.keyboard.press('Enter');
    await sleep(2000);

    console.log('[WAIT] Waiting for command prompt...');
    await sleep(2000);

    console.log('\n🚪 Executing TESTRESTRICT command...');
    await page.keyboard.type('testrestrict');
    await page.keyboard.press('Enter');

    console.log('[WAIT] Waiting for door execution (10 seconds)...');
    console.log('[INFO] Monitor backend logs in another terminal:');
    console.log('   tail -f /tmp/backend.log | grep -E "TESTRESTRICT|Door|TestRestrict"\n');

    await sleep(10000);

    // Check terminal output
    const terminalText = await page.evaluate(() => {
      const termRows = document.querySelector('.xterm-rows');
      return termRows ? termRows.textContent : '';
    });

    console.log('\n📋 Terminal output (last 400 chars):');
    console.log('═'.repeat(60));
    console.log(terminalText.substring(Math.max(0, terminalText.length - 400)));
    console.log('═'.repeat(60));

    if (terminalText.includes('GetAnswer') || terminalText.includes('question')) {
      console.log('\n[OK] SUCCESS: GA door produced output!');
    } else {
      console.log('\n[ERROR] NO OUTPUT: GA door did not produce visible output');
      console.log('   Check backend logs for execution details');
    }

    console.log('\n⏸️  Browser will remain open for 2 minutes for inspection...');
    console.log('   Press Ctrl+C to close early\n');

    await sleep(120000);

  } catch (error) {
    console.error('\n[ERROR] Error:', error.message);
  } finally {
    await browser.close();
    console.log('\n👋 Test complete');
  }
}

// Run the test
if (require.main === module) {
  testTestRestrictCommand().catch(console.error);
}

module.exports = { testTestRestrictCommand };
