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
  // Tracks the most recent live AEDoor message buffer observed in WaitPort/GetMsg
  private bullsLiveMsgAddr: number = 0;
  private pointerLog: string | null = null;
  private bullsHandshakeLog: string | null = null;
  private loggedInfoBufferPointer: boolean = false;
  private bullsPointerWatch: {
    info: number;
    control: number;
    handshake: number;
    nodeMirror: number;
    } = { info: 0, control: 0, handshake: 0, nodeMirror: 0 };
  private lastNonZeroReply: { cmd: number; data: number; node: number } | null =
    null;
  private lastDoorPortInjection: number = 0;
  private lastAEDoorBaseWritten: number = 0;
  private queuedStartupMsg: number = 0;
  private lastPollLogCount: number = 0;
  private pollTraceCount: number = 0;
  private pollCheckLogCount: number = 0;
  private forceBufferReady(buf: number): void {
    if (!buf || buf < 0x100) return;
    try {
      // Zero first byte so tst.b (a0)+ succeeds
      this.emulator.writeMemory(buf, 0);
      // Normalize length/header to an AEDoor message shape (0x104 bytes)
      this.emulator.writeMemory16(
        buf + DoorConstants.MESSAGE_LENGTH_OFFSET,
        DoorConstants.MESSAGE_TOTAL_LENGTH
      );
      // Ensure reply/string pointers are usable if caller forgot to set them
      const stringPtr =
        buf + DoorConstants.MESSAGE_STRING_OFFSET <
        buf + DoorConstants.MESSAGE_TOTAL_LENGTH
          ? buf + DoorConstants.MESSAGE_STRING_OFFSET
          : 0;
      if (stringPtr) {
        this.emulator.writeMemory32(
          buf + DoorConstants.MESSAGE_STRING_PTR_OFFSET,
          stringPtr
        );
        this.emulator.writeMemory32(buf + DoorConstants.MESSAGE_FILLER1_OFFSET, stringPtr);
        this.emulator.writeMemory32(buf + DoorConstants.MESSAGE_FILLER2_OFFSET, stringPtr);
      }
      // Populate reply port if missing
      if (this.doorReplyPortAddr) {
        this.emulator.writeMemory32(
          buf + DoorConstants.MESSAGE_REPLY_PORT_OFFSET,
          this.doorReplyPortAddr
        );
      }
      // Seed raw cmd/data/node slots too
      const seed = this.getSeedValues();
      const seedData = this.nodeStatusAddr || seed.data;
      this.emulator.writeMemory32(buf + 0x14, seed.cmd);
      this.emulator.writeMemory32(buf + 0x18, seedData);
      this.emulator.writeMemory32(buf + 0x1c, seed.node);
      this.writeFieldWithBias(buf, DoorConstants.MESSAGE_COMMAND_OFFSET, seed.cmd);
      this.writeFieldWithBias(buf, DoorConstants.MESSAGE_DATA_OFFSET, seedData);
      this.writeFieldWithBias(buf, DoorConstants.MESSAGE_NODE_OFFSET, seed.node);
    } catch {
      /* ignore */
    }
  }
  private safeRead(addr: number): number {
    try {
      return this.emulator.readMemory32(addr);
    } catch {
      return 0;
    }
  }
  private lastA4: number = 0;
  private iterationLimitPatched = false;
  private bullsPcLogCount: Record<number, number> = {};
  private bullsLastWaitPortReturnPc: number = 0;
  private bullsMessageDumpCount: number = 0;
  private bullsInputScript: string[] = ["\r\n", "1\r\n", "Q\r\n"];
  private bullsScriptIndex: number = 0;
  private handshakeValueLog: number | null = null;
  private pcWatchpoints: number[] = [
    0x1fca,
    0x22ea,
    0x2308,
    0x2340,
    0x234c,
    // Bulls polling/handshake PCs we want to log aggressively
    0x1158,
    0x118e,
    0x1190,
    0x1200,
    0x11e0,
    0x11f2,
  ];
  private pcLogLimit: number = 10;
  private lastReplyMirror: {
    cmd: number;
    data: number;
    node: number;
  } | null = null;
  private teardownLogCount: number = 0;
  private lastHandshake: {
    cmd: number;
    data: number;
    node: number;
    replyPtr?: number;
    len?: number;
  } | null = null;
  private seedOnTeardown: boolean = true;
  private seededHandshakeOnce: boolean = false;
  private readonly headerBias: number = DoorConstants.MESSAGE_HEADER_SIZE || 0;

  /** Register a message buffer as protected so Exec FreeMem ignores it. */
  private protectMessage(addr: number): void {
    if (!addr || addr < 0x100) return;
    try {
      this.execLibrary.registerProtectedMessage(addr);
    } catch {
      /* ignore */
    }
  }

  /** Derive the best available nonzero reply values for seeding. */
  private getSeedValues(): { cmd: number; data: number; node: number } {
    const fallbackNode = this.resolveNodeId() || 1;
    const seed =
      this.lastNonZeroReply ||
      (this.lastHandshake &&
      (this.lastHandshake.cmd !== 0 || this.lastHandshake.data !== 0 || this.lastHandshake.node !== 0)
        ? this.lastHandshake
        : null) ||
      this.lastReplyMirror;
    return {
      cmd: seed?.cmd ?? 1,
      data: seed?.data ?? fallbackNode,
      node: seed?.node ?? fallbackNode,
    };
  }

  /** If a buffer lacks cmd/data/node, populate it with the current seed. */
  private ensureNonZeroFields(buf: number): void {
    if (!buf) return;
    // Validate length to avoid seeding random pointers
    try {
      const len = this.emulator.readMemory16(buf + DoorConstants.MESSAGE_LENGTH_OFFSET);
      if (len < DoorConstants.MESSAGE_TOTAL_LENGTH || len > 0x2000) {
        return;
      }
    } catch {
      return;
    }
    const dc = this.readFieldWithBias(buf, DoorConstants.MESSAGE_DATA_OFFSET);
    const e0 = this.readFieldWithBias(buf, DoorConstants.MESSAGE_COMMAND_OFFSET);
    const e4 = this.readFieldWithBias(buf, DoorConstants.MESSAGE_NODE_OFFSET);
    if (dc !== 0 || e0 !== 0 || e4 !== 0) {
      return;
    }
    const seed = this.getSeedValues();
    this.writeFieldWithBias(buf, DoorConstants.MESSAGE_COMMAND_OFFSET, seed.cmd);
    this.writeFieldWithBias(buf, DoorConstants.MESSAGE_DATA_OFFSET, seed.data);
    this.writeFieldWithBias(buf, DoorConstants.MESSAGE_NODE_OFFSET, seed.node);
    this.lastNonZeroReply = { ...seed };
  }

  /** Ensure Bulls' data segment has the correct BBS port pointers. */
  private ensureDoorPortPointers(a4: number): void {
    const portAddr =
      this.aePortAddress && this.aePortAddress >= 0x100
        ? this.aePortAddress
        : 0;
    if (!a4 || !portAddr) {
      return;
    }
    const offsets = [0x44c, 0x57c, 0x5b8, 0x6a0];
    let wrote = false;
    for (const off of offsets) {
      try {
        this.emulator.writeMemory32(a4 + off, portAddr);
        wrote = true;
      } catch {
        /* ignore */
      }
    }
    if (wrote && this.lastDoorPortInjection !== portAddr) {
      this.lastDoorPortInjection = portAddr;
      console.log(
        `[BullsDoorHandler] Door port pointers set to 0x${portAddr.toString(
          16
        )} at a4 offsets ${offsets
          .map((o) => `0x${o.toString(16)}`)
          .join(",")}`
      );
    }
  }

  /** Ensure Bulls keeps a valid AEDoor.library base pointer in its data segment. */
  private injectAEDoorBasePointer(): void {
    const base = this.execLibrary.getLibraryBase("AEDoor.library");
    if (!base) {
      return;
    }
    const a4 = this.emulator.getRegister(12);
    if (!a4) {
      return;
    }
    const offsets = [0x988];
    let wrote = false;
    for (const offset of offsets) {
      try {
        const current = this.safeRead(a4 + offset);
        if (current !== base) {
          this.emulator.writeMemory32(a4 + offset, base);
          wrote = true;
          console.log(
            `[BullsDoorHandler] A4+0x${offset.toString(
              16
            )} set to AEDoor base 0x${base.toString(16)}`
          );
        }
      } catch {
        /* ignore */
      }
    }
    if (wrote || this.lastAEDoorBaseWritten !== base) {
      this.lastAEDoorBaseWritten = base;
    }
  }

  /**
   * If Bulls is peeking at a message buffer (d0/a1), mirror the queued startup
   * message fields into that buffer so the door sees the pending command.
   */
  private mirrorQueuedMessageIfAvailable(target: number): void {
    if (!target || target < 0x100) return;
    if (!this.queuedStartupMsg || this.queuedStartupMsg < 0x100) return;
    try {
      const cmd = this.emulator.readMemory32(this.queuedStartupMsg + DoorConstants.MESSAGE_COMMAND_OFFSET) || 1;
    const data =
      this.emulator.readMemory32(this.queuedStartupMsg + DoorConstants.MESSAGE_DATA_OFFSET) ||
      this.nodeStatusAddr ||
      this.resolveNodeId() ||
      1;
    const node = this.emulator.readMemory32(this.queuedStartupMsg + DoorConstants.MESSAGE_NODE_OFFSET) || this.resolveNodeId() || 1;
    // Force-set full register reply shape (len/cmd/data/node/reply) per express.e ReplyMsg
    this.writeFieldWithBias(target, DoorConstants.MESSAGE_COMMAND_OFFSET, cmd);
    this.writeFieldWithBias(
      target,
      DoorConstants.MESSAGE_DATA_OFFSET,
      data || this.nodeStatusAddr || 1
    );
    this.writeFieldWithBias(target, DoorConstants.MESSAGE_NODE_OFFSET, node);
    // Bulls also reads from the raw offsets without bias; seed them too.
    this.emulator.writeMemory32(target + 0x14, cmd);
    this.emulator.writeMemory32(target + 0x18, data || this.nodeStatusAddr || 1);
    this.emulator.writeMemory32(target + 0x1c, this.resolveNodeId() || 1);
    // Normalize message header: ln_Type=NT_MESSAGE (5), ln_Pri=0, length=0x104
    this.emulator.writeMemory32(target + 0x0, 0); // ln_Succ
    this.emulator.writeMemory32(target + 0x4, 0); // ln_Pred
    this.emulator.writeMemory(target + 0x8, 5); // ln_Type = NT_MESSAGE
    this.emulator.writeMemory(target + 0x9, 0); // ln_Pri
    this.emulator.writeMemory32(target + 0xa, 0); // ln_Name
    this.emulator.writeMemory16(target + DoorConstants.MESSAGE_LENGTH_OFFSET, DoorConstants.MESSAGE_TOTAL_LENGTH);
      // Point string ptr to embedded buffer
      this.emulator.writeMemory32(
        target + DoorConstants.MESSAGE_STRING_OFFSET - 4,
        target + DoorConstants.MESSAGE_STRING_OFFSET
      );
      if (this.doorReplyPortAddr) {
        this.emulator.writeMemory32(
          target + DoorConstants.MESSAGE_REPLY_PORT_OFFSET,
          this.doorReplyPortAddr
        );
      }
      // Ensure the string pointer points inside this buffer
      this.emulator.writeMemory32(
        target + DoorConstants.MESSAGE_STRING_OFFSET - 4,
        target + DoorConstants.MESSAGE_STRING_OFFSET
      );
    } catch {
      /* ignore */
    }
  }

  private writeFieldWithBias(buf: number, offset: number, value: number): void {
    if (!buf) return;
    this.emulator.writeMemory32(buf + offset, value);
    const biasedOffset = offset + this.headerBias;
    if (this.headerBias > 0 && biasedOffset < DoorConstants.MESSAGE_TOTAL_LENGTH) {
      this.emulator.writeMemory32(buf + biasedOffset, value);
    }
    if (value !== 0) {
      const seedNode = this.resolveNodeId() || 1;
      this.lastNonZeroReply = this.lastNonZeroReply || {
        cmd: value,
        data: seedNode,
        node: seedNode,
      };
    }
  }

  private readFieldWithBias(buf: number, offset: number): number {
    if (!buf) return 0;
    const primary = this.emulator.readMemory32(buf + offset);
    const biasedOffset = offset + this.headerBias;
    if (this.headerBias > 0 && biasedOffset < DoorConstants.MESSAGE_TOTAL_LENGTH) {
      const biased = this.emulator.readMemory32(buf + biasedOffset);
      return primary !== 0 ? primary : biased;
    }
    return primary;
  }

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
        const msgAddr = d0;
        // Inspect the message buffer Bulls is using (d0)
        let msgCmd = 0;
        let msgData = 0;
        let msgNode = 0;
        try {
          msgCmd = this.emulator.readMemory32(msgAddr + DoorConstants.MESSAGE_COMMAND_OFFSET);
          msgData = this.emulator.readMemory32(msgAddr + DoorConstants.MESSAGE_DATA_OFFSET);
          msgNode = this.emulator.readMemory32(msgAddr + DoorConstants.MESSAGE_NODE_OFFSET);
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
          )} a4=0x${a4.toString(16)} a1=0x${this.emulator
            .getRegister(9)
            .toString(16)} portA4+0x44c=0x${this.safeRead(a4 + 0x44c).toString(
            16
          )} portA4+0x450=0x${this.safeRead(a4 + 0x450).toString(
            16
          )} msgCmd=0x${msgCmd.toString(16)} msgData=0x${msgData.toString(
            16
          )} msgNode=0x${msgNode.toString(16)} msgAddr=0x${msgAddr.toString(
            16
          )}`
        );
        // If Bulls is looking at a message addr, mirror the queued startup message into it
        this.mirrorQueuedMessageIfAvailable(msgAddr);
        this.bullsPcLogCount[pc] = count + 1;
      }
    }

    // Aggressive polling trace for suspected Bulls loops
    if (
      (pc >= 0x1100 && pc <= 0x1400) ||
      pc === 0x11e0 ||
      pc === 0x11f2
    ) {
      if (this.pollTraceCount < 100) {
        const d0 = this.emulator.getRegister(0);
        const a1 = this.emulator.getRegister(9);
        const a4 = this.emulator.getRegister(12);
        const msgAddr = d0 && d0 >= 0x100 ? d0 : a1 >= 0x100 ? a1 : 0;
        let cmd = 0,
          data = 0,
          node = 0;
        const len = msgAddr
          ? (() => {
              try {
                return this.emulator.readMemory16(
                  msgAddr + DoorConstants.MESSAGE_LENGTH_OFFSET
                );
              } catch {
                return 0;
              }
            })()
          : 0;
        if (msgAddr) {
          try {
            cmd = this.emulator.readMemory32(msgAddr + DoorConstants.MESSAGE_COMMAND_OFFSET);
            data = this.emulator.readMemory32(msgAddr + DoorConstants.MESSAGE_DATA_OFFSET);
            node = this.emulator.readMemory32(msgAddr + DoorConstants.MESSAGE_NODE_OFFSET);
          } catch {
            /* ignore */
          }
        }
        console.log(
          `[BullsDoorHandler][PollTrace] pc=0x${pc.toString(
            16
          )} d0=0x${d0.toString(16)} a1=0x${a1.toString(16)} a4=0x${a4.toString(
            16
          )} portA4+44c=0x${this.safeRead(a4 + 0x44c).toString(
            16
          )} portA4+450=0x${this.safeRead(a4 + 0x450).toString(
            16
          )} msg=0x${msgAddr.toString(16)} len=${len} cmd=0x${cmd.toString(
            16
          )} data=0x${data.toString(16)} node=0x${node.toString(16)}`
        );
        if (msgAddr) {
          this.mirrorQueuedMessageIfAvailable(msgAddr);
          // Force len/data/replyPort and poke D0 to the startup msg to simulate WaitPort
          this.emulator.writeMemory16(
            msgAddr + DoorConstants.MESSAGE_LENGTH_OFFSET,
            DoorConstants.MESSAGE_TOTAL_LENGTH
          );
          this.writeFieldWithBias(
            msgAddr,
            DoorConstants.MESSAGE_COMMAND_OFFSET,
            1
          );
          this.writeFieldWithBias(
            msgAddr,
            DoorConstants.MESSAGE_DATA_OFFSET,
            this.nodeStatusAddr || data || this.resolveNodeId() || 1
          );
          this.writeFieldWithBias(
            msgAddr,
            DoorConstants.MESSAGE_NODE_OFFSET,
            this.resolveNodeId() || 1
          );
          if (this.doorReplyPortAddr) {
            this.emulator.writeMemory32(
              msgAddr + DoorConstants.MESSAGE_REPLY_PORT_OFFSET,
              this.doorReplyPortAddr
            );
          }
          if (this.queuedStartupMsg && this.queuedStartupMsg >= 0x100) {
            this.emulator.setRegister(0, this.queuedStartupMsg);
          }
          // Emulate queueing: push the message into AEDoorPort and reply port queues
          try {
            const aedoorPort = this.aePortAddress || (global as any)?.currentBbsSession?.doorPort || 0;
            if (aedoorPort) {
              this.execLibrary.putMsg(aedoorPort, msgAddr, { suppressDoorCallback: true });
              // Ensure list head/tail point to this message (lh_Head->msg, lh_Tail=NULL, lh_TailPred->msg)
              this.emulator.writeMemory32(aedoorPort + 0x14, msgAddr); // lh_Head
              this.emulator.writeMemory32(aedoorPort + 0x18, 0); // lh_Tail
              this.emulator.writeMemory32(aedoorPort + 0x1c, msgAddr); // lh_TailPred
              // Clear msg ln_Succ/Pred
              this.emulator.writeMemory32(msgAddr + 0x0, 0);
              this.emulator.writeMemory32(msgAddr + 0x4, 0);
            }
            if (this.doorReplyPortAddr) {
              this.execLibrary.putMsg(this.doorReplyPortAddr, msgAddr, { suppressDoorCallback: true });
              this.emulator.writeMemory32(this.doorReplyPortAddr + 0x14, msgAddr);
              this.emulator.writeMemory32(this.doorReplyPortAddr + 0x18, 0);
              this.emulator.writeMemory32(this.doorReplyPortAddr + 0x1c, msgAddr);
              this.emulator.writeMemory32(msgAddr + 0x0, 0);
              this.emulator.writeMemory32(msgAddr + 0x4, 0);
            }
          } catch {
            /* ignore */
          }
          // Read back after forcing to verify what Bulls will see
          const chkLen = this.emulator.readMemory16(
            msgAddr + DoorConstants.MESSAGE_LENGTH_OFFSET
          );
          const chkCmd = this.readFieldWithBias(
            msgAddr,
            DoorConstants.MESSAGE_COMMAND_OFFSET
          );
          const chkData = this.readFieldWithBias(
            msgAddr,
            DoorConstants.MESSAGE_DATA_OFFSET
          );
          const chkNode = this.readFieldWithBias(
            msgAddr,
            DoorConstants.MESSAGE_NODE_OFFSET
          );
          // Ensure Bulls' buffer probe sees a terminating zero and matching handshake target
          this.emulator.writeMemory(msgAddr, 0); // first byte zero for tst.b loop
          try {
            const target = this.safeRead(this.lastA4 + 0x6c40);
            if (target) {
              this.emulator.writeMemory32(msgAddr + 0xe8, target);
            }
          } catch {
            /* ignore */
        }
        console.log(
          `[BullsDoorHandler][PollTrace][AfterWrite] msg=0x${msgAddr.toString(
            16
          )} len=${chkLen} cmd=0x${chkCmd.toString(16)} data=0x${chkData.toString(
            16
          )} node=0x${chkNode.toString(16)}`
        );
        // Keep buffer in a sane state but avoid poking registers; let door consume via ReplyMsg.
        this.forceBufferReady(msgAddr);
        // Dump raw memory around message to see what Bulls might be reading
        try {
          const dump: string[] = [];
          for (let off = 0; off <= 0x40; off += 4) {
            const v = this.safeRead(msgAddr + off);
              dump.push(`0x${(msgAddr + off).toString(16)}:0x${v.toString(16)}`);
            }
            console.log(
              `[BullsDoorHandler][PollTrace][Dump] msg=0x${msgAddr.toString(
                16
              )} ${dump.join(" ")}`
            );
          } catch {
            /* ignore */
          }
        }
        this.pollTraceCount++;
      }
    }

    // Inspect Bulls buffer readiness loop around 0x141a-0x14e4
    if (pc >= 0x1410 && pc <= 0x1520 && this.pollCheckLogCount < 80) {
      const a0 = this.emulator.getRegister(8);
      const a4 = this.emulator.getRegister(12);
      const a5 = this.emulator.getRegister(13);
      const msgAddr = a0 && a0 >= 0x100 ? a0 : 0;
      let firstByte = -1;
      let len = 0;
      let e8 = 0;
      let cmd = 0;
      let data = 0;
      let node = 0;
      let rawCmd = 0;
      let rawData = 0;
      let rawNode = 0;
      try {
        if (msgAddr) {
          firstByte = this.emulator.readMemory(msgAddr);
          len = this.emulator.readMemory16(
            msgAddr + DoorConstants.MESSAGE_LENGTH_OFFSET
          );
          e8 = this.safeRead(msgAddr + 0xe8);
          cmd = this.readFieldWithBias(
            msgAddr,
            DoorConstants.MESSAGE_COMMAND_OFFSET
          );
          data = this.readFieldWithBias(
            msgAddr,
            DoorConstants.MESSAGE_DATA_OFFSET
          );
          node = this.readFieldWithBias(
            msgAddr,
            DoorConstants.MESSAGE_NODE_OFFSET
          );
          rawCmd = this.safeRead(msgAddr + 0x14);
          rawData = this.safeRead(msgAddr + 0x18);
          rawNode = this.safeRead(msgAddr + 0x1c);
        }
      } catch {
        /* ignore */
      }
      const ctrl1b = a5 ? this.emulator.readMemory(a5 + 0x1b) : 0;
      const ctrl0c = a5 ? this.safeRead(a5 + 0xc) : 0;
      const ctrl10 = a5 ? this.safeRead(a5 + 0x10) : 0;
      const ctrl18 = a5 ? this.safeRead(a5 + 0x18) : 0;
      const handshakeTarget = a4 ? this.safeRead(a4 + 0x6c40) : 0;
      console.log(
        `[BullsDoorHandler][PollCheck] pc=0x${pc.toString(
          16
        )} a0=0x${a0.toString(16)} a4=0x${a4.toString(
          16
        )} a5=0x${a5.toString(
          16
        )} msg=0x${msgAddr.toString(16)} len=${len} first=${firstByte} e8=0x${e8.toString(
          16
        )} target=0x${handshakeTarget.toString(
          16
        )} cmd=0x${cmd.toString(16)} data=0x${data.toString(
          16
        )} node=0x${node.toString(16)} rawCmd=0x${rawCmd.toString(
          16
        )} rawData=0x${rawData.toString(16)} rawNode=0x${rawNode.toString(
          16
        )} ctrl1b=0x${ctrl1b.toString(16)} ctrl0c=0x${ctrl0c.toString(
          16
        )} ctrl10=0x${ctrl10.toString(16)} ctrl18=0x${ctrl18.toString(16)}`
      );
      this.pollCheckLogCount++;
    }

    // Bitmask readiness logs retained for debugging but no longer mutate Bulls registers.
    if (pc >= 0x3f40 && pc <= 0x3fe0 && this.pollCheckLogCount < 120) {
      let a5 = this.emulator.getRegister(13);
      const a4 = this.emulator.getRegister(12);
      const ctlFromA4 = a4 ? this.safeRead(a4 + 0x6c24) : 0;
      const choosePtr = (ptr: number | undefined | null) =>
        ptr && ptr >= 0x100 && ptr < 0x1000000 && ptr !== 0xffff ? ptr : 0;
      const ctlCandidate =
        choosePtr(ctlFromA4) ||
        choosePtr(this.bullsControlBlockAddr) ||
        choosePtr(this.bullsLiveMsgAddr) ||
        choosePtr(this.bullsInfoBufferAddr) ||
        choosePtr(this.queuedStartupMsg) ||
        choosePtr(this.doorInfoAddr ? this.doorInfoAddr + DoorConstants.DOOR_INFO_MESSAGE_OFFSET : 0);
      if (ctlCandidate) {
        a5 = ctlCandidate;
      }
      const ctrl1b = a5 ? this.emulator.readMemory(a5 + 0x1b) : 0;
      const ctrl0c = a5 ? this.safeRead(a5 + 0xc) : 0;
      const ctrl10 = a5 ? this.safeRead(a5 + 0x10) : 0;
      const ctrl18 = a5 ? this.safeRead(a5 + 0x18) : 0;
      console.log(
        `[BullsDoorHandler][BitCheck] pc=0x${pc.toString(
          16
        )} a5=0x${a5.toString(16)} ctrl1b=0x${ctrl1b.toString(
          16
        )} ctrl0c=0x${ctrl0c.toString(16)} ctrl10=0x${ctrl10.toString(
          16
        )} ctrl18=0x${ctrl18.toString(16)}`
      );
      this.pollCheckLogCount++;
    }

    // Teardown window (around FreeMem/CloseLibrary for Bulls)
    if (pc >= 0x1240 && pc <= 0x125a && this.teardownLogCount < this.pcLogLimit) {
      this.reinforcePointersForTeardown();
      // Try to seed buffers immediately when we see the handshake window
      this.seedHandshakeBuffers();
      this.dumpBuffers(
        `[BullsDoorHandler][Teardown] iter=${iteration} pc=0x${pc.toString(16)}`
      );
      this.teardownLogCount++;
    }
  }

  /**
   * Mirror the register reply fields into Bulls control/info buffers so the door
   * sees the updated command/data/node values after ReplyMsg.
   */
  mirrorRegisterReply(msg: {
    command: number;
    data: number;
    nodeId?: number;
    string?: string;
    msgAddr?: number;
  }): void {
    const node = msg.nodeId ?? this.resolveNodeId() ?? 1;
    this.lastReplyMirror = { cmd: msg.command, data: msg.data ?? node, node };
    this.lastHandshake = {
      cmd: msg.command,
      data: msg.data ?? node,
      node,
      replyPtr: msg.msgAddr,
      len: msg.string ? msg.string.length : undefined,
    };
    if (msg.command || msg.data || node) {
      this.lastNonZeroReply = { cmd: msg.command, data: msg.data ?? node, node };
    }
    if (this.bullsControlBlockAddr) {
      this.writeFieldWithBias(this.bullsControlBlockAddr, 0xe0, msg.command);
      this.writeFieldWithBias(this.bullsControlBlockAddr, 0xdc, msg.data ?? node);
      this.writeFieldWithBias(this.bullsControlBlockAddr, 0xe4, node);
      this.writeFieldWithBias(this.bullsControlBlockAddr, 0xe8, 0);
    }
    if (this.bullsInfoBufferAddr) {
      this.writeFieldWithBias(this.bullsInfoBufferAddr, 0xe0, msg.command);
      this.writeFieldWithBias(this.bullsInfoBufferAddr, 0xdc, msg.data ?? node);
      this.writeFieldWithBias(this.bullsInfoBufferAddr, 0xe4, node);
      this.writeFieldWithBias(this.bullsInfoBufferAddr, 0xe8, 0);
    }
    if (msg.msgAddr) {
      this.emulator.writeMemory32(msg.msgAddr + DoorConstants.MESSAGE_COMMAND_OFFSET, msg.command);
      this.emulator.writeMemory32(msg.msgAddr + DoorConstants.MESSAGE_DATA_OFFSET, msg.data ?? node);
      this.emulator.writeMemory32(msg.msgAddr + DoorConstants.MESSAGE_NODE_OFFSET, node);
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

  /** Expose latest live message buffer (if known). */
  getLiveMsgAddr(): number {
    return this.bullsLiveMsgAddr || this.bullsControlBlockAddr || 0;
  }

  /** Addresses that should not be freed while Bulls is running. */
  getProtectedAddrs(): number[] {
    const addrs: number[] = [];
    if (this.bullsControlBlockAddr) addrs.push(this.bullsControlBlockAddr);
    if (this.bullsInfoBufferAddr) addrs.push(this.bullsInfoBufferAddr);
    if (this.bullsLiveMsgAddr) addrs.push(this.bullsLiveMsgAddr);
    return addrs.filter((addr, idx, arr) => addr >= 0x100 && arr.indexOf(addr) === idx);
  }

  /** Pin Bulls control/info pointers to a live message buffer if available. */
  private pinControlPointers(msgPtr: number, a4: number): void {
    if (!msgPtr || msgPtr < 0x100) return;
    this.bullsControlBlockAddr = msgPtr;
    this.bullsInfoBufferAddr = msgPtr;
    this.bullsLiveMsgAddr = msgPtr;
    if (a4) {
      this.emulator.writeMemory32(a4 + 0x6c24, msgPtr);
      this.emulator.writeMemory32(a4 + 0x6c28, msgPtr);
      const handshakeTarget = this.readFieldWithBias(msgPtr, 0xe0);
      if (handshakeTarget) {
        this.emulator.writeMemory32(a4 + 0x6c40, handshakeTarget);
      }
    }
    this.protectMessage(msgPtr);
  }

  /** Force-write cmd/data/node into a given AEDoor message buffer if nonzero. */
  writeMirror(buf: number, cmd: number, data: number, node: number): void {
    if (!buf) return;
    try {
      this.writeFieldWithBias(buf, DoorConstants.MESSAGE_COMMAND_OFFSET, cmd);
      this.writeFieldWithBias(buf, DoorConstants.MESSAGE_DATA_OFFSET, data);
      this.writeFieldWithBias(buf, DoorConstants.MESSAGE_NODE_OFFSET, node);
    } catch (err) {
      console.warn('[BullsDoorHandler] Failed to mirror reply into 0x' + buf.toString(16), err);
    }
  }

  /**
   * When Bulls tears down (near pc ~0x1240), re-mirror the last reply values into
   * both control/info buffers to keep stack/data consistent.
   */
  mirrorLastReplyIntoBuffers(): void {
    if (!this.lastReplyMirror) return;
    const { cmd, data, node } = this.lastReplyMirror;
    this.writeMirror(this.bullsControlBlockAddr, cmd, data, node);
    this.writeMirror(this.bullsInfoBufferAddr, cmd, data, node);
  }

  /**
   * For teardown paths where Bulls frees its buffers, re-seed the reply/control
   * structures using the most recent reply values to reduce stack/data drift.
   */
  reinforceTeardownState(): void {
    this.mirrorLastReplyIntoBuffers();
  }

  /**
   * Ensure A4 pointers and internal state point to the most recent live
   * message buffer before FreeMem/CloseLibrary tears it down.
   */
  reinforcePointersForTeardown(): void {
    const a4 = this.emulator.getRegister(12);
    const candidate =
      (this.lastHandshake?.replyPtr && this.lastHandshake.replyPtr >= 0x100
        ? this.lastHandshake.replyPtr
        : 0) ||
      (this.bullsLiveMsgAddr && this.bullsLiveMsgAddr >= 0x100
        ? this.bullsLiveMsgAddr
        : 0) ||
      this.bullsControlBlockAddr;
    if (candidate && candidate >= 0x100) {
      this.pinControlPointers(candidate, a4);
      this.bullsControlBlockAddr = candidate;
      this.bullsInfoBufferAddr = candidate;
      this.seedInto(candidate);
    }
  }

  private seedInto(buf: number): void {
    if (!buf) return;
    const seed =
      this.lastNonZeroReply ||
      (this.lastHandshake &&
      (this.lastHandshake.cmd !== 0 || this.lastHandshake.data !== 0 || this.lastHandshake.node !== 0)
        ? this.lastHandshake
        : null) ||
      this.lastReplyMirror;
    const fallbackNode = this.resolveNodeId() || 1;
    const cmd = seed?.cmd ?? 1;
    const data = seed?.data ?? fallbackNode;
    const node = seed?.node ?? fallbackNode;
    this.writeFieldWithBias(buf, DoorConstants.MESSAGE_COMMAND_OFFSET, cmd);
    this.writeFieldWithBias(buf, DoorConstants.MESSAGE_DATA_OFFSET, data);
    this.writeFieldWithBias(buf, DoorConstants.MESSAGE_NODE_OFFSET, node);
    if (cmd || data || node) {
      this.lastNonZeroReply = { cmd, data, node };
    }
    this.protectMessage(buf);
  }

  /**
   * Debug helper: dump Bulls control/info buffer fields to console.
   */
  dumpBuffers(label: string = "[BullsDoorHandler][Dump]"): void {
    try {
      const snapshots: any = { label };
      if (this.bullsControlBlockAddr) {
        snapshots.control = {
          addr: this.bullsControlBlockAddr,
          dc: this.readFieldWithBias(this.bullsControlBlockAddr, 0xdc),
          e0: this.readFieldWithBias(this.bullsControlBlockAddr, 0xe0),
          e4: this.readFieldWithBias(this.bullsControlBlockAddr, 0xe4),
          e8: this.readFieldWithBias(this.bullsControlBlockAddr, 0xe8),
        };
      }
      if (this.bullsInfoBufferAddr) {
        snapshots.info = {
          addr: this.bullsInfoBufferAddr,
          dc: this.readFieldWithBias(this.bullsInfoBufferAddr, 0xdc),
          e0: this.readFieldWithBias(this.bullsInfoBufferAddr, 0xe0),
          e4: this.readFieldWithBias(this.bullsInfoBufferAddr, 0xe4),
          e8: this.readFieldWithBias(this.bullsInfoBufferAddr, 0xe8),
        };
      }
      if (this.lastReplyMirror) {
        snapshots.lastReply = this.lastReplyMirror;
      }
      if (this.lastHandshake) {
        snapshots.lastHandshake = this.lastHandshake;
      }
      console.log(label, JSON.stringify(snapshots));
    } catch (err) {
      console.warn(`${label} failed`, err);
    }
  }

  /**
   * Force-seed Bulls control/info buffers with the last handshake values to avoid teardown zeros.
   */
  seedTeardownFromHandshake(): void {
    if (!this.seedOnTeardown || !this.lastHandshake) {
      return;
    }
    const { cmd, data, node } = this.lastHandshake;
    this.writeMirror(this.bullsControlBlockAddr, cmd, data, node);
    this.writeMirror(this.bullsInfoBufferAddr, cmd, data, node);
  }

  /**
   * Seed during the handshake window (before teardown) to keep Bulls buffers nonzero.
   */
  seedHandshakeBuffers(): void {
    if (this.seededHandshakeOnce) return;
    if (!this.lastHandshake) return;
    const { cmd, data, node } = this.lastHandshake;
    this.writeMirror(this.bullsControlBlockAddr, cmd, data, node);
    this.writeMirror(this.bullsInfoBufferAddr, cmd, data, node);
    this.seededHandshakeOnce = true;
    console.log(
      `[BullsDoorHandler] Seeded handshake buffers cmd=0x${cmd.toString(
        16
      )} data=0x${data.toString(16)} node=${node}`
    );
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

  /** Remember the queued startup message so we can mirror it into Bulls' view. */
  setStartupMessage(msgAddr: number): void {
    this.queuedStartupMsg = msgAddr;
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
        (this.config as any).sharedState.lifecycleManager.setIterationLimit(5000000); // much higher for Bulls
        this.iterationLimitPatched = true;
        console.log('[BullsDoorHandler] Increased iteration limit to 5000000 for Bulls debugging');
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
      const handshake = this.readFieldWithBias(infoPtr, 0xdc);
      const e0Val = this.readFieldWithBias(infoPtr, 0xe0);
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
      const handshake = this.readFieldWithBias(infoPtr, 0xdc);
      const e0Val = this.readFieldWithBias(infoPtr, 0xe0);
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
    const controlPtr = a4 !== 0 ? this.emulator.readMemory32(a4 + 0x6c24) : 0;
    let msgPtr = d0 && d0 >= 0x100 ? d0 : 0;
    if (!msgPtr && a1 && a1 >= 0x100) {
      msgPtr = a1;
    }
    if (!msgPtr && controlPtr) {
      msgPtr = controlPtr;
    }
    if (!msgPtr && this.bullsControlBlockAddr) {
      msgPtr = this.bullsControlBlockAddr;
    }
    if (a4) {
      this.ensureDoorPortPointers(a4);
    }
    // Validate candidate message pointer before pinning
    let validatedMsgPtr = msgPtr;
    if (msgPtr && msgPtr >= 0x100) {
      try {
        const length = this.emulator.readMemory16(msgPtr + DoorConstants.MESSAGE_LENGTH_OFFSET);
        // Accept only plausible AEDoor message lengths (>= header size, <= a few KB)
        if (length < DoorConstants.MESSAGE_TOTAL_LENGTH || length > 0x2000) {
          // Seed the buffer to a sane AEDoor message shape and continue using it.
          this.emulator.writeMemory16(
            msgPtr + DoorConstants.MESSAGE_LENGTH_OFFSET,
            DoorConstants.MESSAGE_TOTAL_LENGTH
          );
          this.forceBufferReady(msgPtr);
        }
      } catch {
        validatedMsgPtr = 0;
      }
    }
    if (validatedMsgPtr && validatedMsgPtr >= 0x100) {
      this.pinControlPointers(validatedMsgPtr, a4);
      this.forceBufferReady(validatedMsgPtr);
      this.ensureNonZeroFields(validatedMsgPtr);
    }

    const parts = [
      `pc=0x${pc.toString(16)}`,
      `d0=0x${d0.toString(16)}`,
      `a0=0x${a0.toString(16)}`,
      `a1=0x${a1.toString(16)}`,
      `a4=0x${a4.toString(16)}`,
    ];

    if (validatedMsgPtr && validatedMsgPtr >= 0x100) {
      try {
        const replyPort = this.emulator.readMemory32(
          validatedMsgPtr + DoorConstants.MESSAGE_REPLY_PORT_OFFSET
        );
        const length = this.emulator.readMemory16(
          validatedMsgPtr + DoorConstants.MESSAGE_LENGTH_OFFSET
        );
        const command = this.emulator.readMemory32(validatedMsgPtr + 20);
        const dataPtr = this.emulator.readMemory32(validatedMsgPtr + 24);
        const cmdField = this.readFieldWithBias(
          validatedMsgPtr,
          DoorConstants.MESSAGE_COMMAND_OFFSET
        );
        const dataField = this.readFieldWithBias(
          validatedMsgPtr,
          DoorConstants.MESSAGE_DATA_OFFSET
        );
        const nodeField = this.readFieldWithBias(
          validatedMsgPtr,
          DoorConstants.MESSAGE_NODE_OFFSET
        );
        this.lastHandshake = {
          cmd: cmdField,
          data: dataField,
          node: nodeField,
          replyPtr: validatedMsgPtr,
          len: length,
        };
        this.bullsControlBlockAddr = validatedMsgPtr;
        this.bullsInfoBufferAddr = validatedMsgPtr;
        this.bullsLiveMsgAddr = validatedMsgPtr;
        if (cmdField || dataField || nodeField) {
          this.lastNonZeroReply = { cmd: cmdField, data: dataField, node: nodeField };
        }
        this.protectMessage(validatedMsgPtr);
        parts.push(
          `reply=0x${replyPort.toString(16)}`,
          `len=${length}`,
          `cmd=0x${command.toString(16)}`,
          `data=0x${dataPtr.toString(16)}`,
          `biasedCmd=0x${cmdField.toString(16)}`,
          `biasedData=0x${dataField.toString(16)}`,
          `biasedNode=0x${nodeField.toString(16)}`
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
      if (infoPtr) {
        this.bullsInfoBufferAddr = infoPtr;
        this.bullsLiveMsgAddr = infoPtr;
        this.protectMessage(infoPtr);
        this.seedInto(infoPtr);
      }
      console.log(
        `[BullsDoorHandler][POINTER] pc=0x${pc.toString(
          16
        )} set 0x6c28 -> 0x${infoPtr.toString(16)}`
      );
      if (infoPtr === 0 && this.bullsInfoBufferAddr !== 0) {
        const restore = this.bullsLiveMsgAddr || this.bullsInfoBufferAddr;
        if (restore) {
          this.emulator.writeMemory32(a4 + 0x6c28, restore);
          this.bullsInfoBufferAddr = restore;
        }
      }
    }

    const controlPtr = this.emulator.readMemory32(a4 + 0x6c24);
    if (controlPtr !== this.bullsPointerWatch.control) {
      this.bullsPointerWatch.control = controlPtr;
      if (controlPtr) {
        this.bullsControlBlockAddr = controlPtr;
        this.bullsLiveMsgAddr = controlPtr;
        this.protectMessage(controlPtr);
        this.seedInto(controlPtr);
      }
      console.log(
        `[BullsDoorHandler][POINTER] pc=0x${pc.toString(
          16
        )} set 0x6c24 -> 0x${controlPtr.toString(16)}`
      );
      // If door cleared the control pointer, restore it so XIM can keep working
      if (controlPtr === 0) {
        const restore = this.bullsLiveMsgAddr || this.bullsControlBlockAddr;
        if (restore) {
          this.emulator.writeMemory32(a4 + 0x6c24, restore);
          this.bullsControlBlockAddr = restore;
        }
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

    // Maintain AEDoor.library base pointer alongside the port pointers.
    this.injectAEDoorBasePointer();

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

    this.injectAEDoorBasePointer();

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

      const handshakeValue = this.emulator.readMemory32(
        this.bullsInfoBufferAddr + 0xdc + (this.headerBias || 0)
      );
      const commandValue = this.emulator.readMemory32(
        this.bullsInfoBufferAddr + 0xe0 + (this.headerBias || 0)
      );
      const nodeValue = this.emulator.readMemory32(
        this.bullsInfoBufferAddr + 0xe4 + (this.headerBias || 0)
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
          )} e0=0x${commandValue.toString(16)} e4=0x${nodeValue.toString(
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
    this.execLibrary.registerProtectedMessage(messageAddr);
    this.emulator.writeMemory16(
      messageAddr + DoorConstants.MESSAGE_LENGTH_OFFSET,
      DoorConstants.MESSAGE_TOTAL_LENGTH
    );
    // Initialize a neutral JH_REGISTER message in the door info block
    const nodeId = this.resolveNodeId() || 1;
    this.writeFieldWithBias(messageAddr, DoorConstants.MESSAGE_COMMAND_OFFSET, 1);
    this.writeFieldWithBias(messageAddr, DoorConstants.MESSAGE_DATA_OFFSET, nodeId);
    this.writeFieldWithBias(messageAddr, DoorConstants.MESSAGE_NODE_OFFSET, nodeId);
    const strPtr = messageAddr + DoorConstants.MESSAGE_STRING_OFFSET;
    this.writeFieldWithBias(
      messageAddr,
      DoorConstants.MESSAGE_STRING_PTR_OFFSET,
      strPtr
    );
    // Mirror to filler1/filler2 to match Bulls expectations.
    this.writeFieldWithBias(
      messageAddr,
      DoorConstants.MESSAGE_FILLER1_OFFSET,
      strPtr
    );
    this.writeFieldWithBias(
      messageAddr,
      DoorConstants.MESSAGE_FILLER2_OFFSET,
      strPtr
    );
    const seedCmd = this.readFieldWithBias(messageAddr, DoorConstants.MESSAGE_COMMAND_OFFSET);
    const seedData = this.readFieldWithBias(messageAddr, DoorConstants.MESSAGE_DATA_OFFSET);
    const seedNode = this.readFieldWithBias(messageAddr, DoorConstants.MESSAGE_NODE_OFFSET);
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
        this.writeFieldWithBias(this.bullsControlBlockAddr, 0xe0, 1);
        this.writeFieldWithBias(this.bullsControlBlockAddr, 0xdc, nodeId);
        this.writeFieldWithBias(this.bullsControlBlockAddr, 0xe4, nodeId);
        this.writeFieldWithBias(this.bullsControlBlockAddr, 0xe8, 0);
        const fields = [];
        for (let offset = 0xe0; offset <= 0xe8; offset += 4) {
          fields.push(
            `0x${offset.toString(16)}=0x${this.emulator
              .readMemory32(this.bullsControlBlockAddr + offset + (this.headerBias || 0))
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
    this.writeFieldWithBias(infoAddr, 0xe0, 1);
    this.writeFieldWithBias(infoAddr, 0xdc, nodeId);
    this.writeFieldWithBias(infoAddr, 0xe4, nodeId);
    this.writeFieldWithBias(infoAddr, 0xe8, 0);
    this.writeFieldWithBias(infoAddr, 0xf8, infoAddr + 0x14);
    this.writeFieldWithBias(infoAddr, 0xfc, infoAddr + 0x14);
    console.log(
      `[BullsDoorHandler] Info buffer handshake fields: dc=0x${this.readFieldWithBias(infoAddr, 0xdc)
        .toString(16)}, e0=0x${this.emulator
        .readMemory32(infoAddr + 0xe0 + (this.headerBias || 0))
        .toString(16)}, e4=0x${this.emulator
        .readMemory32(infoAddr + 0xe4 + (this.headerBias || 0))
        .toString(16)}, e8=0x${this.emulator
        .readMemory32(infoAddr + 0xe8 + (this.headerBias || 0))
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

    const handshakeTarget = this.readFieldWithBias(
      this.bullsInfoBufferAddr,
      0xe0
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
