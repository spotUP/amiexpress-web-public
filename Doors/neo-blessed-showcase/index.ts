/**
 * Neo-Blessed Showcase v2.0 - Entry Point
 *
 * Comprehensive demonstration of all neo-blessed and blessed-contrib widgets
 *
 * This is the complete 2000+ line showcase with 10 interactive pages showing
 * all 49 widgets, live animations, charts, gauges, and best practices.
 */

import { CoreDoor as Door } from '@amiexpress/bbs-door-sdk';
import type { DoorContext } from '@amiexpress/bbs-door-sdk';
import { createApp } from './app';

const door = new Door({
  name: 'Neo-Blessed Showcase',
  version: '2.0.0',
  author: 'AmiExpress SDK v2.0',
});

door.onStart(async (ctx: DoorContext) => {
  // Create session object that app expects
  const session = {
    socket: (ctx as any).socket,
    user: (ctx as any).user,
    bbsSession: (ctx as any).bbsSession,
    bbs: ctx.bbs,
    video: ctx.video,
    audio: ctx.audio,
    params: [],
  };

  const app = await createApp(session);
  await app.run();
});

door.onClose(async (ctx: DoorContext) => {
  ctx.output.writeLine('\r\n\x1b[36mShowcase closed.\x1b[0m\r\n');
});

door.onError(async (ctx: DoorContext, error: Error) => {
  ctx.output.writeLine(`\r\n\x1b[31mError: ${error.message}\x1b[0m\r\n`);
});

export default door;
