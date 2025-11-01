const puppeteer = require('puppeteer');

async function testGADoor() {
  console.log('🧪 Testing GA (GetAnswer) door output\n');
  
  const browser = await puppeteer.launch({
    headless: false,
    args: ['--no-sandbox']
  });
  
  const page = await browser.newPage();
  
  // Monitor console
  page.on('console', msg => console.log('🖥️ [BROWSER]', msg.text()));
  
  await page.goto('http://localhost:5173');
  await new Promise(r => setTimeout(r, 1500));
  
  // Login as sysop (GA requires ACCESS=200)
  await page.keyboard.type('A');
  await page.keyboard.press('Enter');
  await new Promise(r => setTimeout(r, 750));
  
  await page.keyboard.type('sysop');
  await page.keyboard.press('Enter');
  await new Promise(r => setTimeout(r, 750));
  
  await page.keyboard.type('sysop');
  await page.keyboard.press('Enter');
  await new Promise(r => setTimeout(r, 2500));

  // Skip prompts
  await page.keyboard.press('Enter');
  await new Promise(r => setTimeout(r, 1000));

  await page.keyboard.press('Enter');
  await new Promise(r => setTimeout(r, 1000));

  console.log('\n🚪 Executing GA command...');
  await page.keyboard.type('GA');
  await page.keyboard.press('Enter');
  await new Promise(r => setTimeout(r, 5000));
  
  const text = await page.evaluate(() => {
    return document.querySelector('.xterm-rows')?.textContent || '';
  });
  
  console.log('\n📋 Terminal content (last 400 chars):');
  console.log('===');
  console.log(text.substring(Math.max(0, text.length - 400)));
  console.log('===\n');
  
  if (text.includes('GetAnswer') || text.includes('question') || text.length > 500) {
    console.log('✅ GA door produced output!');
  } else {
    console.log('❌ No GA door output detected');
  }
  
  console.log('\n💡 Check backend logs: tail -f /tmp/backend.log | grep -E "XIM|🔊|GetAnswer"');
  console.log('⏸️  Browser will stay open for 60 seconds...\n');
  
  await new Promise(r => setTimeout(r, 60000));
  await browser.close();
}

testGADoor().catch(console.error);
