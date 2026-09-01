/**
 * THEME - pick how the doors look.
 *
 * Same shape as DOORS: a CoreDoor whose onStart hands the context straight
 * to createApp. See app.ts for what it draws and why.
 */
import { CoreDoor as Door } from '@amiexpress/bbs-door-sdk';
import { createApp } from './app';

const door = new Door({
  name: 'Theme',
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
  console.error('Theme picker error:', error);
});

export default door;
