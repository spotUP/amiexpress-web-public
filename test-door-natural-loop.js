/**
 * Test GetAnswer door with natural polling loop behavior
 * This test monitors what happens during the timeout loop without forcing D2 exit
 */

const io = require('socket.io-client');

const socket = io('http://localhost:3001', {
  transports: ['websocket']
});

let lastOutput = '';

socket.on('connect', () => {
  console.log('=== Connected to BBS ===\n');
});

socket.on('ansi-output', (data) => {
  lastOutput += data;
  process.stdout.write(data);

  // Auto-respond to prompts
  if (data.includes('ANSI, RIP or No graphics')) {
    console.log('\n=== Auto-selecting ANSI ===');
    setTimeout(() => socket.emit('send-key', 'a'), 500);
  }
  if (data.includes('password:')) {
    console.log('\n=== Auto-entering password ===');
    setTimeout(() => socket.emit('send-line', ''), 500);
  }
});

socket.on('bbs:state-change', (state) => {
  console.log(`\n=== State: ${state.state}/${state.subState} ===`);

  if (state.state === 'AWAIT_CALLER') {
    console.log('=== Logging in as sysop ===');
    socket.emit('send-line', 'sysop');
  }

  if (state.state === 'LOGGED_ON' && state.subState === 'READ_COMMAND') {
    console.log('=== At main menu, launching GetAnswer door ===');
    socket.emit('send-line', 'DOOR');
  }
});

socket.on('door:started', (data) => {
  console.log(`\n=== Door started: ${data.name} ===`);
  console.log('Monitoring for:');
  console.log('  1. Memory changes at 0x2001');
  console.log('  2. Library calls during polling loop');
  console.log('  3. Natural loop exit conditions\n');
});

socket.on('door:output', (data) => {
  process.stdout.write(data);
});

socket.on('door:exit', (data) => {
  console.log(`\n=== Door exited with code: ${data.exitCode} ===`);
  process.exit(0);
});

socket.on('disconnect', () => {
  console.log('\n=== Disconnected ===');
  process.exit(1);
});

// Timeout after 60 seconds
setTimeout(() => {
  console.log('\n=== Test timeout (60s) - Natural loop should complete by now ===');
  process.exit(0);
}, 60000);

console.log('Starting door execution test with natural loop behavior...\n');
