import { Socket } from "socket.io";
import { MoiraEmulator } from "../cpu/MoiraEmulator";
import { ExecLibrary } from "./ExecLibrary";
import { XIMCommand } from "../xim/types";

interface DoorInterfaceState {
  difaceAddr: number;
  bbsPortAddr: number;        // 0x00: dif_AEPort
  replyPortAddr: number;      // 0x04: dif_ReplyPort
  messageAddr: number;        // 0x08: dif_Message
  eventHookAddr: number;      // 0x08: dif_EventHook (was missing)
  nameBufAddr: number;        // 0x0C: dif_NameBuf (16 bytes)
  bbsInfoAddr: number;        // 0x46: dif_BBSInfo
  nodeBufAddr: number;        // 0xDC: dif_NodeBuf
  nodeStateAddr: number;      // 0xE4: dif_NodeState (CRITICAL for Bulls)
  dataPtr: number;            // 0x1C: dif_DataPtr
  stringPtr: number;          // 0x20: dif_String
  replyNameAddr: number;      // 0x0C: dif_ReplyName
  nodeId: number;
  stringCapacity: number;
}

interface PromptState {
  state: DoorInterfaceState;
  maxlen: number;
  resolve: (value: string) => void;
}

const MEMF_CLEAR = 1 << 16;
const DIFACE_SIZE = 0x146;  // Complete DoorInfo structure size
const DIFACE_MSG_OFFSET = 0x46;
const DIFACE_EVENT_HOOK_OFFSET = 0x08;
const DIFACE_NAME_BUF_OFFSET = 0x0C;
const DIFACE_BBS_INFO_OFFSET = 0x46;
const DIFACE_NODE_BUF_OFFSET = 0xDC;
const DIFACE_NODE_STATE_OFFSET = 0xE4;
const DIFACE_REPLY_NAME_OFFSET = 0x0c;
const DIFACE_DATA_PTR_OFFSET = 0x1c;
const DIFACE_STRING_PTR_OFFSET = 0x20;
const MESSAGE_STRING_OFFSET = 28;
const MESSAGE_DATA_OFFSET = 24;
const MESSAGE_COMMAND_OFFSET = 20;
const MESSAGE_REPLY_PORT_OFFSET = 14;
const MESSAGE_LENGTH_OFFSET = 18;
const MESSAGE_LENGTH = 0x100;
const MESSAGE_STRING_CAPACITY = 200;

/**
 * AEDoor.library reimplementation
 *
 * The real 68K AEDoor.library allocates a DIFace structure that contains:
 *   0x00: dif_AEPort   -> Pointer to AEDoorPortX (BBS message port)
 *   0x04: dif_MsgPort  -> Pointer to the door's reply port
 *   0x08: dif_Message  -> Pointer to embedded jhMessage record
 *   0x0C: dif_ReplyName[16]
 *   0x1C: dif_DataPtr  -> Pointer to jhMessage.data
 *   0x20: dif_String   -> Pointer to jhMessage.string[200]
 *
 * Using the disassembly of Libs/AEDoor.library we reproduce the same layout
 * so that 68K doors see exactly what they expect.
 */
export class AEDoorLibrary {
  private socket: Socket;
  private emulator: MoiraEmulator;
  private execLibrary: ExecLibrary;
  private sessionData: any;
  private interfaces = new Map<number, DoorInterfaceState>();
  private activePrompt: PromptState | null = null;

  constructor(
    socket: Socket,
    emulator: MoiraEmulator,
    execLibrary: ExecLibrary,
    sessionData: any
  ) {
    this.socket = socket;
    this.emulator = emulator;
    this.execLibrary = execLibrary;
    this.sessionData = sessionData;

    this.setupInputHandler();
  }

  /**
   * Hook terminal input events for Prompt()/GetStr()
   */
  private setupInputHandler(): void {
    this.socket.on("door:input", (data: string) => {
      if (!this.activePrompt) {
        return;
      }

      const { state, maxlen, resolve } = this.activePrompt;
      const trimmed = data.slice(0, maxlen);

      this.writeCString(state.stringPtr, trimmed, state.stringCapacity);
      this.emulator.resume();
      this.activePrompt = null;
      resolve(trimmed);
    });
  }

  /**
   * CreateComm() - LVO -30
   *
   * Establishes the DIFace, reply port, and jhMessage structure.
   */
  createComm(): number {
    const nodeId = this.resolveNodeId();
    console.log(`[AEDoorLibrary] CreateComm for node ${nodeId}`);
    const bbsPortAddr = this.findBbsPort(nodeId);

    if (bbsPortAddr === 0) {
      console.warn(`[AEDoorLibrary] CreateComm: AEDoorPort${nodeId} not found`);
      this.emulator.setRegister(0, 0);
      return 0;
    }

    const difaceAddr = this.execLibrary.allocMem(DIFACE_SIZE, MEMF_CLEAR);
    if (difaceAddr === 0) {
      console.warn("[AEDoorLibrary] CreateComm: AllocMem failed");
      this.emulator.setRegister(0, 0);
      return 0;
    }

    const messageAddr = difaceAddr + DIFACE_MSG_OFFSET;
    const replyNameAddr = difaceAddr + DIFACE_REPLY_NAME_OFFSET;
    const replyName = `DoorReplyPort${nodeId}`;
    this.writeCString(replyNameAddr, replyName, 16);

    const replyPortAddr = this.execLibrary.createPort(replyNameAddr, 0);
    if (replyPortAddr === 0) {
      console.warn("[AEDoorLibrary] CreateComm: CreatePort failed");
      this.execLibrary.freeMem(difaceAddr, DIFACE_SIZE);
      this.emulator.setRegister(0, 0);
      return 0;
    }

    const stringPtr = messageAddr + MESSAGE_STRING_OFFSET;
    const dataPtr = messageAddr + MESSAGE_DATA_OFFSET;

    this.emulator.writeMemory32(difaceAddr + 0x00, bbsPortAddr);
    this.emulator.writeMemory32(difaceAddr + 0x04, replyPortAddr);
    this.emulator.writeMemory32(difaceAddr + 0x08, messageAddr);
    this.emulator.writeMemory32(difaceAddr + DIFACE_DATA_PTR_OFFSET, dataPtr);
    this.emulator.writeMemory32(
      difaceAddr + DIFACE_STRING_PTR_OFFSET,
      stringPtr
    );

    this.emulator.writeMemory32(
      messageAddr + MESSAGE_REPLY_PORT_OFFSET,
      replyPortAddr
    );
    this.emulator.writeMemory16(
      messageAddr + MESSAGE_LENGTH_OFFSET,
      MESSAGE_LENGTH
    );
    this.emulator.writeMemory32(messageAddr + MESSAGE_COMMAND_OFFSET, 0);
    this.emulator.writeMemory32(messageAddr + MESSAGE_DATA_OFFSET, 0);
    this.clearBuffer(stringPtr, MESSAGE_STRING_CAPACITY);

    // Allocate additional buffers required by DoorInfo structure
    const eventHookAddr = this.execLibrary.allocMem(4, MEMF_CLEAR); // 4 bytes for event hook pointer
    const nameBufAddr = this.execLibrary.allocMem(16, MEMF_CLEAR);  // 16 bytes for CLI/SysOp name
    const bbsInfoAddr = this.execLibrary.allocMem(152, MEMF_CLEAR); // BBS info buffer
    const nodeBufAddr = this.execLibrary.allocMem(8, MEMF_CLEAR);   // Per-node status buffer
    const nodeStateAddr = this.execLibrary.allocMem(16, MEMF_CLEAR); // Node state data (CRITICAL)

    // Initialize DoorInfo structure with all required fields
    this.emulator.writeMemory32(difaceAddr + DIFACE_EVENT_HOOK_OFFSET, eventHookAddr);
    this.emulator.writeMemory32(difaceAddr + DIFACE_NAME_BUF_OFFSET, nameBufAddr);
    this.emulator.writeMemory32(difaceAddr + DIFACE_BBS_INFO_OFFSET, bbsInfoAddr);
    this.emulator.writeMemory32(difaceAddr + DIFACE_NODE_BUF_OFFSET, nodeBufAddr);
    this.emulator.writeMemory32(difaceAddr + DIFACE_NODE_STATE_OFFSET, nodeStateAddr);

    // Initialize node state data (critical for Bulls door and others)
    // Format: [word count][security level][user data...]
    this.emulator.writeMemory16(nodeStateAddr, 8);     // Word count
    this.emulator.writeMemory16(nodeStateAddr + 2, 100); // Security level
    this.emulator.writeMemory16(nodeStateAddr + 4, nodeId); // Node ID
    this.emulator.writeMemory16(nodeStateAddr + 6, 1); // Active flag
    this.emulator.writeMemory16(nodeStateAddr + 8, 0); // Reserved
    this.emulator.writeMemory16(nodeStateAddr + 10, 0); // Reserved
    this.emulator.writeMemory16(nodeStateAddr + 12, 0); // Reserved
    this.emulator.writeMemory16(nodeStateAddr + 14, 0); // Reserved

    const state: DoorInterfaceState = {
      difaceAddr,
      bbsPortAddr,
      replyPortAddr,
      messageAddr,
      eventHookAddr,
      nameBufAddr,
      bbsInfoAddr,
      nodeBufAddr,
      nodeStateAddr,
      dataPtr,
      stringPtr,
      replyNameAddr,
      nodeId,
      stringCapacity: MESSAGE_STRING_CAPACITY,
    };

    // Store door command name in name buffer (for doors that need to know how they were launched)
    const commandName = this.getDoorCommandName();
    if (commandName) {
      this.writeCString(nameBufAddr, commandName, 16); // CLI name buffer is 16 bytes
    }

    this.interfaces.set(difaceAddr, state);
    this.emulator.setRegister(0, difaceAddr);

    // Immediately post the initial AEDoor-style message so doors that expect
    // a startup notification (e.g., XIM doors) see traffic on their reply port
    // without needing an explicit host nudge.
    this.sendInitialReadyMessage(state);

    return difaceAddr;
  }

  /**
   * DeleteComm() - LVO -36
   */
  deleteComm(): void {
    const state = this.getStateFromA1();
    if (!state) {
      return;
    }

    this.interfaces.delete(state.difaceAddr);
    if (state.replyPortAddr) {
      this.execLibrary.deleteMsgPort(state.replyPortAddr);
    }
    this.execLibrary.freeMem(state.difaceAddr, DIFACE_SIZE);
  }

  /**
   * SendCmd() - LVO -42
   */
  sendCmd(): number {
    const state = this.getStateFromA1();
    if (!state) return 0;

    const command = this.emulator.getRegister(0);
    const result = this.dispatchCommand(state, command, {
      useStringPointer: true,
    });
    this.emulator.setRegister(0, result);
    return result;
  }

  /**
   * SendStrCmd() - LVO -48
   */
  sendStrCmd(): number {
    const state = this.getStateFromA1();
    if (!state) return 0;

    const command = this.emulator.getRegister(0);
    const stringAddr = this.emulator.getRegister(8);
    const text = this.readCString(stringAddr, state.stringCapacity);
    const result = this.dispatchCommand(state, command, {
      string: text,
      useStringPointer: true,
    });
    this.emulator.setRegister(0, result);
    return result;
  }

  /**
   * SendDataCmd() - LVO -54
   */
  sendDataCmd(): number {
    const state = this.getStateFromA1();
    if (!state) return 0;

    const command = this.emulator.getRegister(0);
    const dataValue = this.emulator.getRegister(1);
    const result = this.dispatchCommand(state, command, { data: dataValue });
    this.emulator.setRegister(0, result);
    return result;
  }

  /**
   * SendStrDataCmd() - LVO -60
   */
  sendStrDataCmd(): number {
    const state = this.getStateFromA1();
    if (!state) return 0;

    const command = this.emulator.getRegister(0);
    const dataValue = this.emulator.getRegister(1);
    const stringAddr = this.emulator.getRegister(8);
    const text = this.readCString(stringAddr, state.stringCapacity);

    const result = this.dispatchCommand(state, command, {
      string: text,
      data: dataValue,
    });
    this.emulator.setRegister(0, result);
    return result;
  }

  /**
   * GetData() - LVO -66
   *
   * Returns pointer to the data field inside the jhMessage.
   */
  getData(): number {
    const state = this.getStateFromA1();
    if (!state) return 0;

    const dataPtr = this.emulator.readMemory32(
      state.difaceAddr + DIFACE_DATA_PTR_OFFSET
    );
    this.emulator.setRegister(0, dataPtr);
    return dataPtr;
  }

  /**
   * GetString() - LVO -72
   *
   * Returns pointer to the shared string buffer (jhMessage.string).
   */
  getString(): number {
    const state = this.getStateFromA1();
    if (!state) return 0;

    const stringPtr = this.emulator.readMemory32(
      state.difaceAddr + DIFACE_STRING_PTR_OFFSET
    );
    this.emulator.setRegister(0, stringPtr);
    return stringPtr;
  }

  /**
   * Prompt() - LVO -78
   */
  prompt(): number {
    const state = this.getStateFromA1();
    if (!state) return 0;

    const maxlen = this.emulator.getRegister(0);
    const promptAddr = this.emulator.getRegister(10);
    const promptText = promptAddr ? this.readCString(promptAddr, 200) : "";

    console.log(`[AEDoorLibrary] Prompt(maxlen=${maxlen}) -> "${promptText}"`);

    if (promptText.length > 0) {
      this.socket.emit("ansi-output", promptText);
    }

    this.activePrompt = {
      state,
      maxlen,
      resolve: () => {},
    };

    this.emulator.pause();
    this.emulator.setRegister(0, state.stringPtr);
    return state.stringPtr;
  }

  /**
   * WriteStr() - LVO -84
   */
  writeStr(): number {
    const state = this.getStateFromA1();
    if (!state) return 0;

    const stringAddr = this.emulator.getRegister(8);
    const mode = this.emulator.getRegister(1); // 0 = NOLF, 1 = LF
    let text = this.readCString(stringAddr, state.stringCapacity);
    if (mode) {
      text += "\r\n";
    }

    const result = this.dispatchCommand(state, XIMCommand.JH_WRITE, {
      string: text,
      useStringPointer: true,
    });

    this.emulator.setRegister(0, result);
    return result;
  }

  /**
   * ShowGFile() - LVO -90
   */
  showGFile(): number {
    const state = this.getStateFromA1();
    if (!state) return 0;

    const filenameAddr = this.emulator.getRegister(10);
    const filename = this.readCString(filenameAddr, 200);
    const result = this.dispatchCommand(state, XIMCommand.JH_SG, {
      string: filename,
      useStringPointer: true,
    });
    this.emulator.setRegister(0, result);
    return result;
  }

  /**
   * ShowFile() - LVO -96
   */
  showFile(): number {
    const state = this.getStateFromA1();
    if (!state) return 0;

    const filenameAddr = this.emulator.getRegister(10);
    const filename = this.readCString(filenameAddr, 200);
    const result = this.dispatchCommand(state, XIMCommand.JH_SF, {
      string: filename,
      useStringPointer: true,
    });
    this.emulator.setRegister(0, result);
    return result;
  }

  /**
   * SetDT() - LVO -102
   */
  setDT(): number {
    const state = this.getStateFromA1();
    if (!state) return 0;

    const dataType = this.emulator.getRegister(0);
    const valueAddr = this.emulator.getRegister(10);
    const value = this.readCString(valueAddr, state.stringCapacity);

    const result = this.dispatchCommand(state, dataType, {
      string: value,
      data: 0,
    });
    this.emulator.setRegister(0, result);
    return result;
  }

  /**
   * GetDT() - LVO -108
   */
  getDT(): number {
    const state = this.getStateFromA1();
    if (!state) return 0;

    const dataType = this.emulator.getRegister(0);
    const destAddr = this.emulator.getRegister(10);
    const result = this.dispatchCommand(state, dataType, {
      data: 1,
    });

    if (destAddr) {
      const value = this.readCString(state.stringPtr, state.stringCapacity);
      this.writeCString(destAddr, value, state.stringCapacity);
      this.emulator.setRegister(0, destAddr);
      return destAddr;
    }

    this.emulator.setRegister(0, state.stringPtr);
    return state.stringPtr;
  }

  /**
   * GetStr() - LVO -114
   */
  getStr(): number {
    const state = this.getStateFromA1();
    if (!state) return 0;

    const maxlen = this.emulator.getRegister(0);
    const defaultAddr = this.emulator.getRegister(10);

    if (defaultAddr) {
      const defaultStr = this.readCString(defaultAddr, state.stringCapacity);
      this.writeCString(state.stringPtr, defaultStr, state.stringCapacity);
      this.socket.emit("ansi-output", defaultStr);
    }

    this.activePrompt = {
      state,
      maxlen,
      resolve: () => {},
    };

    this.emulator.pause();
    this.emulator.setRegister(0, state.stringPtr);
    return state.stringPtr;
  }

  /**
   * CopyStr() - LVO -120
   */
  copyStr(): number {
    const state = this.getStateFromA1();
    if (!state) return 0;

    const sourceAddr = this.emulator.getRegister(10);
    const maxlen = this.emulator.getRegister(0);
    const source = this.readCString(sourceAddr, maxlen);
    this.writeCString(state.stringPtr, source, state.stringCapacity);
    this.emulator.setRegister(0, state.stringPtr);
    return state.stringPtr;
  }

  /**
   * HotKey() - LVO -126
   *
   * Placeholder: returns -1 to indicate no immediate keypress.
   */
  hotKey(): number {
    this.emulator.setRegister(0, -1);
    return -1;
  }

  /**
   * PreCreateComm() - LVO -132
   * Called before door communication setup
   */
  preCreateComm(): number {
    const nodeNum = this.emulator.getRegister(0);
    console.log(`[AEDoorLibrary] PreCreateComm(node=${nodeNum})`);

    // Basic validation - could add more setup logic here
    if (nodeNum < 1 || nodeNum > 99) {
      console.warn(`[AEDoorLibrary] PreCreateComm: Invalid node number ${nodeNum}`);
      this.emulator.setRegister(0, 0);
      return -1; // Error
    }

    this.emulator.setRegister(0, 1); // Success
    return 0;
  }

  /**
   * PostDeleteComm() - LVO -138
   * Called after door communication cleanup
   */
  postDeleteComm(): number {
    const nodeNum = this.emulator.getRegister(0);
    console.log(`[AEDoorLibrary] PostDeleteComm(node=${nodeNum})`);

    // Basic cleanup validation
    if (nodeNum < 1 || nodeNum > 99) {
      console.warn(`[AEDoorLibrary] PostDeleteComm: Invalid node number ${nodeNum}`);
      this.emulator.setRegister(0, 0);
      return -1; // Error
    }

    this.emulator.setRegister(0, 1); // Success
    return 0;
  }

  /**
   * Send a properly formatted JH message to door's reply port
   */
  private sendJHMessage(state: DoorInterfaceState, command: number, data: number, strData: string): void {
    // Create properly formatted AEDoor message
    // struct Message (20 bytes) + AEDoor extension (variable size)
    const msgSize = 256; // Enough for full AEDoor message structure
    const msgAddr = this.execLibrary.allocMem(msgSize, MEMF_CLEAR);
    if (msgAddr === 0) {
      console.warn("[AEDoorLibrary] Failed to allocate JH message");
      return;
    }

    // === Exec Message Structure (20 bytes) ===
    // mn_Node.ln_Succ (4 bytes) = 0
    this.emulator.writeMemory32(msgAddr + 0, 0);
    // mn_Node.ln_Pred (4 bytes) = 0
    this.emulator.writeMemory32(msgAddr + 4, 0);
    // mn_Node.ln_Type (1 byte) = NT_MESSAGE (5)
    this.emulator.writeMemory(msgAddr + 8, 5);
    // mn_Node.ln_Pri (1 byte) = 0
    this.emulator.writeMemory(msgAddr + 9, 0);
    // mn_Node.ln_Name (4 bytes) = 0
    this.emulator.writeMemory32(msgAddr + 10, 0);
    // mn_ReplyPort (4 bytes) = state.replyPortAddr
    this.emulator.writeMemory32(msgAddr + 14, state.replyPortAddr);
    // mn_Length (2 bytes) = msgSize
    this.emulator.writeMemory16(msgAddr + 18, msgSize);

    // === AEDoor Message Extension (starts at offset 20) ===
    // command = specified command
    this.emulator.writeMemory32(msgAddr + 20, command);
    // data = specified data
    this.emulator.writeMemory32(msgAddr + 24, data);
    // string data = specified string
    if (strData) {
      for (let i = 0; i < strData.length && i < 200; i++) {
        this.emulator.writeMemory(msgAddr + 28 + i, strData.charCodeAt(i));
      }
    }
    this.emulator.writeMemory(msgAddr + 28 + (strData ? strData.length : 0), 0); // null terminator

    // Put message in door's reply port to trigger GetMsg() return
    this.execLibrary.putMsg(state.replyPortAddr, msgAddr);

    console.log(`[AEDoorLibrary] Sent JH message: command=${command}, data=0x${data.toString(16)}`);
  }

  /**
   * Send initial ready messages to door's reply port
   *
   * After CreateComm, AEDoor sends TWO messages (per express.e disassembly):
   * 1. JH_INIT (command 0) - Basic initialization notification
   * 2. JH_STAT (command 1) - Node status with user data (points to DoorInfo+0xE4)
   */
  private sendInitialReadyMessage(state: DoorInterfaceState): void {
    // Send FIRST message: JH_INIT (command 0) - Basic initialization
    this.sendJHMessage(state, 0, state.nodeId, ""); // JH_INIT with node ID

    // Send SECOND message: JH_STAT (command 1) - Node status with user data
    // Data points to DoorInfo+0xE4 (nodeStateAddr) containing node status
    this.sendJHMessage(state, 1, state.nodeStateAddr, ""); // JH_STAT with pointer to node state data

    console.log(`[AEDoorLibrary] ✅ Sent both AEDoor startup messages:`);
    console.log(`[AEDoorLibrary]   1. JH_INIT (0) - Basic initialization`);
    console.log(`[AEDoorLibrary]   2. JH_STAT (1) - Node status data at 0x${state.nodeStateAddr.toString(16)}`);
    console.log(`[AEDoorLibrary] XIM door should now receive both messages and proceed`);
  }

  /**
   * Get the door command name that launched this door
   */
  private getDoorCommandName(): string {
    // This should come from the session/command that launched the door
    // For now, return a default - this needs to be passed from the door handler
    return "UNKNOWN";
  }

  /**
   * Resolve node number from registers or session data.
   */
  private resolveNodeId(): number {
    const sessionNode =
      typeof this.sessionData?.nodeId === "number"
        ? this.sessionData.nodeId
        : 0;

    const d0 = this.emulator.getRegister(0);
    if (d0 >= 0x30 && d0 <= 0x39) {
      return d0 - 0x30;
    }

    if (d0 > 0x200) {
      const str = this.readCString(d0, 4);
      const parsed = parseInt(str, 10);
      if (!Number.isNaN(parsed)) {
        return parsed;
      }
    }

    return sessionNode;
  }

  /**
   * Locate BBS message port for this node (tries both XIM and SIM port names).
   * Per express.e:4316-4320: XIM doors use AEDoorPort{n}, SIM doors use DoorControl{n}
   */
  private findBbsPort(nodeId: number): number {
    // Try both XIM (AEDoorPort) and SIM (DoorControl) port naming conventions
    const portNames = [
      `DoorControl${nodeId}`,   // SIM/SUP/TIM/IIM - express.e:4319
      `AEDoorPort${nodeId}`,    // XIM - express.e:4317
      "DoorControl",            // Fallback simple SIM port
      "AEDoorPort"              // Fallback simple XIM port
    ];
    for (const name of portNames) {
      const addr = this.createTempCString(name);
      if (addr === 0) continue;
      const portAddr = this.execLibrary.findPort(addr);
      this.execLibrary.freeMem(addr, name.length + 1);
      if (portAddr !== 0) {
        console.log(`[AEDoorLibrary] Found BBS port "${name}" at 0x${portAddr.toString(16)}`);
        return portAddr;
      }
    }
    return 0;
  }

  /**
   * Helper: create temporary C string in emulated memory.
   */
  private createTempCString(text: string): number {
    const size = text.length + 1;
    const addr = this.execLibrary.allocMem(size, MEMF_CLEAR);
    if (addr === 0) {
      return 0;
    }
    for (let i = 0; i < text.length; i++) {
      this.emulator.writeMemory(addr + i, text.charCodeAt(i));
    }
    this.emulator.writeMemory(addr + text.length, 0);
    return addr;
  }

  /**
   * Helper: write ASCII string (NUL terminated) to emulator memory.
   */
  private writeCString(addr: number, str: string, maxLength: number): void {
    const length = Math.min(str.length, maxLength - 1);
    for (let i = 0; i < length; i++) {
      this.emulator.writeMemory(addr + i, str.charCodeAt(i));
    }
    this.emulator.writeMemory(addr + length, 0);
  }

  /**
   * Helper: read ASCII string from emulator memory.
   */
  private readCString(addr: number, maxLength: number): string {
    if (!addr) {
      return "";
    }

    const bytes: number[] = [];
    for (let i = 0; i < maxLength; i++) {
      const value = this.emulator.readMemory(addr + i);
      if (value === 0) break;
      bytes.push(value);
    }

    return String.fromCharCode(...bytes);
  }

  private clearBuffer(addr: number, length: number): void {
    for (let i = 0; i < length; i++) {
      this.emulator.writeMemory(addr + i, 0);
    }
  }

  private getStateFromA1(): DoorInterfaceState | null {
    const difaceAddr = this.emulator.getRegister(9); // A1
    if (difaceAddr === 0) {
      console.warn("[AEDoorLibrary] Missing DIFace pointer in A1");
      return null;
    }
    const state = this.interfaces.get(difaceAddr);
    if (!state) {
      console.warn(
        `[AEDoorLibrary] Unknown DIFace 0x${difaceAddr.toString(16)}`
      );
      return null;
    }
    return state;
  }

  private dispatchCommand(
    state: DoorInterfaceState,
    command: number,
    options: { string?: string; data?: number; useStringPointer?: boolean } = {}
  ): number {
    if (command === XIMCommand.JH_REGISTER) {
      const replyName = this.readCString(
        state.replyNameAddr,
        state.stringCapacity
      );
      this.writeCString(state.stringPtr, replyName, state.stringCapacity);
      options = { ...options, data: 0, useStringPointer: false };
    } else if (options.string !== undefined) {
      this.writeCString(state.stringPtr, options.string, state.stringCapacity);
    }

    if (options.useStringPointer) {
      this.emulator.writeMemory32(state.dataPtr, state.stringPtr);
    } else if (typeof options.data === "number") {
      this.emulator.writeMemory32(state.dataPtr, options.data);
    }

    this.emulator.writeMemory32(
      state.messageAddr + MESSAGE_COMMAND_OFFSET,
      command
    );
    this.emulator.writeMemory32(
      state.messageAddr + MESSAGE_REPLY_PORT_OFFSET,
      state.replyPortAddr
    );

    this.execLibrary.putMsg(state.bbsPortAddr, state.messageAddr);
    const replied = this.waitForReply(state, command);
    if (!replied) {
      return -1;
    }

    return this.emulator.readMemory32(state.dataPtr);
  }

  private waitForReply(state: DoorInterfaceState, command: number): boolean {
    for (let i = 0; i < 10000; i++) {
      const msgAddr = this.execLibrary.getMsg(state.replyPortAddr);
      if (msgAddr !== 0) {
        return true;
      }
    }
    console.warn(`[AEDoorLibrary] No reply for command ${command}`);
    return false;
  }

  /**
   * Expose string buffer pointer for tests
   */
  getStringBufferPointer(): number {
    const state = [...this.interfaces.values()][0];
    return state ? state.stringPtr : 0;
  }

  /**
   * Whether a prompt is currently active (used by emulator loop)
   */
  isWaitingForInput(): boolean {
    return this.activePrompt !== null;
  }
}
