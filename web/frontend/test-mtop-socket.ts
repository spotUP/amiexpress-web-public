#!/usr/bin/env npx tsx
import { io } from 'socket.io-client';

const socket = io('http://localhost:3001', {
  transports: ['websocket'],
  reconnection: false
});

let outputBuffer = '';
let commandSent = false;

socket.on('connect', () => {
  console.log('[Connected to BBS]');
  // Login as spot
  socket.emit('login', { username: 'spot', password: '' });
});

socket.on('login-success', (data: any) => {
  console.log('[Login successful]');
  // Wait a moment then run MTOP
  setTimeout(() => {
    console.log('[Sending MTOP command...]');
    commandSent = true;
    socket.emit('command', 'MTOP');
  }, 1000);
});

socket.on('login-failed', (data: any) => {
  console.log('[Login failed]', data);
  process.exit(1);
});

socket.on('ansi-output', (data: string) => {
  outputBuffer += data;
  // Show progress
  if (data.includes('MultiTop')) {
    console.log('[Got MultiTop header]');
  }
});

socket.on('command-complete', () => {
  console.log('[Command completed!]');
  console.log('\n=== MTOP Output ===');
  console.log(outputBuffer);

  // Check bulletin file
  const fs = require('fs');
  const bullPath = '~/Code/AmiExpress/amiexpress-web/Bulletins/bull1.txt';
  if (fs.existsSync(bullPath)) {
    console.log('\n=== bull1.txt contents ===');
    console.log(fs.readFileSync(bullPath, 'utf8'));
  }

  socket.disconnect();
  process.exit(0);
});

socket.on('disconnect', () => {
  console.log('[Disconnected]');
});

socket.on('connect_error', (err: any) => {
  console.log('[Connection error]', err.message);
  process.exit(1);
});

// Timeout after 30 seconds
setTimeout(() => {
  console.log('[Timeout - command did not complete in 30 seconds]');
  console.log('Output so far:', outputBuffer.substring(0, 500));
  process.exit(1);
}, 30000);
