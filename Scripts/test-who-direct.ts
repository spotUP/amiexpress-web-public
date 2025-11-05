// Direct test of WHO door without WebSocket
import { AmigaDoorSession } from '../web/backend/src/amiga-emulation/AmigaDoorSession';
import path from 'path';

console.log('=== WHO Door Direct Test ===\n');

const doorPath = path.join(process.cwd(), 'Doors/who/who');
const session = new AmigaDoorSession(doorPath, 0, null as any);

// Capture output
const outputs: string[] = [];
session.on('output', (text: string) => {
  outputs.push(text);
  console.log('[OUTPUT]', text);
});

// Run door
session.execute().then(() => {
  console.log('\n=== Door Execution Complete ===');
  console.log('Total output lines:', outputs.length);
  console.log('Combined output:\n', outputs.join(''));
  process.exit(0);
}).catch((err) => {
  console.error('\n=== Door Execution Failed ===');
  console.error(err);
  process.exit(1);
});

// Timeout after 10 seconds
setTimeout(() => {
  console.log('\n=== Test Timeout ===');
  process.exit(1);
}, 10000);
