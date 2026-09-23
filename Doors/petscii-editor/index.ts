/**
 * PETSCII Studio - the ANSI editor door, forked into a C64 art editor.
 *
 * Fork lineage, as asked for: `Doors/ansi-editor/index.ts` by way of
 * `Doors/sprite-editor/index.ts`, which is the same wrapper. Everything lives
 * inside the fork - one full-screen editor with its requesters - and the
 * editor itself is the SDK's `PetsciiEditor`, so the mail composer can host
 * the same one for a caller writing a message.
 */

import { CoreDoor as Door } from '@amiexpress/bbs-door-sdk';
import type { DoorContext } from '@amiexpress/bbs-door-sdk/core/types';
import { PetsciiStudioDoor } from './studio';

const door = new Door({
  name: 'PETSCII Studio',
  version: '1.0.0',
  description: 'PETSCII art editor - draw a C64 screen from the BBS',
  author: 'AmiExpress BBS',
});

let app: PetsciiStudioDoor | null = null;

door.onStart(async (ctx: DoorContext) => {
  app = new PetsciiStudioDoor();
  app.setContext(ctx);
  await app.start();
});

door.onClose(async () => {
  app?.destroy();
  app = null;
});

door.onError(async (ctx: DoorContext, error: Error) => {
  ctx.output.writeLine(`\r\n\x1b[31mError in PETSCII Studio: ${error.message}\x1b[0m\r\n`);
});

export { PetsciiStudioDoor };
export default door;
