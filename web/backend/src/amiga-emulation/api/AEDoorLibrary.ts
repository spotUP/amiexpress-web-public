/**
 * AEDoor.library Implementation
 *
 * This implements the AmiExpress Door Interface library that doors use to communicate
 * with the BBS. Based on analysis of AmiExpress-Sources/express.e lines 3379-3500.
 *
 * ARCHITECTURE:
 * - Original: Doors send messages (JH_WRITE, JH_PM, DT_NAME, etc.) via Amiga message ports
 * - Our approach: Trap AEDoor.library functions and handle directly (skip message passing)
 *
 * CRITICAL FUNCTIONS (from AEDOOR_FUNCTION_OFFSETS.md):
 * - CreateComm (-30)   : Initialize door interface
 * - DeleteComm (-36)   : Cleanup door interface
 * - GetString (-72)    : Get pointer to shared string buffer
 * - Prompt (-78)       : Get user input with prompt
 * - WriteStr (-84)     : Output text to terminal
 * - GetDT (-108)       : Get user data (name, location, etc.)
 */

import { Socket } from 'socket.io';
import { MoiraEmulator } from '../cpu/MoiraEmulator';

/**
 * DT_* Constants - Data Type requests (from AEDOOR_API_REFERENCE.md)
 */
export enum DTCommand {
  DT_NAME = 0,           // User's full name
  DT_PASSWORD = 1,       // User's password
  DT_LOCATION = 2,       // User's location
  DT_PHONE = 3,          // User's phone number
  DT_DATAPHONE = 4,      // User's data phone
  DT_BIRTHDAY = 5,       // User's birthday
  DT_GENDER = 6,         // User's gender
  DT_EMAIL = 7,          // User's email
  DT_MAILBOX = 8,        // User's mailbox number
  DT_LEVEL = 9,          // User's security level
  DT_DOWNLOADS = 10,     // User's download count
  DT_UPLOADS = 11,       // User's upload count
  DT_TIMETODAY = 12,     // User's time used today
  DT_TIMELEFT = 13,      // User's time left
  DT_LASTCALL = 14,      // User's last call date
  DT_NUMCALLS = 15,      // User's total calls
  DT_CONFNUM = 16,       // Current conference number
  DT_CONFNAME = 17,      // Current conference name
  DT_NODE = 18,          // Current node number
  DT_BBSNAME = 19,       // BBS name
  DT_SYSOP = 20,         // Sysop name
  DT_PORT = 21,          // Port number
}

/**
 * Memory addresses for AEDoor.library
 */
const AEDOOR_DIFACE_ADDR = 0x080000;     // Fake diface pointer
const AEDOOR_STRING_BUFFER = 0x081000;   // Shared string buffer (256 bytes)
const AEDOOR_INPUT_BUFFER = 0x081100;    // Input buffer (256 bytes)

/**
 * AEDoor.library implementation
 *
 * This class implements the door interface functions that XIM doors use to
 * communicate with the BBS. Instead of using message ports (the original approach),
 * we trap the library functions and handle them directly.
 */
export class AEDoorLibrary {
  private socket: Socket;
  private emulator: MoiraEmulator;
  private sessionData: any;  // BBS session data (user, conference, etc.)
  private activePrompt: {
    maxlen: number;
    resolve: (value: string) => void;
  } | null = null;

  constructor(socket: Socket, emulator: MoiraEmulator, sessionData: any) {
    this.socket = socket;
    this.emulator = emulator;
    this.sessionData = sessionData;

    // Initialize string buffers in emulated memory
    this.initializeBuffers();

    // Set up input handler for Prompt() function
    this.setupInputHandler();
  }

  /**
   * Initialize memory buffers for string data
   */
  private initializeBuffers(): void {
    // Clear string buffer (256 bytes)
    for (let i = 0; i < 256; i++) {
      this.emulator.writeMemory(AEDOOR_STRING_BUFFER + i, 0);
    }

    // Clear input buffer (256 bytes)
    for (let i = 0; i < 256; i++) {
      this.emulator.writeMemory(AEDOOR_INPUT_BUFFER + i, 0);
    }

    console.log('[AEDoorLibrary] Initialized buffers:');
    console.log(`  - String buffer at 0x${AEDOOR_STRING_BUFFER.toString(16)}`);
    console.log(`  - Input buffer at 0x${AEDOOR_INPUT_BUFFER.toString(16)}`);
  }

  /**
   * Set up input handler to receive user input for Prompt() function
   */
  private setupInputHandler(): void {
    this.socket.on('input', (data: string) => {
      if (this.activePrompt) {
        console.log(`[AEDoorLibrary] Received input for prompt: "${data}"`);

        // Truncate to maxlen if needed
        let input = data;
        if (input.length > this.activePrompt.maxlen) {
          input = input.substring(0, this.activePrompt.maxlen);
        }

        // Write to input buffer
        this.writeStringToMemory(AEDOOR_INPUT_BUFFER, input);

        // Resolve the promise
        const resolve = this.activePrompt.resolve;
        this.activePrompt = null;
        resolve(input);
      }
    });

    console.log('[AEDoorLibrary] Input handler registered');
  }

  /**
   * CreateComm() - LVO -30 (0xFFE2)
   *
   * Initializes the door interface.
   *
   * Parameters:
   *   D0 = Node number (ASCII value, e.g., '0' = 48, '1' = 49, etc.)
   *
   * Returns:
   *   D0 = diface pointer (or 0 on failure)
   *
   * From express.e: This creates a message port and finds the BBS port.
   * We skip message ports and just return a fake diface pointer.
   *
   * Pragma: #pragma libcall AEDBase CreateComm 1E 001
   *   - Offset 1E (hex) = 30 (decimal) = -30 LVO
   *   - Parameter mask 001 = D0 only
   */
  createComm(): number {
    const nodeChar = this.emulator.getRegister(0);  // D0

    // Convert ASCII character to node number (e.g., '0' = 48 -> 0)
    const nodeNum = nodeChar >= 48 && nodeChar <= 57 ? nodeChar - 48 : nodeChar;

    console.log(`[AEDoorLibrary] CreateComm(node=${nodeNum}, D0=0x${nodeChar.toString(16)})`);
    console.log(`  - Returning diface pointer: 0x${AEDOOR_DIFACE_ADDR.toString(16)}`);

    // Return fake diface pointer
    return AEDOOR_DIFACE_ADDR;
  }

  /**
   * DeleteComm() - LVO -36 (0xFFDC)
   *
   * Cleanup door interface.
   *
   * Parameters:
   *   A1 = diface pointer
   *
   * Returns:
   *   Nothing
   */
  deleteComm(): void {
    const difaceAddr = this.emulator.getRegister(9);  // A1

    console.log(`[AEDoorLibrary] DeleteComm(diface=0x${difaceAddr.toString(16)})`);
    console.log('  - Cleanup (no-op)');

    // No cleanup needed in our implementation
  }

  /**
   * GetString() - LVO -72 (0xFFB8)
   *
   * Returns pointer to the shared string buffer.
   *
   * Parameters:
   *   A1 = diface pointer
   *
   * Returns:
   *   D0 = Pointer to string buffer
   *
   * This buffer is used by GetDT() and other functions to return string data.
   */
  getString(): number {
    const difaceAddr = this.emulator.getRegister(9);  // A1

    console.log(`[AEDoorLibrary] GetString(diface=0x${difaceAddr.toString(16)})`);
    console.log(`  - Returning buffer address: 0x${AEDOOR_STRING_BUFFER.toString(16)}`);

    return AEDOOR_STRING_BUFFER;
  }

  /**
   * WriteStr() - LVO -84 (0xFFAC)
   *
   * Output text to the terminal.
   *
   * Parameters:
   *   A1 = diface pointer
   *   A2 = string address
   *   D0 = mode (0 = NOLF, 1 = LF)
   *
   * Returns:
   *   D0 = 0 (success)
   *
   * From express.e line 3386 (JH_WRITE case):
   *   IF (transfering=FALSE) AND (doorSilent=FALSE)
   *     aePuts(msg.string)
   *   ENDIF
   */
  writeStr(): number {
    const difaceAddr = this.emulator.getRegister(9);   // A1
    const stringAddr = this.emulator.getRegister(10);  // A2
    const mode = this.emulator.getRegister(0);         // D0

    const str = this.emulator.readString(stringAddr);

    console.log(`[AEDoorLibrary] WriteStr(diface=0x${difaceAddr.toString(16)}, str="${str}", mode=${mode})`);

    // Send to terminal
    const output = mode ? str + '\r\n' : str;
    this.socket.emit('ansi-output', output);

    console.log(`  - Sent to terminal: "${output}"`);

    return 0;  // Success
  }

  /**
   * Prompt() - LVO -78 (0xFFB2)
   *
   * Display prompt and get user input.
   *
   * Parameters:
   *   A1 = diface pointer
   *   D0 = maxlen (maximum input length)
   *   A2 = prompt string address
   *
   * Returns:
   *   D0 = Pointer to input buffer (or 0 on timeout)
   *
   * From express.e line 3404 (JH_PM case):
   *   IF(lineInput(msg.string,'',msg.data,doorTimeout,tempstring)<>RESULT_SUCCESS)
   *     msg.data:=-1
   *   ELSE
   *     msg.data:=1
   *     AstrCopy(msg.string,tempstring,200)
   *   ENDIF
   *
   * NOTE: This is ASYNC in the original (waits for message reply).
   * We need to handle this carefully in the emulator loop.
   */
  prompt(): number {
    const difaceAddr = this.emulator.getRegister(9);   // A1
    const maxlen = this.emulator.getRegister(0);       // D0
    const promptAddr = this.emulator.getRegister(10);  // A2

    const promptStr = this.emulator.readString(promptAddr);

    console.log(`[AEDoorLibrary] Prompt(diface=0x${difaceAddr.toString(16)}, maxlen=${maxlen}, prompt="${promptStr}")`);

    // Send prompt to terminal
    this.socket.emit('ansi-output', promptStr);

    // CRITICAL: This is blocking in the original - door waits for input
    // We need to pause the emulator and wait for user input
    // For now, return input buffer address (we'll handle async later)
    console.log(`  - Waiting for user input (maxlen=${maxlen})`);
    console.log(`  - Will return buffer at 0x${AEDOOR_INPUT_BUFFER.toString(16)}`);

    // Store active prompt state
    this.activePrompt = {
      maxlen: maxlen,
      resolve: (input: string) => {
        console.log(`[AEDoorLibrary] Prompt resolved with: "${input}"`);
      }
    };

    // Return input buffer address
    // The actual input will be written when 'input' event fires
    return AEDOOR_INPUT_BUFFER;
  }

  /**
   * GetDT() - LVO -108 (0xFF94)
   *
   * Get user data based on DT_* constant.
   *
   * Parameters:
   *   A1 = diface pointer
   *   D0 = DT_* constant
   *   A2 = optional string parameter (for some DT_* types)
   *
   * Returns:
   *   D0 = Result (numeric for some types, string written to buffer for others)
   *
   * The result is written to the string buffer (accessed via GetString()).
   */
  getDT(): number {
    const difaceAddr = this.emulator.getRegister(9);   // A1
    const dtCommand = this.emulator.getRegister(0);    // D0
    const paramAddr = this.emulator.getRegister(10);   // A2

    console.log(`[AEDoorLibrary] GetDT(diface=0x${difaceAddr.toString(16)}, dt=${dtCommand})`);

    let result: string | number = 0;

    // Get user data based on DT_* constant
    switch (dtCommand) {
      case DTCommand.DT_NAME:
        result = this.sessionData.user?.username || 'Guest';
        console.log(`  - DT_NAME: "${result}"`);
        this.writeStringToMemory(AEDOOR_STRING_BUFFER, result as string);
        break;

      case DTCommand.DT_LOCATION:
        result = this.sessionData.user?.location || 'Unknown';
        console.log(`  - DT_LOCATION: "${result}"`);
        this.writeStringToMemory(AEDOOR_STRING_BUFFER, result as string);
        break;

      case DTCommand.DT_LEVEL:
        result = this.sessionData.user?.secLevel || 10;
        console.log(`  - DT_LEVEL: ${result}`);
        return result as number;

      case DTCommand.DT_NODE:
        result = this.sessionData.nodeId || 0;
        console.log(`  - DT_NODE: ${result}`);
        return result as number;

      case DTCommand.DT_BBSNAME:
        result = 'AmiExpress-Web BBS';
        console.log(`  - DT_BBSNAME: "${result}"`);
        this.writeStringToMemory(AEDOOR_STRING_BUFFER, result as string);
        break;

      case DTCommand.DT_SYSOP:
        result = 'Sysop';
        console.log(`  - DT_SYSOP: "${result}"`);
        this.writeStringToMemory(AEDOOR_STRING_BUFFER, result as string);
        break;

      case DTCommand.DT_CONFNAME:
        result = this.sessionData.currentConference?.name || 'General';
        console.log(`  - DT_CONFNAME: "${result}"`);
        this.writeStringToMemory(AEDOOR_STRING_BUFFER, result as string);
        break;

      case DTCommand.DT_CONFNUM:
        result = this.sessionData.currentConference?.id || 1;
        console.log(`  - DT_CONFNUM: ${result}`);
        return result as number;

      case DTCommand.DT_TIMELEFT:
        result = 60;  // Default 60 minutes
        console.log(`  - DT_TIMELEFT: ${result}`);
        return result as number;

      default:
        console.log(`  - Unknown DT command: ${dtCommand}`);
        result = '';
        this.writeStringToMemory(AEDOOR_STRING_BUFFER, '');
        break;
    }

    return 0;
  }

  /**
   * Helper: Write a string to emulated memory
   */
  private writeStringToMemory(addr: number, str: string): void {
    const bytes = Buffer.from(str + '\0', 'latin1');
    for (let i = 0; i < bytes.length; i++) {
      this.emulator.writeMemory(addr + i, bytes[i]);
    }
    console.log(`  - Wrote "${str}" to 0x${addr.toString(16)}`);
  }

  /**
   * SendCmd() - LVO -42 (0xFFD6)
   *
   * Send a BBS command without data.
   *
   * Parameters:
   *   A1 = diface pointer
   *   D0 = command code
   *
   * Returns:
   *   D0 = result
   */
  sendCmd(): number {
    const difaceAddr = this.emulator.getRegister(9);   // A1
    const command = this.emulator.getRegister(0);      // D0

    console.log(`[AEDoorLibrary] SendCmd(diface=0x${difaceAddr.toString(16)}, cmd=${command})`);
    console.log('  - Stub (no-op)');

    return 0;  // Success
  }

  /**
   * SendStrCmd() - LVO -48 (0xFFD0)
   *
   * Send a BBS command with string parameter.
   *
   * Parameters:
   *   A1 = diface pointer
   *   D0 = command code
   *   A2 = string address
   *
   * Returns:
   *   D0 = result
   */
  sendStrCmd(): number {
    const difaceAddr = this.emulator.getRegister(9);   // A1
    const command = this.emulator.getRegister(0);      // D0
    const stringAddr = this.emulator.getRegister(10);  // A2

    const str = this.emulator.readString(stringAddr);

    console.log(`[AEDoorLibrary] SendStrCmd(diface=0x${difaceAddr.toString(16)}, cmd=${command}, str="${str}")`);
    console.log('  - Stub (no-op)');

    return 0;  // Success
  }

  /**
   * SendDataCmd() - LVO -54 (0xFFCA)
   *
   * Send a BBS command with numeric data parameter.
   *
   * Parameters:
   *   A1 = diface pointer
   *   D0 = command code
   *   D1 = data value
   *
   * Returns:
   *   D0 = result
   */
  sendDataCmd(): number {
    const difaceAddr = this.emulator.getRegister(9);   // A1
    const command = this.emulator.getRegister(0);      // D0
    const data = this.emulator.getRegister(1);         // D1

    console.log(`[AEDoorLibrary] SendDataCmd(diface=0x${difaceAddr.toString(16)}, cmd=${command}, data=${data})`);
    console.log('  - Stub (no-op)');

    return 0;  // Success
  }

  /**
   * SendStrDataCmd() - LVO -60 (0xFFC4)
   *
   * Send a BBS command with both string and numeric data.
   *
   * Parameters:
   *   A1 = diface pointer
   *   D0 = command code
   *   A2 = string address
   *   D1 = data value
   *
   * Returns:
   *   D0 = result
   */
  sendStrDataCmd(): number {
    const difaceAddr = this.emulator.getRegister(9);   // A1
    const command = this.emulator.getRegister(0);      // D0
    const stringAddr = this.emulator.getRegister(10);  // A2
    const data = this.emulator.getRegister(1);         // D1

    const str = this.emulator.readString(stringAddr);

    console.log(`[AEDoorLibrary] SendStrDataCmd(diface=0x${difaceAddr.toString(16)}, cmd=${command}, str="${str}", data=${data})`);
    console.log('  - Stub (no-op)');

    return 0;  // Success
  }

  /**
   * GetData() - LVO -66 (0xFFBE)
   *
   * Get numeric data from BBS.
   *
   * Parameters:
   *   A1 = diface pointer
   *
   * Returns:
   *   D0 = data value
   */
  getData(): number {
    const difaceAddr = this.emulator.getRegister(9);   // A1

    console.log(`[AEDoorLibrary] GetData(diface=0x${difaceAddr.toString(16)})`);
    console.log('  - Returning 0');

    return 0;
  }

  /**
   * ShowGFile() - LVO -90 (0xFFA6)
   *
   * Display a graphics file.
   *
   * Parameters:
   *   A1 = diface pointer
   *   A2 = filename address
   *
   * Returns:
   *   D0 = result
   */
  showGFile(): number {
    const difaceAddr = this.emulator.getRegister(9);   // A1
    const filenameAddr = this.emulator.getRegister(10);  // A2

    const filename = this.emulator.readString(filenameAddr);

    console.log(`[AEDoorLibrary] ShowGFile(diface=0x${difaceAddr.toString(16)}, file="${filename}")`);
    console.log('  - Stub (no-op) - graphics files not supported');

    return 0;  // Success
  }

  /**
   * ShowFile() - LVO -96 (0xFFA0)
   *
   * Display a text file.
   *
   * Parameters:
   *   A1 = diface pointer
   *   A2 = filename address
   *
   * Returns:
   *   D0 = result
   */
  showFile(): number {
    const difaceAddr = this.emulator.getRegister(9);   // A1
    const filenameAddr = this.emulator.getRegister(10);  // A2

    const filename = this.emulator.readString(filenameAddr);

    console.log(`[AEDoorLibrary] ShowFile(diface=0x${difaceAddr.toString(16)}, file="${filename}")`);
    console.log('  - Stub (no-op) - file display not implemented');

    // TODO: Read file from BBS file area and send to socket
    return 0;  // Success
  }

  /**
   * SetDT() - LVO -102 (0xFF9A)
   *
   * Set user data.
   *
   * Parameters:
   *   A1 = diface pointer
   *   D0 = DT_* constant
   *   A2 = value address (string or number depending on DT_* type)
   *
   * Returns:
   *   D0 = result
   */
  setDT(): number {
    const difaceAddr = this.emulator.getRegister(9);   // A1
    const dtCommand = this.emulator.getRegister(0);    // D0
    const valueAddr = this.emulator.getRegister(10);   // A2

    console.log(`[AEDoorLibrary] SetDT(diface=0x${difaceAddr.toString(16)}, dt=${dtCommand})`);
    console.log('  - Stub (no-op) - setting user data not implemented');

    // TODO: Update user data in sessionData based on DT_* constant
    return 0;  // Success
  }

  /**
   * GetStr() - LVO -114 (0xFF8E)
   *
   * Get input string with default value.
   *
   * Parameters:
   *   A1 = diface pointer
   *   D0 = maxlen
   *   A2 = default string address
   *
   * Returns:
   *   D0 = pointer to input buffer
   */
  getStr(): number {
    const difaceAddr = this.emulator.getRegister(9);   // A1
    const maxlen = this.emulator.getRegister(0);       // D0
    const defaultAddr = this.emulator.getRegister(10);  // A2

    const defaultStr = this.emulator.readString(defaultAddr);

    console.log(`[AEDoorLibrary] GetStr(diface=0x${difaceAddr.toString(16)}, maxlen=${maxlen}, default="${defaultStr}")`);

    // Pre-fill input buffer with default
    this.writeStringToMemory(AEDOOR_INPUT_BUFFER, defaultStr);

    // Send default to terminal (user can edit it)
    this.socket.emit('ansi-output', defaultStr);

    console.log(`  - Waiting for user input (maxlen=${maxlen})`);

    // Store active prompt state
    this.activePrompt = {
      maxlen: maxlen,
      resolve: (input: string) => {
        console.log(`[AEDoorLibrary] GetStr resolved with: "${input}"`);
      }
    };

    return AEDOOR_INPUT_BUFFER;
  }

  /**
   * CopyStr() - LVO -120 (0xFF88)
   *
   * Copy string from door to BBS buffer.
   *
   * Parameters:
   *   A1 = diface pointer
   *   A2 = source string address
   *   D0 = maxlen
   *
   * Returns:
   *   D0 = pointer to BBS buffer
   */
  copyStr(): number {
    const difaceAddr = this.emulator.getRegister(9);   // A1
    const sourceAddr = this.emulator.getRegister(10);  // A2
    const maxlen = this.emulator.getRegister(0);       // D0

    const sourceStr = this.emulator.readString(sourceAddr);

    console.log(`[AEDoorLibrary] CopyStr(diface=0x${difaceAddr.toString(16)}, src="${sourceStr}", maxlen=${maxlen})`);

    // Copy to string buffer (truncate if needed)
    let str = sourceStr;
    if (str.length > maxlen) {
      str = str.substring(0, maxlen);
    }

    this.writeStringToMemory(AEDOOR_STRING_BUFFER, str);

    console.log(`  - Copied to buffer at 0x${AEDOOR_STRING_BUFFER.toString(16)}`);

    return AEDOOR_STRING_BUFFER;
  }

  /**
   * HotKey() - LVO -126 (0xFF82)
   *
   * Get single keypress (hotkey).
   *
   * Parameters:
   *   A1 = diface pointer
   *   A2 = prompt string address
   *
   * Returns:
   *   D0 = character code (or -1 on timeout)
   */
  hotKey(): number {
    const difaceAddr = this.emulator.getRegister(9);   // A1
    const promptAddr = this.emulator.getRegister(10);  // A2

    const promptStr = this.emulator.readString(promptAddr);

    console.log(`[AEDoorLibrary] HotKey(diface=0x${difaceAddr.toString(16)}, prompt="${promptStr}")`);

    // Send prompt to terminal
    this.socket.emit('ansi-output', promptStr);

    console.log('  - Waiting for single keypress');
    console.log('  - Stub: returning -1 (timeout)');

    // TODO: Implement actual hotkey input
    return -1;  // Timeout
  }

  /**
   * Wait for user input (async helper for Prompt)
   */
  async waitForInput(maxlen: number): Promise<string> {
    return new Promise<string>((resolve) => {
      this.activePrompt = {
        maxlen: maxlen,
        resolve: resolve
      };
    });
  }

  /**
   * Check if waiting for input
   */
  isWaitingForInput(): boolean {
    return this.activePrompt !== null;
  }
}
