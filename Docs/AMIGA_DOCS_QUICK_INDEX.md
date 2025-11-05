# Amiga Developer Documentation - Quick Index

**Purpose:** Fast lookup table for AmigaOS functions used in door emulation

All paths relative to: `~/Code/amigadeveloperdocs/ADCD_2.1/Includes_and_Autodocs_3._guide/`

---

## exec.library Functions

### Message Port Functions
| Function | File | Line in Our Code | Status |
|----------|------|------------------|--------|
| CreateMsgPort() | node01FC.html | ExecLibrary.ts:1113 | ✅ Implemented |
| DeleteMsgPort() | node0200.html | ExecLibrary.ts:1146 | ✅ Implemented |
| FindPort() | node0208.html | ExecLibrary.ts:661 | ✅ Implemented |
| AddPort() | node01E7.html | ExecLibrary.ts:695 | ✅ Implemented |
| RemPort() | node0233.html | ExecLibrary.ts:743 | ✅ Implemented |

### Message Passing Functions
| Function | File | Line in Our Code | Status |
|----------|------|------------------|--------|
| PutMsg() | node0226.html | ExecLibrary.ts:779 | ✅ Implemented |
| GetMsg() | node0214.html | ExecLibrary.ts:935 | ✅ Implemented |
| ReplyMsg() | node0235.html | ExecLibrary.ts:874 | ✅ Implemented |
| WaitPort() | node0248.html | ExecLibrary.ts:1023 | ✅ Implemented |

### Signal Functions
| Function | File | Line in Our Code | Status |
|----------|------|------------------|--------|
| AllocSignal() | node01EA.html | ExecLibrary.ts:556 | ✅ Implemented |
| FreeSignal() | node020B.html | ExecLibrary.ts:593 | ✅ Implemented |
| Signal() | node023B.html | ExecLibrary.ts:1063 | ✅ Implemented |
| Wait() | node0247.html | ExecLibrary.ts:1079 | ✅ Implemented |
| SetSignal() | node023A.html | - | ❌ Not implemented |

### Task Functions
| Function | File | Line in Our Code | Status |
|----------|------|------------------|--------|
| FindTask() | node0206.html | ExecLibrary.ts:533 | ✅ Implemented |
| SetTaskPri() | node023C.html | ExecLibrary.ts:649 | ✅ Implemented |
| Forbid() | node020A.html | ExecLibrary.ts:619 | ✅ Implemented |
| Permit() | node0224.html | ExecLibrary.ts:632 | ✅ Implemented |

### Memory Functions
| Function | File | Line in Our Code | Status |
|----------|------|------------------|--------|
| AllocMem() | node01ED.html | ExecLibrary.ts:387 | ✅ Implemented |
| FreeMem() | node020D.html | ExecLibrary.ts:487 | ✅ Implemented |
| AllocVec() | node01F0.html | - | ❌ Not implemented |
| FreeVec() | node020E.html | - | ❌ Not implemented |

### Library Functions
| Function | File | Line in Our Code | Status |
|----------|------|------------------|--------|
| OpenLibrary() | node0222.html | ExecLibrary.ts:258 | ✅ Implemented |
| CloseLibrary() | node01F5.html | ExecLibrary.ts:328 | ✅ Implemented |

---

## dos.library Functions

### File I/O Functions
| Function | File | Line in Our Code | Status |
|----------|------|------------------|--------|
| Open() | node03F3.html | DosLibrary.ts:100 | ✅ Implemented |
| Close() | node03B4.html | DosLibrary.ts:167 | ✅ Implemented |
| Read() | node0405.html | DosLibrary.ts:189 | ✅ Implemented |
| Write() | node041A.html | DosLibrary.ts:239 | ✅ Implemented |
| Seek() | node040A.html | DosLibrary.ts:291 | ✅ Implemented |

### Standard I/O Functions
| Function | File | Line in Our Code | Status |
|----------|------|------------------|--------|
| Input() | node03DB.html | DosLibrary.ts:71 | ✅ Implemented |
| Output() | node03F8.html | DosLibrary.ts:86 | ✅ Implemented |

### Process Functions
| Function | File | Line in Our Code | Status |
|----------|------|------------------|--------|
| Exit() | node03C7.html | - | ❌ Not implemented |
| Delay() | node03BF.html | DosLibrary.ts:338 | ✅ Implemented |
| DateStamp() | node03BE.html | DosLibrary.ts:357 | ✅ Implemented |
| IoErr() | node03DD.html | DosLibrary.ts:376 | ✅ Implemented |
| WaitForChar() | node0419.html | DosLibrary.ts:396 | ✅ Implemented |

---

## Critical Documentation Sections

### Conceptual Overviews
All paths relative to: `~/Code/amigadeveloperdocs/ADCD_2.1/Libraries_Manual_guide/`

| Topic | File | Description |
|-------|------|-------------|
| Message Ports | node02EB.html | Complete overview of port system |
| Interprocess Communication | node028C.html | IPC patterns and best practices |
| Signals and Waits | node02EE.html | Task signaling mechanisms |
| Memory Allocation | node02E8.html | Memory types and pools |
| Task Basics | node02F1.html | Task structure and lifecycle |

### Structure Definitions
All paths relative to: `~/Code/amigadeveloperdocs/ADCD_2.1/Includes_and_Autodocs_3._guide/`

| Structure | File | Description |
|-----------|------|-------------|
| MsgPort | node062E.html | Message port structure |
| Message | node062E.html | Message structure |
| Task | node0672.html | Task structure |
| Node | node062D.html | Basic linked list node |
| List | node0626.html | Linked list structure |

---

## Common Gotchas (Reference to Docs)

### FindPort() Critical Section
**Doc:** node0208.html  
**Issue:** Port pointer only valid between Forbid()/Permit()  
**Our Code:** ExecLibrary.ts:661

### GetMsg() Loop Pattern
**Doc:** node0214.html  
**Issue:** Must loop until NULL - signals coalesce, messages don't  
**Pattern:**
```c
while (msg = GetMsg(port)) {
    // Process message
}
```

### Signal vs Message Confusion
**Doc:** node02EE.html (Libraries Manual)  
**Issue:** One signal can mean multiple messages arrived  
**Solution:** Always loop GetMsg() after Wait() or WaitPort()

### Message Ownership
**Doc:** node028C.html (IPC overview)  
**Issue:** Sender cannot touch message until ReplyMsg() received  
**Our Implementation:** XIMProtocol.ts:467 (message allocation)

---

## Implementation Status

### ✅ Fully Implemented
- Message port creation and management
- Message passing (PutMsg, GetMsg, ReplyMsg, WaitPort)
- Signal management (AllocSignal, FreeSignal, Signal, Wait)
- Basic memory allocation (AllocMem, FreeMem)
- File I/O (Open, Close, Read, Write, Seek)
- Library management (OpenLibrary, CloseLibrary)

### ❌ Not Yet Implemented
- AllocVec/FreeVec (V36+ convenience functions)
- SetSignal (read/modify signal state)
- Exit (process termination)
- Advanced DOS functions (Lock, UnLock, Examine, etc.)

### ⚠️ Partially Implemented
- Task management (FindTask, SetTaskPri work; other functions missing)
- Memory allocation (AllocMem works; AllocVec/FreeVec missing)

---

## How to Use This Index

1. **Find the function** you need to implement/debug
2. **Check our implementation** at the listed file:line
3. **Read the autodoc** at the listed documentation file
4. **Compare behavior** - does our code match the spec?
5. **Fix discrepancies** based on official documentation

**Example:**
```
Need to debug GetMsg() behavior
→ Check ExecLibrary.ts:935
→ Read node0214.html for official spec
→ Verify we're implementing FIFO order correctly
→ Check that we return NULL when queue empty
```

---

## Quick Links

**Primary Implementation Files:**
- `web/backend/src/amiga-emulation/api/ExecLibrary.ts` - exec.library implementation
- `web/backend/src/amiga-emulation/api/DosLibrary.ts` - dos.library implementation
- `web/backend/src/amiga-emulation/XIMProtocol.ts` - Door message protocol
- `web/backend/src/amiga-emulation/AmigaDoorSession.ts` - Door execution loop

**Comprehensive Guide:**
- `Docs/AMIGA_DOOR_IMPLEMENTATION_GUIDE.md` - Full implementation reference

**Original Documentation:**
- `~/Code/amigadeveloperdocs/ADCD_2.1/` - Complete ADCD 2.1

---

**Last Updated:** 2025-11-01
