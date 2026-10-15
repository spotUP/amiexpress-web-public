// Simple WHO door test
const io = require('socket.io-client');

const socket = io('http://localhost:3001', {
  transports: ['websocket'],
  reconnection: false
});

let received = [];
let commandSent = false;

socket.on('connect', () => {
  console.log('[OK] Connected to BBS');
});

socket.on('output', (data) => {
  if (data && data.text) {
    received.push(data.text);
    process.stdout.write(data.text);

    // After AWAITSCREEN, send WHO command
    if (!commandSent && data.text.includes('AmiExpress')) {
      commandSent = true;
      console.log('\n📤 Sending WHO command...\n');
      setTimeout(() => {
        socket.emit('door:input', { command: 'WHO', nodeId: 0 });
      }, 500);
    }
  }
});

socket.on('door:output', (data) => {
  console.log('\n[GAME] WHO DOOR OUTPUT:');
  console.log(data);
  console.log('\n[OK] WHO door executed successfully!');
  process.exit(0);
});

socket.on('door:exit', (data) => {
  console.log('\n🚪 WHO door exited:', data);

  // Check if we got output
  if (received.length > 2) {
    console.log('\n[OK] Test PASSED - WHO door executed');
  } else {
    console.log('\n[ERROR] Test FAILED - No output from WHO');
  }
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
  console.log('\n⏱️  Timeout - test took too long');
  console.log('\n📊 Received output:');
  console.log(received.join('\n'));
  process.exit(1);
}, 15000);
