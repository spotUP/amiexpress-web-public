#!/usr/bin/env node

const puppeteer = require('puppeteer');

async function testLogin() {
  const browser = await puppeteer.launch({ headless: false });
  const page = await browser.newPage();

  try {
    await page.goto('http://localhost:5173', { waitUntil: 'networkidle2' });
    await new Promise(r => setTimeout(r, 3000));

    console.log('Typing: sysop');
    await page.keyboard.type('sysop');
    await page.keyboard.press('Enter');
    await new Promise(r => setTimeout(r, 2000));

    // Try password: password
    console.log('Trying password: password');
    await page.keyboard.type('password');
    await page.keyboard.press('Enter');
    await new Promise(r => setTimeout(r, 3000));

    const text = await page.evaluate(() => document.body.innerText);
    console.log('\nScreen content:');
    console.log(text.substring(0, 500));

    // Wait so we can see result
    await new Promise(r => setTimeout(r, 10000));
  } finally {
    await browser.close();
  }
}

testLogin().catch(console.error);
