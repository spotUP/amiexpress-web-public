/**
 * Bug Tracker - Comprehensive Bug Tracking System for AmiExpress BBS
 *
 * Features:
 * - Multi-category organization (System Commands, Doors, General System)
 * - Priority levels (Low, Medium, High, Critical)
 * - Status tracking (New -> Acknowledged -> In Progress -> Fixed/Closed)
 * - Webhook integration (Discord, Slack, generic webhooks)
 * - Analytics dashboard with metrics and trends
 * - Sysop tools (bulk operations, assignments, internal notes)
 * - Comment system and search/filtering
 *
 * Commands:
 *   BUGS           - Launch bug tracker (main menu)
 *   BUGS NEW       - Create new bug report
 *   BUGS LIST      - List all bugs
 *   BUGS SEARCH    - Search bugs
 */

import { ServerDoor, DoorContext } from '@amiexpress/bbs-door-sdk';
import { createApp } from './app';

/**
 * Metadata
 */
export const metadata = {
  name: 'Bug Tracker',
  version: '1.0.0',
  description: 'Comprehensive bug tracking and issue management system',
  author: 'AmiExpress SDK',
  command: 'BUGS',
};

/**
 * Main door class
 */
const door = new ServerDoor(metadata);

door.onStart(async (ctx: DoorContext) => {
  const session = ctx;
  const args = session.params || [];
  const mode = args[0]?.toUpperCase();

  // Create and run the app
  await createApp(session as any, mode);
});

export default door;
export { createApp };
