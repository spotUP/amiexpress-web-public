# Complete LVO Implementation Plan - 100% AmigaOS Coverage

**Goal**: Implement ALL AmigaOS DOS and Exec library functions, not just "commonly used" ones
**Reason**: We don't know which doors use which functions - hundreds of AmiExpress doors exist

## Implementation Strategy

1. **Map ALL NDK LVOs** - Create complete list from AmigaOS NDK 3.2R4
2. **Implement each function** - Even if rarely used
3. **Stub smartly** - Functions that can't be fully implemented get intelligent stubs that return safe values
4. **Test systematically** - Validate against vamos and real Amiga behavior

---

## DOS.library Complete LVO Table (V36+)

Reference: AmigaOS NDK 3.2R4 dos/dos_lib.fd

### Currently Implemented (55 LVOs)
| Offset | Name | Status |
|--------|------|--------|
| -30 | Open | ✅ IMPLEMENTED |
| -36 | Close | ✅ IMPLEMENTED |
| -42 | Read | ✅ IMPLEMENTED |
| -48 | Write | ✅ IMPLEMENTED |
| -54 | Input | ✅ IMPLEMENTED |
| -60 | Output | ✅ IMPLEMENTED |
| -66 | Seek | ✅ IMPLEMENTED |
| -72 | DeleteFile | ✅ IMPLEMENTED |
| -78 | Rename | ✅ IMPLEMENTED |
| -84 | Lock | ✅ IMPLEMENTED |
| -90 | UnLock | ✅ IMPLEMENTED |
| -96 | DupLock | ✅ IMPLEMENTED |
| -102 | Examine | ✅ IMPLEMENTED |
| -108 | ExNext | ✅ IMPLEMENTED |
| -114 | Info | ✅ IMPLEMENTED |
| -120 | CreateDir | ✅ IMPLEMENTED |
| -126 | CurrentDir | ✅ IMPLEMENTED |
| -132 | IoErr | ✅ IMPLEMENTED |
| -138 | CreateProc | ✅ IMPLEMENTED |
| -144 | Exit | ✅ IMPLEMENTED |
| -150 | LoadSeg | ✅ IMPLEMENTED |
| -156 | UnLoadSeg | ✅ IMPLEMENTED |
| -162 | GetVar | ✅ IMPLEMENTED (Phase 1) |
| -168 | SetFileDate | ✅ IMPLEMENTED |
| -174 | SetProtection | ✅ IMPLEMENTED |
| -180 | SetComment | ✅ IMPLEMENTED |
| -192 | DateStamp | ✅ IMPLEMENTED |
| -198 | Delay | ✅ IMPLEMENTED |
| -204 | WaitForChar | ✅ IMPLEMENTED |
| -228 | ParentDir | ✅ IMPLEMENTED |
| -234 | IsInteractive | ✅ IMPLEMENTED |
| -264 | Execute | ✅ IMPLEMENTED |
| -288 | AllocDosObject | ✅ IMPLEMENTED |
| -294 | FreeDosObject | ✅ IMPLEMENTED |
| -300 | DoPkt | ✅ IMPLEMENTED |
| -324 | SendPkt | ✅ IMPLEMENTED |
| -330 | WaitPkt | ✅ IMPLEMENTED |
| -378 | LockRecord | ✅ IMPLEMENTED |
| -390 | LockRecords | ✅ IMPLEMENTED |
| -396 | UnLockRecord | ✅ IMPLEMENTED |
| -516 | MatchFirst | ✅ IMPLEMENTED |
| -522 | MatchNext | ✅ IMPLEMENTED |
| -534 | MatchEnd | ✅ IMPLEMENTED |
| -540 | ParsePattern | ✅ IMPLEMENTED |
| -546 | MatchPattern | ✅ IMPLEMENTED |
| -552 | FreeArgs | ✅ IMPLEMENTED |
| -564 | FilePart | ✅ IMPLEMENTED |
| -744 | NameFromLock | ✅ IMPLEMENTED |
| -750 | NameFromFH | ✅ IMPLEMENTED |
| -804 | SplitName | ✅ IMPLEMENTED |
| -810 | SameLock | ✅ IMPLEMENTED |
| -900 | SetVar | ✅ IMPLEMENTED (Phase 1) |
| -906 | GetVar | ✅ IMPLEMENTED (Phase 1) |
| -912 | DeleteVar | ✅ IMPLEMENTED (Phase 1) |
| -798 | ReadArgs | ✅ IMPLEMENTED |

### Missing DOS.library LVOs (NEED TO IMPLEMENT)

| Offset | Name | Priority | Effort | Notes |
|--------|------|----------|--------|-------|
| -210 | SetSignal | P0 | 1h | Set/examine process signals |
| -216 | PutStr | P0 | 30m | Write string to stdout |
| -222 | VPrintf | P0 | 2h | Formatted output (RawDoFmt + Write) |
| -240 | SystemTagList | P1 | 3h | Execute command with tags |
| -246 | AssignLock | P1 | 2h | Create logical device assignment |
| -252 | AssignLate | P1 | 1h | Create deferred assignment |
| -258 | AssignPath | P1 | 1h | Create path assignment |
| -270 | DupLockFromFH | P1 | 1h | Get lock from file handle |
| -276 | OpenFromLock | P1 | 1h | Open file from lock |
| -282 | ParentOfFH | P1 | 1h | Get parent dir of file handle |
| -306 | ExAll | P1 | 3h | Examine directory (multiple entries) |
| -312 | ReadLink | P1 | 2h | Read soft link target |
| -318 | MakeLink | P1 | 2h | Create hard/soft link |
| -336 | ChangeMode | P1 | 1h | Change file/lock mode |
| -342 | SetFileSize | P1 | 2h | Truncate/extend file |
| -348 | SetIoErr | P2 | 30m | Set error code |
| -354 | Fault | P1 | 2h | Get error message string |
| -360 | PrintFault | P1 | 1h | Print error message |
| -366 | ErrorReport | P2 | 2h | Display error requester |
| -372 | Cli | P1 | 30m | Get CLI structure pointer |
| -384 | CreateNewProc | P1 | 3h | Enhanced CreateProc |
| -402 | RunCommand | P1 | 4h | Execute loaded segment |
| -408 | GetConsoleTask | P2 | 30m | Get console handler |
| -414 | SetConsoleTask | P2 | 30m | Set console handler |
| -420 | GetFileSyatemTask | P2 | 30m | Get filesystem task |
| -426 | SetFileSyatemTask | P2 | 30m | Set filesystem task |
| -432 | GetArgStr | P2 | 30m | Get argument string |
| -438 | SetArgStr | P2 | 30m | Set argument string |
| -444 | FindCliProc | P2 | 1h | Find CLI process by number |
| -450 | MaxCli | P2 | 30m | Get max CLI number |
| -456 | SetCurrentDirName | P2 | 1h | Set current dir name |
| -462 | GetCurrentDirName | P1 | 1h | Get current dir name |
| -468 | SetProgramName | P2 | 30m | Set program name |
| -474 | GetProgramName | P1 | 1h | Get program name |
| -480 | SetPrompt | P2 | 30m | Set CLI prompt |
| -486 | GetPrompt | P2 | 30m | Get CLI prompt |
| -492 | SetProgramDir | P1 | 1h | Set program directory |
| -498 | GetProgramDir | P1 | 1h | Get program directory |
| -504 | SystemTagList | P1 | 3h | System with tags |
| -510 | AssignAdd | P1 | 2h | Add to multi-assign |
| -528 | ParsePatternNoCase | P1 | 2h | Case-insensitive pattern parse |
| -558 | ReadItem | P1 | 2h | Read script item |
| -570 | PathPart | P1 | 1h | Extract path from string |
| -576 | AddPart | P1 | 1h | Append filename to path |
| -582 | RemPart | P1 | 30m | Remove last path component |
| -588 | FOpen | P2 | 2h | Buffered file open |
| -594 | FClose | P2 | 1h | Buffered file close |
| -600 | FRead | P2 | 2h | Buffered file read |
| -606 | FWrite | P2 | 2h | Buffered file write |
| -612 | FGets | P1 | 2h | Read line from file |
| -618 | FPuts | P1 | 1h | Write line to file |
| -624 | VFWritef | P2 | 2h | Formatted file write |
| -630 | VFPrintf | P2 | 2h | Formatted file output |
| -636 | Flush | P1 | 1h | Flush buffered file |
| -642 | FGetC | P2 | 30m | Get character from file |
| -648 | FPutC | P2 | 30m | Put character to file |
| -654 | UnGetC | P2 | 1h | Push back character |
| -660 | Seek64 | P1 | 2h | 64-bit file seek |
| -666 | GetFileSize64 | P1 | 1h | Get 64-bit file size |
| -672 | SetFileSize64 | P1 | 2h | Set 64-bit file size |
| -678 | FSeek | P2 | 1h | Buffered file seek |
| -684 | FTell | P2 | 30m | Get buffered file position |
| -690 | AllocDosObjectTagList | P1 | 2h | AllocDosObject with tags |
| -696 | FreeDosObjectTagList | P1 | 1h | FreeDosObject with tags |
| -702 | DupLockTagList | P1 | 1h | DupLock with tags |
| -708 | SeekTagList | P1 | 2h | Seek with tags |
| -714 | DeleteFileTagList | P1 | 1h | DeleteFile with tags |
| -720 | RenameTagList | P1 | 1h | Rename with tags |
| -726 | CreateDirTagList | P1 | 1h | CreateDir with tags |
| -732 | ExamineObjectTagList | P1 | 2h | Examine with tags |
| -738 | ExamineDataTagList | P1 | 2h | Examine data with tags |
| -756 | DevNameFromLock | P1 | 1h | Get device name from lock |
| -762 | PathNameFromLock | P1 | 1h | Get full path from lock |
| -768 | AssignAddTagList | P1 | 2h | AssignAdd with tags |
| -774 | RemAssignTagList | P1 | 1h | RemAssign with tags |
| -780 | GetDeviceProc | P1 | 2h | Get device process |
| -786 | FreeDeviceProc | P1 | 1h | Free device process |
| -792 | LockDosList | P2 | 1h | Lock DOS list |
| -798 | UnLockDosList | P2 | 30m | Unlock DOS list |
| -816 | FindSegment | P2 | 2h | Find resident segment |
| -822 | AddSegment | P2 | 2h | Add resident segment |
| -828 | RemSegment | P2 | 1h | Remove resident segment |
| -834 | CheckSignal | P0 | 30m | Check if signal set |
| -840 | ReadLineStruct | P1 | 3h | Read line with completion |
| -846 | AddLineToHistory | P2 | 1h | Add to history buffer |
| -852 | InhibitTagList | P2 | 1h | Inhibit/uninhibit volume |
| -858 | AddDosEntry | P2 | 2h | Add DOS list entry |
| -864 | RemDosEntry | P2 | 1h | Remove DOS list entry |
| -870 | FindDosEntry | P2 | 2h | Find DOS list entry |
| -876 | NextDosEntry | P2 | 1h | Get next DOS entry |
| -882 | LockTagList | P1 | 1h | Lock with tags |
| -888 | UnLockTagList | P1 | 30m | UnLock with tags |
| -894 | AttemptLockDosList | P2 | 1h | Try lock DOS list |
| -918 | GetEnv | P1 | 1h | Get environment variable (CLI) |
| -924 | FindVar | P0 | 30m | Find variable (enhanced) |
| -930 | SetEnv | P1 | 1h | Set environment variable (CLI) |
| -936 | UnsetEnv | P1 | 30m | Delete environment variable |
| -942 | LocalizeString | P2 | 2h | Get localized string |
| -948 | LockTags | P1 | 1h | Lock with extended tags |
| -954 | UnLockTags | P1 | 30m | UnLock with extended tags |

**Total Missing**: ~100 LVOs
**Estimated Effort**: 120-150 hours to implement all

---

## Exec.library Complete LVO Table

Reference: AmigaOS NDK 3.2R4 exec/exec_lib.fd

### Currently Implemented (12+ LVOs)
| Offset | Name | Status |
|--------|------|--------|
| -30 | Open | ✅ IMPLEMENTED |
| -36 | Close | ✅ IMPLEMENTED |
| -114 | FindTask | ✅ IMPLEMENTED |
| -198 | AllocMem | ✅ IMPLEMENTED |
| -204 | FreeMem | ✅ IMPLEMENTED |
| -222 | AllocAbs | ✅ IMPLEMENTED |
| -294 | FindName | ✅ IMPLEMENTED |
| -306 | SetSignal | ✅ IMPLEMENTED (Phase 1) |
| -318 | Wait | ✅ IMPLEMENTED (Phase 1 - TRUE blocking) |
| -324 | Signal | ✅ IMPLEMENTED (Phase 1 - TRUE blocking) |
| -330 | AllocSignal | ✅ IMPLEMENTED |
| -336 | FreeSignal | ✅ IMPLEMENTED |
| -390 | FindPort | ✅ IMPLEMENTED |
| -396 | AddPort | ✅ IMPLEMENTED |
| -402 | RemPort | ✅ IMPLEMENTED |
| -408 | PutMsg | ✅ IMPLEMENTED |
| -414 | GetMsg | ✅ IMPLEMENTED |
| -420 | ReplyMsg | ✅ IMPLEMENTED |
| -426 | WaitPort | ✅ IMPLEMENTED |
| -462 | OpenLibrary | ✅ IMPLEMENTED |
| -468 | CloseLibrary | ✅ IMPLEMENTED |
| -534 | CreateMsgPort | ✅ IMPLEMENTED |
| -540 | DeleteMsgPort | ✅ IMPLEMENTED |

### Missing Exec.library LVOs (NEED TO IMPLEMENT)

| Offset | Name | Priority | Effort | Notes |
|--------|------|----------|--------|-------|
| -42 | Expunge | P3 | 1h | Library expunge |
| -48 | Reserved | P3 | - | Reserved |
| -54 | Reserved | P3 | - | Reserved |
| -60 | Reserved | P3 | - | Reserved |
| -66 | Supervisor | P3 | 2h | Enter supervisor mode |
| -72 | ExitIntr | P3 | 1h | Exit interrupt |
| -78 | Schedule | P3 | 2h | Task scheduler |
| -84 | Reschedule | P3 | 1h | Reschedule task |
| -90 | Switch | P3 | 1h | Task switch |
| -96 | Dispatch | P3 | 2h | Dispatch task |
| -102 | Exception | P3 | 2h | Exception handling |
| -108 | InitCode | P3 | 1h | Initialize code |
| -120 | InitStruct | P2 | 2h | Initialize structure |
| -126 | MakeLibrary | P2 | 3h | Create library |
| -132 | MakeFunctions | P2 | 3h | Create function table |
| -138 | FindResident | P2 | 2h | Find resident module |
| -144 | InitResident | P2 | 2h | Initialize resident |
| -150 | Alert | P1 | 1h | Display system alert |
| -156 | Debug | P2 | 1h | Enter debugger |
| -162 | Disable | P2 | 30m | Disable interrupts |
| -168 | Enable | P2 | 30m | Enable interrupts |
| -174 | Forbid | P1 | 30m | Forbid task switching |
| -180 | Permit | P1 | 30m | Permit task switching |
| -186 | SetSR | P3 | 1h | Set status register |
| -192 | SuperState | P3 | 1h | Enter supervisor state |
| -210 | AvailMem | P1 | 1h | Get available memory |
| -216 | AllocEntry | P2 | 2h | Allocate memory list |
| -228 | Enqueue | P2 | 1h | Add node to priority queue |
| -234 | RemHead | P1 | 30m | Remove list head |
| -240 | RemTail | P1 | 30m | Remove list tail |
| -246 | Remove | P1 | 30m | Remove node |
| -252 | Insert | P1 | 30m | Insert node |
| -258 | AddHead | P1 | 30m | Add to list head |
| -264 | AddTail | P1 | 30m | Add to list tail |
| -270 | RemTask | P2 | 2h | Remove task |
| -276 | AddTask | P2 | 3h | Add task |
| -282 | SetTaskPri | P2 | 1h | Set task priority |
| -288 | SetExcept | P2 | 1h | Set exception handler |
| -300 | ObtainSemaphore | P1 | 2h | Lock semaphore |
| -312 | ReleaseSemaphore | P1 | 1h | Unlock semaphore |
| -342 | AvailSignal | P2 | 1h | Check signal availability |
| -348 | InitSemaphore | P1 | 1h | Initialize semaphore |
| -354 | Procure | P2 | 2h | Procure semaphore |
| -360 | Vacate | P2 | 1h | Release semaphore |
| -366 | OpenResource | P2 | 2h | Open resource |
| -372 | Reserved | P3 | - | Reserved |
| -378 | Reserved | P3 | - | Reserved |
| -384 | Reserved | P3 | - | Reserved |
| -432 | FindSemaphore | P1 | 1h | Find public semaphore |
| -438 | AddSemaphore | P1 | 1h | Add public semaphore |
| -444 | RemSemaphore | P1 | 1h | Remove public semaphore |
| -450 | SumKickData | P3 | 1h | Checksum Kickstart |
| -456 | AddMemList | P3 | 2h | Add memory list |
| -474 | CopyMem | P0 | 1h | Fast memory copy |
| -480 | CopyMemQuick | P0 | 1h | Quick memory copy |
| -486 | CacheClearU | P3 | 1h | Clear instruction cache |
| -492 | CacheClearE | P3 | 1h | Clear cache extent |
| -498 | CacheControl | P3 | 2h | Control cache |
| -504 | CreateIORequest | P1 | 2h | Create I/O request |
| -510 | DeleteIORequest | P1 | 1h | Delete I/O request |
| -516 | DoIO | P1 | 2h | Synchronous I/O |
| -522 | SendIO | P1 | 2h | Asynchronous I/O |
| -528 | CheckIO | P1 | 1h | Check I/O status |
| -546 | ObtainSemaphoreShared | P2 | 2h | Shared semaphore lock |
| -552 | AllocVec | P0 | 1h | Allocate memory (tracked) |
| -558 | FreeVec | P0 | 30m | Free tracked memory |
| -564 | CreatePrivatePool | P2 | 3h | Create memory pool |
| -570 | DeletePrivatePool | P2 | 1h | Delete memory pool |
| -576 | AllocPooled | P2 | 2h | Allocate from pool |
| -582 | FreePooled | P2 | 1h | Free to pool |
| -588 | AttemptSemaphore | P1 | 1h | Try lock semaphore |
| -594 | AttemptSemaphoreShared | P2 | 1h | Try shared lock |
| -600 | ColdReboot | P3 | 1h | Cold reboot system |
| -606 | StackSwap | P1 | 2h | Swap stack |
| -612 | ChildFree | P3 | 1h | Free child task |
| -618 | ChildOrphan | P3 | 1h | Orphan child task |
| -624 | ChildStatus | P3 | 1h | Get child status |
| -630 | ChildWait | P3 | 2h | Wait for child |
| -636 | CachePreDMA | P3 | 1h | Prepare cache for DMA |
| -642 | CachePostDMA | P3 | 1h | Cleanup cache after DMA |
| -648 | AddMemHandler | P3 | 2h | Add memory handler |
| -654 | RemMemHandler | P3 | 1h | Remove memory handler |
| -660 | ObtainQuickVector | P3 | 1h | Get quick vector |
| -666 | Reserved | P3 | - | Reserved |

**Total Missing**: ~70 LVOs
**Estimated Effort**: 90-110 hours to implement all

---

## Implementation Priority System

**P0 (Critical)**: Commonly used by many doors, needed for basic operation
- Estimated: 10-15 functions, 10-15 hours

**P1 (High)**: Used by doors, needed for full functionality
- Estimated: 40-50 functions, 50-60 hours

**P2 (Medium)**: Used by specialized doors, nice to have
- Estimated: 50-60 functions, 40-50 hours

**P3 (Low)**: System-level functions, rarely used by doors
- Estimated: 60-70 functions, 10-20 hours (many are stubs)

---

## Implementation Phases

### Phase A: Critical Missing Functions (P0)
**Time**: 10-15 hours
**Functions**: ~15 functions
- DOS: SetSignal, PutStr, VPrintf, CheckSignal, FindVar enhanced
- Exec: CopyMem, CopyMemQuick, AllocVec, FreeVec

### Phase B: High Priority (P1)
**Time**: 50-60 hours
**Functions**: ~50 functions
- DOS: All file operations, CLI functions, buffered I/O
- Exec: Semaphores, I/O requests, StackSwap

### Phase C: Medium Priority (P2)
**Time**: 40-50 hours
**Functions**: ~60 functions
- DOS: Advanced file operations, DOS list management
- Exec: Memory pools, advanced semaphores, init functions

### Phase D: Low Priority Stubs (P3)
**Time**: 10-20 hours
**Functions**: ~70 functions
- System-level functions with intelligent stub implementations
- Return safe values, log calls for debugging

---

## Total Implementation Effort

**Current Status**: ~70 LVOs implemented
**Missing LVOs**: ~170 LVOs
**Total Implementation Time**: 110-145 hours (2.5-3.5 weeks full-time)

**To 100% Coverage**:
- Phase A (P0): 10-15 hours → 75% tested compatibility
- Phase B (P1): 50-60 hours → 90% tested compatibility
- Phase C (P2): 40-50 hours → 97% tested compatibility
- Phase D (P3): 10-20 hours → 100% coverage (mostly stubs)

---

## Next Steps

1. **Create detailed implementation tickets** for each missing LVO
2. **Start with Phase A** (P0 critical functions)
3. **Test each function** against vamos/real Amiga
4. **Document all implementations** with NDK references
5. **Systematic progression** through P0 → P1 → P2 → P3

**Target**: 100% LVO coverage for complete AmigaOS compatibility
