const io = require('socket.io-client');

const socket = io('http://localhost:3001');

let buffer = '';

socket.on('connect', () => {
  console.log('✓ Connected to BBS');
});

socket.on('ansi-output', (data) => {
  buffer += data;
  process.stdout.write(data);
});

socket.on('disconnect', () => {
  console.log('\n✗ Disconnected from BBS');
  process.exit(1);
});

socket.on('connect_error', (error) => {
  console.error('✗ Connection error:', error.message);
  process.exit(1);
});

// Wait for connection and then test
setTimeout(() => {
  console.log('\n→ Pressing Enter for ANSI prompt...');
  socket.emit('command', '\r');
}, 1000);

setTimeout(() => {
  console.log('\n→ Pressing Enter for BBSTITLE...');
  socket.emit('command', '\r');
}, 2000);

setTimeout(() => {
  console.log('\n→ Sending username: sysop');
  socket.emit('command', 'sysop\r');
}, 3000);

setTimeout(() => {
  console.log('\n→ Sending password: sysop');
  socket.emit('command', 'sysop\r');
}, 4000);

// Wait through screens
setTimeout(() => {
  console.log('\n→ Pressing Enter through screens...');
  socket.emit('command', '\r');
}, 5000);

setTimeout(() => {
  console.log('\n→ Pressing Enter for menu...');
  socket.emit('command', '\r');
}, 6000);

// Test U command (upload)
setTimeout(() => {
  console.log('\n→ Testing U command (Upload)...');
  socket.emit('command', 'u\r');
}, 7000);

setTimeout(() => {
  console.log('\n→ Pressing Enter after upload...');
  socket.emit('command', '\r');
}, 9000);

// Test X command (expert mode)
setTimeout(() => {
  console.log('\n→ Testing X command (Expert Mode Toggle)...');
  socket.emit('command', 'x\r');
}, 10000);

setTimeout(() => {
  console.log('\n→ Pressing Enter after expert mode toggle...');
  socket.emit('command', '\r');
}, 11000);

// Toggle expert mode back off
setTimeout(() => {
  console.log('\n→ Toggling X again to see menu return...');
  socket.emit('command', 'x\r');
}, 12000);

setTimeout(() => {
  console.log('\n→ Pressing Enter to see menu...');
  socket.emit('command', '\r');
}, 13000);

setTimeout(() => {
  console.log('\n✓ Test complete');
  process.exit(0);
}, 15000);
