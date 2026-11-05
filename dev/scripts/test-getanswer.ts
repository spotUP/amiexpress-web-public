// Test GetAnswer door execution
const io = require('socket.io-client');

const socket = io('http://localhost:3001', {
  transports: ['websocket']
});

socket.on('connect', () => {
  console.log('[START] Starting GetAnswer (8KB XIM door)...');

  // Emit door-test event
  socket.emit('door-test', { doorName: 'GetAnswer' });
});

socket.on('door-output', (data) => {
  console.log('[Door Output]', data);
});

socket.on('door-completed', (data) => {
  console.log('[Door Completed]', data);
  console.log('GetAnswer door session completed.');
  process.exit(0);
});

socket.on('error', (error) => {
  console.error('[Socket Error]', error);
  process.exit(1);
});

// Timeout after 15 seconds
setTimeout(() => {
  console.log('Test timeout');
  process.exit(0);
}, 15000);
