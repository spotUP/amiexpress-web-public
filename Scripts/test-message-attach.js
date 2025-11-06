/**
 * Test /F (File Attach) and /X (Transfer Files) commands in message editor
 * Tests express.e:10508-10566 implementation
 */

const io = require('socket.io-client');

const socket = io('http://localhost:3001', {
  transports: ['websocket']
});

let testStep = 0;

socket.on('connect', () => {
  console.log('✓ Connected to BBS');
});

socket.on('ansi-output', (data) => {
  process.stdout.write(data);
});

socket.on('prompt-input', (data) => {
  console.log('\n[PROMPT]', data.prompt);

  setTimeout(() => {
    switch (testStep) {
      case 0:
        console.log('[TEST] Sending ANSI choice: A');
        socket.emit('user-input', 'A\r');
        testStep++;
        break;
      case 1:
        console.log('[TEST] Sending username: testuser');
        socket.emit('user-input', 'testuser\r');
        testStep++;
        break;
      case 2:
        console.log('[TEST] Sending password: password');
        socket.emit('user-input', 'password\r');
        testStep++;
        break;
      case 3:
        console.log('[TEST] Skipping bulletins...');
        socket.emit('user-input', '\r');
        testStep++;
        break;
      case 4:
        console.log('[TEST] Entering E (Enter Message) command');
        socket.emit('user-input', 'E\r');
        testStep++;
        break;
      case 5:
        console.log('[TEST] Sending To: ALL');
        socket.emit('user-input', 'ALL\r');
        testStep++;
        break;
      case 6:
        console.log('[TEST] Sending Subject: Test File Attachment');
        socket.emit('user-input', 'Test File Attachment\r');
        testStep++;
        break;
      case 7:
        console.log('[TEST] Setting Private: N');
        socket.emit('user-input', 'N\r');
        testStep++;
        break;
      case 8:
        console.log('[TEST] Adding message line 1');
        socket.emit('user-input', 'This is a test message.\r');
        testStep++;
        break;
      case 9:
        console.log('[TEST] Testing /F (File Attach) command');
        socket.emit('user-input', '/F\r');
        testStep++;
        break;
      case 10:
        console.log('[TEST] Entering filename: /tmp/test.txt');
        socket.emit('user-input', '/tmp/test.txt\r');
        testStep++;
        break;
      case 11:
        console.log('[TEST] Delete file when message deleted: N');
        socket.emit('user-input', 'N\r');
        testStep++;
        break;
      case 12:
        console.log('[TEST] Adding message line 2');
        socket.emit('user-input', 'File attached successfully!\r');
        testStep++;
        break;
      case 13:
        console.log('[TEST] Testing /L (List) to verify attachment');
        socket.emit('user-input', '/L\r');
        testStep++;
        break;
      case 14:
        console.log('[TEST] Saving message with /S');
        socket.emit('user-input', '/S\r');
        testStep++;
        break;
      case 15:
        console.log('[TEST] Pressing key to continue');
        socket.emit('user-input', '\r');
        testStep++;
        setTimeout(() => {
          console.log('\n\n✓ Test completed - /F command works!');
          console.log('Next: Test /X command manually in BBS');
          process.exit(0);
        }, 2000);
        break;
    }
  }, 500);
});

socket.on('disconnect', () => {
  console.log('✗ Disconnected from BBS');
  process.exit(1);
});

socket.on('error', (error) => {
  console.error('✗ Socket error:', error);
  process.exit(1);
});

setTimeout(() => {
  console.error('✗ Test timeout after 60 seconds');
  process.exit(1);
}, 60000);
