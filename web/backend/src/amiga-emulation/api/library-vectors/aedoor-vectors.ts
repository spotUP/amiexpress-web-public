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
      return lib.hotKey();
    },
  },
  {
    offset: -132, // LVO -132 (0xFF7C)
    name: "PreCreateComm",
    handler: (emu, lib: AEDoorLibrary) => {
console.log("[AEDoorLibrary][Trap] PreCreateComm intercepted");
      return lib.preCreateComm();
    },
  },
  {
    offset: -138, // LVO -138 (0xFF76)
    name: "PostDeleteComm",
    handler: (emu, lib: AEDoorLibrary) => {
      return lib.postDeleteComm();
    },
  },
  {
    offset: -24, // Some doors call this slot; provide a safe stub
    name: "Stub_-24",
    handler: () => {
console.log("[AEDoorLibrary][Trap] Stub -24 invoked");
      return 0;
    },
  },
];
