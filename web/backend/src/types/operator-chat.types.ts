/**
 * Operator Chat Types
 *
 * Data models for AmiExpress Page Sysop feature:
 * - User pages sysop
 * - System checks availability/quiet hours
 * - Notifications sent (Socket.IO, Discord, Browser Push)
 * - Sysop accepts and chat begins
 * - Line-based chat with escape to exit
 */

/**
 * Page Status
 */
export enum PageStatus {
  PENDING = 'pending',      // Waiting for sysop to respond
  ACCEPTED = 'accepted',    // Sysop joined chat
  ENDED = 'ended',          // Chat ended normally
  TIMEOUT = 'timeout',      // No response within timeout
  REJECTED = 'rejected'     // Sysop declined (future)
}

/**
 * Sysop Availability Status
 */
export enum SysopAvailability {
  AVAILABLE = 'available',  // Ready to chat
  BUSY = 'busy',           // Do not disturb
  AWAY = 'away',           // Away from keyboard
  OFFLINE = 'offline'      // Not logged in
}

/**
 * Page Request Record
 * Stored when user invokes Page Sysop command
 */
export interface PageRequest {
  id: string;                  // Unique page ID (UUID)
  userId: string;              // User who paged
  userHandle: string;          // User's handle/name
  nodeId: number;              // Node number
  conferenceId: number;        // Current conference
  conferenceName: string;      // Conference name
  timeOnline: number;          // Seconds online this session
  lastCommand: string;         // Last command executed
  status: PageStatus;          // Current status
  createdAt: Date;             // When page was initiated
  acceptedAt?: Date;           // When sysop accepted
  endedAt?: Date;              // When chat ended
  sysopId?: string;            // Sysop who responded
  sysopHandle?: string;        // Sysop's handle
  cooldownUntil?: Date;        // User can't page again until this time
  notificationsSent: {
    socketIO: boolean;         // Emitted to Socket.IO admin clients
    discord: boolean;          // Posted to Discord webhook
    discordMessageId?: string; // Discord message ID for tracking
    browserPush: boolean;      // Push notification sent
    pushResults?: string[];    // Push subscription results
  };
  token?: string;              // One-time token for Discord link auth
  tokenExpiresAt?: Date;       // Token expiration
}

/**
 * Chat Message
 * Line-based messages between user and sysop
 */
export interface ChatMessage {
  id: string;                  // Message ID (UUID)
  pageId: string;              // Page request this belongs to
  senderId: string;            // User or sysop ID
  senderHandle: string;        // Display name
  senderType: 'user' | 'sysop'; // Who sent it
  message: string;             // Message content
  timestamp: Date;             // When sent
  nodeId: number;              // Node where message originated
}

/**
 * Chat Session State
 * Active chat session between user and sysop
 */
export interface ChatSession {
  pageId: string;              // Page request ID
  userId: string;              // User in chat
  userHandle: string;
  userNodeId: number;
  sysopId: string;             // Sysop in chat
  sysopHandle: string;
  sysopSessionId: string;      // Sysop's Socket.IO session
  startedAt: Date;
  lastActivity: Date;
  messages: ChatMessage[];
  isTyping: {
    user: boolean;
    sysop: boolean;
  };
}

/**
 * Quiet Hours Configuration
 * Times when pages should not alert sysop
 */
export interface QuietHours {
  enabled: boolean;
  startHour: number;           // 0-23
  startMinute: number;         // 0-59
  endHour: number;             // 0-23
  endMinute: number;           // 0-59
  timezone: string;            // IANA timezone (e.g., "America/New_York")
}

/**
 * Operator Chat Configuration
 */
export interface OperatorChatConfig {
  enabled: boolean;                // Feature enabled globally
  requireCarrier: boolean;         // Only allow pages from real connections
  quietHours: QuietHours;          // Do-not-disturb schedule
  pageCooldown: number;            // Seconds between pages per user (default: 300 = 5min)
  pageTimeout: number;             // Seconds until page times out (default: 120 = 2min)
  maxActivePages: number;          // Max pending pages per user (default: 1)
  soundEnabled: boolean;           // Play alert sound on page
  vibrateEnabled: boolean;         // Vibrate on mobile
  discordWebhook?: string;         // Discord webhook URL
  allowedSecLevels: number[];      // Security levels allowed to page (default: all)
}

/**
 * Page Request Creation Data
 */
export interface CreatePageRequest {
  userId: string;
  userHandle: string;
  nodeId: number;
  conferenceId: number;
  conferenceName: string;
  timeOnline: number;
  lastCommand: string;
}

/**
 * Page Response
 * Returned when user tries to page sysop
 */
export interface PageResponse {
  success: boolean;
  pageId?: string;
  message: string;
  status?: PageStatus;
  cooldownRemaining?: number;   // Seconds until user can page again
}

/**
 * Sysop Status
 * Current sysop availability
 */
export interface SysopStatus {
  availability: SysopAvailability;
  statusMessage?: string;
  lastSeen?: Date;
  pendingPages: number;
}

/**
 * Quick Reply Macro
 * Canned responses for sysop (F-key analogs)
 */
export interface QuickReply {
  id: string;
  label: string;              // Button label (e.g., "Hold on")
  message: string;            // Message to send
  order: number;              // Display order
}

/**
 * Default quick replies
 */
export const DEFAULT_QUICK_REPLIES: QuickReply[] = [
  { id: 'hold', label: 'Hold on', message: 'Hold on, I\'ll be right with you...', order: 1 },
  { id: 'onway', label: 'On my way', message: 'On my way!', order: 2 },
  { id: 'wrapping', label: 'Wrapping up', message: 'Wrapping up another task, one moment...', order: 3 },
  { id: 'help', label: 'How can I help?', message: 'How can I help you today?', order: 4 },
  { id: 'ending', label: 'Ending chat', message: 'Thanks for chatting! Let me know if you need anything else.', order: 5 }
];
