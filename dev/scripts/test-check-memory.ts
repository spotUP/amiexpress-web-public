const puppeteer = require('puppeteer');

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function checkMemory() {
  console.log('=== Check Memory at 0x7005c ===\n');

  const browser = await puppeteer.launch({
    headless: false,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  try {
    const page = await browser.newPage();
    await page.goto('http://localhost:5173', { waitUntil: 'networkidle2' });

    await sleep(1500);
    await page.keyboard.type('A');
    await page.keyboard.press('Enter');
    await sleep(750);

    await page.keyboard.type('sysop');
    await page.keyboard.press('Enter');
    await sleep(750);

    await page.keyboard.type('sysop');
    await page.keyboard.press('Enter');
    await sleep(1500);

    console.log('Executing DOORS command...');
    await page.keyboard.type('DOORS');
    await page.keyboard.press('Enter');
    await sleep(1000);

    console.log('Selecting GetAnswer door...');
    await page.keyboard.type('1');
    await page.keyboard.press('Enter');

    console.log('Waiting 5 seconds for door to initialize...');
    await sleep(5000);

  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await browser.close();
  }
}

checkMemory();
