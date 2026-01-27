# 68K Door Debugging Skill

Debug Amiga 68K doors running via MOIRA emulator using XIM protocol analysis.

## CRITICAL RULES

**NEVER debug 68K doors without XIM tools.** Guessing wastes time and creates wrong fixes.

**NEVER blame MOIRA.** 99.9% of bugs are in OUR code, not the emulator.

**NEVER implement without observing.** See actual behavior first, then fix.

## STEP 1: Gather Information

Ask the user (if not provided):
- Which door is failing? (e.g., "Bulls", "ByteComment", "WHO")
- What's the symptom? (crash, hang, wrong output, missing feature)
- Does it work in vamos/real Amiga? (if yes = our bug, not binary)

## STEP 2: Start XIM Live Viewer

```bash
# In terminal 1 - Start servers with XIM logging (auto-enabled)
./dev/scripts/start-servers.sh

# In terminal 2 - Start live XIM message viewer
npm run xim:live
```

Watch for:
- Message flow between door and BBS
- Missing responses
- Malformed messages
- Timeout patterns

## STEP 3: Reproduce and Capture

Have the user (or yourself) run the door and reproduce the issue while watching xim:live.

Look for these patterns in the output:
- `jhMessage` - XIM protocol messages
- `doorMsg` - TIM protocol messages
- `PG_*` commands - TIM page commands
- `DoorControl` - SIM door control messages

## STEP 4: Run Smart Debugger (PRIMARY TOOL)

```bash
# Automated analysis with pattern matching
npm run xim:debug -- DOORNAME
```

This tool:
- Monitors door execution automatically
- Runs 10 automated pattern matchers
- Generates comprehensive report with:
  - Issues found
  - Confidence scores
  - Suggested fixes
  - Code examples

## STEP 5: Deep Analysis (if needed)

### Protocol Validation
```bash
npm run xim:validate -- --door DOORNAME
```
Checks XIM protocol compliance and reports violations.

### Pattern Analysis
```bash
npm run xim:analyze -- --door DOORNAME --verbose
```
Detects common issues:
- Missing message handlers
- Timeout problems
- State machine errors
- Memory access issues

### Message Flow Visualization
```bash
npm run xim:flow -- --door DOORNAME
```
Generates visual diagram of message sequence.

### Decode Unknown Messages
```bash
npm run xim:decode -- "raw_hex_data"
```
Decodes XIM/TIM message bytes to human-readable format.

## STEP 6: Check Door-Specific Logs

```bash
# Per-door detailed logs (created during execution)
ls -la logs/door-68k-{DOORNAME}*.log

# View most recent
tail -100 logs/door-68k-{DOORNAME}*.log | head -50
```

Log format: `door-68k-{NAME}-{TIMESTAMP}.-N{NODE}.log`

## STEP 7: Binary Analysis (if needed)

### Extract strings from binary
```bash
strings doors/{DOORNAME}/{DOORNAME} | grep -i "error\|fail\|version"
```

### Disassemble with radare2
```bash
# View entry point
r2 -q -c "e asm.arch=m68k; e asm.bits=32; s entry0; pd 30" doors/{DOORNAME}/{DOORNAME}

# Find specific function
r2 -q -c "e asm.arch=m68k; e asm.bits=32; aaa; afl" doors/{DOORNAME}/{DOORNAME}
```

### Test with vamos (reference implementation)
```bash
vamos doors/{DOORNAME}/{DOORNAME}
```
If it works in vamos but not our emulator = bug in our implementation.

## STEP 8: Check Library Implementations

Common library issues:

### AEDoor.library
Location: `web/backend/src/amiga-emulation/api/AEDoorLibrary.ts`
- XIM message handling
- jhMessage processing
- Door I/O functions

### DosLibrary
Location: `web/backend/src/amiga-emulation/api/DosLibrary.ts`
- File operations (Open, Read, Write, Close)
- FGets, FPuts for line I/O
- Lock/UnLock for directory access

### ExecLibrary
Location: `web/backend/src/amiga-emulation/api/ExecLibrary.ts`
- Memory allocation (AllocMem, FreeMem)
- Message passing (PutMsg, GetMsg, WaitPort)
- Signal handling

## STEP 9: Use MCP Tools for Reference

```bash
# Search NDK autodocs for function specs
mcp__amiexpress-docs__search_ndk_autodocs "FunctionName"

# Search express.e for implementation reference
mcp__amiexpress-docs__search_express_source "keyword"

# Read express.e module
mcp__amiexpress-docs__read_express_module "module_name"
```

Available modules: init, core, security, io, messaging, doors, commands, mci, display, rexx, windows, logging, mail, files, conference, internal-commands, command-priority, mainloop, startup

## STEP 10: Document Findings

Create debug session document:
```
Documentation/6-Progress/{DOORNAME}_DEBUG_SESSION.md
```

Template:
```markdown
# {DOORNAME} Debug Session - {DATE}

## Issue
{Description of the problem}

## Hypothesis
{What you think is wrong}

## XIM Analysis
{Output from xim:debug or xim:analyze}

## Observations
{What you found}

## Root Cause
{The actual problem}

## Fix
{Code changes made}

## Verification
{How you confirmed the fix works}
```

## XIM TOOLKIT QUICK REFERENCE

| Command | Purpose |
|---------|---------|
| `xim:debug` | **PRIMARY** - Smart orchestrator with auto-analysis |
| `xim:live` | Real-time message viewer |
| `xim:analyze` | Pattern-based issue detection |
| `xim:validate` | Protocol compliance check |
| `xim:decode` | Decode/encode messages |
| `xim:flow` | Message flow diagrams |
| `xim:monitor` | Real-time door state |
| `xim:trace` | File/library/memory access |
| `xim:errors` | Show errors only |
| `xim:diff` | Session comparison |
| `xim:replay` | Send test messages |
| `xim:record` | Record sessions |
| `xim:perf` | Performance profiling |

## COMMON ISSUES AND FIXES

### Door hangs waiting for input
- Check if XIM `jhMessage` with `JH_OUTPUT` is being sent
- Verify `WaitPort` is properly releasing when message arrives
- Check for missing `ReplyMsg` calls

### Door crashes on startup
- Check `OpenLibrary` calls - is AEDoor.library loaded?
- Verify memory allocation succeeds
- Check for null pointer dereference in early code

### Wrong/garbled output
- Check `JH_WRITE` message handling
- Verify string encoding (Latin-1 vs UTF-8)
- Check buffer sizes in FGets/FPuts

### File not found errors
- Use amigafs for case-insensitive paths
- Check path resolution in DosLibrary
- Verify Lock() returns valid BPTR

### Missing features
- Search express.e for the feature
- Check if library function is implemented
- Verify XIM message type is handled

## DO NOT

- Guess what's wrong without XIM analysis
- Start with code reading (observe behavior first)
- Grep logs manually (use xim tools)
- Ask user what's happening (check yourself)
- Implement without observing actual behavior
- Skip documenting findings

## DO

- Use `npm run xim:live` FIRST
- See actual message flow
- Identify exact failure point
- Validate protocol with `xim:validate`
- Decode unknown messages with `xim:decode`
- Visualize flow with `xim:flow`
- Document everything in 6-Progress/

---

## XIM PROTOCOL DETAILS

### XIM Message Types (jhMessage)

| Type | Value | Direction | Description |
|------|-------|-----------|-------------|
| `JH_INPUT` | 1 | Door→BBS | Request input from user |
| `JH_OUTPUT` | 2 | Door→BBS | Send output to user |
| `JH_WRITE` | 3 | Door→BBS | Write string to terminal |
| `JH_GETCHAR` | 4 | Door→BBS | Get single character |
| `JH_PUTCHAR` | 5 | Door→BBS | Put single character |
| `JH_GETS` | 6 | Door→BBS | Get string (line input) |
| `JH_PUTS` | 7 | Door→BBS | Put string |
| `JH_SENDSTRING` | 8 | Door→BBS | Send raw string |
| `JH_HOTKEY` | 9 | Door→BBS | Wait for hotkey |
| `JH_SHOWFILE` | 10 | Door→BBS | Display file |
| `JH_SHOWGFILE` | 11 | Door→BBS | Display graphics file |
| `JH_SETSTRVAL` | 12 | Door→BBS | Set string value |
| `JH_GETSTRVAL` | 13 | Door→BBS | Get string value |
| `JH_SETINTVAL` | 14 | Door→BBS | Set integer value |
| `JH_GETINTVAL` | 15 | Door→BBS | Get integer value |
| `JH_CHECKCARRIER` | 16 | Door→BBS | Check carrier detect |
| `JH_CHECKTIME` | 17 | Door→BBS | Check time remaining |
| `JH_QUIT` | 18 | Door→BBS | Door exit request |
| `JH_CHAINMENU` | 19 | Door→BBS | Chain to menu |
| `JH_RUNCHAINMENU` | 20 | Door→BBS | Run and chain menu |

### XIM Response Structure

```
Offset  Size  Field
0x00    4     mn_Node.ln_Succ
0x04    4     mn_Node.ln_Pred
0x08    1     mn_Node.ln_Type
0x09    1     mn_Node.ln_Pri
0x0A    4     mn_Node.ln_Name
0x0E    4     mn_ReplyPort
0x12    2     mn_Length
0x14    4     jh_Command (message type)
0x18    4     jh_Data (pointer to data)
0x1C    4     jh_Length (data length)
0x20    4     jh_Result (return value)
```

---

## TIM PROTOCOL DETAILS

### TIM Message Types (doorMsg)

| Type | Description |
|------|-------------|
| `DOOR_INIT` | Initialize door |
| `DOOR_EXIT` | Door exiting |
| `DOOR_INPUT` | Input received |
| `DOOR_OUTPUT` | Output to send |

### TIM Page Commands (PG_*)

| Command | Description |
|---------|-------------|
| `PG_CLS` | Clear screen |
| `PG_HOME` | Cursor home |
| `PG_CRLF` | Carriage return + line feed |
| `PG_GETCHAR` | Get character |
| `PG_GETLINE` | Get line of input |
| `PG_PRINT` | Print string |
| `PG_PRINTF` | Formatted print |
| `PG_SETCURSOR` | Set cursor position |
| `PG_SETCOLOR` | Set text color |
| `PG_SETBG` | Set background color |
| `PG_RAWMODE` | Enable raw mode |
| `PG_COOKEDMODE` | Enable cooked mode |
| `PG_PAUSE` | Pause for keypress |
| `PG_TIMEOUT` | Set input timeout |
| `PG_CHECKKEY` | Check for keypress |
| `PG_FLUSH` | Flush output buffer |

---

## SIM PROTOCOL DETAILS

### DoorControl Messages

| Message | Description |
|---------|-------------|
| `DC_STARTUP` | Door starting |
| `DC_SHUTDOWN` | Door shutting down |
| `DC_SUSPEND` | Suspend door |
| `DC_RESUME` | Resume door |
| `DC_QUERY` | Query door status |
| `DC_SIGNAL` | Send signal to door |

### SIM Port Names

- `AEDoor.port` - Main AEDoor communication port
- `BBS.port` - BBS control port
- `Node{N}.port` - Per-node port

---

## AMIGA MEMORY STRUCTURES

### FileLock Structure (20 bytes)
```
Offset  Size  Field           Description
0x00    4     fl_Link         Next lock in chain (BPTR)
0x04    4     fl_Key          Directory block number
0x08    4     fl_Access       SHARED_LOCK (-2) or EXCLUSIVE_LOCK (-1)
0x0C    4     fl_Task         Handler process (MsgPort*)
0x10    4     fl_Volume       Volume node (BPTR)
```

### FileHandle Structure (48 bytes)
```
Offset  Size  Field           Description
0x00    4     fh_Flags        Flags
0x04    4     fh_Interactive  TRUE if interactive
0x08    4     fh_Type         Handler process
0x0C    4     fh_Buf          Buffer for I/O
0x10    4     fh_Pos          Current position in buffer
0x14    4     fh_End          End of buffer
0x18    4     fh_Func1        Read function
0x1C    4     fh_Func2        Write function
0x20    4     fh_Func3        Close function
0x24    4     fh_Args         Handler-specific args
0x28    4     fh_Arg2         Additional arg
```

### Process Structure (key offsets)
```
Offset  Size  Field           Description
0x00    92    pr_Task         Embedded Task structure
0x5C    4     pr_MsgPort      Process message port
0x60    2     pr_Pad          Padding
0x62    4     pr_SegList      Segment list (BPTR)
0x66    4     pr_StackSize    Stack size
0x6A    4     pr_GlobVec      Global vector
0x6E    4     pr_TaskNum      Task number
0x72    4     pr_StackBase    Stack base
0x76    4     pr_Result2      Secondary result (IoErr)
0x7A    4     pr_CurrentDir   Current directory lock (BPTR)
0x7E    4     pr_CIS          Console input stream
0x82    4     pr_COS          Console output stream
0x86    4     pr_ConsoleTask  Console handler
0x8A    4     pr_FileSystemTask  File system handler
0x8E    4     pr_CLI          CLI structure (BPTR)
0x92    4     pr_ReturnAddr   Return address
0x96    4     pr_PktWait      Packet wait function
0x9A    4     pr_WindowPtr    Window for requesters
0x9E    4     pr_HomeDir      Home directory lock
0xA2    4     pr_Flags        Process flags
0xA6    4     pr_ExitCode     Exit function
0xAA    4     pr_ExitData     Exit data
0xAE    4     pr_Arguments    Arguments string
0xB2    4     pr_LocalVars    Local variables list
0xB6    4     pr_ShellPrivate Shell private data
0xBA    4     pr_CES          Error output stream
```

### CLI Structure (64 bytes)
```
Offset  Size  Field           Description
0x00    4     cli_Result2     Secondary result
0x04    4     cli_SetName     Current directory name (BSTR)
0x08    4     cli_CommandDir  Command search path
0x0C    4     cli_ReturnCode  Return code
0x10    4     cli_CommandName Current command (BSTR)
0x14    4     cli_FailLevel   Fail level
0x18    4     cli_Prompt      Prompt string (BSTR)
0x1C    4     cli_StandardInput  Standard input
0x20    4     cli_CurrentInput   Current input
0x24    4     cli_CommandFile    Command file
0x28    4     cli_Interactive    Interactive flag
0x2C    4     cli_Background     Background flag
0x30    4     cli_CurrentOutput  Current output
0x34    4     cli_DefaultStack   Default stack
0x38    4     cli_StandardOutput Standard output
0x3C    4     cli_Module         Current module
```

### MsgPort Structure (34 bytes)
```
Offset  Size  Field           Description
0x00    14    mp_Node         Node structure
0x0E    1     mp_Flags        Port flags
0x0F    1     mp_SigBit       Signal bit
0x10    4     mp_SigTask      Task to signal
0x14    14    mp_MsgList      List of messages
```

### Message Structure (20 bytes)
```
Offset  Size  Field           Description
0x00    14    mn_Node         Node structure
0x0E    4     mn_ReplyPort    Reply port
0x12    2     mn_Length       Message length
```

### ExecBase (key offsets)
```
Offset  Size  Field           Description
0x114   4     ThisTask        Currently running task
0x118   4     IdleCount       Idle counter
0x11C   4     DispCount       Dispatch counter
0x126   2     SysFlags        System flags
0x128   1     IDNestCnt       Interrupt disable nest count
0x129   1     TDNestCnt       Task disable nest count
0x12A   2     AttnFlags       Attention flags (CPU type)
0x12C   2     AttnResched     Reschedule attention
0x12E   4     ResModules      Resident modules
0x132   4     TaskTrapCode    Task trap code
0x136   4     TaskExceptCode  Task exception code
0x13A   4     TaskExitCode    Task exit code
0x13E   4     TaskSigAlloc    Allocated signals
0x142   2     TaskTrapAlloc   Allocated traps
0x144   14    MemList         Memory list
0x152   14    ResourceList    Resource list
0x160   14    DeviceList      Device list
0x16E   14    IntrList        Interrupt list
0x17C   14    LibList         Library list
0x18A   14    PortList        Port list
0x198   14    TaskReady       Ready tasks
0x1A6   14    TaskWait        Waiting tasks
```

---

## 68K REGISTER CONVENTIONS

### General Purpose Registers

| Register | Convention | Typical Use |
|----------|------------|-------------|
| D0 | Return value | Function return, scratch |
| D1 | Scratch | Temporary, scratch |
| D2-D7 | Preserved | Must save/restore in functions |
| A0 | Argument/Return | First pointer arg, return ptr |
| A1 | Argument | Second pointer argument |
| A2-A5 | Preserved | Must save/restore in functions |
| A6 | Library base | Points to library base |
| A7 (SP) | Stack pointer | Stack operations |

### Library Call Convention

```asm
; Typical library call
move.l  _DOSBase,a6      ; Load library base into A6
move.l  filename,d1      ; First arg in D1
move.l  #MODE_OLDFILE,d2 ; Second arg in D2
jsr     _LVOOpen(a6)     ; Call via negative offset
; Result in D0
```

### Common Register Patterns

**String operations:**
- A0 = source string pointer
- A1 = destination string pointer
- D0 = string length or result

**File operations:**
- D1 = filename (BSTR) or file handle
- D2 = mode or length
- D3 = additional parameter
- D0 = result (handle, bytes, or error)

**Memory operations:**
- D0 = size to allocate
- D1 = memory requirements (MEMF_*)
- A1 = address to free
- D0 = allocated address or NULL

---

## LIBRARY VECTOR OFFSETS (LVOs)

### dos.library

| Offset | Function | Args |
|--------|----------|------|
| -30 | Open | D1=name, D2=mode |
| -36 | Close | D1=file |
| -42 | Read | D1=file, D2=buf, D3=len |
| -48 | Write | D1=file, D2=buf, D3=len |
| -54 | Input | - |
| -60 | Output | - |
| -66 | Seek | D1=file, D2=pos, D3=mode |
| -72 | DeleteFile | D1=name |
| -78 | Rename | D1=old, D2=new |
| -84 | Lock | D1=name, D2=mode |
| -90 | UnLock | D1=lock |
| -96 | DupLock | D1=lock |
| -102 | Examine | D1=lock, D2=fib |
| -108 | ExNext | D1=lock, D2=fib |
| -114 | Info | D1=lock, D2=info |
| -120 | CreateDir | D1=name |
| -126 | CurrentDir | D1=lock |
| -132 | IoErr | - |
| -138 | CreateProc | D1=name, D2=pri, D3=seg, D4=stack |
| -192 | DateStamp | D1=datestamp |
| -198 | Delay | D1=ticks |
| -210 | WaitForChar | D1=file, D2=timeout |
| -216 | ParentDir | D1=lock |
| -294 | FGets | D1=file, D2=buf, D3=len |
| -300 | FPuts | D1=file, D2=str |
| -330 | FGetC | D1=file |
| -336 | FPutC | D1=file, D2=char |
| -354 | VFPrintf | D1=file, D2=fmt, D3=args |

### exec.library

| Offset | Function | Args |
|--------|----------|------|
| -30 | Supervisor | A5=code |
| -54 | InitCode | D0=startClass, D1=version |
| -72 | FindResident | A1=name |
| -90 | Alert | D7=alertNum |
| -96 | Debug | D0=flags |
| -102 | Disable | - |
| -108 | Enable | - |
| -114 | Forbid | - |
| -120 | Permit | - |
| -126 | SetSR | D0=newSR, D1=mask |
| -132 | SuperState | - |
| -138 | UserState | D0=sysStack |
| -144 | SetIntVector | D0=intNum, A1=interrupt |
| -162 | AllocMem | D0=size, D1=requirements |
| -168 | AllocAbs | D0=size, A1=location |
| -174 | FreeMem | A1=block, D0=size |
| -198 | AllocEntry | A0=memList |
| -204 | FreeEntry | A0=memList |
| -210 | Insert | A0=list, A1=node, A2=pred |
| -216 | AddHead | A0=list, A1=node |
| -222 | AddTail | A0=list, A1=node |
| -228 | Remove | A1=node |
| -234 | RemHead | A0=list |
| -240 | RemTail | A0=list |
| -246 | Enqueue | A0=list, A1=node |
| -252 | FindName | A0=list, A1=name |
| -294 | AddTask | A1=task, A2=initPC, A3=finalPC |
| -300 | RemTask | A1=task |
| -306 | FindTask | A1=name |
| -312 | SetTaskPri | A1=task, D0=priority |
| -318 | SetSignal | D0=newSignals, D1=signalMask |
| -324 | SetExcept | D0=newSignals, D1=signalMask |
| -330 | Wait | D0=signalSet |
| -336 | Signal | A1=task, D0=signals |
| -342 | AllocSignal | D0=signalNum |
| -348 | FreeSignal | D0=signalNum |
| -354 | AllocTrap | D0=trapNum |
| -360 | FreeTrap | D0=trapNum |
| -366 | AddPort | A1=port |
| -372 | RemPort | A1=port |
| -378 | PutMsg | A0=port, A1=message |
| -384 | GetMsg | A0=port |
| -390 | ReplyMsg | A1=message |
| -396 | WaitPort | A0=port |
| -402 | FindPort | A1=name |
| -408 | AddLibrary | A1=library |
| -414 | RemLibrary | A1=library |
| -420 | OldOpenLibrary | A1=libName |
| -426 | CloseLibrary | A1=library |
| -432 | SetFunction | A1=library, A0=funcOffset, D0=newFunc |
| -438 | SumLibrary | A1=library |
| -552 | OpenLibrary | A1=libName, D0=version |
| -558 | InitSemaphore | A0=sigSem |
| -564 | ObtainSemaphore | A0=sigSem |
| -570 | ReleaseSemaphore | A0=sigSem |
| -576 | AttemptSemaphore | A0=sigSem |
| -582 | ObtainSemaphoreList | A0=sigSem |
| -588 | ReleaseSemaphoreList | A0=sigSem |
| -594 | FindSemaphore | A1=name |
| -600 | AddSemaphore | A1=sigSem |
| -606 | RemSemaphore | A1=sigSem |
| -612 | CopyMem | A0=source, A1=dest, D0=size |
| -618 | CopyMemQuick | A0=source, A1=dest, D0=size |

---

## DOS ERROR CODES

| Code | Name | Description |
|------|------|-------------|
| 103 | ERROR_NO_FREE_STORE | Out of memory |
| 105 | ERROR_TASK_TABLE_FULL | Task table full |
| 114 | ERROR_BAD_TEMPLATE | Bad template |
| 115 | ERROR_BAD_NUMBER | Bad number |
| 116 | ERROR_REQUIRED_ARG_MISSING | Required arg missing |
| 117 | ERROR_KEY_NEEDS_ARG | Key needs argument |
| 118 | ERROR_TOO_MANY_ARGS | Too many arguments |
| 119 | ERROR_UNMATCHED_QUOTES | Unmatched quotes |
| 120 | ERROR_LINE_TOO_LONG | Line too long |
| 121 | ERROR_FILE_NOT_OBJECT | File not object |
| 122 | ERROR_INVALID_RESIDENT_LIBRARY | Invalid resident library |
| 202 | ERROR_OBJECT_IN_USE | Object in use |
| 203 | ERROR_OBJECT_EXISTS | Object exists |
| 204 | ERROR_DIR_NOT_FOUND | Directory not found |
| 205 | ERROR_OBJECT_NOT_FOUND | Object not found |
| 206 | ERROR_BAD_STREAM_NAME | Bad stream name |
| 207 | ERROR_OBJECT_TOO_LARGE | Object too large |
| 209 | ERROR_ACTION_NOT_KNOWN | Packet type unknown |
| 210 | ERROR_INVALID_COMPONENT_NAME | Invalid component name |
| 211 | ERROR_INVALID_LOCK | Invalid lock |
| 212 | ERROR_OBJECT_WRONG_TYPE | Object wrong type |
| 213 | ERROR_DISK_NOT_VALIDATED | Disk not validated |
| 214 | ERROR_DISK_WRITE_PROTECTED | Disk write protected |
| 215 | ERROR_RENAME_ACROSS_DEVICES | Rename across devices |
| 216 | ERROR_DIRECTORY_NOT_EMPTY | Directory not empty |
| 217 | ERROR_TOO_MANY_LEVELS | Too many levels |
| 218 | ERROR_DEVICE_NOT_MOUNTED | Device not mounted |
| 219 | ERROR_SEEK_ERROR | Seek error |
| 220 | ERROR_COMMENT_TOO_BIG | Comment too big |
| 221 | ERROR_DISK_FULL | Disk full |
| 222 | ERROR_DELETE_PROTECTED | Delete protected |
| 223 | ERROR_WRITE_PROTECTED | Write protected |
| 224 | ERROR_READ_PROTECTED | Read protected |
| 225 | ERROR_NOT_A_DOS_DISK | Not a DOS disk |
| 226 | ERROR_NO_DISK | No disk |
| 232 | ERROR_NO_MORE_ENTRIES | No more entries |
| 233 | ERROR_IS_SOFT_LINK | Is soft link |
| 234 | ERROR_OBJECT_LINKED | Object linked |
| 235 | ERROR_BAD_HUNK | Bad hunk |
| 236 | ERROR_NOT_IMPLEMENTED | Not implemented |
| 240 | ERROR_RECORD_NOT_LOCKED | Record not locked |
| 241 | ERROR_LOCK_COLLISION | Lock collision |
| 242 | ERROR_LOCK_TIMEOUT | Lock timeout |
| 243 | ERROR_UNLOCK_ERROR | Unlock error |

---

## SIGNAL TYPES

| Signal | Bit | Description |
|--------|-----|-------------|
| SIGBREAKF_CTRL_C | 12 | Control-C (break) |
| SIGBREAKF_CTRL_D | 13 | Control-D |
| SIGBREAKF_CTRL_E | 14 | Control-E |
| SIGBREAKF_CTRL_F | 15 | Control-F |
| SIGF_SINGLE | 4 | Single-step |
| SIGF_INTUITION | 4 | Intuition signal |
| SIGF_DOS | 8 | DOS signal |

### Signal Usage
```c
// Wait for signal
ULONG signals = Wait(SIGBREAKF_CTRL_C | (1 << port->mp_SigBit));

// Check if Ctrl-C
if (signals & SIGBREAKF_CTRL_C) {
    // Handle break
}

// Signal a task
Signal(task, SIGBREAKF_CTRL_C);
```

---

## DOOR TYPE SPECIFICS

### XIM Doors (AEDoor.library)

**Identification:**
- Uses `OpenLibrary("AEDoor.library", 0)`
- Communicates via jhMessage port
- Most common door type

**Debugging focus:**
- Check jhMessage send/receive flow
- Verify JH_* command handling
- Watch for missing ReplyMsg calls

**Key files:**
- `web/backend/src/amiga-emulation/api/AEDoorLibrary.ts`
- `web/backend/src/amiga-emulation/xim/`

### TIM Doors (Page-based)

**Identification:**
- Uses PG_* page commands
- doorMsg communication
- Older door protocol

**Debugging focus:**
- Check PG_* command implementation
- Verify page buffer handling
- Watch for screen coordinate issues

**Key files:**
- `web/backend/src/amiga-emulation/tim/`

### SIM Doors (DoorControl)

**Identification:**
- Uses DoorControl port
- DC_* messages
- System-level doors

**Debugging focus:**
- Check DoorControl message flow
- Verify DC_* command handling
- Watch for port communication issues

---

## MULTICOM / NODE COMMUNICATION

### How Doors Communicate Between Nodes

1. **Shared memory via Node files:**
   - `Node{N}/` directories contain per-node state
   - Doors read/write to coordinate

2. **XIM nodeInfo structure:**
   ```
   Offset  Size  Field
   0x00    32    username
   0x20    32    location
   0x40    4     nodeNumber
   0x44    4     status
   0x48    4     activity
   ```

3. **MULTICOM initialization in logs:**
   ```
   [MULTICOM] INIT: nodeId=3, username="Sysop", location="Local Console"
   [MULTICOM] updateNode called
   [MULTICOM] initialized for node 3
   ```

### Debugging Multi-Node Issues

```bash
# Watch all node communication
npm run xim:live -- --all-nodes

# Compare two nodes
npm run xim:diff -- --node1 0 --node2 1

# Check specific node state
cat Node{N}/nodeinfo
```

---

## HUNK TYPES

### Amiga Executable Format

| Hunk Type | Value | Description |
|-----------|-------|-------------|
| HUNK_UNIT | 0x3E7 | Unit name (object files) |
| HUNK_NAME | 0x3E8 | Hunk name |
| HUNK_CODE | 0x3E9 | Executable code |
| HUNK_DATA | 0x3EA | Initialized data |
| HUNK_BSS | 0x3EB | Uninitialized data |
| HUNK_RELOC32 | 0x3EC | 32-bit relocation |
| HUNK_RELOC16 | 0x3ED | 16-bit relocation |
| HUNK_RELOC8 | 0x3EE | 8-bit relocation |
| HUNK_EXT | 0x3EF | External symbols |
| HUNK_SYMBOL | 0x3F0 | Symbol table |
| HUNK_DEBUG | 0x3F1 | Debug info |
| HUNK_END | 0x3F2 | End of hunk |
| HUNK_HEADER | 0x3F3 | Executable header |
| HUNK_OVERLAY | 0x3F5 | Overlay info |
| HUNK_BREAK | 0x3F6 | Break point |

### Reading Hunk Info

```bash
# Using our loader logs
grep "HUNK" logs/door-68k-*.log

# Example output:
# [HUNK] Segment 0: CODE at 0x2008, size=11908 bytes
# [HUNK] Segment 1: DATA at 0x4f08, size=1472 bytes

# Using radare2
r2 -q -c "iH" doors/Bulls/Bulls
```

### Memory Layout After Loading

```
+------------------+ 0x0000
|   System/ROM     |
+------------------+ 0x2000
|   CODE segment   | <- Entry point usually here
+------------------+
|   DATA segment   |
+------------------+
|   BSS segment    | <- Zeroed at load
+------------------+
|   Stack          |
+------------------+ SP
```

---

## STACK FRAME ANALYSIS

### 68K Stack Frame Layout

```
High addresses (older frames)
+------------------+
|  Return address  | +4
+------------------+
|  Saved A6 (FP)   | <- A6 points here
+------------------+
|  Local var 1     | -4
+------------------+
|  Local var 2     | -8
+------------------+
|  ...             |
+------------------+
                    <- SP points here
Low addresses (newer data)
```

### Reading Stack in Crash

```bash
# In radare2 - dump stack
r2 -q -c "e asm.arch=m68k; pxw 64 @ sp" binary

# Common patterns:
# - Return addresses: usually 0x2XXX (in CODE segment)
# - Saved registers: often near 0x80000 (ExecBase area)
# - String pointers: often 0xFXXXX (high memory)
```

### Analyzing Crash Location

1. Get PC (program counter) from crash log
2. Find which hunk contains that address
3. Disassemble around crash point:
   ```bash
   r2 -q -c "e asm.arch=m68k; s 0xCRASH_ADDR; pd 20" binary
   ```

---

## LIBRARY FUNCTION BEHAVIORS

### FGets Behavior
- Reads up to len-1 characters or until newline
- Returns buffer pointer on success, NULL on EOF/error
- **Includes** the newline character if found
- Always null-terminates
- D1=file, D2=buffer, D3=maxlen

### FPuts Behavior
- Writes string without adding newline
- Returns non-negative on success, -1 on error
- D1=file, D2=string

### Open Modes
- `MODE_OLDFILE (1005)` - Open existing, read/write
- `MODE_NEWFILE (1006)` - Create/truncate, write
- `MODE_READWRITE (1004)` - Open or create, read/write

### Lock Modes
- `SHARED_LOCK (-2)` - Read access, multiple allowed
- `EXCLUSIVE_LOCK (-1)` - Write access, exclusive

### Memory Flags (MEMF_*)
- `MEMF_ANY (0)` - Any memory
- `MEMF_PUBLIC (1)` - DMA-accessible
- `MEMF_CHIP (2)` - Chip RAM (for graphics/sound)
- `MEMF_FAST (4)` - Fast RAM
- `MEMF_CLEAR (0x10000)` - Zero memory

---

## CASE STUDIES

### Case Study 1: ByteComment Hang

**Symptom:** Door hangs after displaying prompt, no input accepted.

**XIM Analysis:**
```
[XIM] JH_WRITE "Enter comment: "
[XIM] JH_GETS (waiting...)
... (no response)
```

**Root Cause:** JH_GETS handler wasn't sending input back to door.

**Fix:** Added input forwarding in AEDoorLibrary.ts JH_GETS handler.

**Lesson:** Always check both directions of XIM message flow.

### Case Study 2: WHO Door Wrong Node Count

**Symptom:** WHO door shows wrong number of nodes, some missing.

**XIM Analysis:**
```
[MULTICOM] INIT: nodeId=3
[MULTICOM] nodeInfo array only has 3 elements, expected 8
```

**Root Cause:** nodeInfo structure alignment was off by 4 bytes.

**Fix:** Corrected structure offsets in multicom initialization.

**Lesson:** Structure alignment issues are common - verify offsets against NDK docs.

### Case Study 3: Bulls Crash on Startup

**Symptom:** Bulls door crashes immediately with illegal instruction.

**Binary Analysis:**
```bash
strings doors/Bulls/Bulls | grep -i library
# Output: AEDoor.library, dos.library, exec.library
```

**XIM Analysis:**
```
[XIM] OpenLibrary "AEDoor.library" - FAILED
[CPU] Illegal instruction at 0x2156
```

**Root Cause:** AEDoor.library wasn't being found in Libs: path.

**Fix:** Added Libs/ to library search path in emulator.

**Lesson:** Library loading failures cause cascading crashes.

### Case Study 4: DreWall Input Freeze

**Symptom:** Door accepts first input, then freezes.

**XIM Analysis:**
```
[XIM] JH_GETS -> "test input"
[XIM] JH_WRITE "Processing..."
[XIM] WaitPort (waiting forever)
```

**Root Cause:** ReplyMsg wasn't being called after processing input.

**Fix:** Added ReplyMsg call in JH_GETS completion handler.

**Lesson:** Every GetMsg needs a ReplyMsg - missing replies cause deadlock.

---

## QUICK DIAGNOSTIC COMMANDS

```bash
# What libraries does door need?
strings doors/{DOOR}/{DOOR} | grep -i "\.library"

# What files does door access?
strings doors/{DOOR}/{DOOR} | grep -E "^[A-Za-z]+:"

# Entry point and code size
r2 -q -c "e asm.arch=m68k; iE; iS" doors/{DOOR}/{DOOR}

# First 50 instructions
r2 -q -c "e asm.arch=m68k; s entry0; pd 50" doors/{DOOR}/{DOOR}

# Find all string references
r2 -q -c "e asm.arch=m68k; iz" doors/{DOOR}/{DOOR}

# Compare with vamos behavior
vamos --log-file=/tmp/vamos.log doors/{DOOR}/{DOOR}
diff /tmp/vamos.log logs/door-68k-{DOOR}*.log

# Memory map after loading
grep -E "HUNK|segment|Entry" logs/door-68k-{DOOR}*.log
```
