const io = require('socket.io-client');

const socket = io('http://localhost:3001', {
  transports: ['websocket']
});

socket.on('connect', () => {
  console.log('Connected to server');

  // Login
  socket.emit('login', { username: 'sysop', password: 'sysop' });
});

socket.on('login-success', () => {
  console.log('Login successful');

  // Run ANSIED
  setTimeout(() => {
    console.log('Running ANSIED command');
    socket.emit('command', 'ANSIED\r');
  }, 2000);
});

socket.on('door:status', (data) => {
  console.log('Door status:', data);

  if (data.status === 'running') {
    // Try sending input
    setTimeout(() => {
      console.log('Sending ESC to door via door:input event');
      socket.emit('door:input', '\x1b');
    }, 1000);
  }
});

socket.on('ansi-output', (data) => {
  // Suppress normal output
});

setTimeout(() => {
  console.log('Test complete');
  process.exit(0);
}, 10000);
