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
    // Commodore rexxsyslib's private MsgPort initialiser. Generated LVO
    // tables mislabel this as utility.library AllocNamedObjectA; in the
    // shipped AmiExpress RexxMast binary it's a "build named MsgPort"
    // helper that takes A0=port-struct-buffer + A1=name string, sets
    // ln_Type/ln_Name/mp_*, and returns the port pointer in BOTH D0
    // and A1 so the immediately-following JSR -354(A6) AddPort sees
    // the port in A1. Without this the daemon's AREXX port never lands
    // in publicPorts.
    offset: -228,
    name: 'InitRexxPort',
    handler: (emu, lib: RexxSysLibLibrary) => {
      const portAddr = emu.getRegister(8) >>> 0; // A0
      const nameAddr = emu.getRegister(9) >>> 0; // A1
      const sigBit = lib.initRexxPort(portAddr, nameAddr);
      // Side effect: AmiExpress's RexxMast expects A1 = port on return
      // so the next AddPort fires with the correct register layout.
      // (D0 = sigbit per initRexxPort's contract — the daemon does
      // `BSET D0,D7` to build its Wait mask.)
      emu.setRegister(9, portAddr); // A1 = port
      return sigBit; // D0 = sigbit
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
