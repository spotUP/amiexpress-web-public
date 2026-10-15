// Test WHO door with real node user files
import { AmigaDoorSession } from '../web/backend/src/amiga-emulation/AmigaDoorSession';
import path from 'path';
import { EventEmitter } from 'events';

console.log('=== WHO Door Test ===\n');

// Use the simpler who door first
const doorPath = path.join(process.cwd(), 'Doors/who/who');
console.log('Door path:', doorPath);

// Create mock socket (mimics socket.io Socket)
class MockSocket extends EventEmitter {
  emit(event: string, data?: any): boolean {
    if (event === 'ansi-output' && data) {
      // Print door output directly
      process.stdout.write(data);
    } else if (data !== undefined) {
      const preview = typeof data === 'string' ? data.substring(0, 100) : JSON.stringify(data).substring(0, 100);
      console.log(`\n[SOCKET] emit('${event}'):`, preview);
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

console.log('\n=== Starting WHO door execution ===\n');
console.log('Node files available:');
console.log('  node0.user:', require('fs').existsSync('~/Code/amiexpress-web/node0.user') ? 'YES' : 'NO');
console.log('  node0.userkeys:', require('fs').existsSync('~/Code/amiexpress-web/node0.userkeys') ? 'YES' : 'NO');
console.log('  node1.user:', require('fs').existsSync('~/Code/amiexpress-web/node1.user') ? 'YES' : 'NO');
console.log('  node1.userkeys:', require('fs').existsSync('~/Code/amiexpress-web/node1.userkeys') ? 'YES' : 'NO');
console.log('\n');

session.start().then(() => {
  console.log('\n\n=== WHO door execution completed successfully ===');
  process.exit(0);
}).catch((err) => {
  console.error('\n\n=== WHO door execution failed ===');
  console.error('Error:', err.message);
  if (err.stack) {
    console.error('Stack:', err.stack);
  }
  process.exit(1);
});

// Timeout
setTimeout(() => {
  console.log('\n\n=== Timeout after 10 seconds ===');
  process.exit(1);
}, 10000);
