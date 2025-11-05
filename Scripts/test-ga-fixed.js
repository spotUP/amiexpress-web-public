const puppeteer = require('puppeteer');

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function testGA() {
  console.log('🧪 Testing GA door with proper timing\n');
  
  const browser = await puppeteer.launch({ headless: false });
  const page = await browser.newPage();
  
  await page.goto('http://localhost:5173');
  await sleep(2000);
  
  // ANSI
  await page.keyboard.type('A');
  await page.keyboard.press('Enter');
  await sleep(1000);
  
  // Username
  await page.keyboard.type('sysop');
  await page.keyboard.press('Enter');
  await sleep(1000);
  
  // Password
  await page.keyboard.type('sysop');
  await page.keyboard.press('Enter');
  
  // Wait for menu to fully load
  console.log('⏳ Waiting for menu (8 seconds)...');
  await sleep(8000);
  
  console.log('🚪 Typing GA command...');
  await page.keyboard.type('GA');
  await page.keyboard.press('Enter');
  
  // Wait for door execution
  await sleep(10000);
  
  const text = await page.evaluate(() => {
    return document.querySelector('.xterm-rows')?.textContent || '';
  });
  
  console.log('\n📋 Terminal (last 500 chars):');
  console.log(text.substring(Math.max(0, text.length - 500)));
  
  await sleep(60000);
}

testGA();
