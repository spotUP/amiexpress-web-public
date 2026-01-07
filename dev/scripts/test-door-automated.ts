/**
 * Automated Door Test Script
 *
 * Connects to running BBS servers and automates door testing with REAL BBS session.
 *
 * Usage:
 *   1. Start servers: TRACE_PC_JUMPS=1 ./dev/scripts/start-servers.sh
 *   2. Run this: npx tsx dev/scripts/test-door-automated.ts <command>
 *   3. Check logs/backend.log for [PC_JUMP] entries
 *
 * Example:
 *   npx tsx dev/scripts/test-door-automated.ts J
 */

import { io, Socket } from 'socket.io-client';

const BBS_URL = process.env.BBS_URL || 'http://localhost:3001';
const USERNAME = process.env.TEST_USER || 'spot';
const PASSWORD = process.env.TEST_PASS || 'test';

interface TestConfig {
  command: string;
  timeout?: number;
  waitForOutput?: number;
}

class BBSTestClient {
  private socket: Socket | null = null;
  private authenticated = false;
  private outputBuffer: string[] = [];
  private errorBuffer: string[] = [];

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      console.log(`[TEST] Connecting to BBS at ${BBS_URL}...`);

      this.socket = io(BBS_URL, {
        transports: ['websocket'],
        reconnection: false
      });

      this.socket.on('connect', () => {
        console.log(`[TEST] Connected to BBS (socket ID: ${this.socket?.id})`);
        this.setupListeners();
        resolve();
      });

      this.socket.on('connect_error', (error: Error) => {
        console.error(`[TEST] Connection error:`, error.message);
        reject(error);
      });

      this.socket.on('disconnect', (reason: string) => {
        console.log(`[TEST] Disconnected: ${reason}`);
      });

      setTimeout(() => reject(new Error('Connection timeout')), 10000);
    });
  }

  private setupListeners(): void {
    if (!this.socket) return;

    // Capture all ANSI output from BBS
    this.socket.on('ansi-output', (data: string) => {
      this.outputBuffer.push(data);
      process.stdout.write(data); // Echo to console
    });

    // Capture errors
    this.socket.on('error', (error: any) => {
      this.errorBuffer.push(JSON.stringify(error));
      console.error('[TEST] BBS Error:', error);
    });

    // Door status updates
    this.socket.on('door:status', (status: any) => {
      console.log(`[TEST] Door status:`, status);
    });

    // Authentication result
    this.socket.on('auth:result', (result: any) => {
      if (result.success) {
        console.log(`[TEST] Authentication successful`);
        this.authenticated = true;
      } else {
        console.error(`[TEST] Authentication failed:`, result.error);
      }
    });

    // Menu display
    this.socket.on('menu:display', (data: any) => {
      console.log(`[TEST] Menu displayed`);
    });

    // Command feedback
    this.socket.on('command:result', (result: any) => {
      console.log(`[TEST] Command result:`, result);
    });
  }

  async login(): Promise<void> {
    if (!this.socket) throw new Error('Not connected');

    console.log(`[TEST] Logging in as ${USERNAME}...`);

    return new Promise((resolve, reject) => {
      // Send enter key to get to login prompt
      this.socket!.emit('keys:state', { key: 13, state: 'down' });

      setTimeout(() => {
        // Type username
        console.log(`[TEST] Sending username...`);
        for (const char of USERNAME) {
          this.socket!.emit('keys:state', {
            key: char.charCodeAt(0),
            state: 'down'
          });
        }
        this.socket!.emit('keys:state', { key: 13, state: 'down' }); // Enter

        setTimeout(() => {
          // Type password
          console.log(`[TEST] Sending password...`);
          for (const char of PASSWORD) {
            this.socket!.emit('keys:state', {
              key: char.charCodeAt(0),
              state: 'down'
            });
          }
          this.socket!.emit('keys:state', { key: 13, state: 'down' }); // Enter

          // Wait for authentication
          setTimeout(() => {
            if (this.authenticated) {
              resolve();
            } else {
              reject(new Error('Authentication failed'));
            }
          }, 2000);
        }, 500);
      }, 1000);
    });
  }

  async sendCommand(command: string): Promise<void> {
    if (!this.socket) throw new Error('Not connected');
    if (!this.authenticated) throw new Error('Not authenticated');

    console.log(`[TEST] Sending command: ${command}`);

    // Type command
    for (const char of command) {
      this.socket.emit('keys:state', {
        key: char.charCodeAt(0),
        state: 'down'
      });
    }

    // Send enter
    this.socket.emit('keys:state', { key: 13, state: 'down' });
  }

  async waitForOutput(seconds: number): Promise<void> {
    console.log(`[TEST] Waiting ${seconds} seconds for output...`);
    await new Promise(resolve => setTimeout(resolve, seconds * 1000));
  }

  disconnect(): void {
    if (this.socket) {
      console.log(`[TEST] Disconnecting...`);
      this.socket.disconnect();
      this.socket = null;
    }
  }

  getOutput(): string {
    return this.outputBuffer.join('');
  }

  getErrors(): string[] {
    return this.errorBuffer;
  }
}

async function main() {
  const command = process.argv[2];
  if (!command) {
    console.error('Usage: npx tsx dev/scripts/test-door-automated.ts <command>');
    console.error('Example: npx tsx dev/scripts/test-door-automated.ts J');
    process.exit(1);
  }

  const config: TestConfig = {
    command,
    timeout: parseInt(process.env.TEST_TIMEOUT || '30'),
    waitForOutput: parseInt(process.env.TEST_WAIT || '15')
  };

  console.log('='.repeat(80));
  console.log('BBS Automated Door Test');
  console.log('='.repeat(80));
  console.log(`Command: ${config.command}`);
  console.log(`BBS URL: ${BBS_URL}`);
  console.log(`Username: ${USERNAME}`);
  console.log(`Timeout: ${config.timeout}s`);
  console.log('='.repeat(80));
  console.log('');

  const client = new BBSTestClient();

  try {
    await client.connect();
    await client.login();

    // Wait a moment for menu to display
    await client.waitForOutput(2);

    // Send the command
    await client.sendCommand(config.command);

    // Wait for door to execute and complete
    await client.waitForOutput(config.waitForOutput!);

    console.log('');
    console.log('='.repeat(80));
    console.log('[TEST] Test completed');
    console.log('='.repeat(80));
    console.log('');
    console.log('Check logs/backend.log for detailed execution trace.');
    console.log('Look for [PC_JUMP] entries showing PC jumps outside code region.');
    console.log('');

    if (client.getErrors().length > 0) {
      console.log('Errors encountered:');
      client.getErrors().forEach(err => console.log('  -', err));
    }

  } catch (error) {
    console.error('[TEST] Test failed:', error);
    process.exit(1);
  } finally {
    client.disconnect();
  }
}

main().catch(error => {
  console.error('[FATAL]', error);
  process.exit(1);
});
