const io = require('socket.io-client');

console.log('Testing NI door execution on connection...');

const socket = io('http://localhost:3001', {
  transports: ['websocket'],
  reconnection: false
});

socket.on('connect', () => {
  console.log('✓ Connected to BBS');
});

socket.on('ansi-output', (data) => {
  console.log('[ANSI]', data.substring(0, 100));
});

socket.on('disconnect', () => {
  console.log('✗ Disconnected');
  process.exit(0);
});

socket.on('connect_error', (error) => {
  console.error('✗ Connection error:', error.message);
  process.exit(1);
});

// Wait 5 seconds then disconnect
setTimeout(() => {
  console.log('Disconnecting after 5 seconds...');
  socket.disconnect();
}, 5000);
