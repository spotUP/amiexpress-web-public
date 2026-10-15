/**
 * COSYSOP - choose which co-sysop answers when you page.
 *
 * Same shape as SCREENTHEME: a CoreDoor whose onStart hands the context
 * straight to createApp. See app.ts for what it draws, and why it cannot show
 * you the result inside the door.
 */
import { CoreDoor as Door } from '@amiexpress/bbs-door-sdk';
import { createApp } from './app';

const door = new Door({
  name: 'Co-Sysop',
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
  console.error('Co-sysop persona picker error:', error);
});

export default door;
