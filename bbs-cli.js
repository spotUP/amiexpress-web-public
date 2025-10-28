#!/usr/bin/env node

/**
 * AmiExpress BBS CLI Client
 * 
 * A command-line interface for interacting with the AmiExpress BBS via Socket.io
 * Usage: node bbs-cli.js [server-url] [username] [password]
 */

const io = require('socket.io-client');
const readline = require('readline');

// Configuration
const SERVER_URL = process.argv[2] || 'http://localhost:3001';
const USERNAME = process.argv[3];
const PASSWORD = process.argv[4];

// ANSI color codes
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

class BBSClient {
  constructor(serverUrl) {
    this.serverUrl = serverUrl;
    this.socket = null;
    this.authenticated = false;
    this.currentState = 'disconnected';
    this.rl = null;
    this.loginPrompted = false;
  }

  connect() {
    console.log(`${colors.cyan}[BBS CLI] Connecting to ${this.serverUrl}...${colors.reset}`);
    
    this.socket = io(this.serverUrl, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 5
    });

    this.setupEventHandlers();
    this.setupReadline();
  }

  setupEventHandlers() {
    this.socket.on('connect', () => {
      console.log(`${colors.green}[BBS CLI] Connected to server${colors.reset}`);
      this.currentState = 'connected';
    });

    this.socket.on('disconnect', () => {
      console.log(`${colors.red}[BBS CLI] Disconnected from server${colors.reset}`);
      this.currentState = 'disconnected';
      if (this.rl) {
        this.rl.close();
      }
      process.exit(0);
    });

    this.socket.on('ansi-output', (data) => {
      // Output ANSI data directly to console
      process.stdout.write(data);
    });

    this.socket.on('prompt-password', () => {
      console.log(`${colors.yellow}[BBS CLI] Server requested password${colors.reset}`);
      if (PASSWORD) {
        console.log(`${colors.dim}[BBS CLI] Auto-sending password${colors.reset}`);
        this.socket.emit('login', { username: USERNAME, password: PASSWORD });
      } else {
        this.rl.question('Password: ', (password) => {
          this.socket.emit('login', { username: USERNAME || 'guest', password });
        });
      }
    });

    this.socket.on('user-not-found', (data) => {
      console.log(`${colors.yellow}[BBS CLI] User not found: ${data.username}${colors.reset}`);
      process.stdout.write(data.prompt);
      this.rl.question('', (response) => {
        this.socket.emit('new-user-response', { response, username: data.username });
      });
    });

    this.socket.on('login-success', (data) => {
      console.log(`${colors.green}[BBS CLI] Login successful!${colors.reset}`);
      console.log(`${colors.cyan}[BBS CLI] User: ${data.user.username} (Level ${data.user.secLevel})${colors.reset}`);
      this.authenticated = true;
      this.currentState = 'authenticated';
      if (data.token) {
        console.log(`${colors.dim}[BBS CLI] Token: ${data.token.substring(0, 20)}...${colors.reset}`);
      }
    });

    this.socket.on('login-failed', (error) => {
      console.log(`${colors.red}[BBS CLI] Login failed: ${error}${colors.reset}`);
      if (!USERNAME || !PASSWORD) {
        this.promptLogin();
      }
    });

    this.socket.on('retry-login', () => {
      console.log(`${colors.yellow}[BBS CLI] Retrying login...${colors.reset}`);
      this.promptLogin();
    });

    this.socket.on('set-input-mode', (mode) => {
      console.log(`${colors.dim}[BBS CLI] Input mode: ${mode}${colors.reset}`);
    });

    this.socket.on('show-file-upload', (data) => {
      console.log(`${colors.yellow}[BBS CLI] File upload requested but not supported in CLI mode${colors.reset}`);
      console.log(`${colors.dim}[BBS CLI] Upload URL: ${data.uploadUrl}${colors.reset}`);
    });

    this.socket.on('font-preference', (data) => {
      console.log(`${colors.dim}[BBS CLI] Font preference: ${data.font}${colors.reset}`);
    });

    // Internode chat events
    this.socket.on('chat:request', (data) => {
      console.log(`${colors.magenta}[CHAT] ${data.fromUsername} wants to chat with you!${colors.reset}`);
    });

    this.socket.on('chat:accepted', (data) => {
      console.log(`${colors.green}[CHAT] ${data.withUsername} accepted your chat request!${colors.reset}`);
    });

    this.socket.on('chat:declined', (data) => {
      console.log(`${colors.red}[CHAT] ${data.withUsername} declined your chat request${colors.reset}`);
    });

    this.socket.on('chat:message', (data) => {
      console.log(`${colors.cyan}[${data.fromUsername}]: ${data.message}${colors.reset}`);
    });

    this.socket.on('chat:ended', (data) => {
      console.log(`${colors.yellow}[CHAT] Chat session ended with ${data.withUsername}${colors.reset}`);
    });

    // Group chat events
    this.socket.on('room:joined', (data) => {
      console.log(`${colors.green}[ROOM] Joined room: ${data.roomName}${colors.reset}`);
    });

    this.socket.on('room:message', (data) => {
      console.log(`${colors.cyan}[${data.roomName}] <${data.fromUsername}>: ${data.message}${colors.reset}`);
    });

    this.socket.on('room:left', () => {
      console.log(`${colors.yellow}[ROOM] Left the room${colors.reset}`);
    });

    this.socket.on('error', (error) => {
      console.error(`${colors.red}[BBS CLI] Error: ${error}${colors.reset}`);
    });
  }

  setupReadline() {
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: ''
    });

    this.rl.on('line', (line) => {
      if (!this.authenticated && !this.loginPrompted) {
        // Auto-login if credentials provided
        if (USERNAME && !this.loginPrompted) {
          this.loginPrompted = true;
          console.log(`${colors.dim}[BBS CLI] Auto-checking username: ${USERNAME}${colors.reset}`);
          this.socket.emit('check-username', { username: USERNAME });
          return;
        }
      }
      
      // Send command to server
      this.socket.emit('command', line);
    });

    this.rl.on('close', () => {
      console.log(`${colors.yellow}[BBS CLI] Disconnecting...${colors.reset}`);
      if (this.socket) {
        this.socket.disconnect();
      }
      process.exit(0);
    });
  }

  promptLogin() {
    if (USERNAME && PASSWORD) {
      this.loginPrompted = true;
      console.log(`${colors.dim}[BBS CLI] Auto-login with: ${USERNAME}${colors.reset}`);
      this.socket.emit('check-username', { username: USERNAME });
    } else if (USERNAME) {
      this.loginPrompted = true;
      console.log(`${colors.dim}[BBS CLI] Checking username: ${USERNAME}${colors.reset}`);
      this.socket.emit('check-username', { username: USERNAME });
    } else {
      this.rl.question('Username: ', (username) => {
        this.socket.emit('check-username', { username });
      });
    }
  }

  sendCommand(command) {
    if (this.socket && this.socket.connected) {
      this.socket.emit('command', command);
    } else {
      console.log(`${colors.red}[BBS CLI] Not connected to server${colors.reset}`);
    }
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
    }
    if (this.rl) {
      this.rl.close();
    }
  }
}

// Main
function main() {
  console.log(`${colors.bright}${colors.cyan}╔════════════════════════════════════════════╗${colors.reset}`);
  console.log(`${colors.bright}${colors.cyan}║    AmiExpress BBS - CLI Client v1.0       ║${colors.reset}`);
  console.log(`${colors.bright}${colors.cyan}╚════════════════════════════════════════════╝${colors.reset}`);
  console.log();

  if (process.argv.includes('--help') || process.argv.includes('-h')) {
    console.log('Usage: node bbs-cli.js [server-url] [username] [password]');
    console.log();
    console.log('Arguments:');
    console.log('  server-url  Server URL (default: http://localhost:3001)');
    console.log('  username    Username for auto-login');
    console.log('  password    Password for auto-login');
    console.log();
    console.log('Examples:');
    console.log('  node bbs-cli.js');
    console.log('  node bbs-cli.js http://localhost:3001');
    console.log('  node bbs-cli.js http://localhost:3001 sysop mysecret');
    console.log();
    console.log('Interactive Commands:');
    console.log('  Type BBS commands directly (e.g., M, J 1, R, E, etc.)');
    console.log('  Press Ctrl+C or Ctrl+D to exit');
    process.exit(0);
  }

  const client = new BBSClient(SERVER_URL);
  client.connect();

  // Handle graceful shutdown
  process.on('SIGINT', () => {
    console.log(`\n${colors.yellow}[BBS CLI] Shutting down...${colors.reset}`);
    client.disconnect();
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    console.log(`\n${colors.yellow}[BBS CLI] Shutting down...${colors.reset}`);
    client.disconnect();
    process.exit(0);
  });
}

// Check if socket.io-client is installed
try {
  require.resolve('socket.io-client');
  main();
} catch (e) {
  console.error(`${colors.red}Error: socket.io-client is not installed${colors.reset}`);
  console.error(`${colors.yellow}Please install it with: npm install socket.io-client${colors.reset}`);
  process.exit(1);
}