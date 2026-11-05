const puppeteer = require('puppeteer');

async function testDoor() {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  try {
    const page = await browser.newPage();

    // Listen to console logs
    page.on('console', msg => {
      console.log('[Browser Console]', msg.text());
    });

    console.log('→ Opening http://localhost:5173');
    await page.goto('http://localhost:5173', { waitUntil: 'networkidle2' });

    console.log('→ Waiting for terminal to be ready...');
    await page.waitForTimeout(2000);

    console.log('→ Typing username: sysop');
    await page.keyboard.type('sysop');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(1000);

    console.log('→ Typing password: password');
    await page.keyboard.type('password');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(3000);

    console.log('→ Typing GA command');
    await page.keyboard.type('GA');
    await page.keyboard.press('Enter');

    console.log('→ Waiting for door to execute...');
    await page.waitForTimeout(5000);

    console.log('✓ Test complete - check logs for results');

  } catch (error) {
    console.error('✗ Test error:', error.message);
  } finally {
    await browser.close();
  }
}

testDoor().catch(console.error);
