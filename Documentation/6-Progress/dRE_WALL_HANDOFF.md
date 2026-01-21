# dRE!WAll Door - Debug Handoff

**Status:** NOT WORKING - Data loss bug in JH_HK/DT_NAME interaction

## Problem Summary

The dRE!WAll (wall/graffiti) door collects user input character-by-character via JH_HK, but loses the data when calling DT_NAME, resulting in only the original "kokkiklhs / Hello from Athens" entry being saved repeatedly.

## What Works

- ✅ Door launches successfully
- ✅ Displays style files correctly
- ✅ JH_HK protocol implementation matches express.e (character in msg.string[0], ximPort in msg.command)
- ✅ Door reads existing data file (100 bytes) correctly
- ✅ Characters are echoed to screen (door reads them for display)
- ✅ File operations (Open, Read, Write, Close) work correctly
- ✅ Door completes execution without crashes

## What Doesn't Work

- ❌ New entries are NOT saved
- ❌ Existing entries are NOT displayed initially (only after submit)
- ❌ Door writes OLD data instead of NEW input

## Root Cause Analysis

### Character Collection Flow

```
1. JH_HK: Write 'p' to msg.string[0] ✅
2. Door echoes 'p' (reads successfully) ✅
3. JH_HK: Write 'o' to msg.string[0] ✅
4. Door echoes 'o' ✅
5. JH_HK: Write 'o' to msg.string[0] ✅
6. Door echoes 'o' ✅
7. JH_HK: Write 'p' to msg.string[0] ✅
8. Door echoes 'p' ✅
9. DT_NAME: Write "sysop" to msg.string ❌ OVERWRITES collected characters!
10. Door writes OLD data from initialization
```

### Key Findings

**msg.stringPtr Investigation:**
- `msg.stringPtr = 0x1034f8` (SAME as embedded buffer)
- Door has NO separate string buffer
- All data goes to embedded msg.string buffer

**File Operations:**
- Read: Returns correct 100 bytes "kokkiklhs...Hello from Athens"
- Write: Writes 100 bytes of OLD data (0x10368c buffer has old content)
- No Seek() operations (file pointer at offset 0)

**Data Loss Mechanism:**
- Door collects characters via JH_HK into msg.string[0]
- Door SHOULD copy each character to internal buffer (but doesn't seem to)
- DT_NAME call overwrites entire msg.string with "sysop"
- Door's internal buffer never got the characters, writes old data

## Express.e Reference

express.e lines 3436-3447 show JH_HK implementation:
```
CASE JH_HK
  lineCount:=0
  aePuts(msg.string)        <- Echo prompt
  ch:=readChar(doorTimeout) <- Read ONE character
  IF (ch<0)
    msg.data:=-1
  ELSE
    msg.data:=1
  ENDIF
  msg.string[0]:=ch         <- Character goes here
  msg.string[1]:=0
  msg.command:=ximPort      <- XIM port (1 or 2)
```

Our implementation MATCHES this exactly.

## Hypotheses

### Why It Works on Real Amiga

1. **Different DT_NAME timing:** Express.e might not call DT_NAME immediately after character input
2. **Separate string buffer:** Door might use AEDoor.library's string buffer mechanism we haven't discovered
3. **Door expects character accumulation:** Door might expect multiple JH_HK responses in SAME message before DT_NAME
4. **Memory layout difference:** Door might read from a different offset than we expect

### Display Issue

Door shows existing entries ONLY after submitting, not initially:
- `JH_SF` loads style file
- NO display of existing entries initially
- AFTER submit: `[5;0H` displays "Hello from Athens..."
- Suggests door logic error or data validation failure on initial load

## Code Changes Made

### io.ts (XIM Protocol Handler)

**Fixed JH_HK character placement (2026-01-20):**
- Changed from writing character to msg.command → msg.string[0]
- Fixed BOTH code paths: handleHotkey() and completeHotkey()
- Added debug logging for msg.stringPtr tracking
- Matches express.e:3445-3447 exactly

### FileHandle.ts (File Operations)

**Removed O_TRUNC flag (2026-01-20):**
- MODE_NEWFILE now opens without truncation
- Preserves existing file content until Close()
- Matches AmigaDOS behavior for read-while-write scenarios

**Attempted fix (reverted):**
- Tried positioning at EOF for appending
- NOT the issue - door overwrites from position 0
- Reverted to original behavior

### DosLibrary.ts (Debug Logging)

**Added 100-byte read detection:**
- Logs hex/ASCII dump for 100-byte reads
- Confirms door receives correct data: "kokkiklhs...Hello from Athens"
- Buffer at 0x10368c matches file content

## Test Results

**Tested entries:** "test", "yo! cluade", "burp", "ohoy", "toot", "tata", "hoha", "hihi", "test222", "lol", "yes", "hoho", "to", "ko", "poop", "10 characters"

**Every test:**
- Characters echoed correctly ✅ (except when they weren't typed!)
- Data file unchanged (still 100 bytes, old content) ❌
- No crash or errors ✅

**Critical "Ghost Y" Bug (2026-01-20):**
- User typed ~10 characters at "Enter your Line:" prompt
- Door echoed only "y" (which user did NOT type)
- The "y" came from previous prompt "Write Anonymous? (N/y):"
- **Conclusion:** Door is reading stale data from msg.string instead of fresh input
- Indicates data flow corruption between prompts

## Logs

**Latest:** `~/Code/amiexpress-web/logs/door-68k-WALL-20260120202603.-N1.log`

**Key files:**
- Data: `Doors/dRE/dRE!WAll/dRE!WAll.dAtA` (100 bytes)
- Binary: `Doors/dRE/dRE!WAll/dRE!WAll` (11,416 bytes)
- Style: `Doors/dRE/dRE!WAll/dRE!WAll.StYlE.2`

## Failed Attempts

**LINE INPUT MODE (2026-01-20):**
- Hypothesis: JH_HK with data > 1 means line input, not single character
- Implementation: Switched to lineInputBuffer accumulation when data > 1
- Result: WRONG - msg.data is TIMEOUT in seconds, not max length!
- Express.e proof: Line 1128 shows `ch:=readChar(doorTimeout)` - ONE character only
- Reverted this change

## Next Steps for Future Investigation

1. **Fix msg.string clearing** - Ensure msg.string is cleared between XIM calls to prevent stale data
2. **Disassemble door binary** - Understand internal character buffering logic
3. **Compare with working door** - Find door that uses JH_HK successfully
4. **Check AEDoor.library** - Investigate string buffer mechanism
5. **Memory watchpoint** - Track when/how door copies msg.string[0] to internal buffer
6. **DT_NAME alternative** - Check if username should come from different mechanism
7. **Initial display logic** - Why aren't existing entries shown before submit?
8. **"Ghost Y" investigation** - Why is stale prompt text appearing as input?

## Priority

**LOW** - This is a non-essential "graffiti wall" door. Core BBS functionality and important doors (FR, file areas, message bases) take priority.

## Working Around This Door

If users want a wall/graffiti feature, consider:
- Using a different wall door
- Creating a TypeScript door using SDK
- Implementing as BBS command rather than external door

---
**Last Updated:** 2026-01-20
**Total Investigation Time:** ~4 hours
**Sessions:** 2 debug sessions, 15+ test iterations
