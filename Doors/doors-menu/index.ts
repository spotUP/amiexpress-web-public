/**
 * Doors Menu - Interactive Door Selection
 * SDK v2.0 Entry Point
 */

import { CoreDoor as Door } from '@amiexpress/bbs-door-sdk';
import { createApp } from './app';

// Create Door instance
const door = new Door({
  name: 'Doors Menu',
  version: '1.0.0',
  author: 'AmiExpress',
});

// Handle door start
door.onStart(async (ctx: any) => {
  // The backend passes: { socket, bbsSession, user, bbs, params }
  // which is exactly what createApp expects
  await createApp(ctx);
});

// Handle door close
door.onClose(async (ctx: any) => {
  // Cleanup handled by createApp
});

// Handle errors
door.onError(async (ctx: any, error: Error) => {
  console.error('Doors Menu error:', error);
});

export default door;
