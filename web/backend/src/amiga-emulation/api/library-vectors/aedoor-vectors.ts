/**
 * AEDoor.library function vectors
 *
 * ARCHITECTURAL NOTE (2026-01-08):
 * We use TRAP-BASED TypeScript implementations for AEDoor.library functions.
 *
 * HISTORY:
 * - Originally used TypeScript trap handlers (working)
 * - Attempted to use native AEDoor.library binary (Dec 2025 refactor)
 * - Native approach failed - doors exit without sending XIM messages
 * - Restored trap-based approach (Jan 2026)
 *
 * WHY TRAPS WORK BETTER:
 * - TypeScript handlers construct XIM messages directly
 * - Direct control over message port communication
 * - No dependency on native library's memory structure expectations
 * - Native library expected DoorInfo/NodeStatus structures we don't provide
 *
 * TRAP INSTALLATION:
 * - LibraryTraps.installAEDoorVectors() writes ILLEGAL (0x4AFC) at each vector
 * - When door calls library function, CPU traps and calls our TypeScript handler
 * - Handlers in this file implement CreateComm, WriteStr, HotKey, etc.
 * - Messages sent via XIMProtocol to BBS backend
 *
 * NATIVE AEDOOR.LIBRARY LVO TABLE (from aedoor.library.asm disassembly):
 * ======================================================================
 * LVO -24:  (Reserved/unknown - some doors call this)
 * LVO -30:  CreateComm()     - Allocate 326 bytes, find AEDoorPort, create reply port
 * LVO -36:  DeleteComm()     - Send JH_SHUTDOWN, cleanup ports and memory
 * LVO -42:  SendCmd(cmd)     - Send command via PutMsg, Wait for reply, GetMsg
 * LVO -48:  SendStrCmd(str,cmd) - Copy string (max 198 chars), then SendCmd
 * LVO -54:  SendDataCmd(data,cmd) - Set JHM_Data, then SendCmd
 * LVO -60:  SendStrDataCmd(str,data,cmd) - Set both string and data, SendCmd
 * LVO -66:  GetData()        - Return JHM_Data value from last reply
 * LVO -72:  GetString()      - Return ptr to JHM_String from last reply
 * LVO -78:  Prompt(str,len)  - Send JH_PM, returns string ptr or 0 if data=-1
 * LVO -84:  WriteStr(str,nl) - Send string via JH_SM, handles >198 char chunking
 * LVO -90:  ShowGFile(name)  - Send JH_SG command
 * LVO -96:  ShowFile(path)   - Send JH_SF command
 * LVO -102: SetDT(field,str) - Set user data: D1=0 (write mode)
 * LVO -108: GetDT(field)     - Get user data: D1=1 (read mode)
 * LVO -114: GetStr(field)    - Send command 0, returns string ptr or 0 if data=-1
 * LVO -120: CopyStr(dest)    - Copy dif_String to dest buffer (max 198 chars)
 * LVO -126: HotKey(prompt)   - Send JH_HK, returns char code or data if negative
 * LVO -132: PreCreateComm()  - CreateComm + partial cleanup (for testing)
 * LVO -138: PostDeleteComm() - CreateComm + JH_SHUTDOWN + full cleanup
 *
 * BLOCKING PATTERN (ALL commands):
 *   PutMsg(AEDoorPort, msg)    - Queue message to BBS
 *   mask = 1 << sigBit         - Create signal mask from reply port
 *   Wait(mask)                 - BLOCK until BBS signals
 *   GetMsg(replyPort)          - Retrieve reply message
 *
 * BBS MUST call ReplyMsg() to wake blocked doors!
 */

import { LibraryVector } from "./types";
import { AEDoorLibrary } from "../AEDoorLibrary";

export const AEDOOR_VECTORS: LibraryVector[] = [
  {
    offset: -30, // LVO -30 (0xFFE2)
    name: "CreateComm",
    handler: (emu, lib: AEDoorLibrary) => {
console.log("[AEDoorLibrary][Trap] CreateComm intercepted");
      return lib.createComm();
    },
  },
  {
    offset: -36, // LVO -36 (0xFFDC)
    name: "DeleteComm",
    handler: (emu, lib: AEDoorLibrary) => {
      lib.deleteComm();
      return 0;
    },
  },
  {
    offset: -42, // LVO -42 (0xFFD6)
    name: "SendCmd",
    handler: (emu, lib: AEDoorLibrary) => {
      return lib.sendCmd();
    },
  },
  {
    offset: -48, // LVO -48 (0xFFD0)
    name: "SendStrCmd",
    handler: (emu, lib: AEDoorLibrary) => {
      return lib.sendStrCmd();
    },
  },
  {
    offset: -54, // LVO -54 (0xFFCA)
    name: "SendDataCmd",
    handler: (emu, lib: AEDoorLibrary) => {
      return lib.sendDataCmd();
    },
  },
  {
    offset: -60, // LVO -60 (0xFFC4)
    name: "SendStrDataCmd",
    handler: (emu, lib: AEDoorLibrary) => {
      return lib.sendStrDataCmd();
    },
  },
  {
    offset: -66, // LVO -66 (0xFFBE)
    name: "GetData",
    handler: (emu, lib: AEDoorLibrary) => {
      return lib.getData();
    },
  },
  {
    offset: -72, // LVO -72 (0xFFB8)
    name: "GetString",
    handler: (emu, lib: AEDoorLibrary) => {
      return lib.getString();
    },
  },
  {
    offset: -78, // LVO -78 (0xFFB2)
    name: "Prompt",
    handler: (emu, lib: AEDoorLibrary) => {
      return lib.prompt();
    },
  },
  {
    offset: -84, // LVO -84 (0xFFAC)
    name: "WriteStr",
    handler: (emu, lib: AEDoorLibrary) => {
      return lib.writeStr();
    },
  },
  {
    offset: -90, // LVO -90 (0xFFA6)
    name: "ShowGFile",
    handler: (emu, lib: AEDoorLibrary) => {
      return lib.showGFile();
    },
  },
  {
    offset: -96, // LVO -96 (0xFFA0)
    name: "ShowFile",
    handler: (emu, lib: AEDoorLibrary) => {
      return lib.showFile();
    },
  },
  {
    offset: -102, // LVO -102 (0xFF9A)
    name: "SetDT",
    handler: (emu, lib: AEDoorLibrary) => {
      return lib.setDT();
    },
  },
  {
    offset: -108, // LVO -108 (0xFF94)
    name: "GetDT",
    handler: (emu, lib: AEDoorLibrary) => {
      return lib.getDT();
    },
  },
  {
    offset: -114, // LVO -114 (0xFF8E)
    name: "GetStr",
    handler: (emu, lib: AEDoorLibrary) => {
      return lib.getStr();
    },
  },
  {
    offset: -120, // LVO -120 (0xFF88)
    name: "CopyStr",
    handler: (emu, lib: AEDoorLibrary) => {
      return lib.copyStr();
    },
  },
  {
    offset: -126, // LVO -126 (0xFF82)
    name: "HotKey",
    handler: (emu, lib: AEDoorLibrary) => {
      // Native behavior (aedoor.library.asm lines 414-425):
      // 1. Sends JH_HK (command 6) via sendStrCmd with prompt string
      // 2. Waits for reply (blocks on Wait())
      // 3. Checks dif_Data: if negative (BMI), return data value (carrier lost)
      // 4. Otherwise returns first byte of dif_String as character code
      // 5. Sets D1=0 on exit
      console.log("[AEDoorLibrary][Trap] HotKey intercepted");
      return lib.hotKey();
    },
  },
  {
    offset: -132, // LVO -132 (0xFF7C)
    name: "PreCreateComm",
    handler: (emu, lib: AEDoorLibrary) => {
      // Native behavior (aedoor.library.asm lines 427-431):
      // Calls CreateComm, then jumps to DeleteComm's cleanup-only path (no JH_SHUTDOWN)
      // Used for initialization testing
      console.log("[AEDoorLibrary][Trap] PreCreateComm intercepted");
      return lib.preCreateComm();
    },
  },
  {
    offset: -138, // LVO -138 (0xFF76)
    name: "PostDeleteComm",
    handler: (emu, lib: AEDoorLibrary) => {
      // Native behavior (aedoor.library.asm lines 433-439):
      // Calls CreateComm, sends JH_SHUTDOWN, then full DeleteComm cleanup
      console.log("[AEDoorLibrary][Trap] PostDeleteComm intercepted");
      return lib.postDeleteComm();
    },
  },
  {
    offset: -24, // LVO -24 - Some doors call this slot; provide a safe stub
    name: "Stub_-24",
    handler: () => {
      console.log("[AEDoorLibrary][Trap] Stub -24 invoked");
      return 0;
    },
  },
];
