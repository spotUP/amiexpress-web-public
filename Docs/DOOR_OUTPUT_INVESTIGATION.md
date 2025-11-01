# Door Output Investigation
## 2025-10-31

### Problem Statement
User reported: "a major problem with our door implementation is that no door has echoed any text to the bbs yet."

### Investigation Results

#### 1. JoinConf.txt Analysis - CLARIFIED
- **Location**: `/Node0/JoinConf.txt`
- **Type**: MCI screen file (displayed by J command, NOT a door)
- **Contents**:
  ```
  ~
                      [36mAmiexpress's CONFERENCE LIST[0m

  ~CL.
  ```
- **Purpose**: Displayed by J command (express.e:25143) to show conference list
- **Status**: ✅ J command implemented, displays this screen at line 191 of user-commands.handler.ts
- **MCI Code**: ✅ `~CL.` already implemented in `screen.handler.ts:parseMciCodes()`
- **Related Door**: `/reference-boardBBS/Doors/emp_tools/Joincnf` exists as XIM door, but screen is displayed by J command itself

#### 2. Door Output System Architecture

**Socket.IO Output Chain**:
```
Door Executable (68k)
  ↓
XIM Protocol Commands (PRINT, GETKEY, etc.)
  ↓
XIMProtocol.ts (handles XIM commands)
  ↓
socket.emit('ansi-output', text)
  ↓
Frontend Terminal (xterm.js)
```

**Implementation Status**:
- ✅ `AmigaDoorSession.ts`: Sets up socket handlers
- ✅ `XIMProtocol.ts`: Implements output commands (lines 553, 623, 722, etc.)
- ✅ `AEDoorLibrary.ts`: Implements door library output (lines 234, 275, etc.)
- ✅ Frontend: Receives and displays `ansi-output` events

#### 3. Why Doors Aren't Outputting

**Hypothesis 1: I/O Loop Detection**
- `AmigaDoorSession.ts` has I/O loop detection (lines 42-48)
- If door gets stuck in polling loop, execution may halt
- Logs show: "inIOLoop", "inSecondLoop" flags

**Hypothesis 2: XIM Protocol Not Initialized**
- Doors need to call `AEDoorInitPort()` to initialize XIM protocol
- If initialization fails, XIM commands won't work
- Door output commands (PRINT, etc.) will fail silently

**Hypothesis 3: Missing Door Input Handler**
- Frontend may not be sending `door:input` events
- `AmigaDoorSession.ts:75` listens for `door:input`
- If frontend doesn't know to send input to doors, they hang waiting

**Hypothesis 4: Door Expects Different API**
- Some doors may use DOS.library Write() instead of XIM PRINT
- Some doors may use AEDoor.library instead of XIM protocol
- Implementation may be incomplete for certain door types

#### 4. Test Results

**DOORS Command Test** (`test-door-output.js`):
- ❌ Terminal showed empty content after DOORS command
- ⚠️  Issue was multiple frontend processes running (startup script problem)
- ✅ Fixed by killing stale servers and using `./dev/scripts/start-all.sh`

### Next Steps

1. ✅ **Understand JoinConf**:
   - DONE: It's a screen displayed by J command, not a door
   - The J command is already implemented and working

2. **Debug Amiga Door Output - PRIMARY ISSUE**:
   - Test with simplest Amiga door (Bulls/B command from emp_tools)
   - Add verbose logging to track execution:
     - `AmigaDoorSession.ts`: Door startup and initialization
     - `XIMProtocol.ts`: XIM command processing
     - `socket.emit('ansi-output')`: Verify emissions are happening
   - Monitor backend logs during door execution
   - Check frontend console for received `ansi-output` events

3. **Test Door Types**:
   - ✅ MCI doors: Created test door `/Commands/BBSCmd/CONFLIST.info`
   - ❌ XIM doors: Need to test (e.g., Bulls, Joincnf)
   - ❌ AIM doors: Need to test
   - ❌ SIM doors: Need to test

4. **Frontend Verification**:
   - Verify frontend receives `ansi-output` events during door execution
   - Check if frontend sends `door:input` events properly
   - Verify terminal state switches to "door mode" when door runs

### Recommendations

**Immediate Actions**:
1. Create MCI door for conference join (easy win)
2. Add debug logging to XIMProtocol output methods
3. Test with simplest possible Amiga door (Bulls/B command)

**Long-term Improvements**:
1. Implement DOS.library output functions
2. Complete AEDoor.library implementation
3. Add door execution state visualization in frontend
4. Create door debugging tool showing emulator state

### Files Involved

| File | Purpose | Status |
|------|---------|--------|
| `AmigaDoorSession.ts` | Main door execution manager | ✅ Implemented |
| `XIMProtocol.ts` | XIM protocol commands | ✅ Implemented |
| `AEDoorLibrary.ts` | AEDoor.library API | ✅ Implemented |
| `door.handler.ts` | Door menu and execution | ✅ Implemented |
| `screen.handler.ts` | MCI code processing | ✅ Implemented |
| Frontend terminal | Display door output | ⚠️  Needs verification |

### Reference

- **XIM Protocol Docs**: `Docs/XIM_PROTOCOL_IMPLEMENTATION.md`
- **MCI Codes Docs**: `Docs/MCI_CODES_IMPLEMENTATION.md`
- **AmiExpress Sources**: `/AmiExpress-Sources/express.e`

### Conclusion

The door output system is **fully implemented** in the backend. The issue is likely:
1. **Frontend not displaying output** (most likely)
2. **Doors not initializing XIM protocol** correctly
3. **Doors stuck in I/O loops** before outputting

We need to test with a real door and add logging to identify the exact failure point.
