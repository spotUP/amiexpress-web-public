#!/usr/bin/env node

const io = require('socket.io-client');
const readline = require('readline');

const socket = io('http://localhost:3001', {
  transports: ['websocket']
});

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

socket.on('connect', () => {
  console.log('\n=== Connected to BBS ===\n');
});

socket.on('ansi-output', (data) => {
  // Print ANSI output
  process.stdout.write(data);
});

socket.on('request-input', (data) => {
  console.log(`\n[INPUT REQUESTED: ${data.promptType}]`);
});

// Handle stdin
rl.on('line', (line) => {
  socket.emit('client-input', line + '\r\n');
});

socket.on('disconnect', () => {
  console.log('\n=== Disconnected ===');
  process.exit(0);
});

console.log('Starting BBS CLI...');
console.log('After logging in, type: GA (to run GetAnswer door)');
console.log('Watch /tmp/backend.log for detailed instruction traces\n');
