import { Socket } from 'socket.io';
import { XIMProtocol } from '../XIMProtocol';
import { ExecLibrary } from '../api/ExecLibrary';
import { MoiraEmulator } from '../cpu/MoiraEmulator';
import { DoorConstants } from '../DoorTypes';
import { XIMMessageParser } from './messages';

export type XIMHandle = {
  msgAddr: number;
  replyPort: number;
  aedoorPort: number;
};

/**
 * Host-side XIM service for TS/Python doors.
 * Creates a single XIMProtocol instance and manages message buffers
 * so host doors can issue PutMsg/WaitPort/GetMsg just like 68k doors.
 */
export class XIMHostService {
  private emulator: MoiraEmulator;
  private exec: ExecLibrary;
  private xim!: XIMProtocol;
  private parser!: XIMMessageParser;
  private initialized = false;
  private socket: Socket;
  private bbsSession: any;
  private nodeId: number = 1;
  private doorPort: number = 0;

  private constructor(socket: Socket, bbsSession: any, emulator?: MoiraEmulator, exec?: ExecLibrary) {
    this.socket = socket;
    this.bbsSession = bbsSession || {};
    this.emulator = emulator ?? new MoiraEmulator();
    this.exec = exec ?? new ExecLibrary(this.emulator as any);
  }

  /**
   * Async factory to ensure the emulator/exec/XIM wiring is ready before use.
   */
  static async create(
    socket: Socket,
    bbsSession: any,
    options?: { emulator?: MoiraEmulator; exec?: ExecLibrary; nodeId?: number }
  ): Promise<XIMHostService> {
    const service = new XIMHostService(socket, bbsSession, options?.emulator, options?.exec);
    await service.initialize(options?.nodeId);
    return service;
  }

  private async initialize(nodeId?: number) {
    if (!this.emulator.isInitialized()) {
      await this.emulator.initialize();
    }

    // ExecBase/ports must exist for messaging to work.
    this.exec.initialize();

    this.nodeId =
      nodeId ??
      this.bbsSession?.nodeId ??
      this.bbsSession?.nodeNumber ??
      1;
    if (this.nodeId === 0) {
      this.nodeId = 1;
    }

    const portName = `AEDoorPort${this.nodeId}`;
    this.doorPort = this.exec.ensurePublicPort(portName);
    this.exec.setDoorPortAddress(this.doorPort);

    this.xim = new XIMProtocol(this.emulator, this.exec, this.socket, this.doorPort, this.bbsSession);
    this.parser = new XIMMessageParser(this.emulator);

    // Route PutMsg() traffic to the real XIM handlers, same as AmigaDoorSession does.
    this.exec.setDoorMessageCallback((portAddr: number, msgAddr: number) => {
      const parsed = this.xim.parseMessage(msgAddr);
      this.xim.handleMessage(parsed);
    });

    this.initialized = true;
  }

  private ensureReady() {
    if (!this.initialized) {
      throw new Error('XIMHostService not initialized');
    }
  }

  /** Allocate a jhMessage and reply port for a host-side door. */
  createHandle(nodeId: number): XIMHandle {
    this.ensureReady();

    const msgAddr = this.exec.allocMem(DoorConstants.MESSAGE_TOTAL_LENGTH, DoorConstants.MEMF_PUBLIC_CLEAR);
    const replyPort = this.exec.createMsgPort();
    this.emulator.writeMemory32(msgAddr + DoorConstants.MESSAGE_REPLY_PORT_OFFSET, replyPort);
    this.emulator.writeMemory16(msgAddr + DoorConstants.MESSAGE_LENGTH_OFFSET, DoorConstants.MESSAGE_TOTAL_LENGTH);
    this.emulator.writeMemory32(msgAddr + DoorConstants.MESSAGE_NODE_OFFSET, nodeId);
    this.emulator.writeMemory32(msgAddr + DoorConstants.MESSAGE_STRING_PTR_OFFSET, msgAddr + DoorConstants.MESSAGE_STRING_OFFSET);
    this.parser.clearString(msgAddr + DoorConstants.MESSAGE_STRING_OFFSET);
    return { msgAddr, replyPort, aedoorPort: this.doorPort };
  }

  /** Set message fields. */
  setCommand(handle: XIMHandle, cmd: number) {
    this.emulator.writeMemory32(handle.msgAddr + DoorConstants.MESSAGE_COMMAND_OFFSET, cmd);
  }
  setData(handle: XIMHandle, data: number) {
    this.emulator.writeMemory32(handle.msgAddr + DoorConstants.MESSAGE_DATA_OFFSET, data);
  }
  setString(handle: XIMHandle, value: string) {
    const truncated = value.slice(0, DoorConstants.MESSAGE_STRING_CAPACITY - 1);
    for (let i = 0; i < truncated.length; i++) {
      this.emulator.writeMemory(handle.msgAddr + DoorConstants.MESSAGE_STRING_OFFSET + i, truncated.charCodeAt(i));
    }
    this.emulator.writeMemory(handle.msgAddr + DoorConstants.MESSAGE_STRING_OFFSET + truncated.length, 0);
  }

  parse(handle: XIMHandle) {
    return this.parser.parseMessage(handle.msgAddr);
  }

  /** Transfer via PutMsg/WaitPort/GetMsg using the real XIMProtocol. */
  transfer(handle: XIMHandle) {
    this.ensureReady();
    this.dump('OUT', handle);
    this.exec.putMsg(handle.aedoorPort, handle.msgAddr);
    const waited = this.exec.waitPort(handle.replyPort);
    if (waited) {
      this.dump('WAIT', handle);
    }
    const got = this.exec.getMsg(handle.replyPort);
    if (got) {
      this.dump('IN', handle);
    }
  }

  private dump(prefix: string, handle: XIMHandle) {
    const parsed = this.parser.parseMessage(handle.msgAddr);
    console.log(
      `[XIMHostService] ${prefix} msg=0x${parsed.msgAddr.toString(16)} cmd=${parsed.command} data=${parsed.data} node=${parsed.nodeId} line=${parsed.lineNumber} sig=${parsed.signal} task=0x${parsed.task?.toString(16)} str="${parsed.string}"`
    );
  }
}
