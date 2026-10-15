/**
 * Proof-of-Concept: Test door execution with ROM-based library handling
 *
 * Instead of intercepting library traps ourselves, we load the Kickstart ROM
 * and let IT handle the traps. We only intercept specific XIM protocol functions.
 */

const puppeteer = require('puppeteer');

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function testRomBasedDoor() {
  console.log('🧪 Testing door with ROM-based library handling\n');

  const browser = await puppeteer.launch({
    headless: false,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
    defaultViewport: { width: 1280, height: 800 }
  });

  try {
    const page = await browser.newPage();

    // Listen for console messages from the page
    page.on('console', msg => {
      const text = msg.text();
      if (text.includes('[BROWSER]') || text.includes('🔊') || text.includes('XIM') || text.includes('Door')) {
        console.log(`[SERVER]  ${text}`);
      }
    });

    await page.goto('http://localhost:5173', { waitUntil: 'networkidle2' });
    await sleep(1500);

    // Login sequence
    console.log('[NOTE] Logging in...');
    await page.keyboard.type('A');
    await page.keyboard.press('Enter');
    await sleep(750);

    await page.keyboard.type('sysop');
    await page.keyboard.press('Enter');
    await sleep(750);

    await page.keyboard.type('sysop');
    await page.keyboard.press('Enter');
    await sleep(1500);

    // Skip prompts
    await page.keyboard.press('Enter');
    await sleep(1000);
    await page.keyboard.press('Enter');
    await sleep(2000);

    console.log('\n🚪 Executing GA command (ROM-based)...');
    await page.keyboard.type('GA');
    await page.keyboard.press('Enter');

    // Wait for door to execute
    console.log('[WAIT] Waiting for door execution...\n');
    await sleep(10000);

    // Check terminal content
    const terminalText = await page.evaluate(() => {
      const terminal = document.querySelector('.xterm-screen');
      return terminal ? terminal.textContent : '';
    });

    console.log('\n📋 Terminal content (last 400 chars):');
    console.log('===');
    console.log(terminalText.slice(-400));
    console.log('===\n');

    // Check for output
    if (terminalText.includes('GetAnswer') || terminalText.includes('Question')) {
      console.log('[OK] GA door produced output!');
    } else {
      console.log('[ERROR] No GA door output detected');
    }

    console.log('\n[INFO] Check backend logs: tail -f /tmp/backend.log | grep -E "ROM|Supervisor|RTE"');
    console.log('⏸️  Browser will stay open for 60 seconds...\n');
    await sleep(60000);

  } catch (error) {
    console.error('[ERROR] Test failed:', error);
  } finally {
    await browser.close();
  }
}

testRomBasedDoor().catch(console.error);
