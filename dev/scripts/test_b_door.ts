#!/usr/bin/env node

const io = require('socket.io-client');

console.log('='.repeat(60));
console.log('  Testing B Door (Bulletin Reader)');
console.log('='.repeat(60));
console.log();

const socket = io('http://localhost:3001', {
  transports: ['websocket'],
  reconnection: false
});

let outputBuffer = '';

socket.on('connect', () => {
  console.log('✓ Connected to BBS');

  // Login as test user
  socket.emit('login', {
    username: 'sysop',
    password: 'sysop'
  });
});

socket.on('login-response', (response) => {
  if (response.success) {
    console.log('✓ Logged in as', response.user.username);
    console.log('→ Executing B door command...');
    console.log();

    // Execute B command
    socket.emit('command', 'B');

    // Wait for door to execute, then disconnect
    setTimeout(() => {
      console.log();
      console.log('='.repeat(60));
      console.log('Test complete. Check logs above for CreateMsgPort()');
      console.log('='.repeat(60));
      process.exit(0);
    }, 5000);
  } else {
    console.error('✗ Login failed:', response.message);
    process.exit(1);
  }
});

socket.on('ansi-output', (data) => {
  // Print door output
  process.stdout.write(data);
  outputBuffer += data;
});

socket.on('connect_error', (error) => {
  console.error('✗ Connection error:', error.message);
  process.exit(1);
});

socket.on('disconnect', () => {
  console.log('\n✓ Disconnected');
});

// Timeout after 10 seconds
setTimeout(() => {
  console.error('\n✗ Test timeout');
  process.exit(1);
}, 10000);
