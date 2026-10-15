// Test V-AWAIT door directly
import { AmigaDoorSession } from '../web/backend/src/amiga-emulation/AmigaDoorSession';
import path from 'path';
import { EventEmitter } from 'events';

console.log('=== V-AWAIT Door Test ===\n');

const doorPath = path.join(process.cwd(), 'Doors/V-TOOLS/V-AWAIT/V-AWAITold');
console.log('Door path:', doorPath);

// Create mock socket (mimics socket.io Socket)
class MockSocket extends EventEmitter {
  emit(event: string, data?: any): boolean {
    if (data !== undefined) {
      const preview = typeof data === 'string' ? data.substring(0, 100) : JSON.stringify(data).substring(0, 100);
      console.log(`[SOCKET] emit('${event}'):`, preview);
    }
    return super.emit(event, data);
  }

  on(event: string, listener: (...args: any[]) => void): this {
    console.log(`[SOCKET] on('${event}')`);
    return super.on(event, listener);
  }
}

const mockSocket = new MockSocket();

const session = new AmigaDoorSession(mockSocket as any, {
  executablePath: doorPath,
  timeout: 10
});

console.log('\n=== Starting door execution ===\n');

session.start().then(() => {
  console.log('\n=== Door execution completed successfully ===');
  process.exit(0);
}).catch((err) => {
  console.error('\n=== Door execution failed ===');
  console.error('Error:', err.message);
  console.error('Stack:', err.stack);
  process.exit(1);
});

// Timeout
setTimeout(() => {
  console.log('\n=== Timeout after 10 seconds ===');
  process.exit(1);
}, 10000);
