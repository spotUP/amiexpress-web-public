/**
 * XIM Protocol Type Definitions
 *
 * All interfaces and enums for the eXpress Interface Module (XIM) protocol.
 * Based on aedoor.h specification from AmiExpress sources.
 */

// XIM Protocol Command Codes (from axcommon.e - dmcoles/AmiExpress GitHub)
// CRITICAL: These values MUST match axcommon.e exactly for door compatibility
export enum XIMCommand {
  // Terminal I/O commands (JH_*)
  JH_LI = 0,           // Line input
  JH_REGISTER = 1,     // Register with BBS
  JH_SHUTDOWN = 2,     // Shutdown door
  JH_WRITE = 3,        // Write to terminal
  JH_SM = 4,           // Send message
  JH_PM = 5,           // Private message / Prompt message
  JH_HK = 6,           // Hotkey
  JH_SG = 7,           // Security screen
  JH_SF = 8,           // Show file
  JH_EF = 9,           // Edit file
  JH_CO = 10,          // Console output
  JH_BBSNAME = 11,     // Get BBS name
  JH_SYSOP = 12,       // Get sysop name
  JH_FLAGFILE = 13,    // Flag file
  JH_SHOWFLAGS = 14,   // Show flags
  JH_ExtHK = 15,       // Extended hotkey
  JH_SIGBIT = 16,      // Signal bit
  JH_FetchKey = 17,    // Fetch key
  JH_SO = 18,          // Serial output
  JH_SMPTR = 19,       // Send message pointer
  JH_20 = 20,          // Command 20
  JH_CK = 500,         // Check for key (QuicKey) - alias
  JH_DL = 15,          // Alias used by glue for ExtHK/DL
  JH_MCI = 507,        // MCI processing
  SCREEN_ADDRESS = 139,
  RAWSCREEN_ADDRESS = 141,

  // NOTE: PG_* commands (1, 13, 14) were removed - they don't exist in axcommon.e
  // and conflicted with JH_REGISTER (1), JH_FLAGFILE (13), JH_SHOWFLAGS (14)

  // Data query commands (DT_*)
  DT_NAME = 100,
  DT_PASSWORD = 101,
  DT_LOCATION = 102,
  DT_PHONENUMBER = 103,
  DT_SLOTNUMBER = 104,
  DT_SECSTATUS = 105,       // Security status / Access level
  DT_SECBOARD = 106,        // Security board / Ratio type
  DT_SECLIBRARY = 107,      // Security library / Ratio
  DT_SECBULLETIN = 108,     // Security bulletin / Comp type
  DT_MESSAGESPOSTED = 109,
  DT_UPLOADS = 110,
  DT_DOWNLOADS = 111,
  DT_TIMESCALLED = 112,
  DT_TIMELASTON = 113,
  DT_TIMEUSED = 114,
  DT_TIMELIMIT = 115,
  DT_TIMETOTAL = 116,
  DT_BYTESUPLOAD = 117,
  DT_BYTEDOWNLOAD = 118,
  DT_DAILYBYTELIMIT = 119,
  DT_DAILYBYTEDLD = 120,
  DT_EXPERT = 121,
  DT_LINELENGTH = 122,
  ACTIVE_NODES = 123,
  DT_DUMP = 124,
  DT_TIMEOUT = 125,
  DT_USERLOAD = 133,        // Load user data
  DT_STAMP_LASTON = 143,
  DT_STAMP_CTIME = 144,
  DT_CURR_TIME = 145,
  DT_CONFACCESS = 146,
  DT_LANGUAGE = 527,
  DT_QUICKFLAG = 528,
  DT_GOODFILE = 529,
  DT_GOODFILE_FLAG = 529, // Alias for DT_GOODFILE (was incorrectly 531, conflicting with MULTICOM)
  DT_ANSICOLOR = 530,
  DT_ISANSI = 541,
  DT_MSGCODE = 543,
  DT_FILECODE = 545,
  DT_REALNAME = 606,
  DT_INTERNETNAME = 637,    // Internet/email name
  DT_TRANSLATOR = 638,      // Translation setting
  DT_HOST_LANGUAGE = 639,   // Host language
  DT_HOSTNAME = 700,
  DT_HOSTIP = 701,
  DT_GEOGRAPHIC = 702,      // Geographic/BBS location
  DT_SIZEUPLOAD = 703,      // Human-readable upload size
  DT_SIZEDOWNLOAD = 704,    // Human-readable download size
  DT_CONFACCESS2 = 900,     // Extended conference access (25 chars)
  DT_CBYTESUPLOAD = 901,    // Conference bytes uploaded
  DT_CBYTESDOWNLOAD = 902,  // Conference bytes downloaded
  DT_CFILESUPLOAD = 903,    // Conference files uploaded
  DT_CFILESDOWNLOAD = 904,  // Conference files downloaded
  DT_CALLEDTODAY = 906,     // Times called today
  DT_ADDBIT = 1000,
  DT_REMBIT = 1001,
  DT_QUERYBIT = 1002,

  // BBS information commands (BB_*)
  BB_CONFNAME = 126,
  BB_CONFLOCAL = 127,
  BB_LOCAL = 128,
  BB_STATUS = 129,
  BB_COMMAND = 130,
  BB_MAINLINE = 131,
  BB_CONFIG = 134,
  BB_TASKPRI = 140,
  BB_CHATFLAG = 142,
  BB_PCONFLOCAL = 147,
  BB_PCONFNAME = 148,
  BB_NODEID = 149,
  BB_CALLERSLOG = 150,
  BB_UDLOG = 151,
  BB_CHATSET = 162,
  BB_CONFNUM = 510,
  BB_DROPDTR = 511,         // Drop DTR (hangup)
  BB_GETTASK = 512,         // Get task pointer
  BB_REMOVEPORT = 513,
  BB_SOPT = 514,
  BB_LOGONTYPE = 517,
  BB_SCRLEFT = 518,
  BB_SCRTOP = 519,
  BB_SCRWIDTH = 520,
  BB_SCRHEIGHT = 521,
  BB_PURGELINE = 522,
  BB_PURGELINESTART = 523,
  BB_PURGELINEEND = 524,
  BB_NONSTOPTEXT = 525,
  BB_LINECOUNT = 526,
  BB_CONFACCOUNT = 905,     // Conference accounting enabled

  // System commands
  NB_LOAD = 132,            // Load node bulletin
  CHG_USER = 135,           // Change user
  RETURNCOMMAND = 136,      // Return command
  ZMODEMSEND = 137,
  ZMODEMRECEIVE = 138,
  EXPRESS_VERSION = 152,
  SV_UNICONIFY = 153,       // Un-iconify screen
  SV_SYSOPLOG = 154,        // Sysop log
  SV_LOCALLOG = 155,        // Local log
  SV_ACCOUNTS = 156,        // Account management
  SV_CHAT = 157,            // Chat request
  SV_NODEOFFHOOK = 158,     // Node off hook
  SV_EXITNODE = 159,        // Exit node
  SV_INITMODEM = 160,       // Initialize modem
  SV_WHATSUP = 161,         // What's up status
  ENVSTAT = 163,            // Environment status
  SV_INSTANT = 170,         // Instant message
  SV_RESERVE = 171,         // Reserve node
  SV_CHATTOGGLE = 172,      // Toggle chat
  SV_TOPS = 173,            // Top statistics
  SV_AESHELL = 174,         // AE Shell
  SV_START = 176,           // Start node
  SV_NEWMSG = 177,          // New message notification
  SV_QUIETNODE = 178,       // Quiet node
  SV_SETNRAMS = 179,        // Set NRAMs
  SV_RESERVENODE = 180,     // Reserve node
  SV_NODE_LOCK = 181,       // Lock node
  SV_ACPALERT = 182,        // ACP alert
  SV_INCOMING_MSG = 183,    // Incoming message
  SV_KICKUSER = 184,        // Kick user
  SV_STARTNODE = 185,       // Start node
  SV_INFO = 199,            // Info request
  INCOMING_TELNET = 200,    // Incoming telnet connection
  INCOMING_FTP = 201,       // Incoming FTP connection
  SV_ACPSHUTDOWN = 202,     // ACP shutdown
  SV_CONFMAINT = 203,       // Conference maintenance
  SV_VIEWLOGS = 204,        // View logs
  SV_TOGGLESTATUS = 205,    // Toggle status
  SV_TIMEINCREASE = 206,    // Increase time
  SV_TIMEDECREASE = 207,    // Decrease time
  SV_CAPTURE = 208,         // Capture
  SV_DISPLAYFILE = 209,     // Display file
  SV_GRANTTEMP = 210,       // Grant temporary access

  // Keyboard/Arrow commands
  GETKEY = 500,             // Get keyboard input
  RAWARROW = 501,           // Raw arrow keys
  CHAIN = 502,              // Chain to another door

  // Node/Modem info
  NODE_DEVICE = 503,        // Serial device name
  NODE_UNIT = 504,          // Serial device unit
  NODE_BAUD = 505,          // Online baud rate
  NODE_NUMBER = 506,        // Node number

  // Command routing
  PRV_COMMAND = 508,        // Private command
  PRV_GROUP = 509,          // Private group
  NODE_BAUDRATE = 516,      // Online baud rate (raw)

  // Multicom/Semaphore
  MULTICOM = 531,           // Returns masterNode semaphore

  // Account / ConfDB helpers
  LOAD_ACCOUNT = 532,
  SAVE_ACCOUNT = 533,
  SAVE_CONFDB = 534,
  LOAD_CONFDB = 535,
  GET_CONFNUM = 536,
  SEARCH_ACCOUNT = 537,
  APPEND_ACCOUNT = 538,
  LAST_ACCOUNTNUM = 539,
  MOD_TYPE = 540,
  BATCHZMODEMSEND = 542,
  ACP_COMMAND = 544,        // ACP command passthrough
  EDITOR_STRUCT = 546,
  BYPASS_CSI_CHECK = 547,
  SENTBY = 548,

  // Override/control commands
  SETOVERIDE = 549,         // Set override mode
  FULLEDIT = 550,           // Full editor mode
  SETMCIOFF = 551,          // Disable MCI processing

  // Message base commands
  GET_CUSTOM_MSGBASE_PARAM1 = 600,  // Custom msgbase param1
  GET_CUSTOM_MSGBASE_PARAM2 = 601,  // Custom msgbase param2
  LAST_READ = 602,                  // Last message read conference
  LAST_SCANNED = 603,               // Last new message read conference
  MSGBASE_LOC = 604,                // Message base location path
  GET_CUSTOM_MSGBASE_MENUCMD = 605, // Menu command for custom message bases
  UNKNOWN4 = 607,                   // Unknown value storage
  QUICK_KEY = 608,                  // Quick key

  // Serial I/O
  SER_INOUT = 609,          // Serial I/O flags

  // AXNet file transfer
  AXNET_RECEIVE = 610,      // AXNet receive
  AXNET_SEND = 611,         // AXNet send
  MEMCONF = 612,            // Memory conference pointer
  SET_SERSHARED = 613,      // Set serial shared flag

  // Conference access - 614 is ONLY CONF_ACCESS per axcommon.e
  // BB_NUMCONFS does NOT exist in original AmiExpress sources
  CONF_ACCESS = 614,        // Check conference access (returns 0/1/2)

  // Password/Display control
  PASSWORD_HASH = 615,      // Get password hash
  GET_GNSFLAG = 616,        // Get nonStopDisplayFlag
  DISPLAY_FILE = 617,       // Non-stop show file
  CHECK_TO_DISPLAY = 618,   // Non-stop show gfile
  CHOOSE_NAME = 619,        // Name picker dialog
  SET_FILEATTACH = 620,     // Set file attachment mode
  INTERPRET_MCI = 621,      // Interpret MCI without display
  GET_XIMPORT = 622,        // Get XIM port
  GET_MENU_COMMAND_CHAR = 623, // Get menu command character
  FILE_REQUEST = 624,       // ASL file requester
  DISABLE_FILE_ATTACH = 625, // Disable file attachment
  QWKZOOM_REC = 626,        // QWK zoom record number
  REL_CONF = 627,           // Relative conference number
  RETURNCOMMAND2 = 628,     // Return command 2
  CANCEL_TRANSFER_OFFHOOK = 629, // Cancel transfer off hook
  CLEAR_OLM_QUEUE = 630,    // Clear OLM message queue
  QUIET_DOWNLOAD = 631,     // Quiet download mode
  CHECK_PLAYPEN_EXISTS = 632, // Check if file exists in playpen
  EXT_LOAD_ACCOUNT = 633,
  EXT_SAVE_ACCOUNT = 634,
  EXT_CHOOSE_NAME = 635,    // Extended name picker
  CHECK_REALNAME = 636,     // Check realname setting for msgbase

  // AXNet outbound
  XNET_OUTBOUND = 640,      // AXNet outbound directory

  // Console/Telnet commands
  CON_CURSOR = 705,         // Console cursor on/off
  TELNET_CONNECT = 706,     // Connect to telnet server
  GET_CMD_TOOLTYPE = 707,   // Reads tooltype from command's .info file
  TELNET_USERNAME_PROMPT = 708, // Telnet username prompt
  TELNET_USERNAME = 709,    // Telnet username
  TELNET_PASSWORD_PROMPT = 710, // Telnet password prompt
  TELNET_PASSWORD = 711,    // Telnet password

  // Playpen/Iconify/Logon
  SIG_PLAYPEN = 908,        // Playpen directory path
  ICONIFYQUERY = 909,       // Is screen iconified?
  LOGON_UNAME = 910,        // Logon username
  LOGON_UPASS = 911,        // Logon password
  SIG_LI = 912,             // Secure line input (password mode)

  // Maximum command value
  MAX_CMD = 1003,

  // Placeholders for network transfers (not in axcommon.e but referenced)
  NETUPLOAD = 10001,
  NETDOWNLOAD = 10002,
}

/**
 * XIM Message Structure
 *
 * struct DIFace {
 *   APTR dif_AEPort;      // Ptr to AEDoorPortX
 *   APTR dif_MsgPort;     // Ptr to DoorReplyPort
 *   APTR dif_Message;     // Ptr to message
 *   char dif_ReplyName[16];
 *   int *dif_Data;
 *   char *dif_String;
 * }
 */
export interface XIMMessage {
  msgAddr: number;      // Address of message in memory
  command: number;      // XIM command code
  data: number;         // Data value
  replyPort: number;    // Door's reply port address
  messageLength?: number; // mn_Length from Exec message header (bytes)
  stringAddr?: number;  // Address of string data (if any)
  string?: string;      // String content (jhMessage.string field)
  nodeId?: number;
  lineNumber?: number;
  signal?: number;
  task?: number;
  semaphore?: number;
  filler1?: number;
  filler2?: number;
  stringPtr?: number;
  filler3?: number;
}

/**
 * BBS Session Data (passed from BBS to door)
 */
export interface BBSSessionData {
  user?: any;
  bbsName?: string;
  sysopName?: string;
  nodeId?: number;
  conferenceName?: string;
  conferencePath?: string;
  conferenceId?: number;
  bbsPath?: string;
  logonType?: number;
  hostname?: string;
  hostip?: string;
  currentCommand?: string;
  returnCommand?: string;
  nonStopText?: boolean;
  language?: string;
  confAccess?: string;
  lineCount?: number;
  lineWrap?: number;
  pauseLines?: number;
  autoPauseEnabled?: boolean; // If true, XIM auto-pauses after pauseLines; if false (default), door handles pagination
  chainRequest?: string;
  carrierDropped?: boolean;
  timeoutSeconds?: number;
  connectionType?: 'web' | 'telnet' | 'ssh';
  transferRawSend?: (buf: Buffer) => void;
  transferRawActive?: boolean;
  transferRawSink?: (buf: Buffer) => void;
  transferManager?: any;
}

/**
 * Shared XIM state passed across handlers
 */
export interface XIMState {
  registered: boolean;
  shuttingDown: boolean;
  nonStopText: boolean;
  autoPauseEnabled: boolean; // If true, XIM auto-pauses at pauseLines; if false, door handles pagination
  lineCount: number;
  lineWrap: number;
  pauseLines: number;
  language: string;
  confAccess: string;
  carrierDropped: boolean;
  rawArrow: boolean;  // When true, pass raw escape sequences; when false, convert to arrow codes
  transfering: boolean; // When true, file transfer in progress - suppress JH_WRITE output (express.e:3383)
  doorSilent: boolean;  // When true, door output suppressed - used by silent doors (express.e:3383)
  ximPortAddr?: number;
  aePortAddr?: number;
  doorPortAddr?: number;
  doorReplyPortAddr?: number;
  returnCommand?: string;
  prvCommand?: string;
  chainCommand?: string;
  logonType?: number;
  doorCommand?: string;
  // Native door detection: set to true ONLY after 500ms timer fires with no XIM data requests
  // XIM doors that send JH_HK/etc should NOT have input injected - they receive via reply
  isNativeDoor?: boolean;
}

/**
 * Arrow key codes from axconsts.e
 * These are the internal codes used when rawArrow=FALSE
 */
export const ArrowKeyCodes = {
  LEFTARROW: 2,
  RIGHTARROW: 3,
  UPARROW: 4,
  DOWNARROW: 5,
} as const;

/**
 * Environment status values from aedoor.i
 * Used with ENVSTAT command to report current user activity
 */
export const ENVStatus = {
  ENV_DROPPED: -1,      // Carrier dropped / disconnected
  ENV_IDLE: 0,          // User is idle at menu
  ENV_DOWNLOADING: 1,   // Downloading files
  ENV_UPLOADING: 2,     // Uploading files
  ENV_DOORS: 3,         // Running a door
  ENV_MAIL: 4,          // Reading/writing mail
  ENV_STATS: 5,         // Viewing statistics
  ENV_ACCOUNT: 6,       // Account maintenance
  ENV_ZOOM: 7,          // In zoom mode
  ENV_FILES: 8,         // File section
  ENV_BULLETINS: 9,     // Reading bulletins
  ENV_VIEWING: 10,      // Viewing files
  ENV_LOGON: 11,        // Logging on
  ENV_LOGOFF: 12,       // Logging off
  ENV_SYSOP: 13,        // Sysop functions
  ENV_SHELL: 14,        // In shell
  ENV_EMACS: 15,        // In editor
  ENV_JOIN: 16,         // Joining conference
  ENV_CHAT: 17,         // In chat
  ENV_NOTACTIVE: 18,    // Node not active
  ENV_REQ_CHAT: 19,     // Requesting chat
  ENV_CONNECT: 20,      // Connecting
  ENV_LOGGINGON: 21,    // Logging on
  ENV_AWAITCONNECT: 22, // Awaiting connection
  ENV_SCANNING: 23,     // Scanning messages/files
  ENV_SHUTDOWN: 24,     // Shutting down
  ENV_MULTICHAT: 25,    // Multi-node chat
  ENV_SUSPEND: 26,      // Suspended
  ENV_RESERVE: 27,      // Reserved
} as const;

/**
 * AEDoor error codes from aedoor.i
 * Returned by various XIM operations to indicate error conditions
 */
export const AEDoorError = {
  AEERR_ABORTED: 0,     // Transfer unsuccessful
  AEERR_NONODE: -1,     // No node active
  AEERR_TIMEOUT: -2,    // Keyboard timeout
  AEERR_NOCARRIER: -2,  // Lost carrier (same as timeout)
  AEERR_NOMEM: -3,      // Not enough memory
  AEERR_BUFFOVER: -4,   // Buffer overflow
} as const;

/**
 * Data direction convention for DT_* commands
 * Used with msg.data to indicate read vs write operation
 */
export const DataDirection = {
  READIT: 1,   // Door wants to READ data FROM BBS (msg.data !== 0)
  WRITEIT: 0,  // Door wants to WRITE data TO BBS (msg.data === 0)
} as const;

/**
 * Field length limits from xdoorcmd.def
 * Maximum string lengths for various data fields
 */
export const FieldLengths = {
  DT_NAME: 30,           // User name
  DT_PASSWORD: 8,        // User password
  DT_LOCATION: 29,       // User location
  DT_PHONENUMBER: 12,    // Phone number
  DT_SLOTNUMBER: 10,     // Slot number (numeric string)
  DT_SECSTATUS: 10,      // Security status (numeric)
  DT_EXPERT: 1,          // Expert mode flag
  DT_LINELENGTH: 10,     // Screen length (numeric)
  ACTIVE_NODES: 9,       // Active nodes string
  DT_CONFACCESS: 9,      // Conference access (XXXXXXX_X)
  DT_CONFACCESS2: 25,    // Extended conference access
  DT_REALNAME: 26,       // Real name
  BB_CONFNAME: 58,       // Conference name
  BB_CONFLOCAL: 58,      // Conference local path
  BB_LOCAL: 40,          // BBS directory
  BB_MAINLINE: 190,      // Last command entered
  BB_STATUS: 10,         // User status
  RETURNCOMMAND: 190,    // Return command
  BB_CHATFLAG: 3,        // Chat enabled (ON/OFF)
  DT_STAMP: 190,         // Date/time stamp strings
  EXPRESS_VERSION: 10,   // Version string
  GENERIC_STRING: 200,   // Maximum embedded string (MESSAGE_STRING_CAPACITY)
} as const;
