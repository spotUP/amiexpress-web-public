#!/usr/bin/env node

const puppeteer = require('puppeteer');
const { spawn } = require('child_process');

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function testMultiTopDoor() {
  console.log('=== MultiTop Door Test ===\n');

  // Start monitoring backend logs
  console.log('Starting log monitor...\n');
  const logMonitor = spawn('tail', ['-f', '/tmp/backend.log']);
  
  let logOutput = '';
  logMonitor.stdout.on('data', (data) => {
    const text = data.toString();
    logOutput += text;
    // Only print key events
    if (text.includes('Intercepted:') || text.includes('library') || text.includes('Door') || text.includes('INVALID')) {
      process.stdout.write(text);
    }
  });

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox']
  });

  try {
    const page = await browser.newPage();
    
    console.log('Navigating to http://localhost:5173...');
    await page.goto('http://localhost:5173', { waitUntil: 'networkidle2' });
    
    console.log('Waiting for terminal to connect...\n');
    await sleep(1500);

    // Answer ANSI prompt
    console.log('Answering ANSI prompt with A');
    await page.keyboard.type('A');
    await page.keyboard.press('Enter');
    await sleep(750);

    // Login
    console.log('Typing username: sysop');
    await page.keyboard.type('sysop');
    await page.keyboard.press('Enter');
    await sleep(750);

    console.log('Typing password: sysop');
    await page.keyboard.type('sysop');
    await page.keyboard.press('Enter');
    await sleep(1500);

    // Get past screens
    console.log('Pressing Enter to get past screens...');
    await page.keyboard.press('Enter');
    await sleep(500);
    await page.keyboard.press('Enter');
    await sleep(500);

    console.log('\n=== EXECUTING MULTITOP COMMAND ===');
    console.log('Typing: MULTITOP');
    await page.keyboard.type('MULTITOP');
    await page.keyboard.press('Enter');
    
    console.log('Waiting for door to execute...');
    await sleep(2500);

    console.log('\nWaiting for final log messages...\n');
    await sleep(1500);

  } finally {
    await browser.close();
    logMonitor.kill();
    
    // Check for expected messages
    console.log('\n=== TEST RESULTS ===\n');
    
    const checks = [
      'Installing library call traps',
      'OpenLibrary',
      'Library trap detected',
    ];
    
    let foundCount = 0;
    checks.forEach(check => {
      const found = logOutput.includes(check);
      console.log(`  ${found ? '✓' : '✗'} ${check}`);
      if (found) foundCount++;
    });
    
    console.log(`\nScore: ${foundCount}/${checks.length} messages detected\n`);
    
    if (foundCount === checks.length) {
      console.log('✓ SUCCESS: All library trap messages detected!');
    } else {
      console.log('✗ INCOMPLETE: Some messages missing');
    }
  }
}

testMultiTopDoor().catch(console.error);
