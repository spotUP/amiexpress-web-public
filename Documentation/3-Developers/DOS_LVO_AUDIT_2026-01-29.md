# Library LVO Audit Report

**Date:** 2026-01-29
**Reference:** NDK 3.2R4 FD files (authoritative source)

## Summary

Comprehensive audit and fix of all library LVO (Library Vector Offset) mappings across dos-vectors.ts, intuition-vectors.ts, and other library vector files.

## Key Findings

The dos_lib.fd file uses three bias sections:
- `##bias 30` - V33 functions (Open through Execute)
- `##bias 492` - Process Management functions (Cli through IsFileSystem, Format, Date functions)
- `##bias 870` - Path functions (FilePart, PathPart, AddPart, etc.)

## Corrections Made

### dos-vectors.ts

| Function | OLD Offset | NEW Offset | Status |
|----------|------------|------------|--------|
| DeviceProc | -162 | -174 | FIXED |
| SetComment | -168 | -180 | FIXED |
| SetProtection | -174 | -186 | FIXED |
| ParentDir | -210 | -210 | Already correct |
| IsInteractive | -216 | -216 | Already correct |
| Execute | -222 | -222 | Already correct |
| SelectInput | (missing) | -294 | ADDED |
| SelectOutput | (missing) | -300 | ADDED |
| VPrintf | -264 | -954 | FIXED |
| Fault | -390 | -468 | FIXED |
| PrintFault | -396 | -474 | FIXED |
| FilePart | -288 | -870 | FIXED |
| PathPart | -294 | -876 | FIXED |
| AddPart | -300 | -882 | FIXED |

### Removed Invalid Entries

These entries had wrong offset/name combinations and were removed:

| Entry | Offset | Reason |
|-------|--------|--------|
| WaitForChar_180 | -180 | Duplicate (real at -204) |
| DosStub_-298 | -298 | Invalid offset (no function there) |
| FGetC_516 | -516 | -516 is SetConsoleTask, not FGetC |
| FPutC_522 | -522 | -522 is GetFileSysTask, not FPutC |
| FRead_534 | -534 | -534 is GetArgStr, not FRead |
| FWrite_540 | -540 | -540 is SetArgStr, not FWrite |
| FGets_546 | -546 | -546 is FindCliProc, not FGets |
| FPuts_552 | -552 | -552 is MaxCli, not FPuts |
| ReadArgs_804 | -804 | -804 is FindArg, not ReadArgs |
| FreeArgs_810 | -810 | -810 is ReadItem, not FreeArgs |

### DosLibrary.ts handleCall()

| Change | Details |
|--------|---------|
| DeviceProc | case -162 -> case -174 |
| Duplicate -126 | Removed (CurrentDir already exists) |
| SelectInput | Added case -294 |
| SelectOutput | Added case -300 |

## Verified Correct Offsets

These offsets were already correct and unchanged:

```
Open: -30, Close: -36, Read: -42, Write: -48
Input: -54, Output: -60, Seek: -66
DeleteFile: -72, Rename: -78, Lock: -84
UnLock: -90, DupLock: -96, Examine: -102
ExNext: -108, Info: -114, CreateDir: -120
CurrentDir: -126, IoErr: -132, CreateProc: -138
Exit: -144, LoadSeg: -150, UnLoadSeg: -156
DateStamp: -192, Delay: -198, WaitForChar: -204
AllocDosObject: -228, FreeDosObject: -234
FGetC: -306, FPutC: -312, UnGetC: -318
FRead: -324, FWrite: -330, FGets: -336
FPuts: -342, VFPrintf: -354, Flush: -360
OpenFromLock: -378, NameFromLock: -402
Cli: -492, DateToStr: -744, StrToDate: -750
ReadArgs: -798, ParsePattern: -840, MatchPattern: -846
FreeArgs: -858, ParsePatternNoCase: -966, MatchPatternNoCase: -972
```

---

## intuition-vectors.ts

| Function | OLD Offset | NEW Offset | Status |
|----------|------------|------------|--------|
| CloseWindow | -72 | -72 | Already correct (function #8) |
| CloseScreen | -78 | -66 | FIXED (function #7) |
| OpenScreen | -198 | -198 | Already correct (function #29) |
| OpenWindow | -204 | -204 | Already correct (function #30) |
| OpenWorkBench | -438 | -210 | FIXED (function #31) |
| RefreshGadgets | -282 | -222 | FIXED (function #33) |
| SetWindowTitles | -276 | -276 | Already correct (function #42) |
| AutoRequest | -348 | -348 | Already correct (function #54) |

**Note:** intuition.library uses `##bias 30` for all implemented functions.

---

## exec-vectors.ts

### Known Deviation

| Offset | Current | Should Be | Notes |
|--------|---------|-----------|-------|
| -114 | CreatePort | Debug | CreatePort is from amiga.lib (linker library), not exec.library. Kept for compatibility with doors that may depend on this behavior. |

### Verified Correct

Most exec LVO offsets are correct:
```
Supervisor: -30, InitStruct: -78, MakeLibrary: -84
MakeFunctions: -90, FindResident: -96, InitResident: -102
Alert: -108, Forbid: -132, Permit: -138
AllocMem: -198, FreeMem: -210, FindTask: -294
SetTaskPri: -300, SetSignal: -306, Wait: -318
Signal: -324, AllocSignal: -330, AddPort: -354
PutMsg: -366, GetMsg: -372, ReplyMsg: -378
WaitPort: -384, FindPort: -390, OpenLibrary: -552
CloseLibrary: -414, RawDoFmt: -522
CreateMsgPort: -666, DeleteMsgPort: -672
AllocVec: -684, FreeVec: -690
CreatePool: -696, DeletePool: -702
AllocPooled: -708, FreePooled: -714, StackSwap: -732
```

---

## Other Libraries Verified

### icon-vectors.ts
All offsets correct per NDK icon_lib.fd.

### utility-vectors.ts
All offsets correct per NDK utility_lib.fd.

### math-vectors.ts
Standard FFP math library offsets, appear correct.

### bsdsocket-vectors.ts
Third-party library (no NDK reference), offsets maintained as-is.

---

## Testing Required

After these changes, test doors that use:
1. Execute() - Request door uses this for Copy command
2. DeviceProc()
3. SetComment() / SetProtection()
4. SelectInput() / SelectOutput()
5. FilePart() / PathPart() / AddPart()
6. VPrintf()
7. Fault() / PrintFault()
8. CloseScreen() / OpenWorkBench() / RefreshGadgets()

## Reference

The FD file format:
- `##bias N` sets the starting offset for the next function
- Each function increments by 6 bytes
- `##private` functions still consume offsets but aren't exported
- Lines starting with `*` are comments
