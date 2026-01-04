/**
 * Test script to verify WALL door execution during login
 */
import { io, Socket } from 'socket.io-client';

const SERVER_URL = 'http://localhost:3001';

async function testLoginFlow() {
console.log('[TEST] Connecting to BBS...');

  const socket: Socket = io(SERVER_URL, {
    transports: ['websocket'],
    reconnection: false,
    timeout: 10000,
  });

  let sentAnsi = false;
  let sentUsername = false;
  let sentPassword = false;
  let sawWall = false;
  let sawGwall = false;
  let reachedMenu = false;

  socket.on('connect', () => {
console.log('[TEST] Connected!');
  });

  socket.on('ansi-output', (data: string) => {
    const clean = data.replace(/\x1b\[[0-9;]*m/g, '').replace(/[\r\n]+/g, ' ').trim();
    if (clean.length > 0 && clean.length < 200) {
console.log('[OUTPUT]', clean.substring(0, 100));
    }

    // Check for wall output (dRE!WAll shows ASCII art wall/graffiti)
    if (data.includes('dRE') || data.includes('WAll') || data.includes('Graffiti') ||
        data.includes('graffiti') || data.includes('spray')) {
      sawWall = true;
console.log('[WALL] Detected dRE!WAll door output!');
    }

    // Check for gwall (GWALL TypeScript door)
    if (data.includes('GWALL') || data.includes('gwall') || data.includes('Global Wall')) {
      sawGwall = true;
console.log('[GWALL] Detected GWALL door output!');
    }

    // ANSI prompt - respond with 'a' for ANSI
    if ((data.includes('ANSI') || data.includes('graphics')) && data.includes('?') && !sentAnsi) {
console.log('[TEST] ANSI prompt detected, sending "a"...');
      setTimeout(() => socket.emit('command', 'a\r'), 500);
      sentAnsi = true;
    }

    // Check for pause prompts
    if (data.includes('Pause') || data.includes('Space To Resume') || data.includes('[Hit A Key]') ||
        data.includes('press any key') || data.includes('Press any key')) {
console.log('[TEST] Pause detected, sending space...');
      setTimeout(() => socket.emit('command', ' '), 300);
    }

    // Check for actual login/handle prompts (not just "Login Established" text)
    if ((data.includes('Enter your') || data.includes('Handle:') || data.includes('handle:') ||
         data.includes('Username:') || data.includes('Name:')) && !sentUsername) {
console.log('[TEST] Login prompt detected, sending username...');
      setTimeout(() => socket.emit('command', 'spot\r'), 500);
      sentUsername = true;
    }

    // Check for password prompt
    if ((data.toLowerCase().includes('password:') || data.toLowerCase().includes('password?')) && !sentPassword) {
console.log('[TEST] Password prompt, sending password...');
      setTimeout(() => socket.emit('command', 'test123\r'), 300);
      sentPassword = true;
    }

    // Check for main menu
    if (data.includes('Command') && data.includes(':') && !data.includes('EMSI')) {
      reachedMenu = true;
console.log('[TEST] Reached command prompt / main menu');
    }
  });

  socket.on('connect_error', (err) => {
console.error('[ERROR] Connection failed:', err.message);
    process.exit(1);
  });

  socket.on('disconnect', () => {
console.log('[TEST] Disconnected');
  });

  // Keep running for a bit
  await new Promise(resolve => setTimeout(resolve, 30000));
  socket.disconnect();

console.log('\n[TEST] Test complete');
console.log('[RESULT] Saw dRE!WAll door output:', sawWall);
console.log('[RESULT] Saw GWALL door output:', sawGwall);
console.log('[RESULT] Reached main menu:', reachedMenu);
}

testLoginFlow().catch(err => {
console.error('[ERROR]', err);
  process.exit(1);
});
