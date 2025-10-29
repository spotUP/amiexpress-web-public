import { io, Socket } from 'socket.io-client';

const BACKEND_URL = 'http://localhost:3001';
const TEST_USERNAME = 'sysop';
const TEST_PASSWORD = 'sysop';
const TEST_TIMEOUT = 15000; // 15 seconds (shorter for faster testing)

let socket: Socket;
let currentState = 'awaiting_graphics';

function log(message: string) {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${message}`);
}

function sendInput(text: string) {
  log(`SENDING: "${text}"`);
  for (const char of text) {
    socket.emit('command', char);
  }
  socket.emit('command', '\r');
}

log('Starting door output test...');
log(`Connecting to ${BACKEND_URL}...`);

socket = io(BACKEND_URL, {
  transports: ['websocket'],
  reconnection: false
});

socket.on('connect', () => {
  log('Connected to BBS backend');
});

socket.on('ansi-output', (data: string) => {
  // Show ALL output including door output
  const cleanData = data.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '');
  if (cleanData.trim()) {
    console.log('OUTPUT:', cleanData);
  }

  // State machine
  if (currentState === 'awaiting_graphics' && (data.includes('ANSI graphics') || data.includes('graphics (A/r/n)'))) {
    log('Graphics selection prompt detected');
    currentState = 'select_graphics';
    setTimeout(() => sendInput('A'), 500);
  }
  else if ((data.includes('[M]ain Menu') || data.includes('Menu (')) && currentState !== 'door_executing') {
    log('Main menu detected - executing FRONTEND command');
    currentState = 'at_menu';
    setTimeout(() => {
      sendInput('FRONTEND');
      currentState = 'door_executing';
      log('Door should be running - watching for output...');
    }, 1000);
  }
  else if (data.includes('Press any key') && currentState !== 'door_executing' && currentState !== 'awaiting_graphics') {
    setTimeout(() => socket.emit('command', ' '), 300);
  }
});

socket.on('prompt-login', () => {
  log('Login prompt received');
  if (currentState === 'select_graphics') {
    currentState = 'logging_in';
    setTimeout(() => {
      socket.emit('login', { username: TEST_USERNAME, password: TEST_PASSWORD });
    }, 500);
  }
});

socket.on('login-success', (data: any) => {
  log(`Login successful as ${data.user.username}`);
  currentState = 'logged_in';
});

socket.on('disconnect', (reason: string) => {
  log(`Disconnected: ${reason}`);
  process.exit(0);
});

socket.on('connect_error', (error: Error) => {
  log(`Connection error: ${error.message}`);
  process.exit(1);
});

// Timeout
setTimeout(() => {
  log('Test timeout - exiting');
  socket.disconnect();
}, TEST_TIMEOUT);
