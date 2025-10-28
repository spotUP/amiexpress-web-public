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
    
    // Wait for ANSI prompt
    await new Promise(r => setTimeout(r, 2000));
    console.log(`${c.dim}→ Answering ANSI prompt${c.reset}`);
    this.socket.emit('command', 'A');
    
    await new Promise(r => setTimeout(r, 2000));
    console.log(`${c.dim}→ Continuing${c.reset}`);
    this.socket.emit('command', '\r');
    
    await new Promise(r => setTimeout(r, 2000));
    console.log(`${c.dim}→ Logging in${c.reset}\n`);
    this.socket.emit('check-username', { username: this.username });
    
    // Wait for auth
    for (let i = 0; i < 150; i++) {
      if (this.authenticated) break;
      await new Promise(r => setTimeout(r, 100));
    }
    
    // Wait for bulletins/menu
    await new Promise(r => setTimeout(r, 5000));
  }

  async waitForOutput(minWait = 3000) {
    const startOutputCount = this.outputCount;
    
    // Wait minimum time
    await new Promise(r => setTimeout(r, minWait));
    
    // Wait for output to stabilize (no new output for 800ms)
    let stableCount = 0;
    while (stableCount < 8) {
      await new Promise(r => setTimeout(r, 100));
      const timeSince = Date.now() - this.lastOutputTime;
      if (timeSince > 100) {
        stableCount++;
      } else {
        stableCount = 0;
      }
    }
    
    // Extra buffer
    await new Promise(r => setTimeout(r, 500));
    
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

  async runTest(name, commands) {
    this.testNumber++;
    testResults.total++;
    
    console.log(`\n${c.bright}${c.cyan}══════════════════════════════════════════════════════════════════${c.reset}`);
    console.log(`${c.bright}${c.cyan}TEST ${this.testNumber}: ${name}${c.reset}`);
    console.log(`${c.cyan}══════════════════════════════════════════════════════════════════${c.reset}\n`);
    
    // Execute commands
    for (const cmd of commands) {
      console.log(`${c.blue}→ ${cmd.desc}${c.reset}`);
      this.socket.emit('command', cmd.input);
      const hadOutput = await this.waitForOutput(cmd.wait || 3000);
      if (!hadOutput) {
        console.log(`${c.dim}  (no output received)${c.reset}`);
      }
    }
    
    // Now ask for verification
    console.log(`\n${c.bright}${c.yellow}══════════════════════════════════════════════════════════════════${c.reset}`);
    console.log(`${c.bright}${c.yellow}CHECK THE OUTPUT ABOVE ^^^${c.reset}`);
    console.log(`${c.yellow}══════════════════════════════════════════════════════════════════${c.reset}\n`);
    
    const answer = await this.ask(`${c.magenta}Did "${name}" work correctly? (y/n/s): ${c.reset}`);
    const resp = answer.trim().toLowerCase();
    
    if (resp === 's') {
      testResults.total--;
      console.log(`${c.dim}Skipped${c.reset}`);
    } else if (resp === 'y' || resp === '') {
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
        { input: 'M', desc: 'Display main menu', wait: 3000 }
      ]);

      await this.runTest('Next Conference', [
        { input: '>', desc: 'Next conference', wait: 3000 }
      ]);

      await this.runTest('Previous Conference', [
        { input: '<', desc: 'Previous conference', wait: 3000 }
      ]);

      await this.runTest('Join Conference', [
        { input: 'J 1', desc: 'Join conference 1', wait: 3500 }
      ]);

      await this.runTest('Next Message Base', [
        { input: '>>', desc: 'Next message base', wait: 3000 }
      ]);

      await this.runTest('Complete Message Entry', [
        { input: 'E', desc: 'Enter message', wait: 3000 },
        { input: 'ALL', desc: 'To: ALL', wait: 3000 },
        { input: `Test ${Date.now()}`, desc: 'Subject', wait: 3000 },
        { input: 'Line 1', desc: 'Body line 1', wait: 1500 },
        { input: '', desc: 'End body', wait: 3000 },
        { input: 'S', desc: 'Save', wait: 3500 }
      ]);

      await this.runTest('Read Messages', [
        { input: 'R', desc: 'Enter reader', wait: 4000 }
      ]);

      await this.runTest('Quit Reader', [
        { input: 'Q', desc: 'Quit reader', wait: 3000 }
      ]);

      await this.runTest('File List', [
        { input: 'F', desc: 'List files', wait: 4000 }
      ]);

      await this.runTest('Who Online', [
        { input: 'W', desc: 'Who\'s online', wait: 3000 }
      ]);

      await this.runTest('System Stats', [
        { input: 'S', desc: 'System stats', wait: 3000 }
      ]);

      await this.runTest('Help', [
        { input: '?', desc: 'Help menu', wait: 3000 }
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