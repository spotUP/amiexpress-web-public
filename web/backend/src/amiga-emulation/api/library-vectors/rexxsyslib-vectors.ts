/**
 * rexxsyslib.library function vectors
 * #78 Phase 2 — register selection per axconsts FD signatures.
 *
 * LVO Offsets (matches REXXSYSLIB_LVO_PARAMS in lvo-params.generated.ts):
 *   -126 CreateArgstring (UBYTE *string @A0, ULONG length @D0)
 *   -132 DeleteArgstring (UBYTE *argstring @A0)
 *   -138 LengthArgstring (UBYTE *argstring @A0)
 *   -144 CreateRexxMsg   (struct MsgPort *port @A0, UBYTE *ext @A1, UBYTE *host @D0)
 *   -150 DeleteRexxMsg   (struct RexxMsg *packet @A0)
 *   -156 ClearRexxMsg    (struct RexxMsg *msg @A0, ULONG count @D0)
 *   -162 FillRexxMsg     (struct RexxMsg *msg @A0, ULONG count @D0, ULONG mask @D1)
 *   -168 IsRexxMsg       (struct RexxMsg *msg @A0)
 *   -450 LockRexxBase    (ULONG resource @D0)
 *   -456 UnlockRexxBase  (ULONG resource @D0)
 *
 * MOIRA register layout: A0..A7 → registers 8..15; D0..D7 → registers 0..7.
 */

import { LibraryVector } from './types';
import { RexxSysLibLibrary } from '../RexxSysLibLibrary';

export const REXXSYSLIB_VECTORS: LibraryVector[] = [
  {
    offset: -126,
    name: 'CreateArgstring',
    handler: (emu, lib: RexxSysLibLibrary) => {
      const stringAddr = emu.getRegister(8);   // A0
      const length = emu.getRegister(0);       // D0
      return lib.createArgstring(stringAddr, length);
    },
  },
  {
    offset: -132,
    name: 'DeleteArgstring',
    handler: (emu, lib: RexxSysLibLibrary) => {
      const argstringAddr = emu.getRegister(8); // A0
      return lib.deleteArgstring(argstringAddr);
    },
  },
  {
    offset: -138,
    name: 'LengthArgstring',
    handler: (emu, lib: RexxSysLibLibrary) => {
      const argstringAddr = emu.getRegister(8); // A0
      return lib.lengthArgstring(argstringAddr);
    },
  },
  {
    offset: -144,
    name: 'CreateRexxMsg',
    handler: (emu, lib: RexxSysLibLibrary) => {
      const portAddr = emu.getRegister(8);      // A0
      const extensionAddr = emu.getRegister(9); // A1
      const hostAddr = emu.getRegister(0);      // D0
      return lib.createRexxMsg(portAddr, extensionAddr, hostAddr);
    },
  },
  {
    offset: -150,
    name: 'DeleteRexxMsg',
    handler: (emu, lib: RexxSysLibLibrary) => {
      const msgAddr = emu.getRegister(8); // A0
      return lib.deleteRexxMsg(msgAddr);
    },
  },
  {
    offset: -156,
    name: 'ClearRexxMsg',
    handler: (emu, lib: RexxSysLibLibrary) => {
      const msgAddr = emu.getRegister(8); // A0
      const count = emu.getRegister(0);   // D0
      return lib.clearRexxMsg(msgAddr, count);
    },
  },
  {
    offset: -162,
    name: 'FillRexxMsg',
    handler: (emu, lib: RexxSysLibLibrary) => {
      const msgAddr = emu.getRegister(8); // A0
      const count = emu.getRegister(0);   // D0
      const mask = emu.getRegister(1);    // D1
      return lib.fillRexxMsg(msgAddr, count, mask);
    },
  },
  {
    offset: -168,
    name: 'IsRexxMsg',
    handler: (emu, lib: RexxSysLibLibrary) => {
      const msgAddr = emu.getRegister(8); // A0
      return lib.isRexxMsg(msgAddr);
    },
  },
  {
    offset: -450,
    name: 'LockRexxBase',
    handler: (emu, lib: RexxSysLibLibrary) => {
      const resource = emu.getRegister(0); // D0
      return lib.lockRexxBase(resource);
    },
  },
  {
    offset: -456,
    name: 'UnlockRexxBase',
    handler: (emu, lib: RexxSysLibLibrary) => {
      const resource = emu.getRegister(0); // D0
      return lib.unlockRexxBase(resource);
    },
  },
];
