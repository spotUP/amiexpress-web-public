// BullsDoorHandler.ts
// Phase 4: Bulls-Specific Logic Extraction
// Handles Bulls door specific functionality, port injection, and memory management
// 2025-11-20

import { MoiraEmulator } from "../cpu/MoiraEmulator.js";
import { ExecLibrary } from "../api/ExecLibrary.js";
import { DoorConfig, DoorConstants } from "../DoorTypes.js";

export class BullsDoorHandler {
  private emulator: MoiraEmulator;
  private execLibrary: ExecLibrary;
  private config: DoorConfig;

  // Bulls-specific state
  private bullsReplyPortInjected: boolean = false;
  private bullsCreateCommPatched: boolean = false;
  private bullsControlBlockAddr: number = 0;
  private bullsInfoBufferAddr: number = 0;
  private pointerLog: string | null = null;
  private bullsHandshakeLog: string | null = null;
  private loggedInfoBufferPointer: boolean = false;
  private bullsPointerWatch: {
    info: number;
    control: number;
    handshake: number;
    nodeMirror: number;
  } = { info: 0, control: 0, handshake: 0, nodeMirror: 0 };
  private lastA4: number = 0;
  private iterationLimitPatched = false;
  private bullsPcLogCount: Record<number, number> = {};
  private bullsLastWaitPortReturnPc: number = 0;
  private bullsMessageDumpCount: number = 0;
  private bullsInputScript: string[] = ["\r\n", "1\r\n", "Q\r\n"];
  private bullsScriptIndex: number = 0;
  private handshakeValueLog: number | null = null;
  private pcWatchpoints: number[] = [0x1fca, 0x22ea, 0x2308, 0x2340, 0x234c];
  private pcLogLimit: number = 10;

  /**
   * Called each iteration (wired from lifecycle manager) to monitor Bulls loop PCs.
   */
  monitorPc(iteration: number): void {
    const pc = this.emulator.getRegister(16); // PC
    if (iteration % 10000 === 0) {
      console.log(
        `[BullsDoorHandler][PCMonitor] iter=${iteration} pc=0x${pc.toString(
          16
        )}`
      );
    }
    if (this.pcWatchpoints.includes(pc)) {
      const count = this.bullsPcLogCount[pc] || 0;
      if (count < this.pcLogLimit) {
        const d0 = this.emulator.getRegister(0);
        const d1 = this.emulator.getRegister(1);
        const d2 = this.emulator.getRegister(2);
        let d7 = this.emulator.getRegister(7);
        const a4 = this.emulator.getRegister(12);
        this.lastA4 = a4;
        // Inspect the message buffer Bulls is using (d0)
        let msgCmd = 0;
        let msgData = 0;
        let msgNode = 0;
        try {
          msgCmd = this.emulator.readMemory32(d0 + DoorConstants.MESSAGE_COMMAND_OFFSET);
          msgData = this.emulator.readMemory32(d0 + DoorConstants.MESSAGE_DATA_OFFSET);
          msgNode = this.emulator.readMemory32(d0 + DoorConstants.MESSAGE_NODE_OFFSET);
        } catch {
          /* ignore */
        }
        console.log(
          `[BullsDoorHandler][PCMonitor] iter=${iteration} pc=0x${pc.toString(
            16
          )} d0=0x${d0.toString(16)} d1=0x${d1.toString(
            16
          )} d2=0x${d2.toString(16)} d7=0x${d7.toString(
            16
          )} a4=0x${a4.toString(16)} msgCmd=0x${msgCmd.toString(
            16
          )} msgData=0x${msgData.toString(16)} msgNode=0x${msgNode.toString(16)}`
        );
        this.bullsPcLogCount[pc] = count + 1;
      }
    }
  }

  /** Expose Bulls pointer watch addresses so other components can mirror replies. */
  getPointerWatch(): {
    info: number;
    control: number;
    handshake: number;
    nodeMirror: number;
    a4?: number;
  } {
    return { ...this.bullsPointerWatch, a4: this.lastA4 };
  }

  /** Force-write cmd/data/node into a given AEDoor message buffer if nonzero. */
  writeMirror(buf: number, cmd: number, data: number, node: number): void {
    if (!buf) return;
    try {
      this.emulator.writeMemory32(buf + DoorConstants.MESSAGE_COMMAND_OFFSET, cmd);
      this.emulator.writeMemory32(buf + DoorConstants.MESSAGE_DATA_OFFSET, data);
      this.emulator.writeMemory32(buf + DoorConstants.MESSAGE_NODE_OFFSET, node);
    } catch (err) {
      console.warn('[BullsDoorHandler] Failed to mirror reply into 0x' + buf.toString(16), err);
    }
  }

  private setupPcWatchpoints(): void {
    if (!this.emulator) return;
    // Simple instruction hook: log when PC hits watchpoints
    const originalHandleIllegal = (this.emulator as any).handleIllegalInstruction?.bind(
      this.emulator
    );
    (this.emulator as any).handleIllegalInstruction = (pc: number) => {
      if (this.pcWatchpoints.includes(pc)) {
        const d0 = this.emulator.readMemory32(0);
        console.log(
          `[BullsDoorHandler][PCWatch] pc=0x${pc.toString(
            16
          )} d0=0x${d0.toString(16)}`
        );
      }
      if (originalHandleIllegal) {
        return originalHandleIllegal(pc);
      }
      return false;
    };
  }

  // Shared references (managed by parent)
  private doorInfoAddr: number = 0;
  private nodeStatusAddr: number = 0;
  private doorSummaryPtr: number = 0;
  private doorReplyPortAddr: number = 0;
  private aePortAddress: number = 0;
  private sentInitialMessage: boolean = false;

  constructor(
    emulator: MoiraEmulator,
    execLibrary: ExecLibrary,
    config: DoorConfig
  ) {
    this.emulator = emulator;
    this.execLibrary = execLibrary;
    this.config = config;

    // Instrument known Bulls loop PCs to dump state if we get stuck.
    this.setupPcWatchpoints();
  }

  // Setter methods for shared state
  setSharedState(state: {
    doorInfoAddr: number;
    nodeStatusAddr: number;
    doorSummaryPtr: number;
    doorReplyPortAddr: number;
    aePortAddress: number;
    sentInitialMessage: boolean;
    doorPortAddress?: number;
  }): void {
    this.doorInfoAddr = state.doorInfoAddr;
    this.nodeStatusAddr = state.nodeStatusAddr;
    this.doorSummaryPtr = state.doorSummaryPtr;
    this.doorReplyPortAddr = state.doorReplyPortAddr;
    this.aePortAddress = state.aePortAddress;
    this.sentInitialMessage = state.sentInitialMessage;
    if (state.doorPortAddress) {
      this.aePortAddress = state.doorPortAddress;
    }
  }

  /**
   * Bulls-specific initialization and setup
   */
  initializeBulls(): void {
    console.log("[BullsDoorHandler] Initializing Bulls door specific handlers");

    // Set up ExecLibrary callback for Bulls
    this.execLibrary.setWaitPortReturnCallback((addr: number) => {
      this.bullsLastWaitPortReturnPc = addr;
      console.log(
        `[BullsDoorHandler] Recorded WaitPort return PC 0x${addr.toString(16)}`
      );
    });

    // Loosen safety limits to observe IPC
    if (!this.iterationLimitPatched && (this.config as any)?.sharedState?.lifecycleManager) {
      try {
        (this.config as any).sharedState.lifecycleManager.setIterationLimit(500000); // 10x
        this.iterationLimitPatched = true;
        console.log('[BullsDoorHandler] Increased iteration limit to 500000 for Bulls debugging');
      } catch (e) {
        console.log('[BullsDoorHandler] Unable to patch iteration limit', e);
      }
    }
  }

  /**
   * Force message pointer for Bulls door
   */
  bullsForceMessagePointer(): void {
    console.log("[BullsDoorHandler] bullsForceMessagePointer invoked");
    if (this.bullsInfoBufferAddr === 0) {
      const a4 = this.emulator.getRegister(12);
      this.ensureDoorInfoStructure();
      this.ensureBullsControlBlock(a4);
    }
    if (this.bullsInfoBufferAddr === 0) {
      return;
    }
    const d0 = this.emulator.getRegister(0);
    if (d0 !== 0 && d0 < 0xf00000) {
      console.log(
        `[BullsDoorHandler] Bulls pointer check: D0=0x${d0.toString(
          16
        )} (no force)`
      );
      return;
    }
    if (d0 >= 0xf00000) {
      console.log(
        `[BullsDoorHandler] Bulls forced pointer: D0=0x${d0.toString(
          16
        )} replaced with info buffer`
      );
      this.emulator.setRegister(0, this.bullsInfoBufferAddr);
      const d7 = this.emulator.getRegister(7);
      this.emulator.setRegister(7, this.bullsInfoBufferAddr);
      const a4 = this.emulator.getRegister(12);
      if (a4 !== 0) {
        this.emulator.writeMemory32(a4 + 0x6c28, this.bullsInfoBufferAddr);
        this.syncBullsHandshakeTarget(a4);
      }
      if (this.doorInfoAddr !== 0) {
        this.emulator.writeMemory32(
          this.doorInfoAddr + 0xf8,
          this.bullsInfoBufferAddr
        );
        this.emulator.writeMemory32(
          this.doorInfoAddr + 0xfc,
          this.bullsInfoBufferAddr
        );
      }
      console.log(
        `[BullsDoorHandler] Forced message pointer to 0x${this.bullsInfoBufferAddr.toString(
          16
        )}`
      );
    }
  }

  /**
   * Handle Bulls-specific PC tracking and logging
   */
  logBullsPcState(pc: number): void {
    if (pc >= 0x1300 && pc <= 0x1400 && (this.bullsPcLogCount[pc] ?? 0) < 2) {
      console.log(
        `[BullsDoorHandler] PC entering handshake range: 0x${pc.toString(
          16
        )} iteration tracking`
      );
    }
    const count = this.bullsPcLogCount[pc] ?? 0;
    if (count >= 3) {
      return;
    }
    this.bullsPcLogCount[pc] = count + 1;

    const a4 = this.emulator.getRegister(12);
    if (a4 === 0) {
      return;
    }

    const infoPtr = this.emulator.readMemory32(a4 + 0x6c28);
    if (!infoPtr) {
      return;
    }

    if (pc === 0x01264) {
      const controlPtr = this.emulator.readMemory32(a4 + 0x6c24);
      const handshake = this.emulator.readMemory32(infoPtr + 0xdc);
      const e0Val = this.emulator.readMemory32(infoPtr + 0xe0);
      console.log(
        `[BullsDoorHandler] PC=0x${pc
          .toString(16)
          .padStart(4, "0")} control=0x${controlPtr.toString(
          16
        )}, info=0x${infoPtr.toString(16)}, handshake=0x${handshake.toString(
          16
        )}, e0=0x${e0Val.toString(16)}`
      );
    } else if (pc === 0x013c8) {
      const a5 = this.emulator.getRegister(13);
      const sourceStr = a5 ? this.emulator.readString(a5, 64) : "<null>";
      const infoWords: string[] = [];
      for (let offset = 0; offset < 0x18; offset += 4) {
        infoWords.push(
          `0x${this.emulator
            .readMemory32(infoPtr + offset)
            .toString(16)
            .padStart(8, "0")}`
        );
      }
      console.log(
        `[BullsDoorHandler] PC=0x${pc.toString(
          16
        )} copying string from 0x${a5.toString(
          16
        )} -> infoPtr=0x${infoPtr.toString(16)} (source="${sourceStr}")`
      );
      console.log(
        `[BullsDoorHandler]   infoPtr[0..0x14]: ${infoWords.join(" ")}`
      );
    } else if (pc === 0x01408) {
      const handshake = this.emulator.readMemory32(infoPtr + 0xdc);
      const e0Val = this.emulator.readMemory32(infoPtr + 0xe0);
      const summary = this.emulator.readString(infoPtr + 0x14, 64);
      console.log(
        `[BullsDoorHandler] PC=0x${pc.toString(
          16
        )} handshake=0x${handshake.toString(16)}, e0=0x${e0Val.toString(
          16
        )}, summary="${summary}"`
      );
    }
  }

  /**
   * Monitor Bulls handshake state
   */
  logBullsHandshakeState(pc: number): void {
    if (pc < 0x1170 || pc > 0x1286) {
      return;
    }

    const d0 = this.emulator.getRegister(0);
    const a0 = this.emulator.getRegister(8);
    const a1 = this.emulator.getRegister(9);
    const a4 = this.emulator.getRegister(12);

    const parts = [
      `pc=0x${pc.toString(16)}`,
      `d0=0x${d0.toString(16)}`,
      `a0=0x${a0.toString(16)}`,
      `a1=0x${a1.toString(16)}`,
      `a4=0x${a4.toString(16)}`,
    ];

    if (d0 !== 0) {
      try {
        const replyPort = this.emulator.readMemory32(d0 + 14);
        const length = this.emulator.readMemory16(d0 + 18);
        const command = this.emulator.readMemory32(d0 + 20);
        const dataPtr = this.emulator.readMemory32(d0 + 24);
        parts.push(
          `reply=0x${replyPort.toString(16)}`,
          `len=${length}`,
          `cmd=0x${command.toString(16)}`,
          `data=0x${dataPtr.toString(16)}`
        );
      } catch (err) {
        parts.push("cmd=<err>");
      }
    }

    const logLine = `[BullsDoorHandler][HANDSHAKE] ${parts.join(" | ")}`;
    if (this.bullsHandshakeLog !== logLine) {
      this.bullsHandshakeLog = logLine;
      console.log(logLine);
    }
  }

  /**
   * Monitor Bulls pointer changes
   */
  monitorBullsPointers(pc: number): void {
    if (pc < 0x1000 || pc > 0x20000) {
      return;
    }

    const a4 = this.emulator.getRegister(12);
    if (a4 === 0) {
      return;
    }

    const infoPtr = this.emulator.readMemory32(a4 + 0x6c28);
    if (infoPtr !== this.bullsPointerWatch.info) {
      this.bullsPointerWatch.info = infoPtr;
      console.log(
        `[BullsDoorHandler][POINTER] pc=0x${pc.toString(
          16
        )} set 0x6c28 -> 0x${infoPtr.toString(16)}`
      );
      if (infoPtr === 0 && this.bullsInfoBufferAddr !== 0) {
        this.emulator.writeMemory32(a4 + 0x6c28, this.bullsInfoBufferAddr);
      }
    }

    const controlPtr = this.emulator.readMemory32(a4 + 0x6c24);
    if (controlPtr !== this.bullsPointerWatch.control) {
      this.bullsPointerWatch.control = controlPtr;
      console.log(
        `[BullsDoorHandler][POINTER] pc=0x${pc.toString(
          16
        )} set 0x6c24 -> 0x${controlPtr.toString(16)}`
      );
      // If door cleared the control pointer, restore it so XIM can keep working
      if (controlPtr === 0 && this.bullsControlBlockAddr !== 0) {
        this.emulator.writeMemory32(a4 + 0x6c24, this.bullsControlBlockAddr);
        this.syncBullsHandshakeTarget(a4);
      }
    }

    const handshakePtr = this.emulator.readMemory32(a4 + 0x6c40);
    if (handshakePtr !== this.bullsPointerWatch.handshake) {
      this.bullsPointerWatch.handshake = handshakePtr;
      console.log(
        `[BullsDoorHandler][POINTER] pc=0x${pc.toString(
          16
        )} set 0x6c40 -> 0x${handshakePtr.toString(16)}`
      );
      if (handshakePtr === 0 && this.bullsInfoBufferAddr !== 0) {
        const target = this.emulator.readMemory32(
          this.bullsInfoBufferAddr + 0xe0
        );
        if (target !== 0) {
          this.emulator.writeMemory32(a4 + 0x6c40, target);
        }
      }
    }

    const nodeMirror = this.emulator.readMemory32(a4 + 0x6c2c);
    if (nodeMirror !== this.bullsPointerWatch.nodeMirror) {
      this.bullsPointerWatch.nodeMirror = nodeMirror;
      console.log(
        `[BullsDoorHandler][POINTER] pc=0x${pc.toString(
          16
        )} set 0x6c2c -> 0x${nodeMirror.toString(16)}`
      );
    }
  }

  /**
   * Inject reply port directly into Bulls door data structures
   */
  injectBullsReplyPort(): void {
    console.log("[BullsDoorHandler] === INJECTING BULLS REPLY PORT ===");

    // Get A4 (Bulls data segment base)
    const a4 = this.emulator.getRegister(12);
    if (a4 === 0) {
      console.error(
        "[BullsDoorHandler] A4 register is 0 - cannot inject reply port"
      );
      return;
    }

    console.log(`[BullsDoorHandler] A4 (data segment) = 0x${a4.toString(16)}`);

    // Create reply port if not already created
    if (this.doorReplyPortAddr === 0) {
      this.doorReplyPortAddr = this.execLibrary.createMsgPort();
      console.log(
        `[BullsDoorHandler] Created reply port at 0x${this.doorReplyPortAddr.toString(
          16
        )}`
      );
    } else {
      console.log(
        `[BullsDoorHandler] Reusing reply port at 0x${this.doorReplyPortAddr.toString(
          16
        )}`
      );
    }

    this.ensureDoorInfoStructure();
    this.ensureBullsControlBlock(a4);

    if (this.doorInfoAddr) {
      this.emulator.writeMemory32(a4 + 0x6c20, this.doorInfoAddr);
    }
    if (this.doorReplyPortAddr) {
      this.emulator.writeMemory32(a4 + 0x6c1c, this.doorReplyPortAddr);
    }

    // Bulls stores the reply port across several data-structure slots
    const bullsReplyPortOffsets = [0x450, 0x474, 0x720, 0x800, 0x9a4, 0x9a8];

    console.log(
      "[BullsDoorHandler] Injecting reply port into Bulls data structure:"
    );
    bullsReplyPortOffsets.forEach((offset) => {
      const addr = a4 + offset;
      this.emulator.writeMemory32(addr, this.doorReplyPortAddr);
      console.log(
        `[BullsDoorHandler]   A4+0x${offset.toString(
          16
        )} = 0x${this.doorReplyPortAddr.toString(16)}`
      );
    });

    // Also inject BBS port (AEDoorPort)
    if (this.aePortAddress !== 0) {
      const bbsPortOffsets = [0x44c, 0x57c, 0x5b8, 0x6a0];
      console.log(
        "[BullsDoorHandler] Injecting BBS port into Bulls data structure:"
      );
      bbsPortOffsets.forEach((offset) => {
        const addr = a4 + offset;
        this.emulator.writeMemory32(addr, this.aePortAddress);
        console.log(
          `[BullsDoorHandler]   A4+0x${offset.toString(
            16
          )} = 0x${this.aePortAddress.toString(16)}`
        );
      });
    }

    // Verify injection
    console.log("[BullsDoorHandler] Verification:");
    const verifyOffsets = [0x44c, 0x450, 0x474];
    verifyOffsets.forEach((offset) => {
      const value = this.emulator.readMemory32(a4 + offset);
      console.log(
        `[BullsDoorHandler]   A4+0x${offset.toString(16)} = 0x${value.toString(
          16
        )}`
      );
    });

    console.log(
      "[BullsDoorHandler] === BULLS REPLY PORT INJECTION COMPLETE ==="
    );
    if (this.bullsInfoBufferAddr !== 0) {
      const handshakeTarget = this.emulator.readMemory32(
        this.bullsInfoBufferAddr + 0xe0
      );
      if (handshakeTarget !== 0) {
        this.emulator.writeMemory32(a4 + 0x6c40, handshakeTarget);
        console.log(
          `[BullsDoorHandler] Initial handshake target set to 0x${handshakeTarget.toString(
            16
          )}`
        );
      }
    }
    console.log(
      "[BullsDoorHandler] Bulls should now have reply port for XIM communication"
    );

    this.bullsReplyPortInjected = true;
  }

  /**
   * Refresh Bulls door pointers
   */
  refreshBullsDoorPointers(): void {
    const a4 = this.emulator.getRegister(12);
    if (a4 === 0) {
      return;
    }

    if (this.doorReplyPortAddr) {
      const currentReply = this.emulator.readMemory32(a4 + 0x6c1c);
      if (currentReply !== this.doorReplyPortAddr) {
        this.emulator.writeMemory32(a4 + 0x6c1c, this.doorReplyPortAddr);
      }
    }

    if (this.doorInfoAddr) {
      const currentInfo = this.emulator.readMemory32(a4 + 0x6c20);
      if (currentInfo !== this.doorInfoAddr) {
        this.emulator.writeMemory32(a4 + 0x6c20, this.doorInfoAddr);
      }
    }

    if (this.bullsControlBlockAddr) {
      const currentControl = this.emulator.readMemory32(a4 + 0x6c24);
      if (currentControl !== this.bullsControlBlockAddr) {
        this.emulator.writeMemory32(a4 + 0x6c24, this.bullsControlBlockAddr);
      }
      this.syncBullsHandshakeTarget(a4);
      if (!this.loggedInfoBufferPointer) {
        console.log(
          `[BullsDoorHandler] bullsInfoBufferAddr property = 0x${this.bullsInfoBufferAddr.toString(
            16
          )}`
        );
        this.loggedInfoBufferPointer = true;
      }
      const infoPointer = this.emulator.readMemory32(a4 + 0x6c28);
      const logLine = `[BullsDoorHandler] A4+0x6c24=0x${currentControl.toString(
        16
      )}, 0x6c28=0x${infoPointer.toString(16)}/0x6c2c=0x${this.emulator
        .readMemory32(a4 + 0x6c2c)
        .toString(16)}/0x6c40=0x${this.emulator
        .readMemory32(a4 + 0x6c40)
        .toString(16)}`;
      if (this.pointerLog !== logLine) {
        this.pointerLog = logLine;
        console.log(logLine);
      }
    }

    if (this.bullsInfoBufferAddr) {
      const currentInfo = this.emulator.readMemory32(a4 + 0x6c28);
      if (currentInfo !== this.bullsInfoBufferAddr) {
        this.emulator.writeMemory32(a4 + 0x6c28, this.bullsInfoBufferAddr);
        console.log(
          `[BullsDoorHandler] Reset A4+0x6c28 -> 0x${this.bullsInfoBufferAddr.toString(
            16
          )}`
        );
      }
      // Ensure handshake fields stay in "host ready" state
      this.emulator.writeMemory32(this.bullsInfoBufferAddr + 0xdc, 0xff);
      this.emulator.writeMemory32(this.bullsInfoBufferAddr + 0xe0, 0x1);
      this.emulator.writeMemory32(this.bullsInfoBufferAddr + 0xe4, 0xff);

      const handshakeValue = this.emulator.readMemory32(
        this.bullsInfoBufferAddr + 0xdc
      );
      if (handshakeValue !== this.handshakeValueLog) {
        this.handshakeValueLog = handshakeValue;
        const controlPtr = this.emulator.readMemory32(a4 + 0x6c24);
        const infoPtr = this.emulator.readMemory32(a4 + 0x6c28);
        const replyPtr = this.emulator.readMemory32(a4 + 0x6c1c);
        const bbsPort = this.emulator.readMemory32(a4 + 0x44c);
        console.log(
          `[BullsDoorHandler] handshake 0xdc=0x${handshakeValue.toString(
            16
          )} ctrl=0x${controlPtr.toString(16)} info=0x${infoPtr.toString(
            16
          )} reply=0x${replyPtr.toString(16)} bbsPort=0x${bbsPort.toString(16)}`
        );
      }
    }
  }

  /**
   * Inject keyboard input for Bulls door
   */
  injectBullsKeyboardInput(): void {
    console.log(
      "[BullsDoorHandler] === INJECTING KEYBOARD INPUT FOR BULLS DOOR ==="
    );

    const payload = this.bullsInputScript[this.bullsScriptIndex] ?? "\r\n";
    this.bullsScriptIndex++;

    // The actual input injection would be handled by the parent class
    // This is just for logging and state management
    console.log(
      `[BullsDoorHandler] Sending scripted input: ${JSON.stringify(payload)}`
    );

    console.log("[BullsDoorHandler] === KEYBOARD INPUT INJECTION COMPLETE ===");
  }

  /**
   * Force-send a startup message to Bulls if it never registers.
   */
  forceStartupMessage(execLibrary: ExecLibrary): void {
    // Placeholder for future implementation if needed
  }

  /**
   * Check if this is a Bulls door
   */
  isBullsDoor(): boolean {
    return this.config.executablePath.toLowerCase().includes("bull");
  }

  /**
   * Check if Bulls reply port has been injected
   */
  hasBullsReplyPortBeenInjected(): boolean {
    return this.bullsReplyPortInjected;
  }

  // Private helper methods
  private ensureDoorInfoStructure(): void {
    console.log(
      `[BullsDoorHandler] ensureDoorInfoStructure invoked (exec=${!!this
        .execLibrary}, emu=${!!this.emulator}, bulls=${this.isBullsDoor()})`
    );
    if (!this.execLibrary || !this.emulator || !this.isBullsDoor()) {
      return;
    }

    const replyName = `DoorReplyPort${this.resolveNodeId()}`;
    const bbsPortName = this.config.bbsSession?.bbsName ?? "AmiExpress";

    if (this.doorInfoAddr === 0) {
      const addr = this.execLibrary.allocMem(
        DoorConstants.DOOR_INFO_SIZE,
        DoorConstants.MEMF_PUBLIC_CLEAR
      );
      if (addr === 0) {
        console.error(
          "[BullsDoorHandler] Failed to allocate DoorInfo structure"
        );
        return;
      }
      this.doorInfoAddr = addr;

      // Use a named public port so ExecLibrary can recognize Bulls reply traffic
      // and invoke the doorMessageCallback even when Bulls sends to its own port.
      this.doorReplyPortAddr = this.execLibrary.ensurePublicPort(replyName);
    }

    const addr = this.doorInfoAddr;
    const messageAddr = addr + DoorConstants.DOOR_INFO_MESSAGE_OFFSET;
    this.nodeStatusAddr = messageAddr + DoorConstants.MESSAGE_DATA_OFFSET;
    // Ensure the reply port remains registered/public so PutMsg to it triggers callbacks.
    if (this.doorReplyPortAddr !== 0) {
      this.doorReplyPortAddr = this.execLibrary.ensurePublicPort(replyName);
    }
    console.log(
      `[BullsDoorHandler] DoorInfo block prepared at 0x${addr.toString(
        16
      )}, message=0x${messageAddr.toString(
        16
      )}, nodeStatus=0x${this.nodeStatusAddr.toString(16)}`
    );

    this.doorSummaryPtr = messageAddr + DoorConstants.MESSAGE_STRING_OFFSET;

    this.emulator.writeMemory32(addr + 0x00, this.aePortAddress);
    this.emulator.writeMemory32(addr + 0x04, this.doorReplyPortAddr);
    this.emulator.writeMemory32(addr + 0x08, messageAddr);
    this.emulator.writeMemory32(
      addr + DoorConstants.DIF_DATA_PTR_OFFSET,
      this.nodeStatusAddr
    );
    this.emulator.writeMemory32(
      addr + DoorConstants.DIF_STRING_PTR_OFFSET,
      this.doorSummaryPtr
    );

    this.writeStringToMemory(addr + 0x0c, replyName, 16);
    this.writeStringToMemory(
      addr + 0x46,
      `${bbsPortName} (${this.config.bbsSession?.user?.username ?? "guest"})`,
      0x90
    );

    this.emulator.writeMemory32(
      messageAddr + DoorConstants.MESSAGE_REPLY_PORT_OFFSET,
      this.doorReplyPortAddr
    );
    this.emulator.writeMemory16(
      messageAddr + DoorConstants.MESSAGE_LENGTH_OFFSET,
      DoorConstants.MESSAGE_TOTAL_LENGTH
    );
    // Initialize a neutral JH_REGISTER message in the door info block
    const nodeId = this.resolveNodeId() || 1;
    this.emulator.writeMemory32(messageAddr + DoorConstants.MESSAGE_COMMAND_OFFSET, 1);
    this.emulator.writeMemory32(messageAddr + DoorConstants.MESSAGE_DATA_OFFSET, nodeId);
    this.emulator.writeMemory32(messageAddr + DoorConstants.MESSAGE_NODE_OFFSET, nodeId);
    const strPtr = messageAddr + DoorConstants.MESSAGE_STRING_OFFSET;
    this.emulator.writeMemory32(
      messageAddr + DoorConstants.MESSAGE_STRING_PTR_OFFSET,
      strPtr
    );
    // Mirror to filler1/filler2 to match Bulls expectations.
    this.emulator.writeMemory32(
      messageAddr + DoorConstants.MESSAGE_FILLER1_OFFSET,
      strPtr
    );
    this.emulator.writeMemory32(
      messageAddr + DoorConstants.MESSAGE_FILLER2_OFFSET,
      strPtr
    );
    const seedCmd = this.emulator.readMemory32(messageAddr + DoorConstants.MESSAGE_COMMAND_OFFSET);
    const seedData = this.emulator.readMemory32(messageAddr + DoorConstants.MESSAGE_DATA_OFFSET);
    const seedNode = this.emulator.readMemory32(messageAddr + DoorConstants.MESSAGE_NODE_OFFSET);
    console.log(
      `[BullsDoorHandler][Seed] msg=0x${messageAddr.toString(
        16
      )} cmd=${seedCmd} data=${seedData} node=${seedNode}`
    );
  }

  private ensureBullsControlBlock(a4: number): void {
    if (!this.execLibrary || !this.emulator || !this.isBullsDoor()) {
      return;
    }
    if (this.bullsControlBlockAddr === 0) {
      const size = DoorConstants.DOOR_INFO_SIZE;
      const addr = this.execLibrary.allocMem(
        size,
        DoorConstants.MEMF_PUBLIC_CLEAR | 0x2
      );
      if (addr === 0) {
        console.error(
          "[BullsDoorHandler] Failed to allocate Bulls control block"
        );
        return;
      }
      this.bullsControlBlockAddr = addr;
      this.bullsInfoBufferAddr = addr;
    }

    this.ensureBullsInfoBuffer(a4);

    if (this.bullsControlBlockAddr !== 0) {
      const nodeId = this.resolveNodeId() || 1;
      this.emulator.writeMemory32(a4 + 0x6c24, this.bullsControlBlockAddr);
      if (this.bullsInfoBufferAddr !== 0) {
        this.emulator.writeMemory32(a4 + 0x6c28, this.bullsInfoBufferAddr);
        this.syncBullsHandshakeTarget(a4);
      }
      this.writeStringToMemory(a4 + 0x61e, "BULLS DATA READY", 0x40);
      if (this.doorSummaryPtr) {
        this.emulator.writeMemory32(a4 + 0x620, this.doorSummaryPtr);
        this.emulator.writeMemory32(a4 + 0x62e, this.doorSummaryPtr);
      }
      if (this.emulator) {
        this.emulator.writeMemory32(this.bullsControlBlockAddr + 0xe0, 1);
        this.emulator.writeMemory32(this.bullsControlBlockAddr + 0xdc, nodeId);
        this.emulator.writeMemory32(this.bullsControlBlockAddr + 0xe4, nodeId);
        this.emulator.writeMemory32(this.bullsControlBlockAddr + 0xe8, 0);
        const fields = [];
        for (let offset = 0xe0; offset <= 0xe8; offset += 4) {
          fields.push(
            `0x${offset.toString(16)}=0x${this.emulator
              .readMemory32(this.bullsControlBlockAddr + offset)
              .toString(16)}`
          );
        }
        console.log(
          `[BullsDoorHandler] Control block snapshot: ${fields.join(", ")}`
        );
      }
    }
  }

  private ensureBullsInfoBuffer(a4: number): void {
    if (
      !this.execLibrary ||
      !this.emulator ||
      !this.isBullsDoor() ||
      a4 === 0 ||
      this.doorSummaryPtr === 0
    ) {
      return;
    }

    if (this.bullsInfoBufferAddr === 0 && this.bullsControlBlockAddr !== 0) {
      this.bullsInfoBufferAddr = this.bullsControlBlockAddr;
    }
    if (this.bullsInfoBufferAddr === 0) {
      console.warn(
        "[BullsDoorHandler] Info buffer address is still zero after allocation"
      );
      return;
    }

    const infoAddr = this.bullsInfoBufferAddr;
    // Clear the buffer before repopulating to avoid leftover data
    for (let offset = 0; offset < DoorConstants.DOOR_INFO_SIZE; offset += 4) {
      this.emulator.writeMemory32(infoAddr + offset, 0);
    }

    this.emulator.writeMemory(infoAddr + 0x08, 5);
    this.emulator.writeMemory16(infoAddr + 0x12, 0x0104);

    if (this.doorInfoAddr) {
      this.emulator.writeMemory32(infoAddr + 0x0e, this.doorInfoAddr);
    }

    const summaryText =
      this.emulator.readString(a4 + 0x61e, 0x40) || "BULLS DATA READY";
    this.writeStringToMemory(infoAddr + 0x14, summaryText, 0x100);

    const nodeId = this.resolveNodeId() || 1;
    this.emulator.writeMemory32(infoAddr + 0xe0, 1);
    this.emulator.writeMemory32(infoAddr + 0xdc, nodeId);
    this.emulator.writeMemory32(infoAddr + 0xe4, nodeId);
    this.emulator.writeMemory32(infoAddr + 0xe8, 0);
    this.emulator.writeMemory32(infoAddr + 0xf8, infoAddr + 0x14);
    this.emulator.writeMemory32(infoAddr + 0xfc, infoAddr + 0x14);
    console.log(
      `[BullsDoorHandler] Info buffer handshake fields: dc=0x${this.emulator
        .readMemory32(infoAddr + 0xdc)
        .toString(16)}, e0=0x${this.emulator
        .readMemory32(infoAddr + 0xe0)
        .toString(16)}, e4=0x${this.emulator
        .readMemory32(infoAddr + 0xe4)
        .toString(16)}, e8=0x${this.emulator
        .readMemory32(infoAddr + 0xe8)
        .toString(16)}`
    );
  }

  private syncBullsHandshakeTarget(a4: number): void {
    if (
      !this.emulator ||
      !this.isBullsDoor() ||
      this.bullsInfoBufferAddr === 0 ||
      a4 === 0
    ) {
      return;
    }

    const handshakeTarget = this.emulator.readMemory32(
      this.bullsInfoBufferAddr + 0xe0
    );
    if (handshakeTarget === 0) {
      return;
    }

    const currentValue = this.emulator.readMemory32(a4 + 0x6c40);
    if (currentValue !== handshakeTarget) {
      this.emulator.writeMemory32(a4 + 0x6c40, handshakeTarget);
      console.log(
        `[BullsDoorHandler] 0x6c40 updated -> 0x${handshakeTarget.toString(16)}`
      );
    }
  }

  private writeStringToMemory(
    address: number,
    value: string,
    maxLength: number
  ): void {
    if (!this.emulator) {
      return;
    }
    const truncated = value.slice(0, Math.max(0, maxLength - 1));
    for (let i = 0; i < truncated.length; i++) {
      this.emulator.writeMemory(address + i, truncated.charCodeAt(i));
    }
    this.emulator.writeMemory(address + truncated.length, 0);
  }

  private resolveNodeId(): number {
    const session = this.config.bbsSession;
    if (session) {
      if (typeof session.nodeId === "number") {
        return session.nodeId;
      }
      if (typeof session.nodeNumber === "number") {
        return session.nodeNumber;
      }
    }
    return 0;
  }
}
