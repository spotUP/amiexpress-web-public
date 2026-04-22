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
// SESSION STORAGE: Sessions are keyed by nodeId (not socket.id) to prevent door communication issues
export const sessions = new Map<string, BBSSession>();  // Node ID → Session (always use nodeId as key)
export const userSessions = new Map<string, BBSSession>();  // User ID → Session (post-login lookup)
export const socketToNodeId = new Map<string, number>();  // Socket ID → Node ID (CRITICAL for door events)
export const socketToUser = new Map<string, string>();  // Socket ID → User ID (for user lookups)
export const pendingDisconnects = new Map<string, { socketId: string; nodeId: number; startedAt: number; timer: ReturnType<typeof setTimeout> }>();

// Connection rate limiting - track recent connections
const recentConnections: Map<string, number[]> = new Map();
const MAX_CONNECTIONS_PER_IP = 5; // Max 5 connections per IP
const CONNECTION_WINDOW = 60000; // 60 second window

/**
 * Check if IP address has exceeded connection rate limit
 */
export function checkConnectionLimit(ip: string): boolean {
  // Whitelist localhost/internal IPs (health checks, load balancer probes)
  if (ip === '::1' || ip === '127.0.0.1' || ip === '::ffff:127.0.0.1' || ip === 'localhost') {
    return true;
  }
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
 * Connection options for creating a session
 * Used by all protocols (web, telnet, SSH) for unified session initialization
 */
export interface SessionConnectionOptions {
  connectionType?: 'web' | 'telnet' | 'ssh';
  remoteAddress?: string;
  connectionHostname?: string;
  connectionPort?: number;
  connectionBaud?: number;
  screenWidth?: number;
  screenHeight?: number;
  /** Whether terminal supports Unicode (auto-detected from TTYPE for telnet/SSH) */
  unicodeCapable?: boolean;
}

/**
 * Create a new BBS session with default values
 * Unified session creation for all connection types (web, telnet, SSH)
 *
 * @param nodeId - The node ID for this session
 * @param options - Optional connection-specific settings
 */
export function createSession(nodeId: number, options: SessionConnectionOptions = {}): BBSSession {
  const now = Date.now();
  return {
    state: BBSState.AWAIT,
    subState: LoggedOnSubState.DISPLAY_CONNECT, // Start with connection screen
    currentConf: 1, // Start in General conference (ID 1) → Conf1/
    conferenceId: 1, // XIM doors read this property
    currentMsgBase: 1, // Start in Main message base (ID 1)
    timeRemaining: 60, // 60 minutes default
    lastActivity: now,
    confRJoin: 1, // Default to General conference (ID 1)
    msgBaseRJoin: 1, // Default to Main message base (ID 1)
    commandBuffer: '', // Buffer for command input
    menuPause: true, // Like AmiExpress - menu displays immediately by default
    inputBuffer: '', // Buffer for line-based input
    maskInput: false, // Echo typed characters unless password masking is active
    connectionStart: now,
    displayFlowPaused: false, // Whether screen flow is waiting for a pause key
    inDoorManager: false,
    doorInputHandler: undefined,
    relConfNum: 0, // Relative conference number
    currentConfName: 'General', // Current conference name (matches ID 4)
    cmdShortcuts: false, // Like AmiExpress - default to line input mode, not hotkeys
    shortcuts: new Map(), // Loaded shortcuts from .keys
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
    loginTime: now, // Login timestamp
    nodeStartTime: now, // Node start time for uptime
    nodeId: nodeId, // Assign unique virtual node ID - express.e:163
    loginRetryCount: 0, // Initialize retry counter - express.e:29560

    // Phase 10: Initialize message pointers (express.e:199-200)
    lastMsgReadConf: 0, // Last message manually read
    lastNewReadConf: 0, // Last message auto-scanned

    // Command history (express.e:207-209)
    commandHistory: [], // Circular buffer of last 20 commands (historyBuf)
    historyIndex: 0, // Current position for next command storage (historyNum)
    historyCycle: 0, // Current position when navigating history

    // Connection-specific fields (unified across all protocols)
    connectionType: options.connectionType || 'web',
    remoteAddress: options.remoteAddress || 'unknown',
    connectionHostname: options.connectionHostname || 'localhost',
    connectionPort: options.connectionPort || 3001,
    connectionBaud: options.connectionBaud || 19200,
    screenWidth: options.screenWidth || 80,
    screenHeight: options.screenHeight || 24,
    modemEmulationEnabled: (options.connectionBaud || 0) > 0,
    modemBps: options.connectionBaud || 0,
    // Unicode capability - web always supports Unicode, telnet/SSH detected via TTYPE
    // Default to true for web, undefined for telnet/SSH (will be set after TTYPE negotiation)
    unicodeCapable: options.unicodeCapable ?? (options.connectionType === 'web' ? true : undefined)
  };
}

/**
 * Get session by socket ID
 * CRITICAL: Uses nodeId as the lookup key to prevent door communication issues
 * Maps socket.id → nodeId → session
 */
export function getSession(socketId: string): BBSSession | undefined {
  // First check if this socket is mapped to a user (post-login)
  const userId = socketToUser.get(socketId);
  if (userId) {
    const userSession = userSessions.get(userId);
    // DEBUG: Check if sessions by nodeId has different data
    const nodeId = socketToNodeId.get(socketId);
    if (nodeId) {
      const nodeSession = sessions.get(nodeId.toString());
      if (nodeSession && userSession && nodeSession !== userSession) {
        console.log(`[SessionManager] WARNING: userSession !== nodeSession! userSession.inDoorManager=${userSession.inDoorManager}, nodeSession.inDoorManager=${nodeSession.inDoorManager}`);
        // CRITICAL FIX: Return nodeSession if it has door state, as it's the most recently updated
        if (nodeSession.inDoorManager && !userSession.inDoorManager) {
          console.log(`[SessionManager] Using nodeSession (has door state)`);
          return nodeSession;
        }
      }
    }
    return userSession;
  }

  // Look up nodeId from socket.id, then get session by nodeId
  const nodeId = socketToNodeId.get(socketId);
  if (nodeId) {
    return sessions.get(nodeId.toString());
  }

  return undefined;
}

/**
 * Alias for getSession - for compatibility with handlers
 */
export const getSessionBySocketId = getSession;

/**
 * Get socket ID by node ID
 * Reverse lookup: finds which socket is connected as a given node
 * Used by OLM and chat systems to send messages to specific nodes
 */
export function getSocketIdByNodeId(nodeId: number): string | undefined {
  for (const [socketId, mappedNodeId] of socketToNodeId.entries()) {
    if (mappedNodeId === nodeId) {
      return socketId;
    }
  }
  return undefined;
}

/**
 * Set session for socket ID
 * CRITICAL: Stores session by nodeId and creates socket.id → nodeId mapping
 */
export function setSession(socketId: string, session: BBSSession): void {
  const nodeId = session.nodeId;
  if (!nodeId) {
console.error('[Session Manager] CRITICAL: Tried to set session without nodeId!');
    return;
  }

  // Store the mapping: socket.id → nodeId
  socketToNodeId.set(socketId, nodeId);

  // Store the session: nodeId → session
  sessions.set(nodeId.toString(), session);

  // Also map user → session if logged in
  const userId = (session as any).user?.id || (session as any).user?.userId;
  if (userId) {
    userSessions.set(String(userId), session);
  }
}

export function trackPendingDisconnect(userId: string, socketId: string, nodeId: number, timer: ReturnType<typeof setTimeout>): void {
  const existing = pendingDisconnects.get(userId);
  if (existing) {
    clearTimeout(existing.timer);
  }
  pendingDisconnects.set(userId, { socketId, nodeId, startedAt: Date.now(), timer });
}

export function clearPendingDisconnect(userId: string): { socketId: string; nodeId: number; startedAt: number } | null {
  const pending = pendingDisconnects.get(userId);
  if (!pending) return null;
  clearTimeout(pending.timer);
  pendingDisconnects.delete(userId);
  return { socketId: pending.socketId, nodeId: pending.nodeId, startedAt: pending.startedAt };
}

/**
 * Delete session by socket ID
 * CRITICAL: Removes both the nodeId → session mapping and socket.id → nodeId mapping
 */
export function deleteSession(socketId: string): void {
  const nodeId = socketToNodeId.get(socketId);
  if (nodeId) {
    sessions.delete(nodeId.toString());
    socketToNodeId.delete(socketId);
  }

  // Also clean up user mapping if exists
  const userId = socketToUser.get(socketId);
  if (userId) {
    userSessions.delete(userId);
    socketToUser.delete(socketId);
  }
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
    case LoggedOnSubState.POST_MESSAGE_TYPE:
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
