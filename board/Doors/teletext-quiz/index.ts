/**
 * TTQUIZ - a teletext quiz on pages composed as you play.
 *
 * Bamboozle, the quiz this is shaped after, was not a program. A television
 * had no processor and no return path, so every question and every outcome
 * was drawn in advance and broadcast as its own page, and the game was the
 * graph of page numbers between them. A BBS has the processor and the
 * return path, so the page can be built for this question, this score, this
 * caller - while still being an ordinary teletext page, concealed answer
 * and all.
 */
import { ServerDoor, DoorContext } from '@amiexpress/bbs-door-sdk';
import { QuizApp } from './app';

export const metadata = {
  name: 'Teletext Quiz',
  version: '1.0.0',
  description: 'Bamboozle-style teletext quiz on generated pages',
  author: 'AmiExpress Team',
  command: 'TTQUIZ',
};

const door = new ServerDoor(metadata);
let app: QuizApp | null = null;

door.onStart(async (ctx: DoorContext) => {
  app = new QuizApp({
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
  app?.stop();
  app = null;
});

door.onError(async (ctx, error) => {
  console.error('[TeletextQuiz]', error);
  ctx.socket.emit('ansi-output', `\r\n\x1b[31mTeletext Quiz: ${error.message}\x1b[0m\r\n`);
  app?.stop();
  app = null;
  ctx.close();
});

export default door;
