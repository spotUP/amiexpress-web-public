const puppeteer = require('puppeteer');
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function test() {
  const browser = await puppeteer.launch({ headless: false });
  const page = await browser.newPage();
  await page.goto('http://localhost:5173');
  await sleep(1500);
  await page.keyboard.type('A\r');
  await sleep(750);
  await page.keyboard.type('sysop\r');
  await sleep(750);
  await page.keyboard.type('sysop\r');
  await sleep(2000);
  
  console.log('Testing J command...');
  await page.keyboard.type('J\r');
  await sleep(3000);
  
  const text = await page.evaluate(() => document.querySelector('.xterm-rows')?.textContent || '');
  console.log('Terminal output:', text.substring(Math.max(0, text.length - 200)));
  
  await sleep(30000);
}
test();
