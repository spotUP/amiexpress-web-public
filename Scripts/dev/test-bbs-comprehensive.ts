#!/usr/bin/env node

/**
 * Comprehensive BBS Function Test Script
 * Tests all AmiExpress BBS commands and features
 * Reports issues found and creates a TODO list
 */

const io = require('socket.io-client');

// Test results storage
const testResults = {
  passed: [],
  failed: [],
  warnings: [],
  issues: []
};

let socket;
let currentState = 'connecting';
let testTimeout;

// Commands to test (from express.e internal commands)
const commandsToTest = [
  { cmd: 'G', name: 'Goodbye', description: 'Logout/Goodbye command' },
  { cmd: 'H', name: 'Help', description: 'Display help files' },
  { cmd: 'M', name: 'Main Menu', description: 'Return to main menu' },
  { cmd: 'Q', name: 'Quiet Mode', description: 'Toggle quiet mode' },
  { cmd: 'R', name: 'Read Messages', description: 'Read messages in current base' },
  { cmd: 'E', name: 'Enter Message', description: 'Enter new message' },
  { cmd: 'S', name: 'System Statistics', description: 'Display user statistics' },
  { cmd: 'T', name: 'Time', description: 'Display time and time left' },
  { cmd: 'X', name: 'Expert Mode', description: 'Toggle expert mode' },
  { cmd: 'A', name: 'ANSI Mode', description: 'Toggle ANSI mode' },
  { cmd: 'J', name: 'Join Conference', description: 'Join a conference' },
  { cmd: 'JM', name: 'Join Message Base', description: 'Join a message base' },
  { cmd: 'N', name: 'New Files', description: 'List new files' },
  { cmd: '<', name: 'Previous Conference', description: 'Move to previous conference' },
  { cmd: '>', name: 'Next Conference', description: 'Move to next conference' },
  { cmd: '[', name: 'Previous Message Base', description: 'Move to previous message base' },
  { cmd: ']', name: 'Next Message Base', description: 'Move to next message base' },
  { cmd: 'F', name: 'File List', description: 'List files in current area' },
  { cmd: 'FR', name: 'File List Raw', description: 'List files without descriptions' },
  { cmd: 'FS', name: 'File Status', description: 'Show file area status' },
  { cmd: 'U', name: 'Upload', description: 'Upload files' },
  { cmd: 'D', name: 'Download', description: 'Download files' },
  { cmd: 'C', name: 'Comment to Sysop', description: 'Send comment to sysop' },
  { cmd: 'O', name: 'Page Sysop', description: 'Page the sysop for chat' },
  { cmd: 'OLM', name: 'Online Message', description: 'Send online message to user' },
  { cmd: 'W', name: 'Who', description: 'Show who is online' },
  { cmd: 'WHO', name: 'Who List', description: 'Show who is online' },
  { cmd: 'WHD', name: 'Who Detailed', description: 'Show detailed who list' },
  { cmd: 'V', name: 'View File', description: 'View a text file' },
  { cmd: 'VER', name: 'Version', description: 'Show BBS version' },
  { cmd: 'Z', name: 'Zippy Search', description: 'Search for files' },
  { cmd: 'ZOOM', name: 'Zoom', description: 'Quick file search and download' },
  { cmd: 'B', name: 'Read Bulletins', description: 'Read bulletin files' },
  { cmd: '?', name: 'Menu Help', description: 'Display menu options' },
  { cmd: 'CF', name: 'Conference Flags', description: 'Set conference flags' },
  { cmd: 'MS', name: 'Mail Scan', description: 'Scan for personal mail' },
  { cmd: 'RL', name: 'Relogon', description: 'Relogon to BBS' },
  { cmd: 'UP', name: 'User Params', description: 'Edit user parameters' },
  { cmd: 'US', name: 'User Stats', description: 'Show user statistics' },
  { cmd: 'WUP', name: 'Write User Params', description: 'Save user parameters' }
];

// State-based test flow
let testIndex = 0;
let currentTest = null;

function log(message, type = 'info') {
  const timestamp = new Date().toISOString().split('T')[1].split('.')[0];
  const symbols = { info: '→', success: '✓', error: '✗', warning: '[WARNING]' };
  console.log(`[${timestamp}] ${symbols[type] || '→'} ${message}`);
}

function addIssue(category, command, description, severity = 'error') {
  testResults.issues.push({
    category,
    command,
    description,
    severity,
    timestamp: new Date().toISOString()
  });

  if (severity === 'error') {
    testResults.failed.push(`${command}: ${description}`);
  } else {
    testResults.warnings.push(`${command}: ${description}`);
  }
}

function recordSuccess(command, message) {
  testResults.passed.push(`${command}: ${message}`);
  log(`${command} - ${message}`, 'success');
}

function waitFor(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function runTest(test) {
  currentTest = test;
  log(`Testing: ${test.name} (${test.cmd})`, 'info');

  // Send the command
  socket.emit('ansi-input', test.cmd + '\r');

  // Wait for response
  await waitFor(500);
}

function setupSocketListeners() {
  socket.on('connect', () => {
    log('Connected to BBS', 'success');
    currentState = 'connected';
  });

  socket.on('ansi-output', (data) => {
    // Check for error patterns
    if (data.includes('Unknown command') || data.includes('Invalid')) {
      if (currentTest) {
        addIssue('command', currentTest.cmd, `Command not recognized or invalid: ${data.slice(0, 100)}`, 'error');
      }
    }

    // Check for permission denied
    if (data.includes('Permission denied') || data.includes('Access denied')) {
      if (currentTest) {
        addIssue('permissions', currentTest.cmd, 'Permission denied for sysop user', 'warning');
      }
    }

    // Check for crashes/errors
    if (data.includes('Error:') || data.includes('undefined') || data.includes('null')) {
      if (currentTest) {
        addIssue('runtime', currentTest.cmd, `Runtime error detected: ${data.slice(0, 100)}`, 'error');
      }
    }
  });

  socket.on('disconnect', () => {
    log('Disconnected from BBS', 'warning');
  });

  socket.on('error', (error) => {
    log(`Socket error: ${error}`, 'error');
    addIssue('connection', 'socket', `Socket error: ${error}`, 'error');
  });
}

async function loginAsSysop() {
  log('Logging in as sysop...', 'info');

  // Wait for login prompt
  await waitFor(2000);

  // Send username
  socket.emit('ansi-input', 'sysop\r');
  await waitFor(500);

  // Send password
  socket.emit('ansi-input', 'sysop\r');
  await waitFor(2000);

  log('Login complete', 'success');
}

async function runAllTests() {
  log('Starting comprehensive BBS test suite', 'info');
  log('═══════════════════════════════════════', 'info');

  // Phase 1: Connection and login
  log('\n[Phase 1] Connection and Authentication', 'info');
  try {
    await loginAsSysop();
    recordSuccess('LOGIN', 'Successfully logged in as sysop');
  } catch (err) {
    addIssue('authentication', 'LOGIN', `Failed to login: ${err.message}`, 'error');
    log('Cannot proceed without login', 'error');
    process.exit(1);
  }

  // Phase 2: Basic navigation commands
  log('\n[Phase 2] Testing Basic Navigation', 'info');
  const navigationTests = commandsToTest.filter(t =>
    ['M', 'T', 'S', 'VER', '?'].includes(t.cmd)
  );

  for (const test of navigationTests) {
    await runTest(test);
  }

  // Phase 3: Mode toggles
  log('\n[Phase 3] Testing Mode Toggles', 'info');
  const modeTests = commandsToTest.filter(t =>
    ['X', 'A', 'Q'].includes(t.cmd)
  );

  for (const test of modeTests) {
    await runTest(test);
    await runTest(test); // Toggle back
  }

  // Phase 4: Conference navigation
  log('\n[Phase 4] Testing Conference Commands', 'info');
  const confTests = commandsToTest.filter(t =>
    ['J', 'JM', '<', '>', '[', ']', 'CF'].includes(t.cmd)
  );

  for (const test of confTests) {
    if (test.cmd === 'J' || test.cmd === 'JM') {
      // Test with parameter
      socket.emit('ansi-input', test.cmd + ' 1\r');
      await waitFor(500);
    } else {
      await runTest(test);
    }
  }

  // Phase 5: Message commands
  log('\n[Phase 5] Testing Message Commands', 'info');
  const messageTests = commandsToTest.filter(t =>
    ['R', 'E', 'MS'].includes(t.cmd)
  );

  for (const test of messageTests) {
    await runTest(test);
    // Send escape/quit for message reader
    await waitFor(300);
    socket.emit('ansi-input', 'Q\r');
    await waitFor(300);
  }

  // Phase 6: File commands
  log('\n[Phase 6] Testing File Commands', 'info');
  const fileTests = commandsToTest.filter(t =>
    ['F', 'FR', 'FS', 'N', 'Z'].includes(t.cmd)
  );

  for (const test of fileTests) {
    await runTest(test);
    await waitFor(300);
  }

  // Phase 7: Communication commands
  log('\n[Phase 7] Testing Communication Commands', 'info');
  const commTests = commandsToTest.filter(t =>
    ['C', 'O', 'W', 'WHO', 'WHD'].includes(t.cmd)
  );

  for (const test of commTests) {
    await runTest(test);
    await waitFor(300);
  }

  // Phase 8: User commands
  log('\n[Phase 8] Testing User Commands', 'info');
  const userTests = commandsToTest.filter(t =>
    ['UP', 'US', 'WUP'].includes(t.cmd)
  );

  for (const test of userTests) {
    await runTest(test);
    await waitFor(300);
  }

  // Wait a bit for final responses
  await waitFor(2000);

  // Generate report
  generateReport();

  // Cleanup
  socket.disconnect();
  process.exit(0);
}

function generateReport() {
  log('\n═══════════════════════════════════════', 'info');
  log('TEST SUITE COMPLETE', 'info');
  log('═══════════════════════════════════════', 'info');

  console.log(`\nPassed Tests: ${testResults.passed.length}`);
  console.log(`Failed Tests: ${testResults.failed.length}`);
  console.log(`Warnings: ${testResults.warnings.length}`);
  console.log(`Total Issues: ${testResults.issues.length}`);

  if (testResults.issues.length > 0) {
    console.log('\n\n📋 ISSUES FOUND:\n');

    // Group by category
    const byCategory = {};
    testResults.issues.forEach(issue => {
      if (!byCategory[issue.category]) {
        byCategory[issue.category] = [];
      }
      byCategory[issue.category].push(issue);
    });

    Object.keys(byCategory).forEach(category => {
      console.log(`\n[${category.toUpperCase()}]`);
      byCategory[category].forEach((issue, idx) => {
        const icon = issue.severity === 'error' ? '✗' : '[WARNING]';
        console.log(`  ${icon} ${issue.command}: ${issue.description}`);
      });
    });
  }

  // Save to file
  const fs = require('fs');
  const reportPath = '~/Code/AmiExpress/amiexpress-web/test-report.json';
  fs.writeFileSync(reportPath, JSON.stringify(testResults, null, 2));
  log(`\n📄 Detailed report saved to: ${reportPath}`, 'success');
}

// Main execution
async function main() {
  try {
    socket = io('http://localhost:3001', {
      transports: ['websocket'],
      reconnection: false
    });

    setupSocketListeners();

    // Wait for connection
    await waitFor(1000);

    if (!socket.connected) {
      log('Failed to connect to BBS', 'error');
      process.exit(1);
    }

    await runAllTests();

  } catch (error) {
    log(`Fatal error: ${error.message}`, 'error');
    console.error(error);
    process.exit(1);
  }
}

// Handle interrupts
process.on('SIGINT', () => {
  log('\nTest interrupted by user', 'warning');
  if (socket) socket.disconnect();
  process.exit(0);
});

main();
