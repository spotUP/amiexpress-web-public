/**
 * Session management and types
 * Extracted from index.ts for better modularity
 */

// BBS State definitions (mirroring AmiExpress state machine)
export enum BBSState {
  AWAIT = 'await',
  LOGON = 'logon',
  LOGGEDON = 'loggedon'
}

export enum LoggedOnSubState {
  DISPLAY_BULL = 'display_bull',
  DISPLAY_CONF_BULL = 'display_conf_bull',
  DISPLAY_MENU = 'display_menu',
  READ_COMMAND = 'read_command',
  READ_SHORTCUTS = 'read_shortcuts',
  PROCESS_COMMAND = 'process_command',
  POST_MESSAGE_SUBJECT = 'post_message_subject',
  POST_MESSAGE_BODY = 'post_message_body',
  FILE_AREA_SELECT = 'file_area_select',
  FILE_DIR_SELECT = 'file_dir_select',
  FILE_LIST = 'file_list',
  FILE_LIST_CONTINUE = 'file_list_continue',
  CONFERENCE_SELECT = 'conference_select',
  CHAT = 'chat', // Internode chat mode
  DOOR_MANAGER = 'door_manager' // Sysop door management
}

export interface BBSSession {
  state: BBSState;
  subState?: LoggedOnSubState;
  user?: any; // Will be User from database
  nodeNumber?: number; // Node number for multi-node BBS (like AmiExpress nodeNumber)
  currentConf: number;
  currentMsgBase: number;
  timeRemaining: number;
  timeLimit: number; // Time limit in seconds (like AmiExpress timeLimit)
  lastActivity: number;
  confRJoin: number; // Default conference to join (from user preferences)
  msgBaseRJoin: number; // Default message base to join
  commandBuffer: string; // Buffer for command input
  menuPause: boolean; // Like AmiExpress menuPause - controls if menu displays immediately
  messageSubject?: string; // For message posting workflow
  messageBody?: string; // For message posting workflow
  messageRecipient?: string; // For private message recipient
  inputBuffer: string; // Buffer for line-based input (like login system)
  relConfNum: number; // Relative conference number (like AmiExpress relConfNum)
  currentConfName: string; // Current conference name (like AmiExpress currentConfName)
  cmdShortcuts: boolean; // Like AmiExpress cmdShortcuts - controls hotkey vs line input mode
  tempData?: any; // Temporary data storage for complex operations (like file listing)
  // Internode chat fields
  chatSessionId?: string; // Current chat session ID (if in chat)
  chatWithUserId?: string; // User ID of chat partner
  chatWithUsername?: string; // Username of chat partner
  previousState?: BBSState; // State to return to after chat
  previousSubState?: LoggedOnSubState; // Substate to return to after chat
  // Multinode/chat room fields
  currentRoomId?: string; // Current chat room ID
  sysopChatSessionId?: string; // Sysop chat session ID
}

// Conference and Message Base data structures (simplified)
export interface Conference {
  id: number;
  name: string;
  description: string;
}

export interface MessageBase {
  id: number;
  name: string;
  conferenceId: number;
}
