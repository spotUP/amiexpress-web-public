import { io, Socket } from 'socket.io-client';
import { getToken } from './client.js';

const BASE_URL = process.env['AMIEXPRESS_URL'] ?? 'http://localhost:3001';

let _socket: Socket | null = null;

export function getSocket(): Socket {
  if (!_socket) {
    _socket = io(BASE_URL, {
      auth: { token: getToken() },
      reconnectionDelay: 2000,
      reconnectionAttempts: 10,
    });
  }
  return _socket;
}

export function disconnectSocket(): void {
  _socket?.disconnect();
  _socket = null;
}
