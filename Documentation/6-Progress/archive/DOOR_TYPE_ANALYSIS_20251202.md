# Door Type Analysis - 2025-12-02

## Critical Discovery: Most "SIM" Doors Are Actually XIM

### Tested Doors

| Door | Binary Says | Port Type | 0x790 Access | Verdict |
|------|------------|-----------|--------------|---------|
| WHO | "/X DooR by SPY/MST" | AEDoorPort | YES (0x1176) | Unique hybrid |
| RTW | "XIM-DOOR for AmiExpress 3.x" | AEDoorPort%d | NO | XIM door |
| What | (none) | AEDoorPort%s | NO | XIM door |
| SizeCheck | "XIM-DOOR for AmiExpress 4.x" | AEDoorPort%d | NO | XIM door |

### Key Findings

1. **RTW, What, SizeCheck are XIM doors**
   - All look for "AEDoorPort" (XIM protocol)
   - Use standard XIM message-based communication
   - Should work with existing XIM implementation

2. **WHO is unique**
   - Uses `movea.l 0x790.l, a0` + `jsr (a0)` BBS API calling convention
   - ALSO looks for "AEDoorPort" (hybrid behavior?)
   - Uses self-modifying code that rewrites BBS API calls

3. **No true "SIM" doors found yet**
   - None of the tested doors use "DoorControl" port
   - The "SIM" designation may be incorrect or WHO is special case

## WHO Door Self-Modification Issue

### Static Binary (0x1174):
```
0x1174: 67 08           beq.b 0x117e
0x1176: 20 79 00 00 07 90   movea.l 0x790.l, a0
0x117c: 4e 90           jsr (a0)
```

### Runtime Execution (0x1174):
```
0x1174: 4a aa           tst.l (a2)  [DIFFERENT!]
0x1178: 66 00           bne.b ...   [DIFFERENT!]
```

**Conclusion**: WHO rewrites its BBS API call instructions at runtime, so our 0x790 dispatcher never gets called.

## BBS API Implementation Status

### ✅ Implementation Complete
- `BbsApiLibrary.ts` - Stub dispatcher with logging
- `LibraryTraps.ts` - Custom trap registration
- `LibraryManager.ts` - 0x790 setup for SIM doors
- All verification checks pass

### ❌ Cannot Test
- WHO uses self-modifying code - breaks static expectations
- No other SIM doors found to test with

## Recommendations

1. **Test XIM doors**: RTW, What, SizeCheck should work with existing XIM implementation
2. **WHO is special case**: May need different approach or TypeScript port
3. **Search for true SIM doors**: Need to find doors using "DoorControl" port
4. **Document findings**: Update door type detection in DoorLoader

## Next Steps

1. Test RTW as XIM door (add rtw.info with DOORTYPE=XIM)
2. Test What and SizeCheck as XIM doors
3. Search entire doors collection for "DoorControl" string
4. Consider WHO a special case requiring different solution

---

**Date**: 2025-12-02
**Session**: 8 (continued)
**Status**: Door type confusion resolved - most "SIM" doors are actually XIM
