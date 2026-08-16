/**
 * dreamdoor.library function vectors
 * DayDream BBS door compatibility layer
 *
 * Offsets and register conventions come from `DD_LVO` in
 * `../../dd/dd-constants.ts` — the confirmed/inferred RE table recovered by
 * walking dreamdoor.library's RTF_AUTOINIT FunctionTable and cross-matching
 * Xim.s's Jsr calls against the disassembled `xim` client binary (see that
 * file's header comment and
 * thoughts/shared/research/2026-08-14_fame-dd-door-compat.md).
 *
 * The previous version of this file (pre-Task-1 RE) used plain 6-byte
 * spacing starting at -6 and a Prompt handler shaped around a
 * DreamDoorMsg wire format that was never actually wired into the trap
 * handler. None of that is carried forward — this file is a wholesale
 * rewrite against DD_LVO and DreamDoorLibrary's real method signatures.
 *
 * Register numbers follow this codebase's convention (see fame-vectors.ts /
 * aedoor-vectors.ts): D0-D7 = registers 0-7, A0-A6 = registers 8-14.
 */

import { LibraryVector } from './types';
import { DreamDoorLibrary } from '../DreamDoorLibrary';
import { DD_LVO } from '../../dd/dd-constants';

export const DREAMDOOR_VECTORS: LibraryVector[] = [
  {
    offset: DD_LVO.InitDoor, // InitDoor(NodeText)(a0) -> D0=handle
    name: 'InitDoor',
    handler: (emu, lib: DreamDoorLibrary) => {
      const nodeIdAddr = emu.getRegister(8); // A0
      return lib.initDoor(nodeIdAddr);
    },
  },
  {
    offset: DD_LVO.CloseDoor, // CloseDoor(handle)(d0)
    name: 'CloseDoor',
    handler: (emu, lib: DreamDoorLibrary) => {
      const handle = emu.getRegister(0); // D0
      return lib.closeDoor(handle);
    },
  },
  {
    offset: DD_LVO.SendString, // SendString(handle,String)(d0/a0)
    name: 'SendString',
    handler: (emu, lib: DreamDoorLibrary) => {
      const handle = emu.getRegister(0); // D0
      const stringAddr = emu.getRegister(8); // A0
      return lib.sendString(handle, stringAddr);
    },
  },
  {
    offset: DD_LVO.Prompt, // Prompt(handle,Buffer,PromptText,MaxLen,Mode)(d0/a0/a1/d1/d2) -> D0=status
    name: 'Prompt',
    // A1 (promptTextAddr) is confirmed by the LVO table, but per the
    // research doc the real Xim.s client doesn't always set A1 purposefully
    // before this call — it can be left pointing at leftover/residual
    // state from a previous call (a client-side quirk, not a protocol
    // requirement). DreamDoorLibrary.prompt() tolerates that: it reads
    // whatever's at promptTextAddr and a leading null byte (address 0, or a
    // genuinely empty residual buffer) reads back as "no prompt text"
    // rather than throwing. Never assume A1 is valid without that
    // tolerance.
    handler: (emu, lib: DreamDoorLibrary) => {
      const handle = emu.getRegister(0); // D0
      const bufferAddr = emu.getRegister(8); // A0
      const promptTextAddr = emu.getRegister(9); // A1 - may be garbage/zero, see note above
      const maxLen = emu.getRegister(1); // D1
      const mode = emu.getRegister(2); // D2
      return lib.prompt(handle, bufferAddr, promptTextAddr, maxLen, mode);
    },
  },
  {
    offset: DD_LVO.InquirePointers, // InquirePointers(handle,Buffer)(d0/a0)
    name: 'InquirePointers',
    handler: (emu, lib: DreamDoorLibrary) => {
      const handle = emu.getRegister(0); // D0
      const pointersAddr = emu.getRegister(8); // A0
      return lib.inquirePointers(pointersAddr, handle);
    },
  },
  {
    offset: DD_LVO.DisplayFile, // DisplayFile(handle,Filename,AnsiFlag)(d0/a0/d1)
    name: 'DisplayFile',
    handler: (emu, lib: DreamDoorLibrary) => {
      const handle = emu.getRegister(0); // D0
      const filenameAddr = emu.getRegister(8); // A0
      const ansiFlag = emu.getRegister(1); // D1
      return lib.displayFile(handle, filenameAddr, ansiFlag);
    },
  },
  {
    offset: DD_LVO.JoinConference, // JoinConference(handle,ConfNum)(d0/d1) -> D0=result
    name: 'JoinConference',
    handler: (emu, lib: DreamDoorLibrary) => {
      const handle = emu.getRegister(0); // D0
      const confNum = emu.getRegister(1); // D1
      return lib.joinConference(handle, confNum);
    },
  },
  {
    offset: DD_LVO.XprSend, // XprSend(handle,FileList,DeviceOverride)(d0/a0/a1) -> D0=status
    name: 'XprSend',
    handler: (emu, lib: DreamDoorLibrary) => {
      const handle = emu.getRegister(0); // D0
      const fileListAddr = emu.getRegister(8); // A0
      const deviceOverrideAddr = emu.getRegister(9); // A1
      return lib.xprSend(handle, fileListAddr, deviceOverrideAddr);
    },
  },
  {
    offset: DD_LVO.GetKey, // GetKey(handle,Flags)(d0/d1) -> D0=key code
    name: 'GetKey',
    handler: (emu, lib: DreamDoorLibrary) => {
      const handle = emu.getRegister(0); // D0
      const flags = emu.getRegister(1); // D1
      return lib.getKey(handle, flags);
    },
  },
  {
    offset: DD_LVO.ScanFileDirs, // ScanFileDirs(handle,ConfNum)(d0/d1) -> D0=status
    name: 'ScanFileDirs',
    handler: (emu, lib: DreamDoorLibrary) => {
      const handle = emu.getRegister(0); // D0
      const confNum = emu.getRegister(1); // D1
      return lib.scanFileDirs(handle, confNum);
    },
  },
  {
    offset: DD_LVO.Disconnect, // Disconnect(handle)(d0)
    name: 'Disconnect',
    handler: (emu, lib: DreamDoorLibrary) => {
      const handle = emu.getRegister(0); // D0
      return lib.disconnect(handle);
    },
  },
  {
    offset: DD_LVO.DDCommand, // DDCommand(handle,Command)(d0/a0)
    name: 'DDCommand',
    handler: (emu, lib: DreamDoorLibrary) => {
      const handle = emu.getRegister(0); // D0
      const commandAddr = emu.getRegister(8); // A0
      return lib.ddCommand(handle, commandAddr);
    },
  },
];
