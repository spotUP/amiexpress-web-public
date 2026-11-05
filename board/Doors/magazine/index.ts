/**
 * MAG - the reader for THE UNKNOWN FREQUENCY.
 *
 * Reads the stories the board's magazine service publishes
 * (Magazine/index.json, Magazine/stories/<id>.json)
 * and sets them in newspaper columns: one column at 40, two at 80, three on
 * a wide terminal. The front page is the newest stories.
 */
import { CoreDoor as Door } from '@amiexpress/bbs-door-sdk';
import { createApp } from './app';

const door = new Door({
  name: 'The Unknown Frequency',
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
  console.error('Magazine reader error:', error);
});

export default door;
