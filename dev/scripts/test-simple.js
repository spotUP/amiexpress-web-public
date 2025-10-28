#!/usr/bin/env node

const io = require('socket.io-client');

let socket;
let allOutput = '';

function cleanAnsi(text) {
  return text.replace(/\x1b\[[0-9;]*m/g, '').replace(/\x1b\[2J/g, '[CLEAR]').replace(/\x1b\[H/g, '[HOME]');
}

async function waitFor(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  console.log('Connecting to BBS...\n');

  socket = io('http://localhost:3001', {
    transports: ['websocket'],
    reconnection: false
  });

  socket.on('connect', () => {
    console.log('✓ Connected\n');
  });

  socket.on('ansi-output', (data) => {
    allOutput += data;
    const clean = cleanAnsi(data);
    process.stdout.write(clean);
  });

  socket.on('disconnect', () => {
    console.log('\n✗ Disconnected');
    process.exit(0);
  });

  // Wait for connection
  await waitFor(1000);

  // Login
  console.log('\n>>> Sending: sysop');
  socket.emit('ansi-input', 'sysop\r');
  await waitFor(1000);

  console.log('\n>>> Sending: sysop (password)');
  socket.emit('ansi-input', 'sysop\r');
  await waitFor(3000);

  // Test J 1
  console.log('\n\n========================================');
  console.log('>>> Testing: J 1');
  console.log('========================================');
  const beforeJ1 = allOutput.length;
  socket.emit('ansi-input', 'J 1\r');
  await waitFor(2000);
  const afterJ1 = allOutput.substring(beforeJ1);
  console.log('\n>>> Response contains:');
  console.log('  - "joined":', afterJ1.toLowerCase().includes('joined'));
  console.log('  - "conference":', afterJ1.toLowerCase().includes('conference'));
  console.log('  - "General":', afterJ1.includes('General'));
  console.log('  - "BULL":', afterJ1.includes('BULL'));

  // Test M (menu)
  console.log('\n\n========================================');
  console.log('>>> Testing: M');
  console.log('========================================');
  const beforeM = allOutput.length;
  socket.emit('ansi-input', 'M\r');
  await waitFor(1500);
  const afterM = allOutput.substring(beforeM);
  console.log('\n>>> Response contains:');
  console.log('  - "menu":', afterM.toLowerCase().includes('menu'));
  console.log('  - "command":', afterM.toLowerCase().includes('command'));
  console.log('  - Length:', afterM.length);

  // Test T (time)
  console.log('\n\n========================================');
  console.log('>>> Testing: T');
  console.log('========================================');
  const beforeT = allOutput.length;
  socket.emit('ansi-input', 'T\r');
  await waitFor(1000);
  const afterT = allOutput.substring(beforeT);
  console.log('\n>>> Response contains:');
  console.log('  - "time":', afterT.toLowerCase().includes('time'));
  console.log('  - ":" (colon):', afterT.includes(':'));
  console.log('  - Length:', afterT.length);

  console.log('\n\n========================================');
  console.log('Test complete');
  console.log('========================================\n');

  socket.disconnect();
  process.exit(0);
}

main();
