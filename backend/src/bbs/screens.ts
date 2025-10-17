/**
 * Screen loading and display functions
 * Extracted from index.ts for better modularity
 */

import * as path from 'path';
import * as fs from 'fs';
import { Socket } from 'socket.io';
import { BBSSession } from './session';

/**
 * Load and display screen file with variable substitution
 * Matches AmiExpress screen loading: Node-specific -> Conference -> Global
 */
export function loadScreen(screenName: string, session: BBSSession): string | null {
  const basePath = path.join(__dirname, '../../data/bbs/BBS');
  const nodeScreenPath = path.join(basePath, `Node${session.nodeNumber || 0}`, 'Screens', `${screenName}.TXT`);
  const confScreenPath = path.join(basePath, `Conf${String(session.currentConf || 1).padStart(2, '0')}`, 'Screens', `${screenName}.TXT`);
  const globalScreenPath = path.join(basePath, 'Screens', `${screenName}.TXT`);

  // Try node-specific, then conference-specific, then global
  let screenPath: string | null = null;
  if (fs.existsSync(nodeScreenPath)) {
    screenPath = nodeScreenPath;
  } else if (fs.existsSync(confScreenPath)) {
    screenPath = confScreenPath;
  } else if (fs.existsSync(globalScreenPath)) {
    screenPath = globalScreenPath;
  }

  if (!screenPath) {
    console.log(`Screen ${screenName} not found in any location`);
    return null;
  }

  try {
    let content = fs.readFileSync(screenPath, 'utf-8');

    // Variable substitution (like AmiExpress)
    if (session.user) {
      content = content.replace(/\{USERNAME\}/g, session.user.username);
      content = content.replace(/\{REALNAME\}/g, session.user.realname || session.user.username);
      content = content.replace(/\{LOCATION\}/g, session.user.location || 'Unknown');
      content = content.replace(/\{SECLEVEL\}/g, String(session.user.secLevel || 0));
      content = content.replace(/\{CALLS\}/g, String(session.user.calls || 0));
      content = content.replace(/\{UPLOADS\}/g, String(session.user.uploads || 0));
      content = content.replace(/\{DOWNLOADS\}/g, String(session.user.downloads || 0));
      content = content.replace(/\{TIMELEFT\}/g, String(Math.floor(session.timeRemaining)));
    }

    // System variables
    content = content.replace(/\{NODE\}/g, String(session.nodeNumber || 0));
    content = content.replace(/\{CONF\}/g, session.currentConfName || 'Main');
    content = content.replace(/\{DATE\}/g, new Date().toLocaleDateString());
    content = content.replace(/\{TIME\}/g, new Date().toLocaleTimeString());

    return content;
  } catch (error) {
    console.error(`Error loading screen ${screenName}:`, error);
    return null;
  }
}

/**
 * Display a screen file (like displayScreen in AmiExpress)
 */
export function displayScreen(socket: Socket, session: BBSSession, screenName: string): boolean {
  const content = loadScreen(screenName, session);
  if (content) {
    socket.emit('ansi-output', content);
    return true;
  }
  return false;
}

/**
 * Pause with "Press any key to continue..."
 * Sets session state to wait for keypress before continuing
 */
export function doPause(socket: Socket, session: BBSSession): void {
  socket.emit('ansi-output', '\r\n\x1b[32mPress any key to continue...\x1b[0m');
  // Session will wait for any key before continuing
}
