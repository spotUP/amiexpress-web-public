// DoorTypes.ts
// Extracted interfaces, enums, and constants from AmigaDoorSession.ts
// Phase 1: Foundation Setup - 2025-11-20

export interface DoorConfig {
  executablePath: string; // Path to Amiga door binary
  doorType?: string; // Door type: XIM, AIM, SIM, TIM, IIM, MCI, AEM, SUP (default: SIM)
  timeout?: number; // Max execution time in seconds (default: 300)
  bbsSession?: any; // BBS session data (user, system, node info)
  doorId?: string; // Optional door identifier (info name/shortcut)
  args?: string[]; // Optional CLI arguments (without program name)
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
}

export class DoorConstants {
  static readonly DOOR_INFO_SIZE = 0x146;
  static readonly DOOR_INFO_MESSAGE_OFFSET = 0x46;
  static readonly MESSAGE_STRING_OFFSET = 0x14;
  static readonly MESSAGE_STRING_CAPACITY = 200;
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
  static readonly MESSAGE_TOTAL_LENGTH = 0x104;
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

export interface BullsPointerWatch {
  info: number;
  control: number;
  handshake: number;
  nodeMirror: number;
}

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
