// Test RTW door with AmiExpress v5.6 version string
import { AmigaDoorSession } from '../web/backend/src/amiga-emulation/AmigaDoorSession';
import path from 'path';
import { EventEmitter } from 'events';

console.log('=== RTW Door Test (AmiExpress v5.6) ===\n');

const doorPath = path.join(process.cwd(), 'Doors/RTW/rtw');
console.log('Door path:', doorPath);

let outputBuffer = '';
let instructionCount = 0;

// Create mock socket
class MockSocket extends EventEmitter {
  emit(event: string, data?: any): boolean {
    if (event === 'ansi-output' && data) {
      // Accumulate output
      outputBuffer += data;
      console.log(`\n[OUTPUT] ${data.replace(/\r\n/g, '\\r\\n').replace(/\n/g, '\\n')}`);
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
  console.log('\n\n=== Door completed successfully ===');
  console.log('\n=== FULL OUTPUT ===');
  console.log(outputBuffer);
  console.log('=== END OUTPUT ===');

  // Check if we got the error message or the WHO table
  if (outputBuffer.includes('This is a XIM-DOOR for AmiExpress 3.x')) {
    console.log('\n❌ FAIL: Still showing version error message');
  } else if (outputBuffer.includes('Node') || outputBuffer.includes('User')) {
    console.log('\n✓ SUCCESS: WHO table displayed');
  } else {
    console.log('\n? UNKNOWN: Unexpected output');
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
  console.log('\n\n=== Timeout (10s) ===');
  console.log('\n=== OUTPUT SO FAR ===');
  console.log(outputBuffer);

  if (outputBuffer.includes('This is a XIM-DOOR for AmiExpress 3.x')) {
    console.log('\n❌ FAIL: Still showing version error message');
  } else if (outputBuffer.includes('Node') || outputBuffer.includes('User')) {
    console.log('\n✓ SUCCESS: WHO table displayed');
  }

  process.exit(1);
}, 10000);
