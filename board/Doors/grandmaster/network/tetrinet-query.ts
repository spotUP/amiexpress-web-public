/**
 * TetriNET Query Protocol Client
 *
 * Supports playerquery, listchan, listuser, and version commands.
 * Commands are sent over TCP with 0xFF terminator; responses end with LF.
 */

import * as net from 'net';

export type TetriNetQueryCommand = 'playerquery' | 'listchan' | 'listuser' | 'version';

export interface TetriNetQueryResult {
  command: TetriNetQueryCommand;
  lines: string[];
}

export async function queryTetriNetServer(
  host: string,
  command: TetriNetQueryCommand,
  port: number = 31457,
  timeoutMs: number = 5000
): Promise<TetriNetQueryResult> {
  return new Promise((resolve, reject) => {
    const socket = new net.Socket();
    let buffer = '';
    const lines: string[] = [];
    const expectsOk = command === 'listchan' || command === 'listuser' || command === 'version';

    const cleanup = () => {
      socket.removeAllListeners();
      socket.destroy();
    };

    const finish = () => {
      cleanup();
      resolve({ command, lines });
    };

    const timer = setTimeout(() => {
      cleanup();
      reject(new Error('Query timeout'));
    }, timeoutMs);

    socket.on('data', (data: Buffer) => {
      buffer += data.toString('latin1');
      let idx = buffer.indexOf('\n');
      while (idx !== -1) {
        const line = buffer.slice(0, idx).replace(/\r$/, '');
        buffer = buffer.slice(idx + 1);
        if (line.length > 0) {
          if (line === '+OK') {
            clearTimeout(timer);
            finish();
            return;
          }
          lines.push(line);
          if (!expectsOk) {
            clearTimeout(timer);
            finish();
            return;
          }
        }
        idx = buffer.indexOf('\n');
      }
    });

    socket.on('error', (error) => {
      clearTimeout(timer);
      cleanup();
      reject(error);
    });

    socket.on('connect', () => {
      const payload = Buffer.from(command, 'latin1');
      const terminator = Buffer.from([0xFF]);
      socket.write(Buffer.concat([payload, terminator]));
    });

    socket.connect(port, host);
  });
}
