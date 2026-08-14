/**
 * FAME.library function vectors
 * FAME BBS door compatibility layer (FIM protocol)
 *
 * Source of truth for offsets/registers:
 * amiexpress_doors/Sources/_C/FAMECFPR/Pre-Release/include/fd/FAME_lib.fd
 * (##bias 30, offset = -(30 + 6*index)).
 *
 * Only the MVP subset (through -216, plus FAMEAtol at -354) is registered
 * here. Everything beyond -216/-354 relies on the RTS-stub jump table
 * ExecLibrary installs via `stubJumpTableEntries` when fame.library is
 * opened — that's the tail safety net, not this file's job.
 *
 * LVO Offsets (registered here):
 *   -30:  FAMEStrStr          (STUB)
 *   -36:  FAMEStackReport     (STUB)
 *   -42:  FAMEStrChr          (STUB)
 *   -48:  FAMEFileCopy        (STUB)
 *   -54:  FAMEFSearch         (STUB)
 *   -60:  FAMEIsNumStr        (STUB)
 *   -66:  FAMEStrChrCase      (STUB)
 *   -72:  FAMEStrFil          (real — memset)
 *   -78:  FAMEStrMid          (STUB)
 *   -84:  FAMEStrStrCase      (STUB)
 *   -90:  FAMEAllocPooled     (STUB)
 *   -96:  FAMECreatePool      (STUB)
 *   -102: FAMEDeletePool      (STUB)
 *   -108: FAMEFreePooled      (STUB)
 *   -114: FAMEResetPool       (STUB)
 *   -120: FAMEFillMem         (real — memset)
 *   -126: FAMEChrCut          (STUB)
 *   -132: FAMEChrCutCase      (STUB)
 *   -138: FAMEStrCut          (STUB)
 *   -144: FAMEStrCutCase      (STUB)
 *   -150: FAMEStrCopy         (real)
 *   -156: FAMEPrivate1        (STUB)
 *   -162: FAMEPrivate2        (STUB)
 *   -168: FAMEPrivate3        (STUB)
 *   -174: FAMEMemSet          (real — memset)
 *   -180: FAMEPrivate4        (STUB)
 *   -186: FAMEPrivate5        (STUB)
 *   -192: FAMEPrivate6        (STUB)
 *   -198: FAMESwapRedWhite    (STUB)
 *   -204: FAMEAllocObject     (real)
 *   -210: FAMEFreeObject      (real)
 *   -216: FAMENumToStr        (STUB)
 *   -354: FAMEAtol            (real) — present in FAME_lib.fd at index 54
 *         (##bias 30 -> -(30 + 6*54) = -354); confirmed via python3 parse
 *         of the .fd, not RTS-stubbed.
 */

import { LibraryVector } from './types';
import { FameLibrary } from '../FameLibrary';

export const fameVectors: LibraryVector[] = [
  {
    offset: -30, // FAMEStrStr(Source,MatchString)(a0/a1)
    name: 'FAMEStrStr',
    handler: (_emu, lib: FameLibrary) => lib.stub('FAMEStrStr'),
  },
  {
    offset: -36, // FAMEStackReport()()
    name: 'FAMEStackReport',
    handler: (_emu, lib: FameLibrary) => lib.stub('FAMEStackReport'),
  },
  {
    offset: -42, // FAMEStrChr(Source,MatchChar)(a0/d0)
    name: 'FAMEStrChr',
    handler: (_emu, lib: FameLibrary) => lib.stub('FAMEStrChr'),
  },
  {
    offset: -48, // FAMEFileCopy(SourceFH,DestFH,SrcSize,MaxMem)(d0/d1/d2/d3)
    name: 'FAMEFileCopy',
    handler: (_emu, lib: FameLibrary) => lib.stub('FAMEFileCopy'),
  },
  {
    offset: -54, // FAMEFSearch(SearchString,SearchFH)(a0/d0)
    name: 'FAMEFSearch',
    handler: (_emu, lib: FameLibrary) => lib.stub('FAMEFSearch'),
  },
  {
    offset: -60, // FAMEIsNumStr(String)(a0)
    name: 'FAMEIsNumStr',
    handler: (_emu, lib: FameLibrary) => lib.stub('FAMEIsNumStr'),
  },
  {
    offset: -66, // FAMEStrChrCase(Source,MatchChar)(a0/d0)
    name: 'FAMEStrChrCase',
    handler: (_emu, lib: FameLibrary) => lib.stub('FAMEStrChrCase'),
  },
  {
    offset: -72, // FAMEStrFil(FillBuffer,FillChar,NumberOfChars)(a0/d0/d1)
    name: 'FAMEStrFil',
    handler: (emu, lib: FameLibrary) => {
      const bufAddr = emu.getRegister(8); // A0
      const fillChar = emu.getRegister(0); // D0
      const count = emu.getRegister(1); // D1
      lib.memSet(bufAddr, fillChar, count);
      return bufAddr;
    },
  },
  {
    offset: -78, // FAMEStrMid(Source,Destination,StartPos,NumberOfChars)(a0/a1/d1,d0)
    name: 'FAMEStrMid',
    handler: (_emu, lib: FameLibrary) => lib.stub('FAMEStrMid'),
  },
  {
    offset: -84, // FAMEStrStrCase(Source,MatchString)(a0/a1)
    name: 'FAMEStrStrCase',
    handler: (_emu, lib: FameLibrary) => lib.stub('FAMEStrStrCase'),
  },
  {
    offset: -90, // FAMEAllocPooled(ByteSize,MemAttrs,FAMEMemPool)(d0/d1/a0)
    name: 'FAMEAllocPooled',
    handler: (_emu, lib: FameLibrary) => lib.stub('FAMEAllocPooled'),
  },
  {
    offset: -96, // FAMECreatePool(PoolSize,PuddleSize,MemAttrs,Tags)(d0/d1/d2/d3)
    name: 'FAMECreatePool',
    handler: (_emu, lib: FameLibrary) => lib.stub('FAMECreatePool'),
  },
  {
    offset: -102, // FAMEDeletePool(FAMEMemPool)(a1)
    name: 'FAMEDeletePool',
    handler: (_emu, lib: FameLibrary) => lib.stub('FAMEDeletePool'),
  },
  {
    offset: -108, // FAMEFreePooled(Memory)(a1)
    name: 'FAMEFreePooled',
    handler: (_emu, lib: FameLibrary) => lib.stub('FAMEFreePooled'),
  },
  {
    offset: -114, // FAMEResetPool(FAMEMemPool)(a1)
    name: 'FAMEResetPool',
    handler: (_emu, lib: FameLibrary) => lib.stub('FAMEResetPool'),
  },
  {
    offset: -120, // FAMEFillMem(FillBuffer,FillChar,NumberOfChars)(a0/d0/d1)
    name: 'FAMEFillMem',
    handler: (emu, lib: FameLibrary) => {
      const bufAddr = emu.getRegister(8); // A0
      const fillChar = emu.getRegister(0); // D0
      const count = emu.getRegister(1); // D1
      lib.memSet(bufAddr, fillChar, count);
      return bufAddr;
    },
  },
  {
    offset: -126, // FAMEChrCut(String,CutChar,MaxSearchRange)(a0/d0/d1)
    name: 'FAMEChrCut',
    handler: (_emu, lib: FameLibrary) => lib.stub('FAMEChrCut'),
  },
  {
    offset: -132, // FAMEChrCutCase(String,CutChar,MaxSearchRange)(a0/d0/d1)
    name: 'FAMEChrCutCase',
    handler: (_emu, lib: FameLibrary) => lib.stub('FAMEChrCutCase'),
  },
  {
    offset: -138, // FAMEStrCut(String,CutString,MaxSearchRange)(a0/a1/d0)
    name: 'FAMEStrCut',
    handler: (_emu, lib: FameLibrary) => lib.stub('FAMEStrCut'),
  },
  {
    offset: -144, // FAMEStrCutCase(String,CutString,MaxSearchRange)(a0/a1/d0)
    name: 'FAMEStrCutCase',
    handler: (_emu, lib: FameLibrary) => lib.stub('FAMEStrCutCase'),
  },
  {
    offset: -150, // FAMEStrCopy(Source,Destination,MaxLen)(a0/a1/d0)
    name: 'FAMEStrCopy',
    handler: (emu, lib: FameLibrary) => {
      const srcAddr = emu.getRegister(8); // A0
      const dstAddr = emu.getRegister(9); // A1
      const maxLen = emu.getRegister(0); // D0
      return lib.strCopy(srcAddr, dstAddr, maxLen);
    },
  },
  {
    offset: -156, // FAMEPrivate1()()
    name: 'FAMEPrivate1',
    handler: (_emu, lib: FameLibrary) => lib.stub('FAMEPrivate1'),
  },
  {
    offset: -162, // FAMEPrivate2()()
    name: 'FAMEPrivate2',
    handler: (_emu, lib: FameLibrary) => lib.stub('FAMEPrivate2'),
  },
  {
    offset: -168, // FAMEPrivate3()()
    name: 'FAMEPrivate3',
    handler: (_emu, lib: FameLibrary) => lib.stub('FAMEPrivate3'),
  },
  {
    offset: -174, // FAMEMemSet(FillBuffer,FillChar,NumberOfChars)(a0/d0/d1)
    name: 'FAMEMemSet',
    handler: (emu, lib: FameLibrary) => {
      const bufAddr = emu.getRegister(8); // A0
      const fillChar = emu.getRegister(0); // D0
      const count = emu.getRegister(1); // D1
      lib.memSet(bufAddr, fillChar, count);
      return bufAddr;
    },
  },
  {
    offset: -180, // FAMEPrivate4()()
    name: 'FAMEPrivate4',
    handler: (_emu, lib: FameLibrary) => lib.stub('FAMEPrivate4'),
  },
  {
    offset: -186, // FAMEPrivate5()()
    name: 'FAMEPrivate5',
    handler: (_emu, lib: FameLibrary) => lib.stub('FAMEPrivate5'),
  },
  {
    offset: -192, // FAMEPrivate6()()
    name: 'FAMEPrivate6',
    handler: (_emu, lib: FameLibrary) => lib.stub('FAMEPrivate6'),
  },
  {
    offset: -198, // FAMESwapRedWhite(String)(a0)
    name: 'FAMESwapRedWhite',
    handler: (_emu, lib: FameLibrary) => lib.stub('FAMESwapRedWhite'),
  },
  {
    offset: -204, // FAMEAllocObject(Type)(d0)
    name: 'FAMEAllocObject',
    handler: (emu, lib: FameLibrary) => {
      const type = emu.getRegister(0); // D0
      return lib.allocObject(type);
    },
  },
  {
    offset: -210, // FAMEFreeObject(Object)(a1)
    name: 'FAMEFreeObject',
    handler: (emu, lib: FameLibrary) => {
      const addr = emu.getRegister(9); // A1
      lib.freeObject(addr);
      return addr;
    },
  },
  {
    offset: -216, // FAMENumToStr(Value,Flags,BufSize,Buffer)(d0/d1/d2/a0)
    name: 'FAMENumToStr',
    handler: (_emu, lib: FameLibrary) => lib.stub('FAMENumToStr'),
  },
  {
    // FAMEAtol(Buffer)(a0) — index 54 in FAME_lib.fd (##bias 30):
    // offset = -(30 + 6*54) = -354. Present in the .fd (not absent), so
    // per the controller ruling it gets a real vector entry, not a
    // class-method-only implementation.
    offset: -354,
    name: 'FAMEAtol',
    handler: (emu, lib: FameLibrary) => {
      const bufAddr = emu.getRegister(8); // A0
      return lib.atol(bufAddr);
    },
  },
];
