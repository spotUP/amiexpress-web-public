/**
 * MAG - the Underground Mag reader.
 *
 * Reads the stories the board's magazine service publishes
 * (Magazine/index.json, Magazine/stories/<id>.json, Magazine/frontpage.json)
 * and sets them in newspaper columns: one column at 40, two at 80, three on
 * a wide terminal. Only the front page the editor approved is shown as the
 * front page; with nothing approved the reader says AWAITING EDITOR.
 */
import { CoreDoor as Door } from '@amiexpress/bbs-door-sdk';
import { createApp } from './app';

const door = new Door({
  name: 'Underground Mag',
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
