/**
 * ENV (Environment Status) Constants
 *
 * These constants track what a user is currently doing on the BBS.
 * Used for node monitoring, status displays, and multi-node coordination.
 * Based on AmiExpress axcommon.e (lines 23-26)
 *
 * Usage: setEnvStat(ENV_MAIL) sets user status to "reading/writing mail"
 *
 * Total: 31 ENV codes (indexed 0-30)
 */

// Environment Status Codes (ENV_xxx)
export enum EnvStat {
  IDLE = 0,              // User idle/waiting
  DOWNLOADING = 1,       // Downloading files
  UPLOADING = 2,         // Uploading files
  DOORS = 3,             // In door/external program
  MAIL = 4,              // Reading/writing messages
  STATS = 5,             // Viewing statistics
  ACCOUNT = 6,           // Account management
  ZOOM = 7,              // Zoom mail (QWK/offline mail)
  FILES = 8,             // File listings
  BULLETINS = 9,         // Reading bulletins
  VIEWING = 10,          // Viewing a file
  ACCOUNTSEQ = 11,       // Account sequence
  LOGOFF = 12,           // Logging off
  SYSOP = 13,            // Sysop functions
  SHELL = 14,            // Shell/command line
  EMACS = 15,            // EMACS editor
  JOIN = 16,             // Joining conference
  CHAT = 17,             // In chat mode
  NOTACTIVE = 18,        // Node not active
  REQ_CHAT = 19,         // Requesting chat with sysop
  CONNECT = 20,          // Connecting
  LOGGINGON = 21,        // Logging on
  AWAITCONNECT = 22,     // Awaiting connection
  SCANNING = 23,         // Scanning messages
  SHUTDOWN = 24,         // Shutting down
  MULTICHAT = 25,        // Multi-user chat
  SUSPEND = 26,          // Suspended
  RESERVE = 27,          // Reserved
  ONLINEMSG = 28,        // Online messaging
  NUKE = 29,             // Nuke (unused in most systems)
  SETUP = 30             // Setup mode
}

/**
 * The node status a PARKED web session publishes in its MULTICOM singlePort.
 *
 * express.e has no parked state: a lost carrier ends the call. The web board
 * keeps the node for the resume window, so WHO doors must show it as a node
 * whose caller dropped. rTW (Doors/RTW/rtw, WHO) prints its own text table,
 * selected by singlePort.status in a SELECT at code hunk +0x6a4:
 *   cmp.l #99,d0 / bcc  -> no action text (99+ and negative = quiet node)
 *   jump table +0x6c4: 0..28 -> its 29 action strings, 98 -> "dOOR!",
 *   29..97 -> +0xaa6 lea "cARRIER lOST :-(" (data hunk +0x3bc).
 * 31 is the first value past axcommon.e's ENV_* range (0..30) inside that
 * band, so no door can read it as a real action.
 */
export const PARKED_NODE_STATUS = 31;

/**
 * ENV Status Display Names
 * Human-readable names for each status code
 */
export const ENV_NAMES: Record<EnvStat, string> = {
  [EnvStat.IDLE]: 'Idle',
  [EnvStat.DOWNLOADING]: 'Downloading',
  [EnvStat.UPLOADING]: 'Uploading',
  [EnvStat.DOORS]: 'In Door',
  [EnvStat.MAIL]: 'Reading Mail',
  [EnvStat.STATS]: 'Viewing Stats',
  [EnvStat.ACCOUNT]: 'Account Mgmt',
  [EnvStat.ZOOM]: 'Zoom Mail',
  [EnvStat.FILES]: 'File Listings',
  [EnvStat.BULLETINS]: 'Reading Bulletins',
  [EnvStat.VIEWING]: 'Viewing File',
  [EnvStat.ACCOUNTSEQ]: 'Account Seq',
  [EnvStat.LOGOFF]: 'Logging Off',
  [EnvStat.SYSOP]: 'Sysop Functions',
  [EnvStat.SHELL]: 'Shell',
  [EnvStat.EMACS]: 'Editor',
  [EnvStat.JOIN]: 'Joining Conf',
  [EnvStat.CHAT]: 'Chatting',
  [EnvStat.NOTACTIVE]: 'Not Active',
  [EnvStat.REQ_CHAT]: 'Requesting Chat',
  [EnvStat.CONNECT]: 'Connecting',
  [EnvStat.LOGGINGON]: 'Logging On',
  [EnvStat.AWAITCONNECT]: 'Awaiting Connect',
  [EnvStat.SCANNING]: 'Scanning',
  [EnvStat.SHUTDOWN]: 'Shutting Down',
  [EnvStat.MULTICHAT]: 'Multi-Chat',
  [EnvStat.SUSPEND]: 'Suspended',
  [EnvStat.RESERVE]: 'Reserved',
  [EnvStat.ONLINEMSG]: 'Online Msg',
  [EnvStat.NUKE]: 'Nuke',
  [EnvStat.SETUP]: 'Setup'
};
