/**
 * ACHIEVE - your achievements, and the board's link to your global profile.
 *
 * Same shape as THEME: a CoreDoor whose onStart hands the context straight
 * to createApp. See app.ts for what it draws and why.
 */
import { CoreDoor as Door } from '@amiexpress/bbs-door-sdk';
import { createApp } from './app';

const door = new Door({
  name: 'Achievements',
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
  console.error('ACHIEVE error:', error);
});

export default door;
