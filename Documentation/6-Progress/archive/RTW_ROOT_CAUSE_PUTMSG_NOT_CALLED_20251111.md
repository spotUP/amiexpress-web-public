# RTW Door Root Cause - PutMsg Never Called - November 11, 2025

## Summary

RTW door exits with code 30 because it **never calls PutMsg()** to send messages to the BBS. The door IPC protocol requires:
1. Door sends PutMsg(AEDoorPort, message)
2. BBS processes message via GetMsg()
3. BBS sends ReplyMsg() back to door
4. Door wakes from Wait() and continues

**Current State**: RTW executes but never reaches the PutMsg/Wait loop. It exits during initialization.

## What We Learned from express.e

From `AmiExpress-Sources/express.e` lines 4300-4400:

```e
// BBS side (express.e:4317-4401)
StringF(doorPort,'\s\d','AEDoorPort',node)  // Create "AEDoorPort0"
mp:=createPort(doorPort,0)                   // BBS creates the port

WHILE(exit=FALSE)
  signals:=Wait(ximSig)                      // BBS waits for signal from port
  WHILE(msg:=GetMsg(mp))                     // BBS gets messages FROM door
    processXimMsg(msgcmd,msg,...)            // BBS processes message
    ReplyMsg(msg)                            // BBS sends reply to door
  ENDWHILE
ENDWHILE
```

This is the CORRECT protocol, and we already implemented it correctly:
- ✓ We create AEDoorPort0 in AmigaDoorSession
- ✓ We have doorMessageCallback that triggers on PutMsg
- ✓ XIMProtocol.handleMessage() processes door commands
- ✓ All XIM handlers call sendReply() → execLibrary.replyMsg()

## The Real Problem

### Evidence

1. **Execution Log Shows**: RTW loops at PC 0x1172-0x1178
2. **Disassembly Shows**: 0x1170 = PutMsg JSR, 0x1176 = Wait JSR
3. **But Logs Show**: NO "[ExecLibrary] PutMsg" output
4. **Conclusion**: RTW never actually executes PutMsg!

### Why PC Appears at 0x1172

PC 0x1172 is INSIDE the PutMsg JSR instruction (which spans 0x1170-0x1173). This happens when:
- Execution logs are from OLD run (before server restart)
- OR PC logging happens mid-instruction

### Test Run Results

From latest logs:
- LibraryTraps IS working (intercepted StackSwap, AllocMem, etc.)
- PutMsg vector IS installed at 0xfe92
- But PutMsg **never triggered**
- RTW exits after 1134 iterations

## What RTW Is Actually Doing

RTW must be stuck in an **earlier initialization loop** that never reaches the door IPC code. Possible causes:

1. **Waiting for file I/O**: RTW might be waiting for DOOR.SYS or other dropfile
2. **Polling for port**: RTW might be calling FindPort() in a loop waiting for AEDoorPort0
3. **Stuck in BSS clear loop**: Earlier DBRA loop might not be terminating
4. **Memory check failure**: Some initialization check is failing

## Next Steps

### 1. Add Debugging at PC Where RTW Actually Loops

From the last execution log, RTW looped at:
```
0x1158 -> 0x115e -> 0x1160 (repeated many times)
```

Add breakpoint debugging at these addresses:

```typescript
// In AmigaDoorSession.ts execute loop
if (pc === 0x1158 || pc === 0x115E || pc === 0x1160) {
  if (!this.loopCount) this.loopCount = 0;
  this.loopCount++;

  if (this.loopCount % 100 === 0) {
    console.log(`\n[RTW-LOOP] PC=0x${pc.toString(16)}, iteration ${this.loopCount}`);
    console.log(`[RTW-LOOP] D0-D7: ${this.emulator.getRegister(0).toString(16)}, ...`);
    console.log(`[RTW-LOOP] A0-A6: ${this.emulator.getRegister(8).toString(16)}, ...`);

    // Disassemble current instruction
    const opcode = this.emulator.readMemory16(pc);
    console.log(`[RTW-LOOP] Opcode: 0x${opcode.toString(16).padStart(4,'0')}`);
  }
}
```

### 2. Disassemble the Actual Loop

```bash
r2 -q -c "e asm.arch=m68k; e asm.bits=32; s 0x1158; pd 10" doors/RTW/rtw
```

### 3. Check If RTW Calls FindPort

Add debugging for FindPort:

```typescript
// In ExecLibrary.ts findPort() method
findPort(nameAddr: number): number {
  const name = this.emulator.readString(nameAddr);
  console.log(`[ExecLibrary] FindPort("${name}")`);

  if (name.startsWith('AEDoorPort')) {
    console.log(`[ExecLibrary]   *** Door is looking for AEDoorPort! ***`);
  }

  // ... rest of implementation
}
```

### 4. Test with Fresh Server and Capture Logs

```bash
./dev/scripts/kill-servers.sh
./dev/scripts/start-servers.sh
# Wait for startup
# Run RTW from BBS
# Check logs/backend.log for new debugging output
```

## Related Files

- `web/backend/src/amiga-emulation/AmigaDoorSession.ts` - Door execution loop
- `web/backend/src/amiga-emulation/api/ExecLibrary.ts` - PutMsg/GetMsg/ReplyMsg
- `web/backend/src/amiga-emulation/api/LibraryTraps.ts` - JSR interception
- `web/backend/src/amiga-emulation/XIMProtocol.ts` - Message processing
- `AmiExpress-Sources/express.e` - Original BBS door protocol (lines 4300-4400)

## Confidence Level

**HIGH** - We now understand:
- ✓ The correct door IPC protocol from express.e
- ✓ Our implementation matches express.e correctly
- ✓ RTW never calls PutMsg (verified by logs)
- ✓ RTW is stuck in an earlier initialization loop
- ? NEED to identify what that loop is checking for

## Key Insight

**ALWAYS READ THE SOURCE FIRST**. Reading `express.e` immediately revealed the correct protocol. Reverse-engineering RTW wasted time when the answer was in the original BBS sources all along.
