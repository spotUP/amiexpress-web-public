/**
 * Test script for AquaWho door
 */

const puppeteer = require('puppeteer');

const BBS_URL = 'http://localhost:5173';
const TEST_USERNAME = 'sysop';
const TEST_PASSWORD = 'sysop';

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function testWhoDoor() {
  console.log('🚀 Starting AquaWho door test...\n');

  const browser = await puppeteer.launch({
    headless: false,
    defaultViewport: null,
    args: ['--window-size=1024,768']
  });

  try {
    const page = await browser.newPage();

    page.on('console', msg => {
      const type = msg.type();
      if (type === 'error') {
        console.log('❌ Browser error:', msg.text());
      }
    });

    console.log('📡 Connecting to BBS...');
    await page.goto(BBS_URL, { waitUntil: 'networkidle2' });
    await sleep(2000);

    console.log('🔐 Logging in as', TEST_USERNAME);
    await page.waitForSelector('#terminal', { timeout: 10000 });
    await sleep(1000);

    await page.keyboard.type(TEST_USERNAME);
    await page.keyboard.press('Enter');
    await sleep(1000);

    await page.keyboard.type(TEST_PASSWORD);
    await page.keyboard.press('Enter');
    await sleep(2000);

    console.log('✅ Logged in\n');

    console.log('📋 Getting to main menu...');
    await page.keyboard.press('Enter');
    await sleep(1000);
    await page.keyboard.press('Enter');
    await sleep(1000);

    console.log('🚪 Launching WHO door...\n');
    await page.keyboard.type('WHO');
    await page.keyboard.press('Enter');
    await sleep(3000);

    const terminalContent = await page.evaluate(() => {
      const terminal = document.querySelector('#terminal');
      return terminal ? terminal.textContent : '';
    });

    if (terminalContent.includes('AquaWho') || terminalContent.includes('Who is online')) {
      console.log('✅ WHO door launched!');
      await sleep(5000);
      console.log('🚪 Exiting door...');
      await page.keyboard.press('q');
      await sleep(2000);
    } else if (terminalContent.includes('Command not found') || terminalContent.includes('Unknown command')) {
      console.log('❌ WHO door NOT installed');
      console.log('\n📝 To install:');
      console.log('   Create BBS/Commands/BBSCmd/WHO.info with:');
      console.log('   TYPE=DOOR');
      console.log('   LOCATION=Doors:AquaWho/AquaWho');
      console.log('   SECURITY=10');
      console.log('   DESCRIPTION=View who is online\n');
    } else {
      console.log('⚠️  Unexpected response');
      console.log('Last 500 chars:', terminalContent.substring(terminalContent.length - 500));
    }

    console.log('\n⏳ Waiting 10 seconds (you can test manually)...');
    await sleep(10000);

  } catch (error) {
    console.error('❌ Test failed:', error.message);
  } finally {
    await browser.close();
    console.log('\n✅ Test complete');
  }
}

testWhoDoor().catch(console.error);
