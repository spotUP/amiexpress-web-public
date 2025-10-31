const puppeteer = require('puppeteer');

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function testDoorIO() {
  console.log('\n=== Testing Door Terminal I/O ===\n');

  const browser = await puppeteer.launch({
    headless: false,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
    defaultViewport: { width: 1280, height: 800 }
  });

  try {
    const page = await browser.newPage();

    // Enable console logging from page
    page.on('console', msg => {
      const text = msg.text();
      if (text.includes('XIMProtocol') || text.includes('Door')) {
        console.log('[Browser]', text);
      }
    });

    console.log('→ Navigating to BBS...');
    await page.goto('http://localhost:5173', { waitUntil: 'networkidle2' });
    await sleep(2000);

    console.log('→ Answering ANSI prompt...');
    await page.keyboard.type('A');
    await page.keyboard.press('Enter');
    await sleep(1000);

    console.log('→ Logging in as sysop...');
    await page.keyboard.type('sysop');
    await page.keyboard.press('Enter');
    await sleep(1000);

    await page.keyboard.type('sysop');
    await page.keyboard.press('Enter');
    await sleep(2000);

    console.log('→ Getting past screens...');
    await page.keyboard.press('Enter');
    await sleep(500);
    await page.keyboard.press('Enter');
    await sleep(500);

    console.log('\n→ Launching GetAnswer door (GA command)...');
    await page.keyboard.type('GA');
    await page.keyboard.press('Enter');

    // Wait for door to initialize and potentially display banner
    console.log('→ Waiting for door initialization (10 seconds)...');
    await sleep(10000);

    console.log('\n→ Sending test input to door...');
    console.log('  Typing: "Hello Door"');
    await page.keyboard.type('Hello Door');
    await sleep(2000);

    console.log('  Pressing Enter...');
    await page.keyboard.press('Enter');
    await sleep(2000);

    console.log('  Typing: "Y"');
    await page.keyboard.type('Y');
    await sleep(2000);

    console.log('\n→ Waiting for door execution (30 seconds)...');
    await sleep(30000);

    console.log('\n=== Test Complete ===');
    console.log('Check backend logs for XIM protocol messages:');
    console.log('  tail -f /tmp/backend.log | grep -E "XIMProtocol|GETKEY|JH_WRITE"');

  } catch (error) {
    console.error('Test failed:', error);
  } finally {
    await browser.close();
  }
}

testDoorIO();
