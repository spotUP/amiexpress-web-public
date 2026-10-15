/**
 * Sprite Studio - the ANSI editor door, forked into a sprite animation studio.
 *
 * Fork lineage, and this time literally: `Doors/ansi-editor/index.ts` is the
 * base. Everything lives inside that fork - one full-screen editor with its
 * own menu bar, sidebar and status line, and requesters for everything else.
 * See studio.ts's header for why the previous shape (a browser screen that
 * launched an editor) was wrong.
 */

import { CoreDoor as Door } from '@amiexpress/bbs-door-sdk';
import type { DoorContext } from '@amiexpress/bbs-door-sdk/core/types';
import { SpriteStudioDoor } from './studio';

const door = new Door({
  name: 'Sprite Studio',
  version: '1.0.0',
  description: 'Sprite animation studio - the ANSI editor, taught about frames',
  author: 'AmiExpress BBS',
});

let app: SpriteStudioDoor | null = null;

door.onStart(async (ctx: DoorContext) => {
  app = new SpriteStudioDoor();
  app.setContext(ctx);
  await app.start();
});

door.onClose(async () => {
  app?.destroy();
  app = null;
});

door.onError(async (ctx: DoorContext, error: Error) => {
  ctx.output.writeLine(`\r\n\x1b[31mError in Sprite Studio: ${error.message}\x1b[0m\r\n`);
});

export default door;
