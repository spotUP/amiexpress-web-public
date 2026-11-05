const puppeteer = require('puppeteer');

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function testMemoryAtCrash() {
  console.log('=== Memory Analysis at Crash Point ===\n');

  const browser = await puppeteer.launch({
    headless: false,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });
    await page.goto('http://localhost:5173', { waitUntil: 'networkidle2' });

    console.log('Waiting for connection...');
    await sleep(1500);

    // Answer ANSI prompt
    await page.keyboard.type('A');
    await page.keyboard.press('Enter');
    await sleep(750);

    // Login
    await page.keyboard.type('sysop');
    await page.keyboard.press('Enter');
    await sleep(750);

    await page.keyboard.type('sysop');
    await page.keyboard.press('Enter');
    await sleep(1500);

    // Execute DOORS command
    console.log('Executing DOORS command...');
    await page.keyboard.type('DOORS');
    await page.keyboard.press('Enter');
    await sleep(1000);

    // Select GetAnswer door (option 1)
    console.log('Selecting GetAnswer door...');
    await page.keyboard.type('1');
    await page.keyboard.press('Enter');

    console.log('Waiting for door to execute (25 seconds)...');
    await sleep(25000);

    console.log('\n=== Test Complete ===');

  } catch (error) {
    console.error('Error during test:', error.message);
  } finally {
    await browser.close();
  }
}

testMemoryAtCrash();
