/**
 * Test script for ANSI Editor Door
 * Launches the editor with a test user session
 */

const io = require('socket.io-client');

async function test() {
  console.log('Connecting to BBS server...');

  const socket = io('http://localhost:3001', {
    auth: {
      userId: 1,
      username: 'sysop',
      userLevel: 5,
      nodeNumber: 1
    },
    transports: ['websocket']
  });

  socket.on('connect', () => {
    console.log('Connected! Socket ID:', socket.id);
    console.log('\nLaunching ANSI Editor door...\n');

    // Send door execution command
    socket.emit('execute-door', {
      doorPath: 'Doors/ansi-editor',
      userId: 1
    });
  });

  socket.on('ansi-output', (data) => {
    process.stdout.write(data);
  });

  socket.on('door-exit', (data) => {
    console.log('\n\nDoor exited:', data);
    process.exit(0);
  });

  socket.on('connect_error', (error) => {
    console.error('Connection error:', error.message);
    process.exit(1);
  });

  socket.on('disconnect', (reason) => {
    console.log('\nDisconnected:', reason);
    process.exit(0);
  });

  // Handle terminal input from stdin
  process.stdin.setRawMode(true);
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (key) => {
    // Ctrl+C to exit
    if (key === '\u0003') {
      process.exit();
    }

    socket.emit('terminal-input', { input: key });
  });
}

test().catch(console.error);
