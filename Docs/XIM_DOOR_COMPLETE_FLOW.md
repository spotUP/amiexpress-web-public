# XIM Door Complete Implementation - From express.e Sources

**Date:** 2025-10-31
**Source:** AmiExpress-Sources/express.e lines 4231-4545, 3372-4230

## THE COMPLETE FLOW (From express.e)

### 1. BBS Starts Door (runDoor procedure, line 4231)

```e
// Line 48-49: For XIM doors
STRING exestring
StringF(exestring,'\s \d',cmd,node)  // Format: "GetAnswer 0"

// Line 87: Create port name
StringF(doorPort,'\s\d','AEDoorPort',node)  // "AEDoorPort0"

// Line 94-98: Find or create the message port
IF (mp:=FindPort(doorPort))
  alreadyActive:=TRUE
ELSE
  mp:=createPort(doorPort,0)  // Create "AEDoorPort0" with priority 0
ENDIF

// Line 100: Get signal bit from port
ximSig:=Shl(1,mp.sigbit)  // Signal mask = 1 << mp.sigbit

// Line 106: Start the door process
temp:=startProcess(exestring,stacksize,pri,async,doorTrap)
```

**CRITICAL**: The BBS:
1. Creates message port "AEDoorPort0" BEFORE starting door
2. Starts door process with command: "GetAnswer 0"
3. Door finds existing port via FindPort("AEDoorPort0")

### 2. BBS Main Loop (Lines 122-140)

```e
IF type=DOORTYPE_XIM
  WHILE(exit=FALSE)
    signals:=Wait(ximSig)              // BBS WAITS for signal from door
    WHILE(msg:=GetMsg(mp))             // Get messages from door
      msgcmd:=msg.command

      processXimMsg(msgcmd,msg,...)    // Process door's request
      ReplyMsg(msg)                     // Reply to door
    ENDWHILE
  ENDWHILE
ENDIF
```

**THE PROTOCOL:**
- **DOOR sends messages TO BBS** (via PutMsg to AEDoorPort0)
- **BBS waits for signal** (Wait on port's signal bit)
- **When signaled, BBS calls GetMsg()** to get door's requests
- **BBS processes request and calls ReplyMsg()** to send response back
- **Door waits for reply** (Wait on its own reply port)

### 3. XIM Protocol Commands (processXimMsg, line 3372)

```e
SELECT MAX_CMD OF msgcmd
  CASE JH_REGISTER=1        // Door registers with BBS
    msg.command:=userLineLen // BBS replies with line length
    nodesPtr[]:=nodesPtr[]+1

  CASE JH_WRITE=3           // Door writes text to user
    aePuts(msg.string)      // BBS outputs to terminal

  CASE JH_SM=4              // Send message (with optional newline)
    aePuts(msg.string)
    IF msg.data THEN aePuts('\b\n')

  CASE JH_PM=5              // Prompt for input
    lineInput(msg.string,'',msg.data,doorTimeout,tempstring)
    AstrCopy(msg.string,tempstring,200)  // Put user input in msg.string

  CASE JH_HK=6              // Hotkey (read single char)
    aePuts(msg.string)      // Display prompt
    ch:=readChar(doorTimeout)
    msg.string[0]:=ch       // Put char in msg.string[0]
    msg.string[1]:=0

  CASE JH_SHUTDOWN=2        // Door shutting down
    nodesPtr[]:=nodesPtr[]-1
    IF(nodesPtr[]=0) THEN exitPtr[]:=TRUE
ENDSELECT
```

## Message Structure (jhMessage)

From axcommon.e:
```e
OBJECT jhMessage
  ln:ln                    // Exec Message node (14 bytes)
  command:LONG             // XIM command (JH_REGISTER, etc.)
  data:LONG                // Command-specific data
  string[200]:ARRAY OF CHAR // Text data
  signal:LONG              // Signal bit for ExtHK
  lineNum:LONG             // Line number
  strptr:PTR TO CHAR       // String pointer for JH_SMPTR
ENDOBJECT
```

## THE ACTUAL SEQUENCE

### Door Startup:
1. Door starts: `GetAnswer 0`
2. Door calls `FindPort("AEDoorPort0")` - finds BBS's port
3. Door creates its own reply port for receiving responses
4. Door sends JH_REGISTER message to BBS port
5. Door calls `Wait()` on its reply port's signal
6. **DOOR IS NOW BLOCKED WAITING**

### BBS Side:
1. BBS is in `Wait(ximSig)` waiting for door to send message
2. Door's `PutMsg()` signals the BBS port
3. BBS wakes from `Wait()`
4. BBS calls `GetMsg(mp)` to get door's JH_REGISTER message
5. BBS processes: sets `msg.command = userLineLen`
6. BBS calls `ReplyMsg(msg)` - this signals door's reply port
7. BBS loops back to `Wait(ximSig)`

### Door Continues:
1. Door wakes from `Wait()` (reply port was signaled)
2. Door calls `GetMsg()` on its reply port
3. Door reads `msg.command` (now contains userLineLen)
4. Door sends next message (JH_WRITE, JH_SM, etc.)
5. Repeat...

## THE CRITICAL FIX NEEDED

**OUR PROBLEM:** Door calls `Wait()` but we're not implementing it as a blocking trap!

**From vAmiga or real Amiga:**
- `Wait(signalMask)` is a **BLOCKING** system call
- CPU does NOT continue executing - it yields
- When signal arrives, Exec wakes the task
- Task resumes at instruction after `Wait()`

**Our Current Implementation:**
- Door calls `Wait()` trap
- We log it but return immediately
- Door continues executing in polling loop
- Door never actually blocks!

## SOLUTION

### 1. Implement Wait() as TRUE BLOCKING TRAP

```typescript
// In LibraryTraps.ts - Wait() vector handler
if (offset === WAIT_OFFSET) {
  const signalMask = this.emulator.getRegister(0); // D0 = signals to wait for

  console.log(`[LibraryTraps] Wait(0x${signalMask.toString(16)}) - BLOCKING door execution`);

  // Mark task as waiting
  this.execLibrary.wait(signalMask);

  // CRITICAL: STOP THE EXECUTION LOOP!
  // Set a flag that AmigaDoorSession checks
  this.emulator.setWaitingForSignal(true, signalMask);

  // Return - but execution loop should NOT continue
  return;
}
```

### 2. Modify AmigaDoorSession Execution Loop

```typescript
runExecutionLoop() {
  while (this.isRunning) {
    // CHECK if waiting for signal
    if (this.emulator.isWaitingForSignal()) {
      // Don't execute instructions - just sleep
      await sleep(10);
      continue;
    }

    // Execute next instruction
    this.emulator.executeInstruction();
  }
}
```

### 3. Signal() Wakes Door

```typescript
signal(taskAddr: number, signals: number): void {
  this.currentTask.sigRecvd |= signals;

  // Write to memory
  this.emulator.writeMemory32(taskAddr + TC_SIGRECVD_OFFSET, this.currentTask.sigRecvd);

  // Check if task is waiting
  if (this.currentTask.sigWait !== 0) {
    const matchedSignals = this.currentTask.sigRecvd & this.currentTask.sigWait;
    if (matchedSignals !== 0) {
      console.log(`[ExecLibrary] *** SIGNAL MATCH - WAKING DOOR ***`);

      // CRITICAL: Resume execution!
      this.emulator.setWaitingForSignal(false, 0);

      // Set D0 return value for Wait()
      this.emulator.setRegister(0, matchedSignals);

      // Clear the waiting signals
      this.currentTask.sigWait = 0;
      this.currentTask.state = 1; // TS_READY
    }
  }
}
```

## STARTUP MESSAGE IS WRONG!

**We're sending a message TO the door, but that's backwards!**

The door sends messages TO the BBS, not the other way around.

**DELETE `sendStartupMessage()` - it's wrong!**

The door will send JH_REGISTER as its first message when it's ready.

## SUMMARY

**What We Need:**
1. ✅ Create AEDoorPort0 before starting door (we do this)
2. ✅ Signal() writes to memory (we do this)
3. ❌ **Wait() must BLOCK execution** (WE DON'T DO THIS!)
4. ❌ **Signal() must RESUME execution** (WE DON'T DO THIS!)
5. ❌ Delete sendStartupMessage() - wrong direction!

**The door is stuck because:**
- Door calls Wait() waiting for reply
- We don't block execution
- Door continues in polling loop
- Door never progresses past Wait()

**Fix:**
- Implement Wait() as blocking trap
- Stop execution loop when waiting
- Signal() resumes execution loop
- Door will then work correctly!
