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
    offset: DD_LVO.Prompt, // Prompt(handle,Buffer,MaxLen,Mode)(d0/a0/d1/d2) -> D0=status
    name: 'Prompt',
    // Important 3 fix (DD final-review wave, 2026-08-16): the CONFIRMED
    // binding spec (thoughts/shared/research/2026-08-14_fame-dd-door-compat.md,
    // DayDream RE section, LVO -48 row) is +2(L)=A0 buffer ptr (prompt
    // text copied in by the door, answer copied back in place by the BBS)
    // and +6(L)=packed D1/D2 — there is NO A1 argument in the real
    // protocol. Verified against the real Xim.s client source (see
    // DreamDoorLibrary.prompt()'s doc comment for the exact line numbers):
    // neither of its two _LVOPrompt call sites deliberately sets A1 — one
    // leaves it pointing past a just-copied string as pure side effect,
    // the other never touches it at all. A1 below is read only as a
    // legacy/unreliable fallback for an earlier (wrong) implementation-plan
    // revision that prescribed a separate A1 prompt-text pointer;
    // DreamDoorLibrary.prompt() reads A0 first and only consults this A1
    // value if the A0 read comes back empty. Never treat A1 as
    // authoritative — it can hold garbage/residual state from a prior trap
    // call.
    handler: (emu, lib: DreamDoorLibrary) => {
      const handle = emu.getRegister(0); // D0
      const bufferAddr = emu.getRegister(8); // A0 — confirmed: prompt text in, answer out
      const promptTextAddr = emu.getRegister(9); // A1 — legacy fallback only, see note above
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
