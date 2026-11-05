#!/usr/bin/env node

/**
 * Comprehensive BBS Command Test Suite
 * Tests all commands and reports detailed results
 */

const io = require('socket.io-client');

let socket;
let allOutput = '';
let outputLog = '';
let testResults = {
  passed: [],
  failed: [],
  issues: []
};

function log(message, type = 'info') {
  const symbols = { info: '→', success: '✓', error: '✗', warning: '[WARNING]' };
  console.log(`${symbols[type] || '→'} ${message}`);
}

function addIssue(test, description, severity = 'error') {
  testResults.issues.push({ test, description, severity });
  if (severity === 'error') {
    testResults.failed.push(`${test}: ${description}`);
    log(`${test} - ${description}`, 'error');
    const sanitized = lastOutput
      .replace(/\x1b\[2J/g, '')
      .replace(/\x1b\[H/g, '');
    const preview = sanitized.replace(/\r/g, '\\r').replace(/\n/g, '\\n');
    console.log('=== LAST OUTPUT ===');
    console.log(preview);
    console.log('===================');
  } else {
    log(`${test} - ${description}`, 'warning');
  }
}

function recordPass(test, message) {
  testResults.passed.push(`${test}: ${message}`);
  log(`${test} - ${message}`, 'success');
}

async function waitFor(ms) {
  return new Promise<void>(resolve => setTimeout(resolve, ms));
}

const menuPromptPattern = /AmiExpress Web BBS \[[^\]]+\] Menu/;
const pausePromptPattern = /(Press any key to continue|Press ENTER to continue|\(Pause\)\.\.\.[^\r\n]*)/i;
const morePromptPattern = /More\(y\/n\/ns\)?/i;

function stripAnsiCodes(text) {
  return text.replace(/\x1b\[[0-9;]*[A-Za-z]/g, '');
}

async function waitForPrompt(pattern, since = 0, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const chunk = stripAnsiCodes(outputLog.slice(since));
    if (pattern.test(chunk)) {
      return;
    }
    await waitFor(100);
  }
  const finalChunk = stripAnsiCodes(outputLog.slice(since));
  console.warn('[Test] prompt timed out, sanitized tail:', finalChunk.slice(-200));
  throw new Error(`[Test] prompt not detected within timeout: ${pattern}`);
}

async function waitForMenuPrompt(timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  let lastHandled = '';
  while (Date.now() < deadline) {
    const tail = stripAnsiCodes(outputLog.slice(-4096));

    if (menuPromptPattern.test(tail)) {
      return;
    }

    if (morePromptPattern.test(tail) && tail !== lastHandled) {
      lastHandled = tail;
      await sendCommand(' ');
      await waitFor(200);
      continue;
    }

    if (pausePromptPattern.test(tail) && tail !== lastHandled) {
      lastHandled = tail;
      await sendCommand('');
      await waitFor(200);
      continue;
    }

    await waitFor(100);
  }

  throw new Error('[Test] menu prompt not detected within timeout');
}

async function respondToPausePrompts(timeoutMs = 4000) {
  const deadline = Date.now() + timeoutMs;
  let lastHandled = '';
  while (Date.now() < deadline) {
    const tail = stripAnsiCodes(outputLog.slice(-4096));
    if (morePromptPattern.test(tail) && tail !== lastHandled) {
      lastHandled = tail;
      await sendCommand(' ');
      await waitFor(200);
      continue;
    }
    if (pausePromptPattern.test(tail) && tail !== lastHandled) {
      lastHandled = tail;
      await sendCommand('');
      await waitFor(200);
      continue;
    }
    await waitFor(100);
  }
}

async function sendCommand(cmd, waitAfterMs = 400) {
  const start = outputLog.length;
  socket.emit('command', `${cmd}\r`);
  await waitFor(waitAfterMs);
  lastOutput = stripAnsiCodes(outputLog.slice(start));
  return start;
}

function recordOutput(start) {
  const output = stripAnsiCodes(outputLog.slice(start));
  lastOutput = output;
  return output;
}

async function executeMenuCommand(cmd) {
  await respondToPausePrompts(2000);
  await waitForMenuPrompt();
  const start = await sendCommand(cmd);
  await respondToPausePrompts(2000);
  await waitForMenuPrompt();
  return recordOutput(start);
}

let lastOutput = '';
function setupSocket() {
  socket = io('http://localhost:3001', {
    transports: ['websocket'],
    reconnection: false
  });

  socket.on('ansi-output', (data) => {
    allOutput += data;
    outputLog += data;
    const safeData = data.replace(/\x1b\[2J/g, '').replace(/\x1b\[H/g, '');
    process.stdout.write(safeData);
  });

  socket.on('prompt-login', () => {
    log('Received login prompt', 'info');
  });

  socket.on('login-success', () => {
    log('Login success event received', 'success');
  });

  socket.on('login-failed', (message) => {
    log(`Login failed: ${message}`, 'error');
  });

  return new Promise<void>((resolve, reject) => {
    socket.on('connect', () => {
      log('Connected to BBS', 'success');
      resolve();
    });

    socket.on('error', (error) => {
      reject(error);
    });

    setTimeout(() => reject(new Error('Connection timeout')), 15000);
  });
}
async function login() {
  log('Logging in as sysop...', 'info');
  await waitFor(2000);

  socket.emit('login', { username: 'sysop', password: 'sysop' });

  await new Promise<void>((resolve, reject) => {
    socket.once('login-success', () => resolve());
    socket.once('login-failed', (message: string) => reject(new Error(message)));
  });

  await waitForMenuPrompt(30000);
  log('Login complete', 'success');
}

// Test suites

async function joinConference(confNumber: number, expectSuccess = true) {
  await waitForMenuPrompt();
  await respondToPausePrompts(2000);

  const start = outputLog.length;
  await sendCommand('J');
  await waitForPrompt(/Conference\s*Number/i, start, 12000);
  await sendCommand(String(confNumber));

  if (expectSuccess) {
    await waitForPrompt(/Conference joined:/i, start, 12000);
  } else {
    await waitForPrompt(/You do not have access to the requested conference|No message bases in this conference/i, start, 12000);
    await respondToPausePrompts(2000);
  }

  await respondToPausePrompts(2000);
  await waitForMenuPrompt();
  return recordOutput(start);
}

async function testJCommand() {
  log('\n[Test Suite] J Command with Parameters', 'info');

  await waitForMenuPrompt();
  const firstOutput = await joinConference(1);
  if (/Conference joined:.*General/i.test(firstOutput)) {
    recordPass('J 1', 'Successfully joined conference 1');
  } else {
    addIssue('J 1', 'Failed to join conference 1');
  }

  await waitForMenuPrompt();
  const secondOutput = await joinConference(2);
  if (/Conference joined:.*Tech Support/i.test(secondOutput) || /Tech Support/i.test(secondOutput)) {
    recordPass('J 2', 'Successfully joined conference 2');
  } else {
    addIssue('J 2', 'Failed to join conference 2');
  }

  await waitForMenuPrompt();
  const invalidOutput = await joinConference(4, false);
  if (/You do not have access/i.test(invalidOutput) || /No message bases/i.test(invalidOutput)) {
    recordPass('J 4', 'Invalid conference correctly shows access error');
  } else {
    addIssue('J 4', 'Invalid conference number handling failed');
  }
  await waitForMenuPrompt();
}

async function testExpertMode() {
  log('\n[Test Suite] Expert Mode Toggle', 'info');

  const toggleOn = await executeMenuCommand('X');
  if (/Expert mode/i.test(toggleOn)) {
    recordPass('X toggle on', 'Expert mode toggled');
  } else {
    addIssue('X toggle on', 'No response from expert mode toggle');
  }

  await respondToPausePrompts(2000);
  const toggleOff = await executeMenuCommand('X');
  if (/Expert mode/i.test(toggleOff)) {
    recordPass('X toggle off', 'Expert mode toggled back');
  } else {
    addIssue('X toggle off', 'No response from expert mode toggle');
  }
}

async function testConferenceNavigation() {
  log('\n[Test Suite] Conference Navigation', 'info');

  await respondToPausePrompts(2000);
  const nextConf = await executeMenuCommand('>');
  if (/conference/i.test(nextConf) || /Conf/i.test(nextConf) || /BULL/i.test(nextConf)) {
    recordPass('> (Next Conf)', 'Moved to next conference');
  } else {
    addIssue('> (Next Conf)', 'Failed to move to next conference');
  }

  await sendCommand(''); // clear any pause
  const prevConf = await executeMenuCommand('<');
  if (/conference/i.test(prevConf) || /Conf/i.test(prevConf) || /BULL/i.test(prevConf)) {
    recordPass('< (Prev Conf)', 'Moved to previous conference');
  } else {
    addIssue('< (Prev Conf)', 'Failed to move to previous conference');
  }

  await sendCommand('');
  const nextMB = await executeMenuCommand('>>');
  if (/message/i.test(nextMB) || /base/i.test(nextMB) || /BULL/i.test(nextMB)) {
    recordPass('>> (Next MB)', 'Moved to next message base');
  } else {
    addIssue('>> (Next MB)', 'Failed to move to next message base');
  }

  await sendCommand('');
  const prevMB = await executeMenuCommand('<<');
  if (/message/i.test(prevMB) || /base/i.test(prevMB) || /BULL/i.test(prevMB)) {
    recordPass('<< (Prev MB)', 'Moved to previous message base');
  } else {
    addIssue('<< (Prev MB)', 'Failed to move to previous message base');
  }
}

async function testMessageCommands() {
  log('\n[Test Suite] Message Commands', 'info');

  await waitForMenuPrompt();
  await respondToPausePrompts(2000);

  const readStart = await sendCommand('R');
  try {
    await waitForPrompt(/Msg\. Options/i, readStart, 6000);
    await sendCommand('Q');
    await waitForMenuPrompt();
  } catch {
    // No messages case – treat as success
    await waitForMenuPrompt();
  }
  const readOutput = recordOutput(readStart);
  if (/Msg\. Options/i.test(readOutput) || /message/i.test(readOutput)) {
    recordPass('R (Read)', 'Read messages command works');
  } else {
    addIssue('R (Read)', 'Read messages command failed');
  }

  await sendCommand(''); // clear any leftover prompt
  const entryStart = await sendCommand('E');
  // If prompt not seen quickly, try sending Enter once to trigger it
  try {
    await waitForPrompt(/recipient username/i, entryStart, 6000);
  } catch {
    await sendCommand('');
    await waitForPrompt(/recipient username/i, entryStart, 6000);
  }
  await sendCommand('sysop');
  await waitForPrompt(/Subject/i, entryStart, 6000);
  await sendCommand('Harness Test');
  await waitForPrompt(/Private \(Y\/N\)\?/i, entryStart, 6000);
  await sendCommand('y');
  await waitForPrompt(/Enter message/i, entryStart, 6000);
  await sendCommand('Harness message body');
  await sendCommand('');
  await waitForPrompt(/Saving/i, entryStart, 6000);
  await waitForMenuPrompt();
  const entryOutput = recordOutput(entryStart);
  if (/Message #[0-9]+ posted successfully/i.test(entryOutput) || /Message posted/i.test(entryOutput)) {
    recordPass('E (Enter)', 'Enter message command works');
  } else {
    addIssue('E (Enter)', 'Enter message command failed');
  }

  const mailScanOutput = await executeMenuCommand('MS');
  if (/Scanning/i.test(mailScanOutput) || /mail/i.test(mailScanOutput)) {
    recordPass('MS (Mail Scan)', 'Mail scan command works');
  } else {
    addIssue('MS (Mail Scan)', 'Mail scan command failed');
  }
}

async function testFileCommands() {
  log('\n[Test Suite] File Commands', 'info');

  const fileList = await executeMenuCommand('F');
  if (/file/i.test(fileList) || /bytes/i.test(fileList)) {
    recordPass('F (File List)', 'File list command works');
  } else {
    addIssue('F (File List)', 'File list command failed');
  }

  const rawList = await executeMenuCommand('FR');
  if (/file/i.test(rawList)) {
    recordPass('FR (Raw List)', 'File list raw command works');
  } else {
    addIssue('FR (Raw List)', 'File list raw command failed');
  }

  const statusOutput = await executeMenuCommand('FS');
  if (/Status/i.test(statusOutput) || /file/i.test(statusOutput)) {
    recordPass('FS (Status)', 'File status command works');
  } else {
    addIssue('FS (Status)', 'File status command failed');
  }

  const newFilesOutput = await executeMenuCommand('N');
  if (/new files/i.test(newFilesOutput) || /new/i.test(newFilesOutput) || /No new files/i.test(newFilesOutput)) {
    recordPass('N (New Files)', 'New files command works');
  } else {
    addIssue('N (New Files)', 'New files command failed');
  }
}

async function testUtilityCommands() {
  log('\n[Test Suite] Utility Commands', 'info');

  const timeOutput = await executeMenuCommand('T');
  if (/Time/i.test(timeOutput) || /:/.test(timeOutput)) {
    recordPass('T (Time)', 'Time command works');
  } else {
    addIssue('T (Time)', 'Time command failed');
  }

  const statsOutput = await executeMenuCommand('S');
  if (/stat/i.test(statsOutput)) {
    recordPass('S (Stats)', 'Statistics command works');
  } else {
    addIssue('S (Stats)', 'Statistics command failed');
  }

  const versionOutput = await executeMenuCommand('VER');
  if (/version/i.test(versionOutput) || /AmiExpress/i.test(versionOutput)) {
    recordPass('VER', 'Version command works');
  } else {
    addIssue('VER', 'Version command failed');
  }

  const helpOutput = await executeMenuCommand('?');
  if (/help/i.test(helpOutput)) {
    recordPass('? (Help)', 'Help command works');
  } else {
    addIssue('? (Help)', 'Help command failed');
  }
}

async function testCommunicationCommands() {
  log('\n[Test Suite] Communication Commands', 'info');

  const whoOutput = await executeMenuCommand('W');
  if (/online/i.test(whoOutput) || /user/i.test(whoOutput)) {
    recordPass('W (Who)', 'Who command works');
  } else {
    addIssue('W (Who)', 'Who command failed');
  }

  const whoAllOutput = await executeMenuCommand('WHO');
  if (/online/i.test(whoAllOutput) || /node/i.test(whoAllOutput)) {
    recordPass('WHO', 'WHO command works');
  } else {
    addIssue('WHO', 'WHO command failed');
  }

  const whdOutput = await executeMenuCommand('WHD');
  if (/online/i.test(whdOutput) || /Detailed/i.test(whdOutput)) {
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
      const icon = issue.severity === 'error' ? '✗' : '[WARNING]';
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

  fs.writeFileSync(require('path').join(require('os').tmpdir(), 'test-results.json'), JSON.stringify(report, null, 2));
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
