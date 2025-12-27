/**
 * Widget Shadow Demo - Entry Point
 *
 * Exact replica of blessed widget-shadow.js demo
 * Demonstrates shadows and neo-blessed style transparency
 */

import { createApp } from './app.js';

/** Door metadata */
export const metadata = {
  name: 'Widget Shadow Demo',
  version: '1.0.0',
  description: 'Exact replica of blessed widget-shadow.js - demonstrates shadows and transparency',
  author: 'blessed (ported)',
  command: 'SHADOWDEMO',
};

/** Door session from BBS handler */
interface DoorSession {
  socket: any;
  user: any;
  bbsSession: any;
  bbs: any;
  params: string[];
}

/** Main door entry point - required by BBS */
export async function runDoor(session: DoorSession): Promise<void> {
  await createApp(session);
}

export default { runDoor, metadata };
