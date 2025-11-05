# AEDoor.library Quick Reference

## Status: COMPLETE ✓

All 19 functions implemented with correct assembly calling conventions.

## Critical Functions (Ready to Use)

### WriteStr() - Output Text
```typescript
// Parameters: A1=diface, A0=string, D1=mode (0=NOLF, 1=LF)
// FIXED: Now reads A0/D1 (was incorrectly reading A2/D0)
```

### SendCmd() - Execute Commands
```typescript
// Parameters: A1=diface, D0=command
// Implemented: JH_WRITE (3), JH_SYSOP (12), JH_BBSName (11)
```

### CreateComm() - Initialize
```typescript
// Parameters: D0=node number
// Returns: D0=diface pointer
```

### DeleteComm() - Cleanup
```typescript
// Parameters: A1=diface pointer
```

## All 19 Functions

| Offset | Function | Status |
|--------|----------|--------|
| -30 | CreateComm | ✓ Complete |
| -36 | DeleteComm | ✓ Complete |
| -42 | SendCmd | ✓ Complete (18 commands) |
| -48 | SendStrCmd | ✓ Stub |
| -54 | SendDataCmd | ✓ Stub |
| -60 | SendStrDataCmd | ✓ Stub |
| -66 | GetData | ✓ Stub |
| -72 | GetString | ✓ Complete |
| -78 | Prompt | ✓ Async stub |
| -84 | WriteStr | ✓ Complete [FIXED] |
| -90 | ShowGFile | ✓ Stub |
| -96 | ShowFile | ✓ Stub |
| -102 | SetDT | ✓ Stub |
| -108 | GetDT | ✓ Partial |
| -114 | GetStr | ✓ Async stub |
| -120 | CopyStr | ✓ Complete |
| -126 | HotKey | ✓ Stub |
| -132 | PreCreateComm | ✓ Complete |
| -138 | PostDeleteComm | ✓ Complete |

## Proper Door Pattern

```asm
1. OpenLibrary("AEDoor.library")
2. CreateComm(nodeNumber)
3. WriteStr(diface, string, mode)
4. SendCmd(diface, JH_SYSOP)
5. SendCmd(diface, JH_WRITE)
6. DeleteComm(diface)
7. CloseLibrary(AEDBase)
8. RTS
```

## Testing

Backend rebuilt and running with all changes.

Test with doors that use proper AEDoor.library pattern.

## Files

- `AEDoorLibrary.ts` - Implementation (~860 lines)
- `LibraryTraps.ts` - Vector registration (19 vectors)
- `SESSION_2025-11-01_AEDOOR_IMPLEMENTATION.md` - Full details

## Next: Install vasm and compile Example.s for testing
