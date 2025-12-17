/**
 * Neo-Blessed Showcase - Entry Point
 *
 * Comprehensive interactive demo of all neo-blessed widgets.
 */

import { createApp } from './app.js';

/** Door metadata */
export const metadata = {
  name: 'Neo-Blessed Showcase',
  version: '2.0.0',
  description: 'Interactive demo of all neo-blessed UI widgets',
  author: 'AmiExpress',
  command: 'NEOSHOWCASE',
};

/** Door session from BBS handler */
interface DoorSession {
  socket: any;
  user: any;
  bbsSession: any;
  bbs: any;
  params: string[];
}

/** Main door entry point - required by SDK */
export async function runDoor(session: DoorSession): Promise<void> {
  const app = await createApp(session);
  await app.run();
}

export default { runDoor, metadata };
