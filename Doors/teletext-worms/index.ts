/**
 * TTWORMS - Worms, in teletext, on a board that can actually compute.
 *
 * Team17 built Worms for teletext in 1996 and it was broadcast for six
 * weeks. It worked by precomputing every screen the game could ever reach
 * and transmitting them as hidden pages, because a television had no
 * processor and no way to send anything back. It was shelved because a
 * day's broadcast could not hold enough pages.
 *
 * Neither limit applies here. The board works out the shot and composes
 * the page for it, and the caller's keys arrive over a socket. The result
 * is still an ordinary teletext page - 40 columns, block graphics at 2x3
 * pixels a cell, an 80 by 60 battlefield - just one that could not have
 * been sent down a vertical blanking interval.
 */
import { ServerDoor, DoorContext } from '@amiexpress/bbs-door-sdk';
import { WormsApp } from './app';

export const metadata = {
  name: 'Teletext Worms',
  version: '1.0.0',
  description: 'Turn-based artillery on generated teletext pages',
  author: 'AmiExpress Team',
  command: 'TTWORMS',
};

const door = new ServerDoor(metadata);
let app: WormsApp | null = null;

door.onStart(async (ctx: DoorContext) => {
  app = new WormsApp({
    socket: ctx.socket as unknown as { emit(event: string, data: string): void },
    bbsSession: ctx.bbsSession as Record<string, unknown>,
    user: ctx.user,
    close: () => ctx.close(),
    achievement: (type, opts) => ctx.achievement?.(type, opts) ?? false,
  });
  app.start();
});

door.onInput(async (_ctx, key) => {
  app?.handleInput(key.raw ?? key.key);
});

door.onClose(async () => {
  // A match left in a lobby holds a seat nobody can take.
  app?.stop();
  app = null;
});

door.onError(async (ctx, error) => {
  console.error('[TeletextWorms]', error);
  ctx.socket.emit('ansi-output', `\r\n\x1b[31mWorms: ${error.message}\x1b[0m\r\n`);
  app?.stop();
  app = null;
  ctx.close();
});

export default door;
