// Test RTW door to debug output issue
import { AmigaDoorSession } from '../web/backend/src/amiga-emulation/AmigaDoorSession';
import path from 'path';
import { EventEmitter } from 'events';

console.log('=== RTW Door Test ===\n');

const doorPath = path.join(process.cwd(), 'Doors/RTW/rtw');
console.log('Door path:', doorPath);

let outputBuffer = '';

// Create mock socket
class MockSocket extends EventEmitter {
  emit(event: string, data?: any): boolean {
    if (event === 'ansi-output' && data) {
      // Accumulate output
      outputBuffer += data;
      // Show hex codes for debugging
      const hex = Array.from(data).map((c: string) =>
        '0x' + c.charCodeAt(0).toString(16).padStart(2, '0')
      ).join(' ');
      console.log(`\n[OUTPUT] Received ${data.length} chars`);
      console.log(`[TEXT] "${data}"`);
      console.log(`[HEX] ${hex}`);
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
  timeout: 10
});

console.log('\n=== Starting RTW door ===\n');

session.start().then(() => {
  console.log('\n\n=== Door completed ===');
  console.log('\n=== FULL OUTPUT ===');
  console.log(outputBuffer);
  console.log('\n=== END OUTPUT ===');
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
  console.log('\n\n=== Timeout ===');
  console.log('\n=== OUTPUT SO FAR ===');
  console.log(outputBuffer);
  process.exit(1);
}, 10000);
