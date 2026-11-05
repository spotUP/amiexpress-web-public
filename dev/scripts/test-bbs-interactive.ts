#!/usr/bin/env node

const io = require('socket.io-client');
const readline = require('readline');

const SERVER_URL = process.argv[2] || 'http://localhost:3001';
const USERNAME = process.argv[3] || 'sysop';
const PASSWORD = process.argv[4] || 'sysop';

const c = {
  reset: '\x1b[0m', bright: '\x1b[1m', red: '\x1b[31m', green: '\x1b[32m',
  yellow: '\x1b[33m', blue: '\x1b[34m', magenta: '\x1b[35m', cyan: '\x1b[36m', dim: '\x1b[2m'
};

const testResults = { passed: [], failed: [], total: 0 };

class InteractiveTester {
  constructor(serverUrl, username, password) {
    this.serverUrl = serverUrl;
    this.username = username;
    this.password = password;
    this.socket = null;
    this.authenticated = false;
    this.testNumber = 0;
    this.lastOutputTime = 0;
    this.outputCount = 0;
  }

  async connect() {
    return new Promise((resolve, reject) => {
      console.log(`\n${c.cyan}══════════════════════════════════════════════${c.reset}`);
      console.log(`${c.cyan}Connecting to ${this.serverUrl}${c.reset}`);
      console.log(`${c.cyan}══════════════════════════════════════════════${c.reset}\n`);
      
      this.socket = io(this.serverUrl, {
        transports: ['websocket', 'polling'],
        reconnection: false
      });

      // CRITICAL: Set up ansi-output handler FIRST
      this.socket.on('ansi-output', (data) => {
        this.lastOutputTime = Date.now();
        this.outputCount++;
        // Write directly to stdout - ALWAYS show output
        process.stdout.write(data);
      });

      this.socket.on('connect', () => {
        console.log(`\n${c.green}✓ Connected${c.reset}\n`);
        resolve();
      });

      this.socket.on('connect_error', reject);

      this.socket.on('login-success', (data) => {
        console.log(`\n${c.green}✓ Logged in: ${data.user.username} (Level ${data.user.secLevel})${c.reset}\n`);
        this.authenticated = true;
      });

      this.socket.on('login-failed', (error) => {
        console.log(`\n${c.red}✗ Login failed: ${error}${c.reset}\n`);
      });

      this.socket.on('prompt-password', () => {
        this.socket.emit('login', { username: this.username, password: this.password });
      });

      this.socket.on('user-not-found', (data) => {
        this.socket.emit('new-user-response', { response: 'C', username: data.username });
      });
    });
  }

  async handleConnection() {
    console.log(`${c.cyan}Handling connection flow...${c.reset}\n`);

    // Wait for connection screen and ANSI prompt - can be much faster
    await new Promise(r => setTimeout(r, 1000));
    console.log(`${c.dim}→ Answering ANSI prompt with 'A'${c.reset}`);
    this.socket.emit('command', 'A');

    // Wait for BBSTITLE screen - can be faster
    await new Promise(r => setTimeout(r, 500));
    console.log(`${c.dim}→ Continuing past BBSTITLE${c.reset}`);
    this.socket.emit('command', '\r');

    // Wait for login prompt
    await new Promise(r => setTimeout(r, 500));
    console.log(`${c.dim}→ Logging in${c.reset}\n`);
    this.socket.emit('check-username', { username: this.username });

    // Wait for auth
    for (let i = 0; i < 150; i++) {
      if (this.authenticated) break;
      await new Promise(r => setTimeout(r, 100));
    }

    // Wait for login completion and bulletins
    console.log(`${c.dim}→ Waiting for login completion and bulletins${c.reset}`);
    await new Promise(r => setTimeout(r, 2000));

    // Send Enter to continue past bulletins
    console.log(`${c.dim}→ Sending Enter to continue past bulletins${c.reset}`);
    this.socket.emit('command', '\r');

    // Wait for conference scan and menu
    console.log(`${c.dim}→ Waiting for conference scan and menu display${c.reset}`);
    await new Promise(r => setTimeout(r, 2000));

    // Send final Enter for menu display
    console.log(`${c.dim}→ Sending final Enter for menu display${c.reset}`);
    this.socket.emit('command', '\r');

    // Wait for menu to stabilize
    await new Promise(r => setTimeout(r, 1000));
  }

  async waitForOutput(minWait = 200) {
    const startOutputCount = this.outputCount;

    // Wait minimum time - BBS is very fast
    await new Promise(r => setTimeout(r, minWait));

    // Wait for output to stabilize (no new output for 100ms)
    let stableCount = 0;
    while (stableCount < 3) {
      await new Promise(r => setTimeout(r, 25));
      const timeSince = Date.now() - this.lastOutputTime;
      if (timeSince > 25) {
        stableCount++;
      } else {
        stableCount = 0;
      }
    }

    // Minimal buffer
    await new Promise(r => setTimeout(r, 50));

    return this.outputCount > startOutputCount;
  }

  async ask(question) {
    return new Promise((resolve) => {
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
      });
      
      rl.question(question, (answer) => {
        rl.close();
        resolve(answer);
      });
    });
  }

  async runTest(name, commands, interactive = false) {
    this.testNumber++;
    testResults.total++;

    console.log(`\n${c.bright}${c.cyan}══════════════════════════════════════════════════════════════════${c.reset}`);
    console.log(`${c.bright}${c.cyan}TEST ${this.testNumber}: ${name}${c.reset}`);
    console.log(`${c.cyan}══════════════════════════════════════════════════════════════════${c.reset}\n`);

    // Execute commands
    for (const cmd of commands) {
      const keyDisplay = cmd.input === '\r' ? 'ENTER' : cmd.input === '\n' ? 'ENTER' : cmd.input;
      console.log(`${c.blue}→ ${cmd.desc} [pressing: ${keyDisplay}]${c.reset}`);
      this.socket.emit('command', cmd.input);
      const hadOutput = await this.waitForOutput(cmd.wait || 1000);
      if (!hadOutput) {
        console.log(`${c.dim}  (no output received)${c.reset}`);
      }

      // If interactive mode, pause after each command for user confirmation
      if (interactive) {
        const confirm = await this.ask(`${c.yellow}Press Enter to continue to next step...${c.reset}`);
      }
    }

    // Show current prompt/menu state - wait longer to see final output
    console.log(`\n${c.dim}Current BBS state:${c.reset}`);
    console.log(`${c.dim}================${c.reset}`);
    // Wait longer to see if there's any final BBS output
    await new Promise(r => setTimeout(r, 1000));

    // Now ask for verification
    console.log(`\n${c.bright}${c.yellow}══════════════════════════════════════════════════════════════════${c.reset}`);
    console.log(`${c.bright}${c.yellow}CHECK THE OUTPUT ABOVE ^^^${c.reset}`);
    console.log(`${c.yellow}══════════════════════════════════════════════════════════════════${c.reset}\n`);

    const answer = await this.ask(`${c.magenta}Did "${name}" work correctly? (Y/n/s): ${c.reset}`);
    const resp = answer.trim().toLowerCase();

    if (resp === 's') {
      testResults.total--;
      console.log(`${c.dim}Skipped${c.reset}`);
    } else if (resp === 'y' || resp === 'yes' || resp === '') {
      testResults.passed.push({ num: this.testNumber, name });
      console.log(`${c.green}✓ PASS${c.reset}`);
    } else {
      testResults.failed.push({ num: this.testNumber, name });
      console.log(`${c.red}✗ FAIL${c.reset}`);
    }
  }

  async runAllTests() {
    console.log(`${c.bright}${c.cyan}══════════════════════════════════════════════════════════════════${c.reset}`);
    console.log(`${c.bright}${c.cyan} AmiExpress BBS - Interactive Testing${c.reset}`);
    console.log(`${c.bright}${c.cyan}══════════════════════════════════════════════════════════════════${c.reset}\n`);

    try {
      await this.connect();
      await this.handleConnection();
      
      console.log(`\n${c.bright}${c.green}Ready to test!${c.reset}\n`);
      console.log(`${c.yellow}After each test, answer: y=pass, n=fail, s=skip${c.reset}\n`);
      
      const ready = await this.ask(`${c.magenta}Press Enter to start tests...${c.reset} `);

      // Run tests
      await this.runTest('Main Menu', [
        { input: 'M', desc: 'Display main menu', wait: 500 },
        { input: '\r', desc: 'Continue from menu', wait: 200 },
        { input: '\r', desc: 'Continue from ANSI prompt', wait: 200 }
      ]);

      await this.runTest('Next Conference', [
        { input: '\r', desc: 'Start command input', wait: 100 },
        { input: '>', desc: 'Next conference', wait: 200 },
        { input: '\r', desc: 'Continue from conference change', wait: 200 }
      ]);

      await this.runTest('Previous Conference', [
        { input: '\r', desc: 'Start command input', wait: 100 },
        { input: '<', desc: 'Previous conference', wait: 200 },
        { input: '\r', desc: 'Continue from conference change', wait: 200 }
      ]);

      await this.runTest('Join Conference', [
        { input: '\r', desc: 'Start command input', wait: 100 },
        { input: 'J', desc: 'Join conference command', wait: 200 },
        { input: '\r', desc: 'Show conference menu', wait: 200 },
        { input: '1', desc: 'Select conference 1', wait: 200 },
        { input: '\r', desc: 'Confirm conference join', wait: 200 },
        { input: '\r', desc: 'Continue from conference join', wait: 200 }
      ]);

      await this.runTest('Next Message Base', [
        { input: '\r', desc: 'Start command input', wait: 100 },
        { input: '>>', desc: 'Next message base', wait: 200 },
        { input: '\r', desc: 'Continue from message base change', wait: 200 },
        { input: '\r', desc: 'Return to main menu', wait: 200 }
      ]);

      await this.runTest('Complete Message Entry', [
        { input: '\r', desc: 'Start command input', wait: 200 },
        { input: 'E', desc: 'Enter message', wait: 800 },
        { input: '\r', desc: 'Continue to recipient prompt', wait: 500 },
        { input: 'ALL', desc: 'To: ALL', wait: 500 },
        { input: '\r', desc: 'Continue to subject prompt', wait: 500 },
        { input: `Test ${Date.now()}`, desc: 'Subject', wait: 500 },
        { input: '\r', desc: 'Continue to body prompt', wait: 800 },
        { input: 'Line 1', desc: 'Body line 1', wait: 300 },
        { input: '\r', desc: 'Continue body input', wait: 300 },
        { input: 'Line 2', desc: 'Body line 2', wait: 300 },
        { input: '\r', desc: 'Continue body input', wait: 300 },
        { input: '\r', desc: 'Empty line to save message', wait: 800 },
        { input: '\r', desc: 'Continue from message posted', wait: 500 },
        { input: '\r', desc: 'Return to main menu', wait: 500 },
        { input: '\r', desc: 'Ensure menu is displayed', wait: 500 }
      ], true); // Add interactive flag

      await this.runTest('Read Messages', [
        { input: '\r', desc: 'Start command input', wait: 100 },
        { input: 'R', desc: 'Enter reader', wait: 300 },
        { input: '\r', desc: 'Continue from reader', wait: 200 }
      ]);

      await this.runTest('Quit Reader', [
        { input: '\r', desc: 'Start command input', wait: 100 },
        { input: 'Q', desc: 'Quit reader', wait: 200 },
        { input: '\r', desc: 'Continue from quit', wait: 200 }
      ]);

      await this.runTest('File List', [
        { input: '\r', desc: 'Start command input', wait: 100 },
        { input: 'F', desc: 'List files', wait: 300 },
        { input: '\r', desc: 'Continue from file list', wait: 200 }
      ]);

      await this.runTest('Who Online', [
        { input: '\r', desc: 'Start command input', wait: 100 },
        { input: 'W', desc: 'Who\'s online', wait: 200 },
        { input: '\r', desc: 'Continue from who list', wait: 200 }
      ]);

      // Skip System Stats test - 'S' is User Statistics, no separate system stats command

      await this.runTest('Help', [
        { input: '\r', desc: 'Start command input', wait: 100 },
        { input: '?', desc: 'Help menu', wait: 200 },
        { input: '\r', desc: 'Continue from help', wait: 200 }
      ]);

      // Results
      console.log(`\n${c.bright}${c.cyan}══════════════════════════════════════════════════════════════════${c.reset}`);
      console.log(`${c.bright}${c.cyan} Final Results${c.reset}`);
      console.log(`${c.cyan}══════════════════════════════════════════════════════════════════${c.reset}\n`);
      
      console.log(`Total:   ${testResults.total}`);
      console.log(`${c.green}Passed:  ${testResults.passed.length}${c.reset}`);
      console.log(`${c.red}Failed:  ${testResults.failed.length}${c.reset}`);
      
      const rate = testResults.total > 0 ? 
        ((testResults.passed.length / testResults.total) * 100).toFixed(1) : 0;
      console.log(`Rate:    ${rate}%\n`);

      if (testResults.failed.length > 0) {
        console.log(`${c.red}Failed:${c.reset}`);
        testResults.failed.forEach(t => console.log(`  ${t.num}. ${t.name}`));
      }

      console.log(`\n${c.cyan}══════════════════════════════════════════════════════════════════${c.reset}\n`);
      
      this.socket.disconnect();
      process.exit(testResults.failed.length > 0 ? 1 : 0);

    } catch (error) {
      console.error(`${c.red}Error: ${error.message}${c.reset}`);
      if (this.socket) this.socket.disconnect();
      process.exit(1);
    }
  }
}

async function main() {
  if (process.argv.includes('--help') || process.argv.includes('-h')) {
    console.log('Interactive Testing - Shows BBS output, asks y/n');
    console.log('\nUsage: node test-bbs-interactive.js [server] [user] [pass]');
    console.log('Defaults: http://localhost:3001 sysop sysop');
    process.exit(0);
  }

  try {
    require.resolve('socket.io-client');
  } catch (e) {
    console.error('Error: npm install socket.io-client');
    process.exit(1);
  }

  const tester = new InteractiveTester(SERVER_URL, USERNAME, PASSWORD);
  await tester.runAllTests();
}

main().catch(error => {
  console.error(`Fatal: ${error.message}`);
  process.exit(1);
});