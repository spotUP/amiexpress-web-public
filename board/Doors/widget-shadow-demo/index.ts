/**
 * Widget Shadow Demo - Entry Point
 *
 * Exact replica of blessed widget-shadow.js demo
 * Demonstrates shadows and neo-blessed style transparency
 */

import { ServerDoor, DoorContext } from '@amiexpress/bbs-door-sdk';
import { createApp } from './app.js';

/** Door metadata */
export const metadata = {
  name: 'Widget Shadow Demo',
  version: '1.0.0',
  description: 'Exact replica of blessed widget-shadow.js - demonstrates shadows and transparency',
  author: 'blessed (ported)',
  command: 'SHADOWDEMO',
};

/**
 * Main door class
 */
const door = new ServerDoor(metadata);

door.onStart(async (ctx: DoorContext) => {
  await createApp(ctx as any);
});

export default door;
