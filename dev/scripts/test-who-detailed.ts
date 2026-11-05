import WebSocket from 'ws';

const ws = new WebSocket('ws://localhost:3001');

ws.on('open', () => {
  console.log('Connected to BBS');

  // Login as sysop
  setTimeout(() => ws.send('sysop\n'), 500);
  setTimeout(() => ws.send('PASSWORD\n'), 1000);

  // Wait for main menu, then run WHO door
  setTimeout(() => {
    console.log('\n=== Running WHO command ===');
    ws.send('WHO\n');
  }, 3000);

  // Exit after output
  setTimeout(() => {
    console.log('\n=== Test complete ===');
    ws.close();
    process.exit(0);
  }, 8000);
});

ws.on('message', (data) => {
  const text = data.toString();
  if (text.trim()) {
    console.log(text);
  }
});

ws.on('error', (error) => {
  console.error('WebSocket error:', error);
  process.exit(1);
});
