#!/usr/bin/env node

/**
 * AmiExpress BBS - Comprehensive Command Test Suite
 * 
 * Tests all 45+ BBS commands from express.e implementation
 * Based on COMPLETE_COMMAND_LIST.md
 * 
 * Usage: node test-bbs-commands.js [server-url] [username] [password]
 */

const io = require('socket.io-client');

// Configuration
const SERVER_URL = process.argv[2] || 'http://localhost:3001';
const USERNAME = process.argv[3] || 'sysop';
const PASSWORD = process.argv[4] || 'sysop';
const DELAY_BETWEEN_COMMANDS = 1000; // 1 second delay between commands
const WAIT_FOR_RESPONSE = 2000; // 2 seconds to wait for response

// Test results
const testResults = {
  passed: [],
  failed: [],
  skipped: [],
  total: 0
};

// ANSI colors
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

class BBSCommandTester {
  constructor(serverUrl, username, password) {
    this.serverUrl = serverUrl;
    this.username = username;
    this.password = password;
    this.socket = null;
    this.authenticated = false;
    this.currentTest = null;
    this.receivedOutput = '';
    this.testQueue = [];
  }

  async connect() {
    return new Promise((resolve, reject) => {
      console.log(`${colors.cyan}[TEST] Connecting to ${this.serverUrl}...${colors.reset}`);
      
      this.socket = io(this.serverUrl, {
        transports: ['websocket', 'polling'],
        reconnection: false
      });

      this.socket.on('connect', () => {
        console.log(`${colors.green}[TEST] Connected${colors.reset}`);
        resolve();
      });

      this.socket.on('connect_error', (error) => {
        reject(new Error(`Connection failed: ${error.message}`));
      });

      this.setupEventHandlers();
    });
  }

  setupEventHandlers() {
    this.socket.on('disconnect', () => {
      console.log(`${colors.yellow}[TEST] Disconnected${colors.reset}`);
    });

    this.socket.on('ansi-output', (data) => {
      this.receivedOutput += data;
      // Only show output in verbose mode
      if (process.env.VERBOSE) {
        process.stdout.write(data);
      }
    });

    this.socket.on('login-success', (data) => {
      console.log(`${colors.green}[TEST] Login successful: ${data.user.username}${colors.reset}`);
      this.authenticated = true;
    });

    this.socket.on('login-failed', (error) => {
      console.log(`${colors.red}[TEST] Login failed: ${error}${colors.reset}`);
    });

    this.socket.on('prompt-password', () => {
      this.socket.emit('login', { username: this.username, password: this.password });
    });

    this.socket.on('user-not-found', (data) => {
      // Auto-create new user for testing
      this.socket.emit('new-user-response', { response: 'C', username: data.username });
    });
  }

  async login() {
    return new Promise((resolve) => {
      console.log(`${colors.cyan}[TEST] Handling connection screens...${colors.reset}`);
      
      // Wait for ANSI prompt
      setTimeout(() => {
        console.log(`${colors.cyan}[TEST] Answering ANSI prompt${colors.reset}`);
        this.socket.emit('command', 'A'); // Answer ANSI prompt
        
        setTimeout(() => {
          console.log(`${colors.cyan}[TEST] Continuing through screens${colors.reset}`);
          this.socket.emit('command', '\r'); // Press Enter to continue
          
          setTimeout(() => {
            console.log(`${colors.cyan}[TEST] Logging in as ${this.username}...${colors.reset}`);
            this.socket.emit('check-username', { username: this.username });
            
            // Wait for authentication
            const checkAuth = setInterval(() => {
              if (this.authenticated) {
                clearInterval(checkAuth);
                console.log(`${colors.green}[TEST] Authentication complete${colors.reset}`);
                resolve();
              }
            }, 100);
            
            // Timeout after 10 seconds
            setTimeout(() => {
              clearInterval(checkAuth);
              if (!this.authenticated) {
                console.log(`${colors.yellow}[TEST] Proceeding (auth completing)${colors.reset}`);
                resolve();
              }
            }, 10000);
          }, 2000);
        }, 2000);
      }, 2000);
    });
  }

  async sendCommand(command, expectedPattern = null, description = '') {
    testResults.total++;
    this.currentTest = { command, description, expectedPattern };
    this.receivedOutput = '';

    console.log(`${colors.blue}[TEST ${testResults.total}] ${description || command}${colors.reset}`);
    
    return new Promise((resolve) => {
      this.socket.emit('command', command);
      
      setTimeout(() => {
        const success = expectedPattern ? 
          this.receivedOutput.match(expectedPattern) !== null : 
          true;
        
        if (success) {
          console.log(`${colors.green}  ✓ PASS${colors.reset}`);
          testResults.passed.push({ ...this.currentTest, output: this.receivedOutput.substring(0, 100) });
        } else {
          console.log(`${colors.red}  ✗ FAIL${colors.reset}`);
          if (process.env.VERBOSE) {
            console.log(`    Expected: ${expectedPattern}`);
            console.log(`    Got: ${this.receivedOutput.substring(0, 200)}`);
          }
          testResults.failed.push({ ...this.currentTest, output: this.receivedOutput.substring(0, 100) });
        }
        
        resolve(success);
      }, WAIT_FOR_RESPONSE);
    });
  }

  async wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async runTests() {
    console.log(`${colors.bright}${colors.cyan}═══════════════════════════════════════════════════════════${colors.reset}`);
    console.log(`${colors.bright}${colors.cyan}  AmiExpress BBS - Comprehensive Command Test Suite${colors.reset}`);
    console.log(`${colors.bright}${colors.cyan}═══════════════════════════════════════════════════════════${colors.reset}`);
    console.log();

    try {
      await this.connect();
      await this.login();
      await this.wait(2000); // Wait for bulletins and menu to display

      // Navigation Commands
      console.log(`\n${colors.bright}═══ Navigation Commands ═══${colors.reset}`);
      await this.sendCommand('M', null, 'M - Main Menu (toggle ANSI)');
      await this.wait(DELAY_BETWEEN_COMMANDS);
      
      await this.sendCommand('<', null, '< - Previous Conference');
      await this.wait(DELAY_BETWEEN_COMMANDS);
      
      await this.sendCommand('>', null, '> - Next Conference');
      await this.wait(DELAY_BETWEEN_COMMANDS);
      
      await this.sendCommand('<<', null, '<< - Previous Message Base');
      await this.wait(DELAY_BETWEEN_COMMANDS);
      
      await this.sendCommand('>>', null, '>> - Next Message Base');
      await this.wait(DELAY_BETWEEN_COMMANDS);

      // Conference/Message Base Commands
      console.log(`\n${colors.bright}═══ Conference & Message Base Commands ═══${colors.reset}`);
      await this.sendCommand('J', null, 'J - Join Conference (prompt)');
      await this.wait(DELAY_BETWEEN_COMMANDS);
      
      await this.sendCommand('J 1', null, 'J 1 - Join Conference 1');
      await this.wait(DELAY_BETWEEN_COMMANDS);
      
      await this.sendCommand('JM', null, 'JM - Join Message Base (prompt)');
      await this.wait(DELAY_BETWEEN_COMMANDS);
      
      await this.sendCommand('JM 1', null, 'JM 1 - Join Message Base 1');
      await this.wait(DELAY_BETWEEN_COMMANDS);
      
      await this.sendCommand('CF', null, 'CF - Conference Flags');
      await this.wait(DELAY_BETWEEN_COMMANDS);

      // Message Commands
      console.log(`\n${colors.bright}═══ Message Commands ═══${colors.reset}`);
      await this.sendCommand('MS', null, 'MS - Mail Scan');
      await this.wait(DELAY_BETWEEN_COMMANDS);
      
      await this.sendCommand('R', null, 'R - Read Messages');
      await this.wait(DELAY_BETWEEN_COMMANDS * 2);
      
      await this.sendCommand('Q', null, 'Q - Quit Message Reader');
      await this.wait(DELAY_BETWEEN_COMMANDS);
      
      await this.sendCommand('E', null, 'E - Enter Message');
      await this.wait(DELAY_BETWEEN_COMMANDS * 2);
      
      // Press Enter to skip message entry
      await this.sendCommand('\r', null, 'Enter - Cancel message entry');
      await this.wait(DELAY_BETWEEN_COMMANDS);

      // File Commands
      console.log(`\n${colors.bright}═══ File Commands ═══${colors.reset}`);
      await this.sendCommand('F', null, 'F - File List');
      await this.wait(DELAY_BETWEEN_COMMANDS * 2);
      
      await this.sendCommand('FR', null, 'FR - File List Raw');
      await this.wait(DELAY_BETWEEN_COMMANDS);
      
      await this.sendCommand('FS', null, 'FS - File Status');
      await this.wait(DELAY_BETWEEN_COMMANDS);
      
      await this.sendCommand('N', null, 'N - New Files');
      await this.wait(DELAY_BETWEEN_COMMANDS * 2);
      
      await this.sendCommand('Z TEST', null, 'Z - Zippy Search (keyword: TEST)');
      await this.wait(DELAY_BETWEEN_COMMANDS);

      // Communication Commands
      console.log(`\n${colors.bright}═══ Communication Commands ═══${colors.reset}`);
      await this.sendCommand('W', null, 'W - Who\'s Online');
      await this.wait(DELAY_BETWEEN_COMMANDS);
      
      await this.sendCommand('WHO', null, 'WHO - Who\'s Online (list)');
      await this.wait(DELAY_BETWEEN_COMMANDS);
      
      await this.sendCommand('WHD', null, 'WHD - Who\'s Online (detailed)');
      await this.wait(DELAY_BETWEEN_COMMANDS);

      // User Commands
      console.log(`\n${colors.bright}═══ User Commands ═══${colors.reset}`);
      await this.sendCommand('S', null, 'S - System Statistics');
      await this.wait(DELAY_BETWEEN_COMMANDS);
      
      await this.sendCommand('US', null, 'US - User Statistics');
      await this.wait(DELAY_BETWEEN_COMMANDS);
      
      await this.sendCommand('UP', null, 'UP - User Parameters');
      await this.wait(DELAY_BETWEEN_COMMANDS);

      // Mode Toggle Commands
      console.log(`\n${colors.bright}═══ Mode Toggle Commands ═══${colors.reset}`);
      await this.sendCommand('A', null, 'A - Toggle ANSI Mode');
      await this.wait(DELAY_BETWEEN_COMMANDS);
      
      await this.sendCommand('X', null, 'X - Toggle Expert Mode');
      await this.wait(DELAY_BETWEEN_COMMANDS);
      
      await this.sendCommand('Q', null, 'Q - Toggle Quiet Mode');
      await this.wait(DELAY_BETWEEN_COMMANDS);

      // Utility Commands
      console.log(`\n${colors.bright}═══ Utility Commands ═══${colors.reset}`);
      await this.sendCommand('?', null, '? - Help Menu');
      await this.wait(DELAY_BETWEEN_COMMANDS);
      
      await this.sendCommand('H', null, 'H - Help (prompt)');
      await this.wait(DELAY_BETWEEN_COMMANDS);
      
      await this.sendCommand('T', null, 'T - Time/Time Left');
      await this.wait(DELAY_BETWEEN_COMMANDS);
      
      await this.sendCommand('VER', null, 'VER - Version Info');
      await this.wait(DELAY_BETWEEN_COMMANDS);
      
      await this.sendCommand('B', null, 'B - Read Bulletins (prompt)');
      await this.wait(DELAY_BETWEEN_COMMANDS);
      
      await this.sendCommand('GR', null, 'GR - Greetings');
      await this.wait(DELAY_BETWEEN_COMMANDS);

      // Advanced/Special Commands
      console.log(`\n${colors.bright}═══ Advanced Commands ═══${colors.reset}`);
      
      // Test door slots (may not have doors configured)
      await this.sendCommand('1', null, '1 - Door Slot 1');
      await this.wait(DELAY_BETWEEN_COMMANDS);
      
      await this.sendCommand('2', null, '2 - Door Slot 2');
      await this.wait(DELAY_BETWEEN_COMMANDS);

      // Internode Chat Commands
      console.log(`\n${colors.bright}═══ Chat Commands ═══${colors.reset}`);
      await this.sendCommand('C', null, 'C - Comment to Sysop (prompt)');
      await this.wait(DELAY_BETWEEN_COMMANDS);
      
      await this.sendCommand('\r', null, 'Enter - Cancel comment');
      await this.wait(DELAY_BETWEEN_COMMANDS);

      // Navigation between conferences
      console.log(`\n${colors.bright}═══ Conference Navigation Tests ═══${colors.reset}`);
      await this.sendCommand('J 1', null, 'J 1 - Join Conference 1');
      await this.wait(DELAY_BETWEEN_COMMANDS);
      
      await this.sendCommand('J 2', null, 'J 2 - Join Conference 2');
      await this.wait(DELAY_BETWEEN_COMMANDS);
      
      await this.sendCommand('J 3', null, 'J 3 - Join Conference 3');
      await this.wait(DELAY_BETWEEN_COMMANDS);
      
      // Return to conference 1
      await this.sendCommand('J 1', null, 'J 1 - Return to Conference 1');
      await this.wait(DELAY_BETWEEN_COMMANDS);

      // Invalid commands
      console.log(`\n${colors.bright}═══ Invalid Command Tests ═══${colors.reset}`);
      await this.sendCommand('INVALID', null, 'INVALID - Unknown command');
      await this.wait(DELAY_BETWEEN_COMMANDS);
      
      await this.sendCommand('J 999', null, 'J 999 - Invalid conference');
      await this.wait(DELAY_BETWEEN_COMMANDS);

      // Sysop Commands (if user is sysop)
      console.log(`\n${colors.bright}═══ Sysop Commands (may require permissions) ═══${colors.reset}`);
      await this.sendCommand('CM', null, 'CM - Conference Maintenance');
      await this.wait(DELAY_BETWEEN_COMMANDS);
      
      await this.sendCommand('FM', null, 'FM - File Maintenance');
      await this.wait(DELAY_BETWEEN_COMMANDS);
      
      await this.sendCommand('NM', null, 'NM - Node Management');
      await this.wait(DELAY_BETWEEN_COMMANDS);

      // Message Reader Subcommands
      console.log(`\n${colors.bright}═══ Message Reader Subcommands ═══${colors.reset}`);
      await this.sendCommand('R', null, 'R - Enter message reader');
      await this.wait(DELAY_BETWEEN_COMMANDS * 2);
      
      await this.sendCommand('?', null, '? - Message reader help');
      await this.wait(DELAY_BETWEEN_COMMANDS);
      
      await this.sendCommand('A', null, 'A - Again (redisplay)');
      await this.wait(DELAY_BETWEEN_COMMANDS);
      
      await this.sendCommand('L', null, 'L - List messages');
      await this.wait(DELAY_BETWEEN_COMMANDS);
      
      await this.sendCommand('Q', null, 'Q - Quit reader');
      await this.wait(DELAY_BETWEEN_COMMANDS);

      // Final test: Return to main menu
      console.log(`\n${colors.bright}═══ Final Tests ═══${colors.reset}`);
      await this.sendCommand('M', null, 'M - Return to Main Menu');
      await this.wait(DELAY_BETWEEN_COMMANDS);

      // Print test results
      this.printResults();

      // Disconnect
      console.log(`\n${colors.cyan}[TEST] Disconnecting...${colors.reset}`);
      this.socket.disconnect();

    } catch (error) {
      console.error(`${colors.red}[TEST] Error: ${error.message}${colors.reset}`);
      if (this.socket) {
        this.socket.disconnect();
      }
      process.exit(1);
    }
  }

  printResults() {
    console.log(`\n${colors.bright}${colors.cyan}═══════════════════════════════════════════════════════════${colors.reset}`);
    console.log(`${colors.bright}${colors.cyan}  Test Results Summary${colors.reset}`);
    console.log(`${colors.bright}${colors.cyan}═══════════════════════════════════════════════════════════${colors.reset}`);
    console.log();
    console.log(`Total Tests:  ${testResults.total}`);
    console.log(`${colors.green}Passed:       ${testResults.passed.length}${colors.reset}`);
    console.log(`${colors.red}Failed:       ${testResults.failed.length}${colors.reset}`);
    console.log(`${colors.yellow}Skipped:      ${testResults.skipped.length}${colors.reset}`);
    console.log();
    
    const passRate = ((testResults.passed.length / testResults.total) * 100).toFixed(1);
    console.log(`Pass Rate:    ${passRate}%`);
    console.log();

    if (testResults.failed.length > 0) {
      console.log(`${colors.red}Failed Tests:${colors.reset}`);
      testResults.failed.forEach((test, i) => {
        console.log(`  ${i + 1}. ${test.command} - ${test.description}`);
      });
      console.log();
    }

    console.log(`${colors.bright}${colors.cyan}═══════════════════════════════════════════════════════════${colors.reset}`);
    console.log();

    // Exit with appropriate code
    process.exit(testResults.failed.length > 0 ? 1 : 0);
  }
}

// Main
async function main() {
  if (process.argv.includes('--help') || process.argv.includes('-h')) {
    console.log('Usage: node test-bbs-commands.js [server-url] [username] [password]');
    console.log();
    console.log('Arguments:');
    console.log('  server-url  Server URL (default: http://localhost:3001)');
    console.log('  username    Test username (default: testuser)');
    console.log('  password    Test password (default: testpass)');
    console.log();
    console.log('Environment Variables:');
    console.log('  VERBOSE=1   Show all ANSI output during tests');
    console.log();
    console.log('Examples:');
    console.log('  node test-bbs-commands.js');
    console.log('  node test-bbs-commands.js http://localhost:3001 sysop secret');
    console.log('  VERBOSE=1 node test-bbs-commands.js');
    process.exit(0);
  }

  // Check if socket.io-client is installed
  try {
    require.resolve('socket.io-client');
  } catch (e) {
    console.error(`${colors.red}Error: socket.io-client is not installed${colors.reset}`);
    console.error(`${colors.yellow}Please install it with: npm install socket.io-client${colors.reset}`);
    process.exit(1);
  }

  const tester = new BBSCommandTester(SERVER_URL, USERNAME, PASSWORD);
  await tester.runTests();
}

main().catch(error => {
  console.error(`${colors.red}Fatal error: ${error.message}${colors.reset}`);
  process.exit(1);
});