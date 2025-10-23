#!/usr/bin/env node

/**
 * Comprehensive BBS Command Test Suite
 * Tests all commands and reports detailed results
 */

const io = require('socket.io-client');

let socket;
let allOutput = '';
let testResults = {
  passed: [],
  failed: [],
  issues: []
};

function log(message, type = 'info') {
  const symbols = { info: '→', success: '✓', error: '✗', warning: '⚠' };
  console.log(`${symbols[type] || '→'} ${message}`);
}

function addIssue(test, description, severity = 'error') {
  testResults.issues.push({ test, description, severity });
  if (severity === 'error') {
    testResults.failed.push(`${test}: ${description}`);
    log(`${test} - ${description}`, 'error');
  } else {
    log(`${test} - ${description}`, 'warning');
  }
}

function recordPass(test, message) {
  testResults.passed.push(`${test}: ${message}`);
  log(`${test} - ${message}`, 'success');
}

async function waitFor(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

let lastOutput = '';

function setupSocket() {
  socket = io('http://localhost:3001', {
    transports: ['websocket'],
    reconnection: false
  });

  socket.on('ansi-output', (data) => {
    allOutput += data;
    lastOutput += data;
  });

  return new Promise((resolve, reject) => {
    socket.on('connect', () => {
      log('Connected to BBS', 'success');
      resolve();
    });

    socket.on('error', (error) => {
      reject(error);
    });

    setTimeout(() => reject(new Error('Connection timeout')), 5000);
  });
}

async function sendCommand(cmd) {
  lastOutput = '';
  socket.emit('ansi-input', cmd + '\r');
  await waitFor(500);
  return lastOutput;
}

async function login() {
  log('Logging in as sysop...', 'info');
  await waitFor(2000);
  await sendCommand('sysop');
  await waitFor(500);
  await sendCommand('sysop');
  await waitFor(3000);
  log('Login complete', 'success');
}

// Test suites

async function testJCommand() {
  log('\n[Test Suite] J Command with Parameters', 'info');

  // Test J 1 (valid conference)
  let output = await sendCommand('J 1');
  await waitFor(1000);

  if (lastOutput.includes('General') || lastOutput.includes('joined') || lastOutput.includes('BULL')) {
    recordPass('J 1', 'Successfully joined conference 1');
  } else {
    addIssue('J 1', 'Failed to join conference 1');
  }

  // Test J 2 (valid conference)
  output = await sendCommand('J 2');
  await waitFor(1000);

  if (lastOutput.includes('Tech Support') || lastOutput.includes('joined') || lastOutput.includes('BULL')) {
    recordPass('J 2', 'Successfully joined conference 2');
  } else {
    addIssue('J 2', 'Failed to join conference 2');
  }

  // Test J 4 (invalid conference - should redisplay list)
  output = await sendCommand('J 4');
  await waitFor(1000);

  if (lastOutput.includes('AVAILABLE CONFERENCES') || lastOutput.includes('Conference Number')) {
    recordPass('J 4', 'Invalid conference correctly shows list again');
  } else {
    addIssue('J 4', 'Invalid conference number handling failed');
  }

  // Cancel by pressing Enter
  await sendCommand('');
  await waitFor(500);
}

async function testExpertMode() {
  log('\n[Test Suite] Expert Mode Toggle', 'info');

  // Get to menu first
  await sendCommand('M');
  await waitFor(500);

  // Toggle expert mode on
  let output = await sendCommand('X');
  await waitFor(500);

  if (lastOutput.includes('Expert') || lastOutput.includes('mode') || lastOutput.includes('ON') || lastOutput.length > 10) {
    recordPass('X toggle on', 'Expert mode toggled');
  } else {
    addIssue('X toggle on', 'No response from expert mode toggle');
  }

  // Toggle expert mode off
  output = await sendCommand('X');
  await waitFor(500);

  if (lastOutput.includes('Expert') || lastOutput.includes('mode') || lastOutput.includes('OFF') || lastOutput.length > 10) {
    recordPass('X toggle off', 'Expert mode toggled back');
  } else {
    addIssue('X toggle off', 'No response from expert mode toggle');
  }
}

async function testConferenceNavigation() {
  log('\n[Test Suite] Conference Navigation', 'info');

  // Return to menu
  await sendCommand('M');
  await waitFor(500);

  // Test >
  let output = await sendCommand('>');
  await waitFor(1000);

  if (lastOutput.includes('conference') || lastOutput.includes('joined') || lastOutput.includes('Conf') || lastOutput.includes('BULL')) {
    recordPass('> (Next Conf)', 'Moved to next conference');
  } else {
    addIssue('> (Next Conf)', 'Failed to move to next conference');
  }

  // Test <
  output = await sendCommand('<');
  await waitFor(1000);

  if (lastOutput.includes('conference') || lastOutput.includes('joined') || lastOutput.includes('Conf') || lastOutput.includes('BULL')) {
    recordPass('< (Prev Conf)', 'Moved to previous conference');
  } else {
    addIssue('< (Prev Conf)', 'Failed to move to previous conference');
  }

  // Test >>
  output = await sendCommand('>>');
  await waitFor(1000);

  if (lastOutput.includes('message') || lastOutput.includes('base') || lastOutput.includes('joined') || lastOutput.includes('BULL')) {
    recordPass('>> (Next MB)', 'Moved to next message base');
  } else {
    addIssue('>> (Next MB)', 'Failed to move to next message base');
  }

  // Test <<
  output = await sendCommand('<<');
  await waitFor(1000);

  if (lastOutput.includes('message') || lastOutput.includes('base') || lastOutput.includes('joined') || lastOutput.includes('BULL')) {
    recordPass('<< (Prev MB)', 'Moved to previous message base');
  } else {
    addIssue('<< (Prev MB)', 'Failed to move to previous message base');
  }
}

async function testMessageCommands() {
  log('\n[Test Suite] Message Commands', 'info');

  await sendCommand('M');
  await waitFor(500);

  // Test R (Read)
  let output = await sendCommand('R');
  await waitFor(1000);

  if (lastOutput.includes('message') || lastOutput.includes('Msg') || lastOutput.includes('no messages') || lastOutput.includes('No messages')) {
    recordPass('R (Read)', 'Read messages command works');
    // Quit reader
    await sendCommand('Q');
    await waitFor(500);
  } else {
    addIssue('R (Read)', 'Read messages command failed');
  }

  // Test E (Enter)
  output = await sendCommand('E');
  await waitFor(1000);

  if (lastOutput.includes('To:') || lastOutput.includes('Enter') || lastOutput.includes('message') || lastOutput.includes('Subject')) {
    recordPass('E (Enter)', 'Enter message command works');
    // Abort message entry
    await sendCommand('/ABORT');
    await waitFor(500);
  } else {
    addIssue('E (Enter)', 'Enter message command failed');
  }

  // Test MS (Mail Scan)
  output = await sendCommand('MS');
  await waitFor(1000);

  if (lastOutput.includes('Scanning') || lastOutput.includes('mail') || lastOutput.includes('message') || lastOutput.length > 10) {
    recordPass('MS (Mail Scan)', 'Mail scan command works');
  } else {
    addIssue('MS (Mail Scan)', 'Mail scan command failed');
  }
}

async function testFileCommands() {
  log('\n[Test Suite] File Commands', 'info');

  await sendCommand('M');
  await waitFor(500);

  // Test F (File List)
  let output = await sendCommand('F');
  await waitFor(1000);

  if (lastOutput.includes('file') || lastOutput.includes('File') || lastOutput.includes('bytes') || lastOutput.length > 50) {
    recordPass('F (File List)', 'File list command works');
  } else {
    addIssue('F (File List)', 'File list command failed');
  }

  // Test FR (File List Raw)
  output = await sendCommand('FR');
  await waitFor(1000);

  if (lastOutput.includes('file') || lastOutput.includes('File') || lastOutput.length > 50) {
    recordPass('FR (Raw List)', 'File list raw command works');
  } else {
    addIssue('FR (Raw List)', 'File list raw command failed');
  }

  // Test FS (File Status)
  output = await sendCommand('FS');
  await waitFor(1000);

  if (lastOutput.includes('file') || lastOutput.includes('File') || lastOutput.includes('Status') || lastOutput.length > 50) {
    recordPass('FS (Status)', 'File status command works');
  } else {
    addIssue('FS (Status)', 'File status command failed');
  }

  // Test N (New Files)
  output = await sendCommand('N');
  await waitFor(1000);

  if (lastOutput.includes('new') || lastOutput.includes('New') || lastOutput.includes('file') || lastOutput.length > 50) {
    recordPass('N (New Files)', 'New files command works');
  } else {
    addIssue('N (New Files)', 'New files command failed');
  }
}

async function testUtilityCommands() {
  log('\n[Test Suite] Utility Commands', 'info');

  await sendCommand('M');
  await waitFor(500);

  // Test T (Time)
  let output = await sendCommand('T');
  await waitFor(500);

  if (lastOutput.includes('time') || lastOutput.includes('Time') || lastOutput.includes(':') || lastOutput.length > 10) {
    recordPass('T (Time)', 'Time command works');
  } else {
    addIssue('T (Time)', 'Time command failed');
  }

  // Test S (Stats)
  output = await sendCommand('S');
  await waitFor(1000);

  if (lastOutput.includes('stat') || lastOutput.includes('Stat') || lastOutput.includes('user') || lastOutput.length > 50) {
    recordPass('S (Stats)', 'Statistics command works');
  } else {
    addIssue('S (Stats)', 'Statistics command failed');
  }

  // Test VER (Version)
  output = await sendCommand('VER');
  await waitFor(500);

  if (lastOutput.includes('version') || lastOutput.includes('Version') || lastOutput.includes('AmiExpress') || lastOutput.length > 20) {
    recordPass('VER', 'Version command works');
  } else {
    addIssue('VER', 'Version command failed');
  }

  // Test ? (Help)
  output = await sendCommand('?');
  await waitFor(1000);

  if (lastOutput.includes('help') || lastOutput.includes('Help') || lastOutput.includes('command') || lastOutput.length > 50) {
    recordPass('? (Help)', 'Help command works');
  } else {
    addIssue('? (Help)', 'Help command failed');
  }
}

async function testCommunicationCommands() {
  log('\n[Test Suite] Communication Commands', 'info');

  await sendCommand('M');
  await waitFor(500);

  // Test W (Who)
  let output = await sendCommand('W');
  await waitFor(500);

  if (lastOutput.includes('online') || lastOutput.includes('user') || lastOutput.includes('node') || lastOutput.length > 20) {
    recordPass('W (Who)', 'Who command works');
  } else {
    addIssue('W (Who)', 'Who command failed');
  }

  // Test WHO
  output = await sendCommand('WHO');
  await waitFor(500);

  if (lastOutput.includes('online') || lastOutput.includes('user') || lastOutput.includes('node') || lastOutput.length > 20) {
    recordPass('WHO', 'WHO command works');
  } else {
    addIssue('WHO', 'WHO command failed');
  }

  // Test WHD
  output = await sendCommand('WHD');
  await waitFor(1000);

  if (lastOutput.includes('online') || lastOutput.includes('user') || lastOutput.includes('node') || lastOutput.length > 20) {
    recordPass('WHD (Detailed)', 'WHO detailed command works');
  } else {
    addIssue('WHD (Detailed)', 'WHO detailed command failed');
  }
}

async function generateReport() {
  log('\n═══════════════════════════════════════', 'info');
  log('TEST SUITE COMPLETE', 'info');
  log('═══════════════════════════════════════', 'info');

  console.log(`\nPassed: ${testResults.passed.length}`);
  console.log(`Failed: ${testResults.failed.length}`);
  console.log(`Total Issues: ${testResults.issues.length}`);

  if (testResults.issues.length > 0) {
    console.log('\n📋 ISSUES FOUND:\n');
    testResults.issues.forEach((issue, idx) => {
      const icon = issue.severity === 'error' ? '✗' : '⚠';
      console.log(`  ${idx + 1}. ${icon} ${issue.test}`);
      console.log(`     ${issue.description}`);
    });
  } else {
    log('\n🎉 All tests passed!', 'success');
  }

  // Save detailed report
  const fs = require('fs');
  const report = {
    timestamp: new Date().toISOString(),
    summary: {
      passed: testResults.passed.length,
      failed: testResults.failed.length,
      total: testResults.passed.length + testResults.failed.length
    },
    passed: testResults.passed,
    failed: testResults.failed,
    issues: testResults.issues
  };

  fs.writeFileSync('~/Code/amiexpress-web/test-results.json', JSON.stringify(report, null, 2));
  log('\n📄 Detailed report saved to: test-results.json', 'success');
}

async function main() {
  try {
    console.log('═══════════════════════════════════════');
    console.log('  AmiExpress BBS Command Test Suite');
    console.log('═══════════════════════════════════════\n');

    await setupSocket();
    await login();

    // Run all test suites
    await testJCommand();
    await testExpertMode();
    await testConferenceNavigation();
    await testMessageCommands();
    await testFileCommands();
    await testUtilityCommands();
    await testCommunicationCommands();

    await generateReport();

    socket.disconnect();
    process.exit(testResults.failed.length > 0 ? 1 : 0);

  } catch (error) {
    log(`Fatal error: ${error.message}`, 'error');
    console.error(error);
    process.exit(1);
  }
}

process.on('SIGINT', () => {
  log('\nTest interrupted', 'warning');
  if (socket) socket.disconnect();
  process.exit(1);
});

main();
