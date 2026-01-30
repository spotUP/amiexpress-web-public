/**
 * dreamdoor.library function vectors
 * DayDream BBS door compatibility layer
 *
 * LVO Offsets:
 *   -6:  InitDoor
 *   -12: InquirePointers
 *   -18: Prompt
 *   -24: SendString
 *   -30: GetKey
 *   -36: DisplayFile
 *   -42: DDCommand
 *   -48: CloseDoor
 *   -54: JoinConference
 *   -60: XprSend
 *   -66: ScanFileDirs
 *   -72: Disconnect
 */

import { LibraryVector } from './types';
import { DreamDoorLibrary } from '../DreamDoorLibrary';

export const DREAMDOOR_VECTORS: LibraryVector[] = [
  {
    offset: -6, // InitDoor
    name: 'InitDoor',
    handler: (emu, lib: DreamDoorLibrary) => {
      const nodeIdAddr = emu.getRegister(8); // A0
      return lib.initDoor(nodeIdAddr);
    },
  },
  {
    offset: -12, // InquirePointers
    name: 'InquirePointers',
    handler: (emu, lib: DreamDoorLibrary) => {
      const pointersAddr = emu.getRegister(8); // A0
      const handle = emu.getRegister(0); // D0
      return lib.inquirePointers(pointersAddr, handle);
    },
  },
  {
    offset: -18, // Prompt
    name: 'Prompt',
    handler: (emu, lib: DreamDoorLibrary) => {
      const handle = emu.getRegister(0); // D0
      const msgBufferAddr = emu.getRegister(8); // A0
      const displayMode = emu.getRegister(2); // D2
      const inputMode = emu.getRegister(3); // D3
      return lib.prompt(handle, msgBufferAddr, displayMode, inputMode);
    },
  },
  {
    offset: -24, // SendString
    name: 'SendString',
    handler: (emu, lib: DreamDoorLibrary) => {
      const handle = emu.getRegister(0); // D0
      const stringAddr = emu.getRegister(8); // A0
      return lib.sendString(handle, stringAddr);
    },
  },
  {
    offset: -30, // GetKey
    name: 'GetKey',
    handler: (emu, lib: DreamDoorLibrary) => {
      const handle = emu.getRegister(0); // D0
      const promptMode = emu.getRegister(1); // D1
      return lib.getKey(handle, promptMode);
    },
  },
  {
    offset: -36, // DisplayFile
    name: 'DisplayFile',
    handler: (emu, lib: DreamDoorLibrary) => {
      const handle = emu.getRegister(0); // D0
      const filenameAddr = emu.getRegister(8); // A0
      const pauseFlag = emu.getRegister(1); // D1
      return lib.displayFile(handle, filenameAddr, pauseFlag);
    },
  },
  {
    offset: -42, // DDCommand
    name: 'DDCommand',
    handler: (emu, lib: DreamDoorLibrary) => {
      const handle = emu.getRegister(0); // D0
      const commandAddr = emu.getRegister(8); // A0
      return lib.ddCommand(handle, commandAddr);
    },
  },
  {
    offset: -48, // CloseDoor
    name: 'CloseDoor',
    handler: (emu, lib: DreamDoorLibrary) => {
      const handle = emu.getRegister(0); // D0
      return lib.closeDoor(handle);
    },
  },
  {
    offset: -54, // JoinConference
    name: 'JoinConference',
    handler: (emu, lib: DreamDoorLibrary) => {
      const handle = emu.getRegister(0); // D0
      const confNum = emu.getRegister(1); // D1
      return lib.joinConference(handle, confNum);
    },
  },
  {
    offset: -60, // XprSend
    name: 'XprSend',
    handler: (emu, lib: DreamDoorLibrary) => {
      const handle = emu.getRegister(0); // D0
      const fileBufferAddr = emu.getRegister(8); // A0
      const outputBufferAddr = emu.getRegister(9); // A1
      return lib.xprSend(handle, fileBufferAddr, outputBufferAddr);
    },
  },
  {
    offset: -66, // ScanFileDirs
    name: 'ScanFileDirs',
    handler: (emu, lib: DreamDoorLibrary) => {
      const handle = emu.getRegister(0); // D0
      const confNum = emu.getRegister(1); // D1
      return lib.scanFileDirs(handle, confNum);
    },
  },
  {
    offset: -72, // Disconnect
    name: 'Disconnect',
    handler: (emu, lib: DreamDoorLibrary) => {
      const handle = emu.getRegister(0); // D0
      return lib.disconnect(handle);
    },
  },
];
