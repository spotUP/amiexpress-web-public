const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({
    headless: false,
    devtools: true
  });

  const page = await browser.newPage();

  // Listen to console messages
  page.on('console', msg => {
    console.log('[BROWSER]', msg.type(), msg.text());
  });

  // Listen to network requests
  page.on('request', req => {
    if (req.url().includes('socket.io')) {
      console.log('[REQUEST]', req.method(), req.url());
    }
  });

  // Listen to responses
  page.on('response', res => {
    if (res.url().includes('socket.io')) {
      console.log('[RESPONSE]', res.status(), res.url());
    }
  });

  console.log('Opening chat login page...');
  await page.goto('http://localhost:3001/chat/login', {
    waitUntil: 'networkidle2'
  });

  console.log('Waiting 2 seconds for modal to render...');
  await new Promise(r => setTimeout(r, 2000));

  console.log('Clicking in the terminal to focus...');
  await page.click('.chat-terminal-wrapper');

  console.log('Waiting 1 second...');
  await new Promise(r => setTimeout(r, 1000));

  console.log('Typing "test" into terminal...');
  await page.keyboard.type('test', { delay: 100 });

  console.log('Waiting 2 seconds to see what happens...');
  await new Promise(r => setTimeout(r, 2000));

  console.log('Pressing Tab...');
  await page.keyboard.press('Tab');

  console.log('Waiting 2 seconds...');
  await new Promise(r => setTimeout(r, 2000));

  console.log('Typing "password"...');
  await page.keyboard.type('password', { delay: 100 });

  console.log('Waiting 2 seconds...');
  await new Promise(r => setTimeout(r, 2000));

  console.log('Pressing Enter...');
  await page.keyboard.press('Enter');

  console.log('Waiting 5 seconds to see result...');
  await new Promise(r => setTimeout(r, 5000));

  console.log('Done! Browser will stay open for inspection.');
})();
