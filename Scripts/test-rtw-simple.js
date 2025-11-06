/**
 * Simple RTW (WHO) door test
 * Tests 68K binary door execution
 */

const io = require('socket.io-client');

const BBS_URL = 'http://localhost:3001';
const TEST_USERNAME = 'sysop';
const TEST_PASSWORD = 'sysop';

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function testRTWDoor() {
  console.log('🚀 Starting RTW (WHO) door test...\n');

  const socket = io(BBS_URL, {
    transports: ['websocket'],
    reconnection: false
  });

  return new Promise((resolve, reject) => {
    let output = '';
    let doorLaunched = false;
    let doorOutput = false;

    socket.on('connect', () => {
      console.log('✅ Connected to BBS\n');
    });

    socket.on('ansi-output', (data) => {
      output += data;
      process.stdout.write(data);

      // Check for door launch
      if (data.includes('RTW') || data.includes('Who is online') || data.includes('Node')) {
        doorLaunched = true;
        doorOutput = true;
        console.log('\n✅ DOOR LAUNCHED - Output detected!\n');
      }
    });

    socket.on('door:status', (data) => {
      console.log(`\n📊 Door status: ${data.status}\n`);

      if (data.status === 'running') {
        console.log('✅ Door execution started!\n');

        // Give door 3 seconds to produce output
        setTimeout(() => {
          if (doorOutput) {
            console.log('✅ SUCCESS - Door produced output!\n');
          } else {
            console.log('⚠️  Door running but no output yet...\n');
          }

          // Exit door
          socket.emit('door:input', 'q');

          setTimeout(() => {
            socket.disconnect();
            resolve();
          }, 2000);
        }, 3000);
      }
    });

    socket.on('disconnect', () => {
      console.log('\n🔌 Disconnected\n');
    });

    socket.on('error', (error) => {
      console.error('❌ Socket error:', error);
      reject(error);
    });

    // Login sequence
    setTimeout(() => socket.emit('command', TEST_USERNAME), 1000);
    setTimeout(() => socket.emit('command', TEST_PASSWORD), 2000);
    setTimeout(() => socket.emit('command', ''), 3500); // Skip bulletins
    setTimeout(() => socket.emit('command', ''), 4000); // Get to menu
    setTimeout(() => {
      console.log('🚪 Launching WHO door...\n');
      socket.emit('command', 'WHO');
    }, 5000);

    // Timeout after 20 seconds
    setTimeout(() => {
      if (!doorLaunched) {
        console.log('❌ Test timeout - door did not launch\n');
        socket.disconnect();
        reject(new Error('Timeout'));
      }
    }, 20000);
  });
}

testRTWDoor()
  .then(() => {
    console.log('✅ Test complete');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Test failed:', error.message);
    process.exit(1);
  });
