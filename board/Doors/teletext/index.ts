/**
 * TELETEXT - browse the teletext service packs installed on this board.
 *
 * Ceefax, Oracle and 4-Tel pages survive because people recovered them off
 * home VHS tapes; a pack is one of those recoveries plus a manifest. The
 * door replays them the way they went out: page numbers, subpage carousels,
 * the four coloured fastext keys, and reveal for a concealed answer. The
 * interactive pages of the era - Bamboozle, the quizzes, the unearthed
 * pages of Worms for Teletext - were never programs, only page graphs, so
 * following the links IS playing them.
 */
import { ServerDoor, DoorContext } from '@amiexpress/bbs-door-sdk';
import { TeletextApp, type DoorSession } from './app';

export const metadata = {
  name: 'Teletext',
  version: '1.0.0',
  description: 'Browse installed teletext service packs',
  author: 'AmiExpress Team',
  command: 'TELETEXT',
};

const door = new ServerDoor(metadata);
let app: TeletextApp | null = null;

door.onStart(async (ctx: DoorContext) => {
  app = new TeletextApp({
    socket: ctx.socket as unknown as DoorSession['socket'],
    bbsSession: ctx.bbsSession as Record<string, unknown>,
    user: ctx.user,
    bbs: ctx.bbs as DoorSession['bbs'],
    close: () => ctx.close(),
  });
  app.start();
});

door.onInput(async (_ctx, key) => {
  app?.handleInput(key.raw ?? key.key);
});

door.onClose(async () => {
  // The carousel is a timer. A door that leaves one running keeps painting
  // into a socket that has gone.
  app?.stop();
  app = null;
});

door.onError(async (ctx, error) => {
  console.error('[Teletext]', error);
  ctx.socket.emit('ansi-output', `\r\n\x1b[31mTeletext: ${error.message}\x1b[0m\r\n`);
  app?.stop();
  app = null;
  ctx.close();
});

export default door;
