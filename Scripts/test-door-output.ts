/**
 * Test script to verify door output is working
 * Tests that Amiga doors can send text to the BBS terminal
 */

const puppeteer = require('puppeteer');

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function testDoorOutput() {
  console.log('🧪 Starting door output test...\n');

  const browser = await puppeteer.launch({
    headless: false,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
    defaultViewport: { width: 1280, height: 800 }
  });

  try {
    const page = await browser.newPage();

    // Navigate to BBS
    console.log('📡 Connecting to BBS...');
    await page.goto('http://localhost:5173', { waitUntil: 'networkidle2' });
    await sleep(1500);

    // Answer ANSI prompt
    console.log('🎨 Selecting ANSI mode...');
    await page.keyboard.type('A');
    await page.keyboard.press('Enter');
    await sleep(750);

    // Login as sysop
    console.log('🔐 Logging in as sysop...');
    await page.keyboard.type('sysop');
    await page.keyboard.press('Enter');
    await sleep(750);

    await page.keyboard.type('sysop');
    await page.keyboard.press('Enter');
    await sleep(2000);

    // Try to execute DOORS command
    console.log('🚪 Executing DOORS command...');
    await page.keyboard.type('DOORS');
    await page.keyboard.press('Enter');
    await sleep(1500);

    // Get terminal content
    let terminalText = await page.evaluate(() => {
      const term = document.querySelector('.xterm-rows');
      return term ? term.textContent : '';
    });

    console.log('📋 Terminal content after DOORS command:');
    console.log('---');
    console.log(terminalText.substring(terminalText.length - 500)); // Last 500 chars
    console.log('---\n');

    // Check if door list is displayed
    if (terminalText.includes('Door Games') || terminalText.includes('Available doors')) {
      console.log('[OK] DOORS command working - door menu displayed');

      // Try to select first door if available
      if (terminalText.includes('1.')) {
        console.log('[GAME] Attempting to select door #1...');
        await page.keyboard.type('1');
        await page.keyboard.press('Enter');
        await sleep(3000);

        // Get terminal content after door execution
        terminalText = await page.evaluate(() => {
          const term = document.querySelector('.xterm-rows');
          return term ? term.textContent : '';
        });

        console.log('📋 Terminal content after door execution:');
        console.log('---');
        console.log(terminalText.substring(terminalText.length - 500));
        console.log('---\n');

        if (terminalText.includes('Starting') || terminalText.includes('Launching')) {
          console.log('[OK] Door execution started');
        } else {
          console.log('[ERROR] Door may not have started properly');
        }
      } else {
        console.log('[WARNING]  No doors found in list');
      }
    } else {
      console.log('[ERROR] DOORS command failed - menu not displayed');
    }

    console.log('\n⏸️  Keeping browser open for manual inspection...');
    console.log('Press Ctrl+C to close');
    await sleep(300000); // Keep open for 5 minutes

  } catch (error) {
    console.error('[ERROR] Test error:', error);
  } finally {
    // Don't close browser automatically
    // await browser.close();
  }
}

testDoorOutput().catch(console.error);
