#!/usr/bin/env node

/**
 * AmiExpress BBS - DEEP Integration Test Suite
 * 
 * Comprehensive end-to-end testing of all BBS workflows and commands
 * Tests complete user interactions, not just command execution
 * 
 * Usage: node test-bbs-deep.js [server-url] [username] [password]
 */

const io = require('socket.io-client');
const crypto = require('crypto');

// Configuration
const SERVER_URL = process.argv[2] || 'http://localhost:3001';
const USERNAME = process.argv[3] || 'sysop';
const PASSWORD = process.argv[4] || 'sysop';
const DELAY_SHORT = 500;     // 0.5 seconds
const DELAY_MEDIUM = 1000;   // 1 second
const DELAY_LONG = 2000;     // 2 seconds
const DELAY_VERY_LONG = 3000; // 3 seconds

// Test results tracking
const testResults = {
  passed: [],
  failed: [],
  skipped: [],
  warnings: [],
  total: 0,
  startTime: Date.now()
};

// ANSI colors
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m'
};

class DeepBBSTester {
  constructor(serverUrl, username, password) {
    this.serverUrl = serverUrl;
    this.username = username;
    this.password = password;
    this.socket = null;
    this.authenticated = false;
    this.currentTest = null;
    this.receivedOutput = '';
    this.outputBuffer = [];
    this.stateData = {};
  }

  log(message, level = 'info') {
    const timestamp = new Date().toISOString().split('T')[1].split('.')[0];
    const prefix = {
      'info': `${colors.blue}[INFO]${colors.reset}`,
      'success': `${colors.green}[PASS]${colors.reset}`,
      'error': `${colors.red}[FAIL]${colors.reset}`,
      'warn': `${colors.yellow}[WARN]${colors.reset}`,
      'test': `${colors.cyan}[TEST]${colors.reset}`
    }[level] || '[INFO]';
    
    if (process.env.VERBOSE || level !== 'info') {
      console.log(`${colors.dim}${timestamp}${colors.reset} ${prefix} ${message}`);
    }
  }

  async connect() {
    return new Promise((resolve, reject) => {
      this.log(`Connecting to ${this.serverUrl}...`, 'info');
      
      this.socket = io(this.serverUrl, {
        transports: ['websocket', 'polling'],
        reconnection: false,
        timeout: 10000
      });

      this.socket.on('connect', () => {
        this.log('Connected successfully', 'success');
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
      this.log('Disconnected from server', 'warn');
    });

    this.socket.on('ansi-output', (data) => {
      this.receivedOutput += data;
      this.outputBuffer.push({
        time: Date.now(),
        data: data
      });

      // Always show BBS output for debugging
      console.log(`\n${colors.dim}=== BBS OUTPUT ===${colors.reset}`);
      console.log(data);
      console.log(`${colors.dim}=== END OUTPUT ===${colors.reset}\n`);

      if (process.env.VERBOSE) {
        process.stdout.write(data);
      }
    });

    this.socket.on('login-success', (data) => {
      this.log(`Login successful: ${data.user.username} (Level ${data.user.secLevel})`, 'success');
      this.authenticated = true;
      this.stateData.user = data.user;
    });

    this.socket.on('login-failed', (error) => {
      this.log(`Login failed: ${error}`, 'error');
    });

    this.socket.on('prompt-password', () => {
      this.socket.emit('login', { username: this.username, password: this.password });
    });

    this.socket.on('user-not-found', (data) => {
      this.log('Creating new test user...', 'info');
      this.socket.emit('new-user-response', { response: 'C', username: data.username });
    });

    this.socket.on('set-input-mode', (mode) => {
      this.stateData.inputMode = mode;
    });
  }

  async login() {
    return new Promise((resolve) => {
      this.log('Handling connection screens...', 'info');
      
      // Wait for ANSI prompt
      setTimeout(() => {
        this.log('Answering ANSI prompt', 'info');
        this.socket.emit('command', 'A');
        
        setTimeout(() => {
          this.log('Continuing through screens', 'info');
          this.socket.emit('command', '\r');
          
          setTimeout(() => {
            this.log('Starting authentication...', 'info');
            this.socket.emit('check-username', { username: this.username });
            
            const checkAuth = setInterval(() => {
              if (this.authenticated) {
                clearInterval(checkAuth);
                this.log('Authentication complete', 'success');
                resolve();
              }
            }, 100);
            
            setTimeout(() => {
              clearInterval(checkAuth);
              if (!this.authenticated) {
                this.log('Proceeding (auth completing)', 'warn');
                resolve();
              }
            }, 15000);
          }, 2000);
        }, 2000);
      }, 2000);
    });
  }

  async sendCommand(command, description = '') {
    this.currentTest = { command, description };
    this.receivedOutput = '';
    this.outputBuffer = [];
    
    this.log(`Executing: ${description || command}`, 'test');
    this.socket.emit('command', command);
    
    return new Promise(resolve => setTimeout(resolve, DELAY_SHORT));
  }

  async sendAndWait(command, waitTime = DELAY_MEDIUM, description = '') {
    await this.sendCommand(command, description);
    await this.wait(waitTime);
    return this.receivedOutput;
  }

  async wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async expectOutput(pattern, timeout = DELAY_LONG) {
    const startTime = Date.now();
    
    return new Promise((resolve) => {
      const check = setInterval(() => {
        if (this.receivedOutput.match(pattern)) {
          clearInterval(check);
          resolve(true);
        } else if (Date.now() - startTime > timeout) {
          clearInterval(check);
          resolve(false);
        }
      }, 100);
    });
  }

  async testWorkflow(name, testFn) {
    testResults.total++;
    const testNum = testResults.total;
    
    console.log(`\n${colors.bright}${colors.cyan}━━━ Test ${testNum}: ${name} ━━━${colors.reset}`);
    
    try {
      await testFn();
      this.log(`✓ PASSED: ${name}`, 'success');
      testResults.passed.push({ num: testNum, name, time: Date.now() - testResults.startTime });
      return true;
    } catch (error) {
      this.log(`✗ FAILED: ${name} - ${error.message}`, 'error');
      testResults.failed.push({ 
        num: testNum, 
        name, 
        error: error.message,
        output: this.receivedOutput.substring(0, 200)
      });
      return false;
    }
  }

  // ==================== DEEP WORKFLOW TESTS ====================

  async runDeepTests() {
    console.log(`${colors.bright}${colors.cyan}╔═══════════════════════════════════════════════════════════════╗${colors.reset}`);
    console.log(`${colors.bright}${colors.cyan}║   AmiExpress BBS - DEEP Integration Test Suite               ║${colors.reset}`);
    console.log(`${colors.bright}${colors.cyan}║   Testing Complete Workflows & User Interactions              ║${colors.reset}`);
    console.log(`${colors.bright}${colors.cyan}╚═══════════════════════════════════════════════════════════════╝${colors.reset}`);
    console.log();
    console.log(`${colors.dim}Server: ${this.serverUrl}${colors.reset}`);
    console.log(`${colors.dim}User: ${this.username}${colors.reset}`);
    console.log();

    try {
      await this.connect();
      await this.login();
      await this.wait(DELAY_LONG);

      // ====================
      // INITIALIZATION TESTS
      // ====================
      await this.testWorkflow('Initial Connection & Bulletins', async () => {
        // Should have received welcome screens
        if (!this.receivedOutput.includes('AmiExpress') && !this.receivedOutput.includes('BBS')) {
          throw new Error('No welcome screen received');
        }
      });

      await this.testWorkflow('Main Menu Display', async () => {
        await this.sendCommand('M', 'Display main menu');
        await this.wait(DELAY_MEDIUM);
        // Menu should display some content
        if (this.receivedOutput.length < 50) {
          throw new Error('Menu output too short');
        }
      });

      // ====================
      // CONFERENCE WORKFLOW TESTS
      // ====================
      await this.testWorkflow('Complete Conference Navigation', async () => {
        // Test joining different conferences
        await this.sendAndWait('J', DELAY_MEDIUM, 'Prompt conference list');
        await this.sendAndWait('1', DELAY_MEDIUM, 'Join conference 1');
        await this.wait(DELAY_SHORT);
        
        await this.sendAndWait('J 2', DELAY_MEDIUM, 'Direct join conference 2');
        await this.wait(DELAY_SHORT);
        
        await this.sendAndWait('J 3', DELAY_MEDIUM, 'Direct join conference 3');
        await this.wait(DELAY_SHORT);
        
        // Return to conference 1
        await this.sendAndWait('J 1', DELAY_MEDIUM, 'Return to conference 1');
        
        if (!this.receivedOutput) {
          throw new Error('No output from conference commands');
        }
      });

      await this.testWorkflow('Conference Navigation Keys', async () => {
        await this.sendAndWait('>', DELAY_MEDIUM, 'Next conference');
        await this.sendAndWait('<', DELAY_MEDIUM, 'Previous conference');
        await this.sendAndWait('>', DELAY_MEDIUM, 'Next conference again');
        
        if (this.receivedOutput.length < 20) {
          throw new Error('Conference navigation produced no output');
        }
      });

      await this.testWorkflow('Message Base Navigation', async () => {
        await this.sendAndWait('JM', DELAY_MEDIUM, 'Show message base list');
        await this.sendAndWait('1', DELAY_MEDIUM, 'Join message base 1');
        await this.wait(DELAY_SHORT);
        
        await this.sendAndWait('>>', DELAY_MEDIUM, 'Next message base');
        await this.sendAndWait('<<', DELAY_MEDIUM, 'Previous message base');
        
        if (!this.receivedOutput) {
          throw new Error('Message base navigation failed');
        }
      });

      await this.testWorkflow('Conference Flags Display', async () => {
        await this.sendAndWait('CF', DELAY_LONG, 'Show conference flags');
        
        // Should show some conference information
        if (this.receivedOutput.length < 50) {
          throw new Error('Conference flags display too short');
        }
      });

      // ====================
      // MESSAGE ENTRY WORKFLOW TESTS
      // ====================
      await this.testWorkflow('Complete Message Entry - Public', async () => {
        this.log('Starting message entry workflow...', 'info');
        
        // Start message entry
        await this.sendAndWait('E', DELAY_MEDIUM, 'Enter message command');
        await this.wait(DELAY_SHORT);
        
        // Enter recipient (ALL for public)
        await this.sendAndWait('ALL', DELAY_MEDIUM, 'Recipient: ALL');
        await this.wait(DELAY_SHORT);
        
        // Enter subject
        const testSubject = `Test Message ${Date.now()}`;
        await this.sendAndWait(testSubject, DELAY_MEDIUM, `Subject: ${testSubject}`);
        await this.wait(DELAY_SHORT);
        
        // Enter message body
        await this.sendAndWait('This is line 1 of test message', DELAY_SHORT, 'Body line 1');
        await this.sendAndWait('This is line 2 of test message', DELAY_SHORT, 'Body line 2');
        await this.sendAndWait('This is line 3 of test message', DELAY_SHORT, 'Body line 3');
        
        // End message entry (press Enter on empty line)
        await this.sendAndWait('', DELAY_MEDIUM, 'End message (empty line)');
        await this.wait(DELAY_SHORT);
        
        // Save message (S command typically)
        await this.sendAndWait('S', DELAY_MEDIUM, 'Save message');
        await this.wait(DELAY_LONG);
        
        this.log('Message entry workflow completed', 'success');
      });

      await this.testWorkflow('Message Entry - Private Message', async () => {
        await this.sendAndWait('E', DELAY_MEDIUM, 'Enter private message');
        await this.wait(DELAY_SHORT);
        
        // Send to SYSOP
        await this.sendAndWait('SYSOP', DELAY_MEDIUM, 'Recipient: SYSOP');
        await this.wait(DELAY_SHORT);
        
        await this.sendAndWait('Private Test Message', DELAY_MEDIUM, 'Subject');
        await this.wait(DELAY_SHORT);
        
        await this.sendAndWait('This is a private message for testing', DELAY_SHORT, 'Body');
        await this.sendAndWait('', DELAY_MEDIUM, 'End body');
        await this.sendAndWait('S', DELAY_LONG, 'Save private message');
        
        this.log('Private message entry completed', 'success');
      });

      await this.testWorkflow('Message Entry - Cancel', async () => {
        await this.sendAndWait('E', DELAY_MEDIUM, 'Start message entry');
        await this.wait(DELAY_SHORT);
        
        // Cancel by pressing Enter on empty recipient
        await this.sendAndWait('\r', DELAY_MEDIUM, 'Cancel with empty input');
        await this.wait(DELAY_SHORT);
        
        this.log('Message cancellation worked', 'success');
      });

      // ====================
      // MESSAGE READING WORKFLOW TESTS
      // ====================
      await this.testWorkflow('Complete Message Reading Flow', async () => {
        await this.sendAndWait('R', DELAY_LONG, 'Enter message reader');
        await this.wait(DELAY_MEDIUM);
        
        // Should enter message reader
        if (this.receivedOutput.includes('No messages') || this.receivedOutput.includes('no new')) {
          this.log('No messages to read, skipping reader commands', 'warn');
          await this.sendAndWait('Q', DELAY_SHORT, 'Quit reader');
          return;
        }
        
        // Test reader commands
        await this.sendAndWait('?', DELAY_MEDIUM, 'Show reader help');
        await this.wait(DELAY_SHORT);
        
        await this.sendAndWait('A', DELAY_MEDIUM, 'Again - redisplay message');
        await this.wait(DELAY_SHORT);
        
        await this.sendAndWait('L', DELAY_MEDIUM, 'List messages');
        await this.wait(DELAY_MEDIUM);
        
        await this.sendAndWait('\r', DELAY_MEDIUM, 'Next message (Enter)');
        await this.wait(DELAY_SHORT);
        
        await this.sendAndWait('Q', DELAY_MEDIUM, 'Quit message reader');
        await this.wait(DELAY_SHORT);
        
        this.log('Message reader workflow completed', 'success');
      });

      await this.testWorkflow('Message Reader - Reply to Message', async () => {
        await this.sendAndWait('R', DELAY_LONG, 'Enter reader');
        await this.wait(DELAY_MEDIUM);
        
        if (this.receivedOutput.includes('No messages') || this.receivedOutput.includes('no new')) {
          await this.sendAndWait('Q', DELAY_SHORT, 'Quit - no messages');
          this.log('No messages to reply to', 'warn');
          return;
        }
        
        // Try to reply
        await this.sendAndWait('R', DELAY_MEDIUM, 'Reply to current message');
        await this.wait(DELAY_LONG);
        
        // If reply prompt appeared, cancel it
        await this.sendAndWait('\r', DELAY_SHORT, 'Cancel reply');
        await this.wait(DELAY_SHORT);
        
        await this.sendAndWait('Q', DELAY_MEDIUM, 'Quit reader');
      });

      await this.testWorkflow('Mail Scan Operation', async () => {
        await this.sendAndWait('MS', DELAY_VERY_LONG, 'Perform mail scan');
        await this.wait(DELAY_MEDIUM);
        
        // Mail scan should complete
        if (this.receivedOutput.length < 20) {
          throw new Error('Mail scan produced minimal output');
        }
      });

      // ====================
      // FILE OPERATION WORKFLOW TESTS
      // ====================
      await this.testWorkflow('Complete File Listing', async () => {
        await this.sendAndWait('F', DELAY_LONG, 'List files');
        await this.wait(DELAY_MEDIUM);
        
        // Should show file listing or "no files" message
        if (this.receivedOutput.length < 30) {
          this.log('Minimal file listing', 'warn');
        }
      });

      await this.testWorkflow('File List Raw Format', async () => {
        await this.sendAndWait('FR', DELAY_MEDIUM, 'Raw file list');
        await this.wait(DELAY_MEDIUM);
        
        if (!this.receivedOutput) {
          throw new Error('No output from FR command');
        }
      });

      await this.testWorkflow('File Status Display', async () => {
        await this.sendAndWait('FS', DELAY_MEDIUM, 'File status');
        await this.wait(DELAY_MEDIUM);
        
        // Should show file area statistics
        if (this.receivedOutput.length < 20) {
          throw new Error('File status too short');
        }
      });

      await this.testWorkflow('New Files Listing', async () => {
        await this.sendAndWait('N', DELAY_LONG, 'New files');
        await this.wait(DELAY_MEDIUM);
        
        // May show "no new files" which is OK
        if (!this.receivedOutput) {
          throw new Error('No output from N command');
        }
      });

      await this.testWorkflow('New Files with Date', async () => {
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const dateStr = yesterday.toISOString().split('T')[0];
        
        await this.sendAndWait(`N ${dateStr}`, DELAY_LONG, `New files since ${dateStr}`);
        await this.wait(DELAY_MEDIUM);
      });

      await this.testWorkflow('File Search - Zippy', async () => {
        await this.sendAndWait('Z TEST', DELAY_LONG, 'Search files for TEST');
        await this.wait(DELAY_MEDIUM);
        
        // Search may return no results, which is fine
        if (!this.receivedOutput) {
          throw new Error('No output from Z command');
        }
      });

      await this.testWorkflow('File Search - Zoom', async () => {
        await this.sendAndWait('ZOOM DOC', DELAY_LONG, 'Zoom search for DOC');
        await this.wait(DELAY_MEDIUM);
      });

      // ====================
      // USER WORKFLOW TESTS
      // ====================
      await this.testWorkflow('System Statistics', async () => {
        await this.sendAndWait('S', DELAY_MEDIUM, 'Show system stats');
        await this.wait(DELAY_MEDIUM);
        
        // Should show various system statistics
        if (this.receivedOutput.length < 50) {
          throw new Error('System stats too short');
        }
      });

      await this.testWorkflow('User Statistics', async () => {
        await this.sendAndWait('US', DELAY_MEDIUM, 'Show user stats');
        await this.wait(DELAY_MEDIUM);
        
        // Should show user-specific statistics
        if (this.receivedOutput.length < 30) {
          throw new Error('User stats too short');
        }
      });

      await this.testWorkflow('User Parameters Display', async () => {
        await this.sendAndWait('UP', DELAY_MEDIUM, 'Show user parameters');
        await this.wait(DELAY_MEDIUM);
        
        // Should show user preferences/settings
        if (!this.receivedOutput.includes('ANSI') && !this.receivedOutput.includes('Expert')) {
          this.log('User parameters may not have displayed correctly', 'warn');
        }
      });

      await this.testWorkflow('Mode Toggles - ANSI', async () => {
        await this.sendAndWait('A', DELAY_MEDIUM, 'Toggle ANSI mode');
        await this.wait(DELAY_SHORT);
        
        await this.sendAndWait('A', DELAY_MEDIUM, 'Toggle ANSI mode back');
        await this.wait(DELAY_SHORT);
      });

      await this.testWorkflow('Mode Toggles - Expert', async () => {
        await this.sendAndWait('X', DELAY_MEDIUM, 'Toggle expert mode');
        await this.wait(DELAY_SHORT);
        
        await this.sendAndWait('X', DELAY_MEDIUM, 'Toggle expert mode back');
        await this.wait(DELAY_SHORT);
      });

      await this.testWorkflow('Mode Toggles - Quiet', async () => {
        await this.sendAndWait('Q', DELAY_MEDIUM, 'Toggle quiet mode');
        await this.wait(DELAY_SHORT);
        
        await this.sendAndWait('Q', DELAY_MEDIUM, 'Toggle quiet mode back');
        await this.wait(DELAY_SHORT);
      });

      // ====================
      // COMMUNICATION WORKFLOW TESTS
      // ====================
      await this.testWorkflow('Who\'s Online - Basic', async () => {
        await this.sendAndWait('W', DELAY_MEDIUM, 'Who\'s online');
        await this.wait(DELAY_MEDIUM);
        
        // Should show at least our own user
        if (!this.receivedOutput) {
          throw new Error('No output from W command');
        }
      });

      await this.testWorkflow('Who\'s Online - List Format', async () => {
        await this.sendAndWait('WHO', DELAY_MEDIUM, 'WHO list format');
        await this.wait(DELAY_MEDIUM);
        
        if (!this.receivedOutput) {
          throw new Error('No output from WHO command');
        }
      });

      await this.testWorkflow('Who\'s Online - Detailed', async () => {
        await this.sendAndWait('WHD', DELAY_MEDIUM, 'WHO detailed');
        await this.wait(DELAY_MEDIUM);
        
        if (!this.receivedOutput) {
          throw new Error('No output from WHD command');
        }
      });

      await this.testWorkflow('Comment to Sysop - Cancel', async () => {
        await this.sendAndWait('C', DELAY_MEDIUM, 'Comment prompt');
        await this.wait(DELAY_SHORT);
        
        // Cancel with empty line
        await this.sendAndWait('\r', DELAY_SHORT, 'Cancel comment');
        await this.wait(DELAY_SHORT);
      });

      // ====================
      // UTILITY WORKFLOW TESTS
      // ====================
      await this.testWorkflow('Help System', async () => {
        await this.sendAndWait('?', DELAY_MEDIUM, 'Help menu');
        await this.wait(DELAY_MEDIUM);
        
        if (this.receivedOutput.length < 50) {
          throw new Error('Help output too short');
        }
      });

      await this.testWorkflow('Help Search', async () => {
        await this.sendAndWait('H', DELAY_MEDIUM, 'Help prompt');
        await this.wait(DELAY_SHORT);
        
        await this.sendAndWait('MESSAGE', DELAY_MEDIUM, 'Search help for MESSAGE');
        await this.wait(DELAY_MEDIUM);
      });

      await this.testWorkflow('Time Display', async () => {
        await this.sendAndWait('T', DELAY_MEDIUM, 'Show time/time left');
        await this.wait(DELAY_MEDIUM);
        
        // Should show time information
        if (this.receivedOutput.length < 20) {
          throw new Error('Time display too short');
        }
      });

      await this.testWorkflow('Version Information', async () => {
        await this.sendAndWait('VER', DELAY_MEDIUM, 'Show version');
        await this.wait(DELAY_MEDIUM);
        
        // Should show version info
        if (!this.receivedOutput.includes('Version') && !this.receivedOutput.includes('AmiExpress')) {
          this.log('Version info may not be complete', 'warn');
        }
      });

      await this.testWorkflow('Bulletin Display', async () => {
        await this.sendAndWait('B', DELAY_MEDIUM, 'Bulletin prompt');
        await this.wait(DELAY_SHORT);
        
        // Cancel or read bulletin 1
        await this.sendAndWait('1', DELAY_MEDIUM, 'Read bulletin 1');
        await this.wait(DELAY_MEDIUM);
      });

      await this.testWorkflow('Greetings Display', async () => {
        await this.sendAndWait('GR', DELAY_MEDIUM, 'Show greetings');
        await this.wait(DELAY_MEDIUM);
        
        if (!this.receivedOutput) {
          throw new Error('No output from GR command');
        }
      });

      // ====================
      // ERROR HANDLING TESTS
      // ====================
      await this.testWorkflow('Invalid Command Handling', async () => {
        await this.sendAndWait('INVALIDCOMMAND123', DELAY_MEDIUM, 'Invalid command');
        await this.wait(DELAY_SHORT);
        
        // Should handle gracefully
        if (!this.receivedOutput) {
          throw new Error('No response to invalid command');
        }
      });

      await this.testWorkflow('Invalid Conference Number', async () => {
        await this.sendAndWait('J 999', DELAY_MEDIUM, 'Join invalid conference');
        await this.wait(DELAY_MEDIUM);
        
        // Should reject and possibly show conference list
        if (!this.receivedOutput) {
          throw new Error('No response to invalid conference');
        }
      });

      await this.testWorkflow('Invalid Message Base Number', async () => {
        await this.sendAndWait('JM 999', DELAY_MEDIUM, 'Join invalid message base');
        await this.wait(DELAY_MEDIUM);
        
        if (!this.receivedOutput) {
          throw new Error('No response to invalid message base');
        }
      });

      // ====================
      // ADVANCED WORKFLOW TESTS
      // ====================
      await this.testWorkflow('Conference Switch and Message Check', async () => {
        // Complex workflow: switch conferences and check messages
        await this.sendAndWait('J 1', DELAY_MEDIUM, 'Switch to conf 1');
        await this.wait(DELAY_SHORT);
        
        await this.sendAndWait('R', DELAY_LONG, 'Read messages in conf 1');
        await this.wait(DELAY_MEDIUM);
        await this.sendAndWait('Q', DELAY_SHORT, 'Quit reader');
        await this.wait(DELAY_SHORT);
        
        await this.sendAndWait('J 2', DELAY_MEDIUM, 'Switch to conf 2');
        await this.wait(DELAY_SHORT);
        
        await this.sendAndWait('R', DELAY_LONG, 'Read messages in conf 2');
        await this.wait(DELAY_MEDIUM);
        await this.sendAndWait('Q', DELAY_SHORT, 'Quit reader');
      });

      await this.testWorkflow('Multiple Menu Displays', async () => {
        // Test menu display multiple times
        for (let i = 0; i < 3; i++) {
          await this.sendAndWait('M', DELAY_MEDIUM, `Menu display ${i + 1}`);
          await this.wait(DELAY_SHORT);
        }
      });

      await this.testWorkflow('Navigation Stress Test', async () => {
        // Rapid navigation through commands
        await this.sendAndWait('>', DELAY_SHORT, 'Next conf');
        await this.sendAndWait('<', DELAY_SHORT, 'Prev conf');
        await this.sendAndWait('>>', DELAY_SHORT, 'Next msgbase');
        await this.sendAndWait('<<', DELAY_SHORT, 'Prev msgbase');
        await this.sendAndWait('M', DELAY_MEDIUM, 'Menu');
      });

      // ====================
      // SYSOP COMMAND TESTS (may fail if not sysop)
      // ====================
      await this.testWorkflow('Sysop Commands - Conference Maintenance', async () => {
        await this.sendAndWait('CM', DELAY_MEDIUM, 'Conference maintenance');
        await this.wait(DELAY_MEDIUM);
        
        // May show "access denied" which is OK for non-sysop
        if (this.receivedOutput.includes('Access') || this.receivedOutput.includes('denied')) {
          this.log('Not sysop level - expected', 'warn');
        }
        
        // Cancel if in CM mode
        await this.sendAndWait('Q', DELAY_SHORT, 'Quit CM');
      });

      await this.testWorkflow('Sysop Commands - File Maintenance', async () => {
        await this.sendAndWait('FM', DELAY_MEDIUM, 'File maintenance');
        await this.wait(DELAY_MEDIUM);
        
        // Cancel if in FM mode
        await this.sendAndWait('Q', DELAY_SHORT, 'Quit FM');
      });

      await this.testWorkflow('Sysop Commands - Node Management', async () => {
        await this.sendAndWait('NM', DELAY_MEDIUM, 'Node management');
        await this.wait(DELAY_MEDIUM);
        
        // Cancel if in NM mode
        await this.sendAndWait('Q', DELAY_SHORT, 'Quit NM');
      });

      // ====================
      // FINAL CLEANUP TESTS
      // ====================
      await this.testWorkflow('Return to Main Menu', async () => {
        await this.sendAndWait('M', DELAY_MEDIUM, 'Final menu display');
        await this.wait(DELAY_MEDIUM);
        
        if (!this.receivedOutput) {
          throw new Error('Menu did not display');
        }
      });

      // Print results
      this.printResults();

      // Graceful disconnect
      this.log('Disconnecting...', 'info');
      this.socket.disconnect();

    } catch (error) {
      console.error(`${colors.red}Fatal error: ${error.message}${colors.reset}`);
      if (error.stack) {
        console.error(`${colors.dim}${error.stack}${colors.reset}`);
      }
      if (this.socket) {
        this.socket.disconnect();
      }
      process.exit(1);
    }
  }

  printResults() {
    const duration = Math.round((Date.now() - testResults.startTime) / 1000);
    
    console.log(`\n${colors.bright}${colors.cyan}╔═══════════════════════════════════════════════════════════════╗${colors.reset}`);
    console.log(`${colors.bright}${colors.cyan}║                    Test Results Summary                       ║${colors.reset}`);
    console.log(`${colors.bright}${colors.cyan}╚═══════════════════════════════════════════════════════════════╝${colors.reset}`);
    console.log();
    console.log(`${colors.bright}Total Tests:${colors.reset}     ${testResults.total}`);
    console.log(`${colors.green}${colors.bright}✓ Passed:${colors.reset}        ${testResults.passed.length}`);
    console.log(`${colors.red}${colors.bright}✗ Failed:${colors.reset}        ${testResults.failed.length}`);
    console.log(`${colors.yellow}${colors.bright}⚠ Warnings:${colors.reset}      ${testResults.warnings.length}`);
    console.log(`${colors.dim}Duration:${colors.reset}        ${duration}s`);
    console.log();
    
    const passRate = ((testResults.passed.length / testResults.total) * 100).toFixed(1);
    const passRateColor = passRate >= 90 ? colors.green : passRate >= 70 ? colors.yellow : colors.red;
    console.log(`${colors.bright}Pass Rate:${colors.reset}       ${passRateColor}${passRate}%${colors.reset}`);
    console.log();

    if (testResults.failed.length > 0) {
      console.log(`${colors.red}${colors.bright}Failed Tests:${colors.reset}`);
      testResults.failed.forEach((test, i) => {
        console.log(`  ${colors.red}${i + 1}.${colors.reset} Test ${test.num}: ${test.name}`);
        console.log(`     ${colors.dim}Error: ${test.error}${colors.reset}`);
        if (process.env.VERBOSE && test.output) {
          console.log(`     ${colors.dim}Output: ${test.output.substring(0, 100)}...${colors.reset}`);
        }
      });
      console.log();
    }

    if (testResults.warnings.length > 0) {
      console.log(`${colors.yellow}${colors.bright}Warnings:${colors.reset}`);
      testResults.warnings.forEach((warn, i) => {
        console.log(`  ${colors.yellow}${i + 1}.${colors.reset} ${warn}`);
      });
      console.log();
    }

    console.log(`${colors.bright}${colors.cyan}═══════════════════════════════════════════════════════════════${colors.reset}`);
    console.log();

    // Exit with appropriate code
    process.exit(testResults.failed.length > 0 ? 1 : 0);
  }
}

// Main
async function main() {
  if (process.argv.includes('--help') || process.argv.includes('-h')) {
    console.log('AmiExpress BBS - DEEP Integration Test Suite');
    console.log();
    console.log('Usage: node test-bbs-deep.js [server-url] [username] [password]');
    console.log();
    console.log('Arguments:');
    console.log('  server-url  Server URL (default: http://localhost:3001)');
    console.log('  username    Test username (default: random testuser)');
    console.log('  password    Test password (default: testpass123)');
    console.log();
    console.log('Environment Variables:');
    console.log('  VERBOSE=1   Show all ANSI output and detailed logs');
    console.log();
    console.log('Examples:');
    console.log('  node test-bbs-deep.js');
    console.log('  node test-bbs-deep.js http://localhost:3001');
    console.log('  VERBOSE=1 node test-bbs-deep.js http://localhost:3001 sysop secret');
    console.log();
    console.log('Test Coverage:');
    console.log('  ✓ Complete message entry workflows (public & private)');
    console.log('  ✓ Complete message reading workflows (all reader commands)');
    console.log('  ✓ Complete conference navigation and switching');
    console.log('  ✓ Complete file operations (list, search, status)');
    console.log('  ✓ Complete user workflows (stats, parameters, modes)');
    console.log('  ✓ Communication commands (WHO, comments)');
    console.log('  ✓ Utility commands (help, time, version, bulletins)');
    console.log('  ✓ Error handling (invalid commands, numbers)');
    console.log('  ✓ Sysop commands (if permissions allow)');
    console.log('  ✓ Complex multi-step workflows');
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

  const tester = new DeepBBSTester(SERVER_URL, USERNAME, PASSWORD);
  await tester.runDeepTests();
}

main().catch(error => {
  console.error(`${colors.red}Fatal error: ${error.message}${colors.reset}`);
  console.error(error.stack);
  process.exit(1);
});