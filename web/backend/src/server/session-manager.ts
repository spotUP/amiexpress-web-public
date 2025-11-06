import { BBSSession } from '../index';
import { BBSState, LoggedOnSubState } from '../constants/bbs-states';
import { EnvStat } from '../constants/env-codes';

/**
 * BBS Session Manager
 *
 * Manages active BBS sessions including:
 * - Session storage and retrieval
 * - Node ID assignment (multi-node emulation)
 * - Connection rate limiting
 * - Session cleanup
 */

// Store active sessions (in production, use Redis/database)
export const sessions = new Map<string, BBSSession>();

// Connection rate limiting - track recent connections
const recentConnections: Map<string, number[]> = new Map();
const MAX_CONNECTIONS_PER_IP = 5; // Max 5 connections per IP
const CONNECTION_WINDOW = 60000; // 60 second window

/**
 * Check if IP address has exceeded connection rate limit
 */
export function checkConnectionLimit(ip: string): boolean {
  const now = Date.now();
  const connections = recentConnections.get(ip) || [];

  // Remove old connections outside the window
  const recentConns = connections.filter(time => now - time < CONNECTION_WINDOW);

  if (recentConns.length >= MAX_CONNECTIONS_PER_IP) {
    return false; // Rate limit exceeded
  }

  // Add this connection
  recentConns.push(now);
  recentConnections.set(ip, recentConns);
  return true;
}

/**
 * Cleanup old connection tracking data every 5 minutes
 */
setInterval(() => {
  const now = Date.now();
  for (const [ip, connections] of recentConnections.entries()) {
    const recent = connections.filter(time => now - time < CONNECTION_WINDOW);
    if (recent.length === 0) {
      recentConnections.delete(ip);
    } else {
      recentConnections.set(ip, recent);
    }
  }
}, 5 * 60 * 1000); // 5 minutes

/**
 * Get next available node ID (1-99)
 * In AmiExpress, each physical node had a number - we simulate this for websockets
 */
export function getNextAvailableNodeId(): number {
  const usedNodeIds = new Set<number>();

  // Collect all currently used node IDs
  for (const session of sessions.values()) {
    if (session.nodeId) {
      usedNodeIds.add(session.nodeId);
    }
  }

  // Find first available node ID (1-99)
  for (let i = 1; i < 100; i++) {
    if (!usedNodeIds.has(i)) {
      return i;
    }
  }

  return 1; // Fallback (shouldn't happen with 99 nodes)
}

/**
 * Create a new BBS session with default values
 */
export function createSession(nodeId: number): BBSSession {
  return {
    state: BBSState.AWAIT,
    subState: LoggedOnSubState.DISPLAY_CONNECT, // Start with connection screen
    currentConf: 1, // Start in General conference (ID 1) → BBS/Conf01/
    currentMsgBase: 1, // Start in Main message base (ID 1)
    timeRemaining: 60, // 60 minutes default
    lastActivity: Date.now(),
    confRJoin: 1, // Default to General conference (ID 1)
    msgBaseRJoin: 1, // Default to Main message base (ID 1)
    commandBuffer: '', // Buffer for command input
    menuPause: true, // Like AmiExpress - menu displays immediately by default
    inputBuffer: '', // Buffer for line-based input
    relConfNum: 0, // Relative conference number
    currentConfName: 'General', // Current conference name (matches ID 4)
    cmdShortcuts: false, // Like AmiExpress - default to line input mode, not hotkeys
    doorExpertMode: false, // Like AmiExpress - doors can force menu display (express.e:28583)

    // Phase 9: Initialize security fields (express.e:447-455)
    acsLevel: -1, // Will be set on login
    securityFlags: '', // Temporary per-session ACS overrides
    secOverride: '', // Permanent override denials
    overrideDefaultAccess: false, // Skip default access checks
    userSpecificAccess: false, // User has specific access file
    currentStat: EnvStat.IDLE, // Environment status
    quietFlag: false, // Quiet mode (invisible to WHO)
    blockOLM: false, // Block Online Messages
    loginTime: Date.now(), // Login timestamp
    nodeStartTime: Date.now(), // Node start time for uptime
    nodeId: nodeId, // Assign unique virtual node ID - express.e:163
    loginRetryCount: 0, // Initialize retry counter - express.e:29560

    // Phase 10: Initialize message pointers (express.e:199-200)
    lastMsgReadConf: 0, // Last message manually read
    lastNewReadConf: 0 // Last message auto-scanned
  };
}

/**
 * Get session by socket ID
 */
export function getSession(socketId: string): BBSSession | undefined {
  return sessions.get(socketId);
}

/**
 * Set session for socket ID
 */
export function setSession(socketId: string, session: BBSSession): void {
  sessions.set(socketId, session);
}

/**
 * Delete session by socket ID
 */
export function deleteSession(socketId: string): void {
  sessions.delete(socketId);
}

/**
 * Map substate to human-readable activity for WHO command
 */
export function getActivityFromSubState(subState?: string): string {
  if (!subState) return 'IDLE';

  // Match express.e ENV_* states
  switch (subState) {
    case LoggedOnSubState.DISPLAY_MENU:
    case LoggedOnSubState.READ_COMMAND:
    case LoggedOnSubState.READ_SHORTCUTS:
      return 'MAIN MENU';
    case LoggedOnSubState.READ_MESSAGES:
      return 'READING MAIL';
    case LoggedOnSubState.POST_MESSAGE:
    case LoggedOnSubState.POST_MESSAGE_SUBJECT:
    case LoggedOnSubState.POST_MESSAGE_TO:
    case LoggedOnSubState.POST_MESSAGE_BODY:
      return 'POSTING MESSAGE';
    case LoggedOnSubState.FILES_MAIN:
    case LoggedOnSubState.FILES_VIEW_AREA:
      return 'BROWSING FILES';
    case LoggedOnSubState.FILES_DOWNLOAD:
      return 'DOWNLOADING';
    case LoggedOnSubState.FILES_UPLOAD:
      return 'UPLOADING';
    case LoggedOnSubState.FILES_MAINTENANCE:
    case LoggedOnSubState.FILES_MAINT_SELECT:
      return 'FILE MAINTENANCE';
    default:
      return 'UNKNOWN';
  }
}
