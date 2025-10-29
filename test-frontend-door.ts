import { io, Socket } from 'socket.io-client';

const BACKEND_URL = 'http://localhost:3001';
const TEST_USERNAME = 'sysop';
const TEST_PASSWORD = 'sysop';
const TEST_TIMEOUT = 30000; // 30 seconds

let socket: Socket;
let currentState = 'awaiting_graphics';
const receivedOutput: string[] = [];

function log(message: string) {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${message}`);
}

function sendInput(text: string) {
  log(`SENDING: "${text}"`);
  // Send each character individually like xterm.js does
  for (const char of text) {
    socket.emit('command', char);
  }
  socket.emit('command', '\r');
}

log('Starting BBS door execution test...');
log(`Connecting to ${BACKEND_URL}...`);

socket = io(BACKEND_URL, {
  transports: ['websocket'],
  reconnection: false
});

socket.on('connect', () => {
  log('Connected to BBS backend');
});

socket.on('ansi-output', (data: string) => {
  receivedOutput.push(data);
  const cleanData = data.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '');
  if (cleanData.trim()) {
    console.log('RECEIVED:', cleanData);
  }

  // State machine to navigate BBS flow
  if (currentState === 'awaiting_graphics' && (data.includes('ANSI graphics') || data.includes('graphics (A/r/n)'))) {
    log('Graphics selection prompt detected');
    currentState = 'select_graphics';
    setTimeout(() => sendInput('A'), 500);
  }
  else if ((data.includes('[M]ain Menu') || data.includes('Menu (')) && currentState !== 'door_executing') {
    log('Main menu detected - ready to execute FRONTEND command');
    currentState = 'at_menu';
    setTimeout(() => {
      log('Executing FRONTEND command...');
      sendInput('FRONTEND');
      currentState = 'door_executing';
    }, 1000);
  }
  else if (data.includes('Press any key') && currentState !== 'door_executing' && currentState !== 'awaiting_graphics') {
    log('Pause prompt detected - sending space');
    setTimeout(() => socket.emit('command', ' '), 300);
  }

  log(`Door output received (state: ${currentState})`);
});

socket.on('prompt-login', () => {
  log('Login prompt received from server');
  if (currentState === 'select_graphics') {
    currentState = 'logging_in';
    setTimeout(() => {
      log(`Sending login credentials: ${TEST_USERNAME}`);
      socket.emit('login', { username: TEST_USERNAME, password: TEST_PASSWORD });
    }, 500);
  }
});

socket.on('login-success', (data: any) => {
  log(`Login successful: ${JSON.stringify(data)}`);
  currentState = 'logged_in';
});

socket.on('disconnect', (reason: string) => {
  log(`Disconnected: ${reason}`);
  log(`Final state: ${currentState}`);
  log(`Received ${receivedOutput.length} output chunks`);
  process.exit(0);
});

socket.on('connect_error', (error: Error) => {
  log(`Connection error: ${error.message}`);
  process.exit(1);
});

// Timeout after 30 seconds
setTimeout(() => {
  log('Test timeout - exiting');
  log(`Final state: ${currentState}`);
  socket.disconnect();
}, TEST_TIMEOUT);
