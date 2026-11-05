/**
 * TIP - one tip per login.
 *
 * A display-only door: pick a tip, show it, any key (or 30 seconds for
 * unattended logins) returns to the board. Nothing is written except the
 * rotation state (seen tip ids, per caller) in door storage, so logins
 * cycle instead of repeating.
 *
 * Phase 1: fixed 80-column render, run by hand via TIP. Responsive,
 * 40-column and login-hook phases follow per the plan.
 */
import { CoreDoor as Door } from '@amiexpress/bbs-door-sdk';
import { createApp } from './app';

const door = new Door({
  name: 'Tip of the day',
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
  console.error('Tip-of-the-day error:', error);
});

export default door;
