// DoorTypes.ts
// Extracted interfaces, enums, and constants from AmigaDoorSession.ts
// Phase 1: Foundation Setup - 2025-11-20

export interface DoorConfig {
  executablePath: string; // Path to Amiga door binary
  doorType?: string; // Door type: XIM, AIM, SIM, TIM, IIM, MCI, AEM, SUP, FIM (default: SIM)
  timeout?: number; // Max execution time in seconds (default: 300)
  bbsSession?: any; // BBS session data (user, system, node info)
  doorId?: string; // Optional door identifier (info name/shortcut)
  args?: string[]; // Optional CLI arguments (without program name)
  cwd?: string; // Working directory for the door (defaults to door directory)
  assigns?: Record<string, string>; // Amiga assigns (BBS:, Doors:, NodeX:, etc.)
  env?: Record<string, string>; // Environment variables accessible via FindVar/CLI
  stack?: number; // Optional stack size (bytes) from .info (STACK tooltype)
  priority?: string; // Optional priority setting
  resident?: boolean;
  expertMode?: boolean;
  trapOn?: boolean;
  silent?: boolean;
  quickMode?: boolean;
  multiNode?: boolean;
  logInputs?: boolean;
  scriptCheck?: boolean;
  banner?: string;
  mimicVer?: string;
  passParameters?: number;
  internal?: string;
  toolTypes?: Record<string, string>;
  overclockFactor?: number; // CPU overclocking multiplier (0=auto, 1-50=specific, -1=force disable)
}

/**
 * Door Protocol Constants
 *
 * Native AEDoor.library Memory Layout (from aedoor.library.asm disassembly):
 * ============================================================================
 *
 * createComm() allocates 326 bytes (0x146) total for DoorInfo structure:
 *   - DoorInfo fields (pointers, port name buffer)
 *   - MsgPort structure (MP_SIZE = 34 bytes)
 *   - jhMessage structure (MN_LENGTH = 256 bytes)
 *
 * DoorInfo Structure (dif_* offsets):
 *   dif_AEPort      - ptr to AEDoorPort (found via FindPort)
 *   dif_MsgPort     - ptr to door's reply port
 *   dif_Message     - ptr to jhMessage
 *   dif_ReplyName   - name buffer ("DoorReplyPort{n}")
 *   dif_Data        - ptr to JHM_Data field in message
 *   dif_String      - ptr to JHM_String field in message
 *   dif_Sizeof      - size marker (end of DoorInfo, start of MsgPort)
 *
 * jhMessage Structure (after Exec message header):
 *   +0x00: mn_Node (10 bytes)
 *   +0x0a: mn_ReplyPort (4 bytes) - pointer to reply port
 *   +0x0e: mn_Length (2 bytes) - message length (256)
 *   +0x14: String[198] - embedded string buffer (DBEQ D1=0xC6 = 198 chars)
 *   +0xDC: Data (LONG) - data/status field
 *   +0xE0: Command (LONG) - XIM command code
 *   +0xE4: NodeID (LONG) - node number
 *   +0xE8: LineNum (LONG) - line number
 *   +0xEC: Signal (LONG) - signal mask
 *   +0xF0: Task (LONG) - task pointer
 *
 * Port Naming Convention:
 *   BBS port:   "AEDoorPort{n}" (n = 1-2 digit node number)
 *   Reply port: "DoorReplyPort{n}"
 *
 * Blocking Behavior (CRITICAL):
 *   ALL AEDoor.library functions use this pattern:
 *     PutMsg(AEDoorPort, message)    - send request
 *     mask = 1 << replyPort->sigBit  - create signal mask
 *     Wait(mask)                     - BLOCK until signal
 *     GetMsg(replyPort)              - retrieve reply
 *   BBS must call ReplyMsg() to unblock the door!
 *
 * Carrier Lost Convention:
 *   msg.data = -1 (0xFFFFFFFF) signals carrier dropped
 *   Native functions check BMI (branch if minus) to detect this
 *   prompt/getStr/hotKey return 0 or negative value on carrier loss
 *
 * String Length Limit:
 *   Native library uses DBEQ loop with D1=198 (0xC6) as counter
 *   This allows 198 actual characters plus null terminator
 */
export class DoorConstants {
  // Exec message header size (mn_Node + reply/length)
  static readonly MESSAGE_HEADER_SIZE = 0x14;
  // AEDoor-based XIM doors touch offsets past 0x1a0 (cli/user/location buffers), so allocate >= 0x200
  static readonly DOOR_INFO_SIZE = 0x240;
  static readonly DOOR_INFO_MESSAGE_OFFSET = 0x46;
  static readonly MESSAGE_STRING_OFFSET = 0x14;
  // CRITICAL: Native AEDoor.library uses 198-char limit (DBEQ D1=0xC6)
  // See aedoor.library.asm lines 293-296 (sendStrCmd) and 406-409 (copyStr)
  static readonly MESSAGE_STRING_CAPACITY = 198;
  static readonly MESSAGE_DATA_OFFSET = 0xdc;
  static readonly MESSAGE_COMMAND_OFFSET = 0xe0;
  static readonly MESSAGE_NODE_OFFSET = 0xe4;
  static readonly MESSAGE_LINE_OFFSET = 0xe8;
  static readonly MESSAGE_SIGNAL_OFFSET = 0xec;
  static readonly MESSAGE_TASK_OFFSET = 0xf0;
  static readonly MESSAGE_SEMAPHORE_OFFSET = 0xf4;
  static readonly MESSAGE_FILLER1_OFFSET = 0xf8;
  static readonly MESSAGE_FILLER2_OFFSET = 0xfc;
  static readonly MESSAGE_STRING_PTR_OFFSET = 0x100;
  static readonly MESSAGE_FILLER3_OFFSET = 0x104;
  static readonly MESSAGE_REPLY_PORT_OFFSET = 14;
  static readonly MESSAGE_LENGTH_OFFSET = 18;
  // Extended jhMessage size: some doors (AquaScan, etc.) access offsets up to 0x14a
  // for extended user/account data. Allocate 0x150 (336 bytes) to cover all accesses.
  // Standard: 0x108 (264 bytes) = 20-byte mn + 200-byte string + 11 LONG fields
  // Extended: 0x150 (336 bytes) = standard + 72 bytes for filler4-filler12 (9 LONGs + slack)
  static readonly MESSAGE_TOTAL_LENGTH = 0x150;
  static readonly DIF_DATA_PTR_OFFSET = 0x1c;
  static readonly DIF_STRING_PTR_OFFSET = 0x20;
  static readonly NODE_STATUS_SIZE = 0x100;
  static readonly NODE_STATUS_USERNAME_OFFSET = 0x20;
  static readonly NODE_STATUS_LOCATION_OFFSET = 0x60;
  static readonly NODE_STATUS_SUMMARY_OFFSET = 0xa0;
  static readonly NODE_STATUS_USERNAME_PTR_OFFSET = 0x10;
  static readonly NODE_STATUS_LOCATION_PTR_OFFSET = 0x14;
  static readonly NODE_STATUS_SUMMARY_PTR_OFFSET = 0x18;
  static readonly MEMF_PUBLIC_CLEAR = 0x10001;
}

export enum AEDoorCommand {
  JH_LI = 0, // Line Input
  JH_REGISTER = 1, // Register door with BBS
  JH_SHUTDOWN = 2, // Shutdown door
  JH_WRITE = 3, // Write text to terminal
  JH_SM = 4, // Send Message
  JH_PM = 5, // Post Message
  JH_HK = 6, // HotKey
  JH_SG = 7, // Show GFile
  JH_SF = 8, // Show File
  DT_NAME = 100, // Get user name
  DT_LOCATION = 102, // Get user location
  DT_PHONENUMBER = 103, // Get phone number
  DT_SECLEVEL = 105, // Get security level
  GETKEY = 500, // Get user input
}

/**
 * TIM Door Protocol Commands (PG_*)
 * Used by DoorControl{n} port for older SIM/TIM/IIM/SUP doors
 * Reference: express.e lines 4371-4525
 */
export enum TIMDoorCommand {
  PG_SHUTDOWN = 0,  // Exit door
  PG_SO = 1,        // Serial output (character)
  PG_CC = 2,        // Console output (character)
  PG_CH = 3,        // Both serial and console output (character)
  PG_CO = 4,        // Console puts (string)
  PG_SM = 5,        // Send message (string)
  PG_PM = 6,        // Prompt message (with input)
  PG_SC = 7,        // Serial input
  PG_HK = 8,        // Hot key
  PG_SG = 9,        // Security screen
  PG_SF = 10,       // Show file
  PG_EF = 11,       // Edit file
  PG_UD = 12,       // User data (numeric)
  PG_US = 13,       // User string
  PG_RD = 14,       // Random number
  PG_TM = 15,       // Time modify
  PG_FF = 16,       // File find
  BB_TASKPRI = 17,  // Task priority
}

/**
 * TIM Door Message Structure (doorMsg)
 * Simpler structure than jhMessage used by XIM doors
 * Reference: express.e lines 4374-4376 (carrier, command, string fields)
 */
export class TIMDoorConstants {
  // doorMsg structure offsets (simpler than jhMessage)
  static readonly DOORMSG_HEADER_SIZE = 0x14;      // Message Node header
  static readonly DOORMSG_CARRIER_OFFSET = 0x14;   // carrier: BOOL (2 bytes)
  static readonly DOORMSG_COMMAND_OFFSET = 0x16;   // command: WORD (2 bytes)
  static readonly DOORMSG_DATA_OFFSET = 0x18;      // data: LONG (4 bytes)
  static readonly DOORMSG_STRING_OFFSET = 0x1c;    // string: CHAR[80] (80 bytes)
  static readonly DOORMSG_STRING_CAPACITY = 80;
  static readonly DOORMSG_TOTAL_SIZE = 0x6c;       // Total size (~108 bytes)
}

// DOS Library offsets (for getAEDoorFunctionName reference)
export const DOS_FUNCTION_OFFSETS: Record<string, string> = {
  "-6": "Open",
  "-12": "Close",
  "-18": "Read",
  "-24": "Write",
  "-30": "Input",
  "-36": "Output",
  "-42": "Seek",
  // ... (full map will be moved here in later phases)
  "-474": "TWrite",
};

export interface WriteCallLogEntry {
  pc: number;
  iteration: number;
  args: {
    fileHandle: number;
    buffer: number;
    length: number;
  };
}

export interface AEDoorCallLogEntry {
  pc: number;
  iteration: number;
  function: string;
}
