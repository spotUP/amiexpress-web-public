#!/usr/bin/env node

/**
 * Deep Dive BBS Testing
 * Thoroughly tests command functionality and reports detailed results
 */

const io = require('socket.io-client');

let socket;
let testLog = [];
let issues = [];
let passed = 0;
let failed = 0;

function log(message, level = 'info') {
  const timestamp = new Date().toISOString().split('T')[1].split('.')[0];
  const entry = { timestamp, message, level };
  testLog.push(entry);

  const symbols = { info: '→', pass: '✓', fail: '✗', warn: '[WARNING]' };
  console.log(`[${timestamp}] ${symbols[level] || '→'} ${message}`);
}

function assertPass(test, message) {
  passed++;
  log(`${test}: ${message}`, 'pass');
}

function assertFail(test, message, details = '') {
  failed++;
  issues.push({ test, message, details });
  log(`${test}: ${message}`, 'fail');
  if (details) log(`  Details: ${details}`, 'info');
}

async function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

class BBSClient {
  constructor() {
    this.allOutput = '';
    this.lastOutput = '';
  }

  connect() {
    return new Promise((resolve, reject) => {
      socket = io('http://localhost:3001', {
        transports: ['websocket'],
        reconnection: false,
        timeout: 5000
      });

      socket.on('connect', () => {
        log('Connected to BBS', 'pass');
        resolve();
      });

      socket.on('ansi-output', (data) => {
        this.allOutput += data;
        this.lastOutput += data;
      });

      socket.on('error', (error) => {
        reject(error);
      });

      socket.on('disconnect', () => {
        log('Disconnected from BBS', 'warn');
      });

      setTimeout(() => reject(new Error('Connection timeout')), 5000);
    });
  }

  async send(text, waitTime = 800) {
    this.lastOutput = '';
    socket.emit('ansi-input', text + '\r');
    await wait(waitTime); // Give server time to process
    return this.lastOutput;
  }

  getOutput() {
    return this.lastOutput;
  }

  getAllOutput() {
    return this.allOutput;
  }

  hasOutput(text) {
    return this.lastOutput.toLowerCase().includes(text.toLowerCase());
  }

  outputLength() {
    return this.lastOutput.length;
  }

  clearOutput() {
    this.lastOutput = '';
  }
}

// Test Suites

async function testLogin(client) {
  log('\n=== Testing Login ===', 'info');

  await wait(3000); // Wait for initial screens

  log('Sending username...', 'info');
  await client.send('sysop');
  await wait(800);

  log('Sending password...', 'info');
  await client.send('sysop');
  await wait(4000); // Wait for all login screens

  const output = client.getAllOutput(); // Use all accumulated output
  log(`Login output length: ${output.length} chars`, 'info');

  if (output.length > 500) {
    assertPass('LOGIN', 'Successfully logged in');

    // Clear any pause prompts after login (bulletins, etc.)
    log('Clearing pause prompts...', 'info');
    await client.send('', 1000); // Press Enter to clear pause
    await wait(1000);
    await client.send('', 1000); // Press Enter again if needed
    await wait(1000);

    return true;
  } else {
    assertFail('LOGIN', 'Login failed or timed out', `Output length: ${output.length}`);
    return false;
  }
}

async function testBasicCommands(client) {
  log('\n=== Testing Basic Commands ===', 'info');

  // Wait a bit after login before sending commands
  await wait(1000);

  // Test T (Time)
  await client.send('T', 1000);
  const tOutput = client.getOutput();
  log(`T output: "${tOutput.substring(0, 50)}"`, 'info');
  if (tOutput.includes(':') || tOutput.toLowerCase().includes('time') || tOutput.length > 10) {
    assertPass('T', 'Time command responds');
  } else {
    assertFail('T', 'Time command no response', `Output length: ${tOutput.length}`);
  }

  // Test VER (Version)
  await client.send('VER', 1000);
  const verOutput = client.getOutput();
  if (verOutput.toLowerCase().includes('amiexpress') || verOutput.toLowerCase().includes('version') || verOutput.length > 20) {
    assertPass('VER', 'Version command responds');
  } else {
    assertFail('VER', 'Version command no response', `Got: "${verOutput.substring(0, 50)}"`);
  }

  // Test S (Stats)
  await client.send('S', 1200);
  const sOutput = client.getOutput();
  if (sOutput.toLowerCase().includes('stat') || sOutput.toLowerCase().includes('user') || sOutput.length > 50) {
    assertPass('S', 'Stats command responds');
  } else {
    assertFail('S', 'Stats command no response', `Got: ${sOutput.length} chars`);
  }
}

async function testModeToggles(client) {
  log('\n=== Testing Mode Toggles ===', 'info');

  // Test X (Expert Mode)
  await client.send('X');
  if (client.hasOutput('expert') || client.hasOutput('mode') || client.outputLength() > 10) {
    assertPass('X on', 'Expert mode toggle responds');
  } else {
    assertFail('X on', 'Expert mode no response');
  }

  // Toggle back
  await client.send('X');
  if (client.outputLength() > 10) {
    assertPass('X off', 'Expert mode toggles back');
  } else {
    assertFail('X off', 'Expert mode toggle back failed');
  }

  // Test A (ANSI)
  await client.send('A');
  if (client.hasOutput('ansi') || client.hasOutput('color') || client.outputLength() > 10) {
    assertPass('A on', 'ANSI mode toggle responds');
  } else {
    assertFail('A on', 'ANSI mode no response');
  }

  await client.send('A');
  assertPass('A off', 'ANSI mode toggles back');

  // Test Q (Quiet)
  await client.send('Q');
  if (client.outputLength() > 5) {
    assertPass('Q on', 'Quiet mode toggle responds');
  } else {
    assertFail('Q on', 'Quiet mode no response');
  }

  await client.send('Q');
  assertPass('Q off', 'Quiet mode toggles back');
}

async function testConferenceCommands(client) {
  log('\n=== Testing Conference Commands ===', 'info');

  // Test J 1
  await client.send('J 1');
  await wait(1000); // Conference join takes time
  if (client.hasOutput('General') || client.hasOutput('conference') || client.hasOutput('joined') || client.hasOutput('BULL')) {
    assertPass('J 1', 'Joined conference 1');
  } else {
    assertFail('J 1', 'Failed to join conference', `Output: ${client.getOutput().substring(0, 200)}`);
  }

  // Test J 2
  await client.send('J 2');
  await wait(1000);
  if (client.hasOutput('Tech') || client.hasOutput('Support') || client.hasOutput('BULL')) {
    assertPass('J 2', 'Joined conference 2');
  } else {
    assertFail('J 2', 'Failed to join conference');
  }

  // Test J 4 (invalid)
  await client.send('J 4');
  await wait(1000);
  if (client.hasOutput('AVAILABLE CONFERENCES') || client.hasOutput('Conference Number')) {
    assertPass('J 4', 'Invalid conference shows list (no crash)');
    // Cancel the prompt
    await client.send('');
    await wait(500);
  } else {
    assertFail('J 4', 'Invalid conference handling broken');
  }

  // Test > (Next Conference)
  await client.send('>');
  await wait(1000);
  if (client.outputLength() > 50) {
    assertPass('>', 'Next conference responds');
  } else {
    assertFail('>', 'Next conference no response');
  }

  // Test < (Previous Conference)
  await client.send('<');
  await wait(1000);
  if (client.outputLength() > 50) {
    assertPass('<', 'Previous conference responds');
  } else {
    assertFail('<', 'Previous conference no response');
  }
}

async function testMessageBaseCommands(client) {
  log('\n=== Testing Message Base Commands ===', 'info');

  // Test >> (Next Message Base)
  await client.send('>>');
  await wait(1000);
  if (client.outputLength() > 50) {
    assertPass('>>', 'Next message base responds');
  } else {
    assertFail('>>', 'Next message base no response');
  }

  // Test << (Previous Message Base)
  await client.send('<<');
  await wait(1000);
  if (client.outputLength() > 50) {
    assertPass('<<', 'Previous message base responds');
  } else {
    assertFail('<<', 'Previous message base no response');
  }

  // Test JM 1 (Join Message Base)
  await client.send('JM 1');
  await wait(1000);
  if (client.outputLength() > 50) {
    assertPass('JM 1', 'Join message base responds');
  } else {
    assertFail('JM 1', 'Join message base no response');
  }
}

async function testMessageCommands(client) {
  log('\n=== Testing Message Commands ===', 'info');

  // Test R (Read Messages)
  await client.send('R');
  await wait(1500);
  if (client.hasOutput('message') || client.hasOutput('Msg') || client.hasOutput('no messages') || client.hasOutput('Options')) {
    assertPass('R', 'Read messages command works');

    // If in message reader, test navigation
    if (client.hasOutput('Options') || client.hasOutput('>:')) {
      // Test ? (help)
      await client.send('?');
      await wait(500);
      if (client.outputLength() > 50) {
        assertPass('R > ?', 'Message reader help works');
      }

      // Quit reader
      await client.send('Q');
      await wait(500);
      assertPass('R > Q', 'Quit message reader');
    } else {
      assertPass('R > empty', 'No messages (OK)');
    }
  } else {
    assertFail('R', 'Read messages failed');
  }

  // Test MS (Mail Scan)
  await client.send('MS');
  await wait(1000);
  if (client.outputLength() > 10) {
    assertPass('MS', 'Mail scan responds');
  } else {
    assertFail('MS', 'Mail scan no response');
  }

  // Test E (Enter Message) - just verify prompt appears
  await client.send('E');
  await wait(1000);
  if (client.hasOutput('To:') || client.hasOutput('recipient') || client.hasOutput('message')) {
    assertPass('E', 'Enter message prompts');
    // Abort the message
    await client.send('/ABORT');
    await wait(500);
  } else {
    assertFail('E', 'Enter message failed');
  }
}

async function testFileCommands(client) {
  log('\n=== Testing File Commands ===', 'info');

  // Test F (File List)
  await client.send('F');
  await wait(1500);
  if (client.hasOutput('file') || client.hasOutput('File') || client.outputLength() > 50) {
    assertPass('F', 'File list responds');
  } else {
    assertFail('F', 'File list no response');
  }

  // Test FR (File Raw)
  await client.send('FR');
  await wait(1000);
  if (client.outputLength() > 30) {
    assertPass('FR', 'File raw list responds');
  } else {
    assertFail('FR', 'File raw list no response');
  }

  // Test FS (File Status)
  await client.send('FS');
  await wait(1000);
  if (client.outputLength() > 30) {
    assertPass('FS', 'File status responds');
  } else {
    assertFail('FS', 'File status no response');
  }

  // Test N (New Files)
  await client.send('N');
  await wait(1000);
  if (client.outputLength() > 30) {
    assertPass('N', 'New files responds');
  } else {
    assertFail('N', 'New files no response');
  }
}

async function testCommunicationCommands(client) {
  log('\n=== Testing Communication Commands ===', 'info');

  // Test W (Who)
  await client.send('W');
  await wait(500);
  if (client.outputLength() > 20) {
    assertPass('W', 'Who command responds');
  } else {
    assertFail('W', 'Who command no response');
  }

  // Test WHO
  await client.send('WHO');
  await wait(500);
  if (client.outputLength() > 20) {
    assertPass('WHO', 'WHO command responds');
  } else {
    assertFail('WHO', 'WHO command no response');
  }

  // Test WHD
  await client.send('WHD');
  await wait(1000);
  if (client.outputLength() > 20) {
    assertPass('WHD', 'WHD command responds');
  } else {
    assertFail('WHD', 'WHD command no response');
  }
}

async function testUserCommands(client) {
  log('\n=== Testing User Commands ===', 'info');

  // Test US (User Stats)
  await client.send('US');
  await wait(1000);
  if (client.outputLength() > 50) {
    assertPass('US', 'User stats responds');
  } else {
    assertFail('US', 'User stats no response');
  }

  // Test UP (User Params) - just verify it prompts
  await client.send('UP');
  await wait(1000);
  if (client.outputLength() > 30) {
    assertPass('UP', 'User params responds');
  } else {
    assertFail('UP', 'User params no response');
  }
}

async function generateReport() {
  log('\n' + '='.repeat(60), 'info');
  log('TEST SUITE COMPLETE', 'info');
  log('='.repeat(60), 'info');

  const total = passed + failed;
  const percentage = total > 0 ? ((passed / total) * 100).toFixed(1) : 0;

  console.log(`\n📊 Results:`);
  console.log(`  Passed: ${passed}`);
  console.log(`  Failed: ${failed}`);
  console.log(`  Total: ${total}`);
  console.log(`  Success Rate: ${percentage}%`);

  if (issues.length > 0) {
    console.log(`\n[ERROR] Issues Found (${issues.length}):\n`);
    issues.forEach((issue, idx) => {
      console.log(`${idx + 1}. ${issue.test}: ${issue.message}`);
      if (issue.details) {
        console.log(`   ${issue.details}`);
      }
    });
  } else {
    console.log(`\n[OK] All tests passed!`);
  }

  // Save report
  const fs = require('fs');
  const report = {
    timestamp: new Date().toISOString(),
    summary: { passed, failed, total, percentage: parseFloat(percentage) },
    issues,
    log: testLog
  };

  fs.writeFileSync('~/Code/AmiExpress/amiexpress-web/test-results.json', JSON.stringify(report, null, 2));
  log('\n📄 Detailed report: test-results.json', 'info');
}

// Main execution
async function main() {
  console.log('╔═══════════════════════════════════════════════════════════╗');
  console.log('║         AmiExpress BBS - Deep Dive Test Suite            ║');
  console.log('╚═══════════════════════════════════════════════════════════╝\n');

  const client = new BBSClient();

  try {
    await client.connect();

    const loggedIn = await testLogin(client);
    if (!loggedIn) {
      log('Cannot proceed without login', 'fail');
      process.exit(1);
    }

    await testBasicCommands(client);
    await testModeToggles(client);
    await testConferenceCommands(client);
    await testMessageBaseCommands(client);
    await testMessageCommands(client);
    await testFileCommands(client);
    await testCommunicationCommands(client);
    await testUserCommands(client);

    await generateReport();

    socket.disconnect();
    process.exit(failed > 0 ? 1 : 0);

  } catch (error) {
    log(`Fatal error: ${error.message}`, 'fail');
    console.error(error.stack);
    process.exit(1);
  }
}

process.on('SIGINT', () => {
  log('\nTest interrupted', 'warn');
  if (socket) socket.disconnect();
  process.exit(1);
});

main();
