const io = require('socket.io-client');

const socket = io('http://localhost:3001', {
  transports: ['websocket']
});

let step = 0;
let authenticated = false;

console.log('Starting GetAnswer door test...\n');

socket.on('connect', () => {
  console.log('✓ Connected to backend\n');
  step = 1;
});

socket.on('ansi-output', (data) => {
  // Show the actual output
  if (data.length < 200) {
    const display = data.replace(/\x1b\[[0-9;]*m/g, '').replace(/\r/g, '').trim();
    if (display) {
      console.log(`[BBS] ${display}`);
    }
  }

  if (step === 1 && (data.includes('ANSI') || data.includes('graphics'))) {
    // Graphics mode prompt
    console.log('→ Selecting ANSI mode\n');
    socket.emit('user-input', 'A\n');
    step = 1.5;
  } else if (step === 1.5) {
    // Wait for username prompt
    setTimeout(() => {
      console.log('→ Sending username: sysop\n');
      socket.emit('user-input', 'sysop\n');
      step = 2;
    }, 500);
  } else if (step === 2 && (data.includes('Password') || data.includes('password'))) {
    console.log('→ Sending password\n');
    socket.emit('user-input', 'password\n');
    step = 3;
  } else if (step === 3 && (data.includes('Command') || data.includes('AmiExpress'))) {
    if (!authenticated) {
      authenticated = true;
      console.log('✓ Authenticated successfully\n');
      setTimeout(() => {
        console.log('→ Sending GA command\n');
        socket.emit('user-input', 'GA\n');
        step = 4;

        // Check logs after 3 seconds
        setTimeout(() => {
          console.log('\n=== Checking backend logs for door execution ===\n');
          const { execSync } = require('child_process');
          try {
            const logs = execSync('tail -150 /tmp/backend.log', { encoding: 'utf8' });

            // Look for key indicators
            const lines = logs.split('\n');
            let inDoorSection = false;
            let foundExecLib = false;
            let foundPcError = false;
            let foundDoorExec = false;

            lines.forEach(line => {
              if (line.includes('GA') || line.includes('GetAnswer')) {
                inDoorSection = true;
              }
              if (inDoorSection) {
                if (line.includes('ExecLibrary')) {
                  foundExecLib = true;
                  console.log('  ✓ ExecLibrary initialized');
                }
                if (line.includes('PC assertion') || line.includes('PC0 assertion')) {
                  foundPcError = true;
                  console.log('  ✗ PC assertion error found!');
                }
                if (line.includes('Starting door execution') || line.includes('Executing door')) {
                  foundDoorExec = true;
                  console.log('  ✓ Door execution started');
                }

                // Show all lines that look important
                if (line.includes('[Door') ||
                    line.includes('ExecLibrary') ||
                    line.includes('PC') ||
                    line.includes('assertion') ||
                    line.includes('GetAnswer') ||
                    line.includes('ERROR') ||
                    line.includes('Memory') ||
                    line.includes('CPU')) {
                  console.log(`  ${line}`);
                }
              }
            });

            console.log('\n=== Summary ===');
            console.log(`  ExecLibrary initialized: ${foundExecLib ? 'YES' : 'NO'}`);
            console.log(`  PC assertion error: ${foundPcError ? 'YES ✗' : 'NO ✓'}`);
            console.log(`  Door execution started: ${foundDoorExec ? 'YES' : 'NO'}`);

          } catch (err) {
            console.error('Error reading logs:', err.message);
          }

          socket.disconnect();
          process.exit(0);
        }, 3000);
      }, 1000);
    }
  }
});

socket.on('door-output', (data) => {
  console.log('[DOOR]', data);
});

socket.on('disconnect', () => {
  console.log('\n✗ Disconnected from backend');
});

socket.on('error', (error) => {
  console.error('✗ Socket error:', error);
});

// Safety timeout
setTimeout(() => {
  console.log('\n✗ Test timeout - disconnecting');
  socket.disconnect();
  process.exit(1);
}, 25000);
