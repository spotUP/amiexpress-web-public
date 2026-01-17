/**
 * dos-types.ts - Type definitions and constants for dos.library
 *
 * This module contains all type definitions, interfaces, and constants
 * used by the DOS library emulation.
 *
 * @module dos-types
 */

// ============================================================================
// Amiga DOS Mode Constants (from dos/dos.h)
// ============================================================================

/** Open existing file for reading */
export const MODE_OLDFILE = 1005;
/** Create new file or overwrite existing */
export const MODE_NEWFILE = 1006;
/** Open existing file for read/write */
export const MODE_READWRITE = 1004;

// ============================================================================
// Seek Mode Constants (from dos/dos.h)
// ============================================================================

/** Seek from start of file */
export const OFFSET_BEGINNING = -1;
/** Seek from current position */
export const OFFSET_CURRENT = 0;
/** Seek from end of file */
export const OFFSET_END = 1;

// ============================================================================
// AllocDosObject Types (from dos/dosextens.h)
// ============================================================================

/** Allocate FileHandle structure */
export const DOS_FILEHANDLE = 0;
/** Allocate ExAllControl structure */
export const DOS_EXALLCONTROL = 1;
/** Allocate FileInfoBlock structure (260 bytes) */
export const DOS_FIB = 2;
/** Allocate DosPacket structure */
export const DOS_STDPKT = 3;
/** Allocate CommandLineInterface structure */
export const DOS_CLI = 4;
/** Allocate RDArgs structure */
export const DOS_RDARGS = 5;

// ============================================================================
// Lock Access Modes
// ============================================================================

/** Shared read lock */
export const ACCESS_READ = -2;
/** Exclusive write lock */
export const ACCESS_WRITE = -1;

// ============================================================================
// Standard File Handles
// ============================================================================

/** Standard input handle ID */
export const STDIN_HANDLE = 1;
/** Standard output handle ID */
export const STDOUT_HANDLE = 2;
/** Standard error handle ID */
export const STDERR_HANDLE = 3;
/** NIL: device handle ID */
export const NIL_HANDLE = 99;

// ============================================================================
// DOS Error Codes (from NDK dos/dos.h)
// ============================================================================

export const DOS_ERRORS = {
  // Success
  ERROR_NO_ERROR: 0,

  // Memory errors (103-120)
  ERROR_NO_FREE_STORE: 103,
  ERROR_TASK_TABLE_FULL: 105,
  ERROR_BAD_TEMPLATE: 114,
  ERROR_BAD_NUMBER: 115,
  ERROR_REQUIRED_ARG_MISSING: 116,
  ERROR_KEY_NEEDS_ARG: 117,
  ERROR_TOO_MANY_ARGS: 118,
  ERROR_UNMATCHED_QUOTES: 119,
  ERROR_LINE_TOO_LONG: 120,

  // Object errors (202-213)
  ERROR_OBJECT_IN_USE: 202,
  ERROR_OBJECT_EXISTS: 203,
  ERROR_DIR_NOT_FOUND: 204,
  ERROR_OBJECT_NOT_FOUND: 205,
  ERROR_BAD_STREAM_NAME: 206,
  ERROR_OBJECT_TOO_LARGE: 207,
  ERROR_ACTION_NOT_KNOWN: 209,
  ERROR_INVALID_COMPONENT_NAME: 210,
  ERROR_INVALID_LOCK: 211,
  ERROR_OBJECT_WRONG_TYPE: 212,
  ERROR_DISK_NOT_VALIDATED: 213,

  // Protection errors (214-223)
  ERROR_WRITE_PROTECTED: 214,
  ERROR_DELETE_PROTECTED: 215,
  ERROR_READ_PROTECTED: 216,
  ERROR_NOT_A_DOS_DISK: 218,
  ERROR_SEEK_ERROR: 219,
  ERROR_COMMENT_TOO_BIG: 220,
  ERROR_DISK_FULL: 221,
  ERROR_DISK_WRITE_PROTECTED: 223,

  // Filename errors (232-240)
  ERROR_RENAME_ACROSS_DEVICES: 224,
  ERROR_DIRECTORY_NOT_EMPTY: 225,
  ERROR_TOO_MANY_LEVELS: 226,
  ERROR_DEVICE_NOT_MOUNTED: 227,
  ERROR_NO_MORE_ENTRIES: 232,
  ERROR_IS_SOFT_LINK: 233,
  ERROR_OBJECT_LINKED: 234,
  ERROR_BAD_HUNK: 235,
  ERROR_NOT_IMPLEMENTED: 236,
  ERROR_RECORD_NOT_LOCKED: 240,

  // Lock/file handling errors (241-299)
  ERROR_LOCK_COLLISION: 241,
  ERROR_LOCK_TIMEOUT: 242,
  ERROR_UNLOCK_ERROR: 243,

  // Device errors (300-399)
  ERROR_BUFFER_OVERFLOW: 303,
  ERROR_INVALID_STREAM_STATE: 304,
} as const;

export type DosErrorCode = typeof DOS_ERRORS[keyof typeof DOS_ERRORS];

// ============================================================================
// Interfaces
// ============================================================================

/**
 * Represents an open file handle in the DOS library
 */
export interface FileHandle {
  /** Unique file handle identifier */
  id: number;
  /** File name (may be device name for console) */
  name: string;
  /** Open mode (MODE_OLDFILE, MODE_NEWFILE, etc.) */
  mode: number;
  /** Current position in file */
  position: number;
  /** Whether this is a console device */
  isConsole: boolean;
  /** File contents in memory (for buffered I/O) */
  buffer?: Buffer;
  /** Actual filesystem path */
  realPath?: string;
}

/**
 * Represents a file/directory lock
 */
export interface Lock {
  /** Unique lock identifier */
  id: number;
  /** Real filesystem path */
  path: string;
  /** Access mode (ACCESS_READ or ACCESS_WRITE) */
  mode: number;
  /** Original AmigaDOS path */
  amigaPath: string;
  /** Address of FileLockStruct in emulator memory */
  memAddr: number;
  /** BPTR (memAddr >> 2) returned to door */
  bptr: number;
}

/**
 * Parsed template entry for ReadArgs
 */
export interface ReadArgsTemplateEntry {
  /** Display name from template */
  displayName: string;
  /** Uppercase normalized names for matching */
  namesUpper: string[];
  /** Whether this argument is required */
  required: boolean;
  /** Whether this is a switch (/S) */
  isSwitch: boolean;
  /** Whether this is a keyword (/K) */
  isKeyword: boolean;
  /** Whether this is numeric (/N) */
  isNumeric: boolean;
  /** Whether this accepts multiple values (/M) */
  isMultiple: boolean;
  /** Whether this is a rest argument (/F) */
  isRest: boolean;
  /** Whether this is a toggle (/T) */
  isToggle: boolean;
}

/**
 * Context for ReadArgs parsing
 */
export interface ReadArgsContext {
  /** Pointer to RDArgs structure */
  rdArgsPtr: number;
  /** Pointer to parse buffer */
  bufferPtr: number;
  /** Size of parse buffer */
  bufferSize: number;
  /** Current offset in buffer */
  bufferOffset: number;
  /** Whether we allocated the buffer */
  ownsBuffer: boolean;
  /** Whether we allocated the struct */
  ownsStruct: boolean;
}

/**
 * Token from ReadArgs input parsing
 */
export interface ReadArgsToken {
  /** Raw token string */
  raw: string;
  /** Processed value */
  value: string;
  /** Uppercase normalized value */
  normalizedValue: string;
  /** Key name if key=value format */
  key?: string;
  /** Uppercase key name */
  keyUpper?: string;
  /** Whether this token has been consumed */
  consumed: boolean;
}

/**
 * Result of tokenizing ReadArgs input
 */
export interface ReadArgsTokenResult {
  /** Parsed tokens */
  tokens: ReadArgsToken[];
  /** Error code if parsing failed */
  error?: number;
}

/**
 * ReadArgs context info wrapper
 */
export interface ReadArgsContextInfo {
  /** Pointer to RDArgs structure */
  rdArgsPtr: number;
  /** Associated context */
  context: ReadArgsContext;
}

/**
 * ReadArgs input info
 */
export interface ReadArgsInputInfo {
  /** Input string to parse */
  input: string;
  /** Source pointer in memory */
  sourcePtr: number;
  /** Length of input */
  length: number;
}

// ============================================================================
// LVO (Library Vector Offset) Constants
// ============================================================================

/**
 * DOS Library Vector Offsets
 * These are the negative offsets from the library base address
 */
export const DOS_LVO = {
  // Basic file operations
  Open: -30,
  Close: -36,
  Read: -42,
  Write: -48,
  Input: -54,
  Output: -60,
  Seek: -66,

  // File management
  DeleteFile: -72,
  Rename: -78,

  // Lock operations
  Lock: -84,
  UnLock: -90,
  DupLock: -96,

  // Directory operations
  Examine: -102,
  ExNext: -108,
  Info: -114,
  CreateDir: -120,
  CurrentDir: -126,

  // Error and process
  IoErr: -132,
  CreateProc: -138,
  Exit: -144,

  // Segment loading
  LoadSeg: -150,
  UnLoadSeg: -156,

  // Packet handling
  GetPacket: -162,
  QueuePacket: -168,

  // Device operations
  DeviceProc: -174,

  // File attributes
  SetComment: -180,
  SetProtection: -186,
  DateStamp: -192,

  // Timing
  Delay: -198,
  WaitForChar: -204,

  // More directory ops
  ParentDir: -210,
  IsInteractive: -216,
  Execute: -222,

  // V36+ functions
  PutStr: -948,
  VPrintf: -954,
} as const;

// ============================================================================
// Memory Layout Constants
// ============================================================================

/** Default buffer size for ReadArgs */
export const READARGS_DEFAULT_BUFFER_SIZE = 4096;

/** Base address for ReadArgs heap allocations */
export const READARGS_HEAP_BASE = 0x140000;

/** Base address for environment variable structures */
export const ENV_VAR_STRUCT_BASE = 0x120000;

/** Base address for environment variable strings */
export const ENV_STRING_BASE = 0x122000;

/** Size of each environment variable structure */
export const ENV_VAR_STRUCT_SIZE = 0x40;

// ============================================================================
// Debug Flag
// ============================================================================

/**
 * Enable file operation debugging
 * Set DEBUG_FILE_OPS=1 to log all file operations
 */
export const DEBUG_FILE_OPS = process.env.DEBUG_FILE_OPS === '1';
