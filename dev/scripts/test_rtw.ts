// Simple RTW door test
const io = require('socket.io-client');

const socket = io('http://localhost:3001', {
  transports: ['websocket'],
  reconnection: false
});

let received = [];
let commandSent = false;

socket.on('connect', () => {
  console.log('[OK] Connected to BBS');
  console.log('   Socket ID:', socket.id);

  // Send RTW command immediately after connection
  setTimeout(() => {
    if (!commandSent) {
      commandSent = true;
      console.log('\n📤 Sending RTW command (immediate)...\n');
      socket.emit('door:input', { command: 'RTW', nodeId: 0 });
    }
  }, 1000);
});

socket.on('output', (data) => {
  if (data && data.text) {
    received.push(data.text);
    process.stdout.write(data.text);

    // After ANY output, send RTW command (don't wait for specific text)
    if (!commandSent) {
      commandSent = true;
      console.log('\n📤 Sending RTW command...\n');
      setTimeout(() => {
        socket.emit('door:input', { command: 'RTW', nodeId: 0 });
      }, 500);
    }
  }
});

socket.on('door:output', (data) => {
  console.log('\n[GAME] RTW DOOR OUTPUT:');
  console.log(data);
  console.log('\n[OK] RTW door executed!');
  console.log('\n📋 Check backend logs for corruption detection:');
  console.log('   grep -A20 "CORRUPTION" logs/backend.log');
  process.exit(0);
});

socket.on('door:exit', (data) => {
  console.log('\n🚪 RTW door exited:', data);
  console.log('\n📋 Check backend logs for corruption detection:');
  console.log('   grep -A20 "CORRUPTION" logs/backend.log');
  process.exit(0);
});

socket.on('error', (err) => {
  console.error('[ERROR] Socket error:', err);
  process.exit(1);
});

socket.on('disconnect', () => {
  console.log('🔌 Disconnected');
  process.exit(0);
});

// Timeout after 15 seconds
setTimeout(() => {
  console.log('\n⏱️  Timeout - RTW took too long');
  console.log('\n📋 Check backend logs for corruption detection:');
  console.log('   grep -A20 "CORRUPTION" logs/backend.log');
  process.exit(1);
}, 15000);
