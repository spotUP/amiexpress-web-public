/**
 * WEBTERM - the web terminal settings of W: modem speed, terminal font,
 * PETSCII colours and character set, your data, delete my account.
 *
 * A CoreDoor whose onStart hands the context straight to createApp. See app.ts.
 */
import { CoreDoor as Door } from '@amiexpress/bbs-door-sdk';
import { createApp } from './app';

const door = new Door({
  name: 'Web terminal',
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
  console.error('WEBTERM error:', error);
});

export default door;
