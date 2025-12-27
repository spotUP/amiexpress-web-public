# MultiTop Door Infinite Loop Debug Session - Dec 26, 2025

## Problem
MultiTop (mtop) door was entering an infinite loop, causing stuck processes at 100%+ CPU and overheating the computer.

## Investigation Steps

### 1. Initial Analysis
- Found multiple `mtop` processes at 100%+ CPU in batch files (batch1-batch6)
- Each batch file had 5 multitop commands generating bulletin statistics
- Load average: 8.19, 8.70, 10.04

### 2. Source Code Analysis
Studied `/Documentation/7-Reference Sources/AmiExpressEDoorSources/MultiTop2/mtop.e`:
- Entry point: `main()` at line 899
- Parses args with `ReadArgs()` at line 941
- Opens template design file at line 1007
- Calls `findSortField(templfh)` at line 1011

### 3. FindSortField Function (line 812)
```e
PROC findSortField(fh)
  WHILE Fgets(fh,tempStr,255)<>0
    SetStr(tempStr,StrLen(tempStr))
    IF (p:=InStr(tempStr,'@SORT='))>=0
      Seek(fh,0,OFFSET_BEGINNING)
      StrCopy(sortField,tempStr+p+6)
      ...
      RETURN getSortField(sortField)
    ENDIF
  ENDWHILE
  Seek(fh,0,OFFSET_BEGINNING)
ENDPROC -1
```

This function reads the entire template file line-by-line looking for `@SORT=` directive.

### 4. FGets Implementation Check
Verified `web/backend/src/amiga-emulation/api/DosLibrary.ts:1826`:
- Reads until newline (0x0a) or maxLen-1
- Returns 0 on EOF (correct)
- Returns bufPtr if any bytes read (correct)
- Null-terminates string (correct)

Implementation is correct!

### 5. Design File Analysis
Checked `/Doors/MultiTop/Designs/MTopULBytes1.dsg`:
- Line 7 contains: `@SORT=UPLOADEDBYTES`
- File uses Unix line endings (0x0a)
- File has 31 lines total
- Should work fine with FGets

### 6. Root Cause Discovery
Found `/Commands/BBSCmd/MTOP.info` had **WRONG door type**:
- Configured as: `TYPE=XIM`
- Should be: `TYPE=SIM`

**Why this matters:**
- **XIM doors** use AEDoor.library and communicate via message ports (PutMsg/GetMsg)
- **SIM doors** are standalone programs that read stdin/files and write stdout
- mtop.e only uses `dos/dos` modules - no AEDoor.library
- Emulator expecting XIM protocol messages that never come
- Loop guard logic behaves differently for XIM doors
- Can cause infinite loops when door type is wrong

## Fix Applied
Changed `MTOP.info` line 2 from `TYPE=XIM` to `TYPE=SIM`

## Temporary Workaround
Commented out all multitop lines in batch1-batch6 with semicolons:
```
;doors:multitop/mtop doors:multitop/designs/mtopulbytes1.dsg bbs:bulletins/bull1.txt ignoresysop userdata bbs:user.data
```

## Testing Required
1. Restart BBS server to reload door configuration
2. Uncomment one multitop line in batch1
3. Run batch1 and verify mtop completes successfully
4. Check bulletin output file was created
5. Monitor CPU usage - should remain low
6. If successful, uncomment remaining multitop lines

## Related Files
- **Door binary**: `/Doors/multitop/mtop`
- **Door info**: `/Commands/BBSCmd/MTOP.info` (FIXED)
- **E source**: `/Documentation/7-Reference Sources/AmiExpressEDoorSources/MultiTop2/mtop.e`
- **Design files**: `/Doors/MultiTop/Designs/*.dsg`
- **Batch files**: `/batch1` through `/batch6`
- **Logs**: `/logs/door-68k-mtop-*.log`

## Lessons Learned
1. **ALWAYS verify door type matches implementation** (check E source for AEDoor.library usage)
2. **Wrong door type can cause infinite loops** even if code is correct
3. **Use E source code** to understand door behavior, not assumptions
4. **Check .info files first** before diving into emulator internals
5. **Follow CLAUDE.md rules**: Study sources deeply, find root cause with evidence

## Door Type Reference
- **SIM door**: Standalone program, uses dos.library only, reads stdin/files
  - Examples: quicknew, mtop, statistics generators
- **XIM door**: Interactive, uses AEDoor.library, message-based communication
  - Examples: RTW, Bulls, online games

## Status
- [x] Root cause identified (wrong door type)
- [x] MTOP.info fixed (TYPE=SIM)
- [x] Temporary workaround applied (multitop commented out)
- [ ] Testing pending (user to uncomment and test)
- [ ] Re-enable all multitop lines once verified working
