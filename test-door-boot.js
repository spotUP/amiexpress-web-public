// Test script to trigger GetAnswer door and monitor ROM boot logs
const io = require('socket.io-client');

const socket = io('http://localhost:3001', {
  transports: ['websocket']
});

console.log('🚀 Starting GetAnswer door test...');
console.log('📋 Monitoring ROM boot sequence...\n');

socket.on('connect', () => {
  console.log('✅ Connected to backend');

  // Launch GetAnswer door
  socket.emit('door:launch', {
    doorId: 'GetAnswer',
    doorPath: '~/Code/amiexpress-web/doors/GetAnswer/GetAnswer'
  });
});

socket.on('door:status', (data) => {
  console.log(`📊 Door status: ${data.status}`);
});

socket.on('door:error', (data) => {
  console.error(`❌ Door error: ${data.message}`);
  process.exit(1);
});

socket.on('door:output', (data) => {
  process.stdout.write(data);
});

socket.on('ansi-output', (data) => {
  process.stdout.write(data);
});

socket.on('disconnect', () => {
  console.log('\n❌ Disconnected from backend');
  process.exit(0);
});

// Timeout after 60 seconds
setTimeout(() => {
  console.log('\n⏱️ Test timeout (60s)');
  process.exit(0);
}, 60000);
