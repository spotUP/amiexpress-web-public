/**
 * XIM Protocol Type Definitions
 *
 * All interfaces and enums for the eXpress Interface Module (XIM) protocol.
 * Based on aedoor.h specification from AmiExpress sources.
 */

// XIM Protocol Command Codes (from aedoor.h and axcommon.e)
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
  JH_CK = 500,         // Check for key (QuicKey)
  JH_DL = 15,          // Alias used by glue for ExtHK/DL
  JH_MCI = 507,        // MCI processing
  SCREEN_ADDRESS = 139,
  RAWSCREEN_ADDRESS = 141,
  DISPLAY_FILE = 617,      // Non-stop show file (DoorKit alias JH_SF_NSF)
  CHECK_TO_DISPLAY = 618,  // Non-stop show gfile (DoorKit alias JH_SG_NSF)

  // PG_* commands (express.e/axconsts.e)
  PG_SM = 1,           // Serial/Screen Message (axconsts.e:94)
  PG_UD = 13,          // User Data (axconsts.e:105)
  PG_US = 14,          // User String (axconsts.e:106)

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
  DT_STAMP_LASTON = 143,
  DT_CURR_TIME = 145,
  DT_STAMP_CTIME = 144,
  DT_CONFACCESS = 146,
  DT_LANGUAGE = 527,
  DT_QUICKFLAG = 528,
  DT_GOODFILE = 529,
  DT_GOODFILE_FLAG = 531,
  DT_ANSICOLOR = 530,
  DT_ISANSI = 541,
  DT_MSGCODE = 543,
  DT_FILECODE = 545,
  DT_REALNAME = 606,
  DT_HOSTNAME = 700,
  DT_HOSTIP = 701,
  DT_ADDBIT = 1000,
  DT_REMBIT = 1001,
  DT_QUERYBIT = 1002,

  // BBS information commands (BB_*)
  BB_CONFNAME = 126,
  BB_CONFLOCAL = 127,
  BB_LOCAL = 128,
  BB_MAINLINE = 131,
  BB_TASKPRI = 140,
  BB_CHATFLAG = 142,
  BB_CHATSET = 162,
  BB_PCONFNAME = 148,
  BB_PCONFLOCAL = 147,
  BB_STATUS = 129,
  BB_COMMAND = 130,
  BB_NODEID = 149,
  BB_CALLERSLOG = 150,
  BB_UDLOG = 151,
  BB_REMOVEPORT = 513,
  BB_SOPT = 514,
  BB_CONFNUM = 510,
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
  BB_DROPDTR = 161,
  BB_GETTASK = 164,

  // System commands
  EXPRESS_VERSION = 152,
  GETKEY = 500,            // Get keyboard input
  RAWARROW = 501,          // Raw arrow keys
  CHAIN = 502,             // Chain to another door
  RETURNCOMMAND = 136,     // Return command
  RETURNCOMMAND2 = 628,    // Return command 2
  QUICK_KEY = 608,         // Quick key
  ENVSTAT = 163,           // Environment status
  SV_NEWMSG = 177,         // Server new message (express.e uses 177)
  PRV_COMMAND = 133,       // Private command
  PRV_GROUP = 134,         // Private group
  ACP_COMMAND = 544,       // ACP command passthrough

  // Transfers
  ZMODEMSEND = 137,
  ZMODEMRECEIVE = 138,
  BATCHZMODEMSEND = 542,
  NETUPLOAD = 10001,       // Placeholder until confirmed from express.e
  NETDOWNLOAD = 10002,     // Placeholder until confirmed from express.e

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
  EDITOR_STRUCT = 546,
  BYPASS_CSI_CHECK = 547,
  SENTBY = 548,
  EXT_LOAD_ACCOUNT = 633,
  EXT_SAVE_ACCOUNT = 634,
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
  lineCount: number;
  lineWrap: number;
  pauseLines: number;
  language: string;
  confAccess: string;
  carrierDropped: boolean;
  ximPortAddr?: number;
  aePortAddr?: number;
  doorPortAddr?: number;
  doorReplyPortAddr?: number;
  returnCommand?: string;
  prvCommand?: string;
  chainCommand?: string;
  logonType?: number;
}
