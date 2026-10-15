// Test simpler WHO door
import { AmigaDoorSession } from '../web/backend/src/amiga-emulation/AmigaDoorSession';
import path from 'path';
import { EventEmitter } from 'events';

console.log('=== Simple WHO Door Test ===\n');

const doorPath = path.join(process.cwd(), 'Doors/who/who');
console.log('Door path:', doorPath);

let outputBuffer = '';

// Create mock socket
class MockSocket extends EventEmitter {
  emit(event: string, data?: any): boolean {
    if (event === 'ansi-output' && data) {
      outputBuffer += data;
      console.log(`[OUTPUT] ${data.replace(/\r\n/g, '\\r\\n').replace(/\n/g, '\\n')}`);
    }
    return super.emit(event, data);
  }

  on(event: string, listener: (...args: any[]) => void): this {
    return super.on(event, listener);
  }
}

const mockSocket = new MockSocket();

const session = new AmigaDoorSession(mockSocket as any, {
  executablePath: doorPath,
  timeout: 15
});

console.log('\n=== Starting WHO door ===\n');

session.start().then(() => {
  console.log('\n\n=== Door completed successfully ===');
  console.log('\n=== FULL OUTPUT ===');
  console.log(outputBuffer);
  console.log('=== END OUTPUT ===');

  if (outputBuffer.length > 0) {
    console.log('\n✓ SUCCESS: WHO door produced output');
  } else {
    console.log('\n❌ FAIL: No output from WHO door');
  }

  process.exit(0);
}).catch((err) => {
  console.error('\n\n=== Door failed ===');
  console.error('Error:', err.message);
  console.log('\n=== OUTPUT SO FAR ===');
  console.log(outputBuffer);
  process.exit(1);
});

// Timeout
setTimeout(() => {
  console.log('\n\n=== Timeout (15s) ===');
  console.log('\n=== OUTPUT SO FAR ===');
  console.log(outputBuffer);
  process.exit(1);
}, 15000);
