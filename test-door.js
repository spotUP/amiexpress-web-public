const io = require('socket.io-client');

const socket = io('http://localhost:3001', {
  transports: ['websocket']
});

let step = 0;

socket.on('connect', () => {
  console.log('✓ Connected to backend');
  step = 1;
});

socket.on('ansi-output', (data) => {
  // Log output for debugging
  const preview = data.substring(0, 100).replace(/\r/g, '\\r').replace(/\n/g, '\\n');
  console.log(`[ANSI] ${preview}${data.length > 100 ? '...' : ''}`);

  if (step === 1) {
    // Initial connection - send username
    console.log('→ Sending username: sysop');
    socket.emit('user-input', 'sysop\n');
    step = 2;
  } else if (step === 2 && data.includes('Password')) {
    // Password prompt
    console.log('→ Sending password');
    socket.emit('user-input', 'password\n');
    step = 3;
  } else if (step === 3 && data.includes('Command')) {
    // At command prompt - run GA command
    console.log('→ Sending GA command');
    socket.emit('user-input', 'GA\n');
    step = 4;
  }
});

socket.on('door-output', (data) => {
  console.log('[DOOR OUTPUT]', data);
});

socket.on('disconnect', () => {
  console.log('✗ Disconnected');
});

socket.on('error', (error) => {
  console.error('✗ Socket error:', error);
});

// Keep script running
setTimeout(() => {
  console.log('\n=== Test complete - checking logs ===\n');
  socket.disconnect();
  process.exit(0);
}, 15000);
