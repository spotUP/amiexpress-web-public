/**
 * Sprite Studio - browse and preview every door's sprite sheets.
 *
 * Fork lineage: the ANSI editor door's wrapper (Doors/ansi-editor) is the
 * pattern for hosting a full-screen blessed app in a door; the black-screen
 * fix (34056d29f) landed there first so this fork starts clean. Editing
 * modes are plan 2b; this door ships browsing and live playback.
 */

import { CoreDoor as Door } from '@amiexpress/bbs-door-sdk';
import type { DoorContext } from '@amiexpress/bbs-door-sdk/core/types';
import { StudioApp } from './app';

const door = new Door({
  name: 'Sprite Studio',
  version: '0.1.0',
  description: 'Browse and preview door sprite sheets',
  author: 'AmiExpress BBS',
});

let app: StudioApp | null = null;

door.onStart(async (ctx: DoorContext) => {
  app = new StudioApp(ctx);
  await app.start();
});

door.onClose(async () => {
  app?.destroy();
  app = null;
});

export default door;
