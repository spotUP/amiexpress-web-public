/**
 * NOTIFY - choose how the board reaches you (email, push, a notice on the board).
 *
 * A CoreDoor whose onStart hands the context straight to createApp. See app.ts.
 */
import { CoreDoor as Door } from '@amiexpress/bbs-door-sdk';
import { createApp } from './app';

const door = new Door({
  name: 'Notifications',
  version: '1.0.0',
  author: 'AmiExpress',
});

door.onStart(async (ctx: any) => {
  await createApp(ctx);
});

door.onClose(async () => {
  // createApp tears down its own screen and input manager.
});

door.onError(async (_ctx: any, error: Error) => {
  console.error('NOTIFY error:', error);
});

export default door;
