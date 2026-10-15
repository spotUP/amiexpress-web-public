# exec.library LVO Offset Audit Report - CRITICAL ISSUES FOUND
**Date**: 2025-12-16
**Status**: 🚨 EMERGENCY - 26+ functions have WRONG offsets

## Executive Summary

Comprehensive audit of exec.library reveals **systematic offset errors** affecting 26+ critical system functions. Semaphore operations, I/O functions, list operations, and interrupt control functions all have incorrect LVO offsets.

**Impact**: CRITICAL - This causes:
- Door crashes when calling fundamental OS functions
- Incorrect function dispatch (calling wrong system function!)
- Memory corruption from parameter mismatches
- Semaphore deadlocks (wrong sync primitives called)
- I/O failures (wrong device operations)

## exec.library Discrepancies

### CRITICAL: System Synchronization (Semaphores)
| Function | Our Offset | Official Offset | Error | Notes |
|----------|------------|-----------------|-------|-------|
| **InitSemaphore** | -348 | **-558** | -210 | Off by 210! Wrong function called |
| **ObtainSemaphore** | -300 | **-564** | -264 | Off by 264! Conflicts with SetTaskPri |
| **ReleaseSemaphore** | -312 | **-570** | -258 | Off by 258! Deadlock risk |
| **AttemptSemaphore** | -588 | **-576** | -12 | Off by 12 |
| **FindSemaphore** | -432 | **-594** | -162 | Off by 162! |
| **AddSemaphore** | -438 | **-600** | -162 | Off by 162! |
| **RemSemaphore** | -444 | **-606** | -162 | Off by 162! |

### CRITICAL: I/O Operations
| Function | Our Offset | Official Offset | Error | Notes |
|----------|------------|-----------------|-------|-------|
| **DoIO** | -516 | **-456** | -60 | Off by 60! |
| **SendIO** | -522 | **-462** | -60 | Off by 60! |
| **CheckIO** | -528 | **-468** | -60 | Off by 60! |
| **CreateIORequest** | -504 | **-654** | -150 | Off by 150! |
| **DeleteIORequest** | -510 | **-660** | -150 | Off by 150! |

### CRITICAL: Interrupt Control
| Function | Our Offset | Official Offset | Error | Notes |
|----------|------------|-----------------|-------|-------|
| **Disable** | -162 | **-120** | -42 | Off by 42! Wrong IRQ control |
| **Enable** | -168 | **-126** | -42 | Off by 42! Wrong IRQ control |
| **Forbid** | -174 | **-132** | -42 | Off by 42! Wrong multitasking |
| **Permit** | -180 | **-138** | -42 | Off by 42! Wrong multitasking |

### HIGH: List Operations
| Function | Our Offset | Official Offset | Error | Notes |
|----------|------------|-----------------|-------|-------|
| **Insert** | -252 | **-234** | +18 | REVERSED with Remove! |
| **AddHead** | -258 | **-240** | -18 | Off by 18! |
| **AddTail** | -264 | **-246** | -18 | Off by 18! |
| **Remove** | -246 | **-252** | +6 | Off by 6 |
| **RemHead** | -234 | **-258** | +24 | Off by 24! |
| **RemTail** | -240 | **-264** | +24 | Off by 24! |

### MEDIUM: Other Functions
| Function | Our Offset | Official Offset | Error | Notes |
|----------|------------|-----------------|-------|-------|
| **SetTaskPri** | -282 | **-300** | +18 | Conflicts with ObtainSemaphore |
| **AvailMem** | -210 | **-216** | +6 | CONFLICTS with FreeMem at -210! |

### Duplicate Offsets (Remove Old Incorrect)
| Function | Old (Wrong) | New (Correct) | Status |
|----------|-------------|---------------|--------|
| **CopyMem** | -474 | **-624** | Duplicate exists |
| **CopyMemQuick** | -480 | **-630** | Duplicate exists |

## Patterns Identified

### Pattern 1: Semaphore Functions (V36+)
**ALL semaphore functions have wrong offsets**, consistently off by 12-264:
- InitSemaphore: Off by 210
- ObtainSemaphore: Off by 264 (most severe!)
- ReleaseSemaphore: Off by 258
- Find/Add/RemSemaphore: Off by 162

### Pattern 2: I/O Functions
**ALL I/O functions off by 60-150**:
- DoIO, SendIO, CheckIO: Off by 60
- CreateIORequest, DeleteIORequest: Off by 150

### Pattern 3: Interrupt Control
**ALL interrupt functions off by 42**:
- Disable, Enable, Forbid, Permit all consistently wrong

### Pattern 4: List Operations
**ALL list functions have systematic errors**:
- Head/Tail operations off by 18-24
- Insert and Remove REVERSED positions!

## Offset Conflicts

**CRITICAL Conflicts to Resolve:**
- **-210**: Used by both FreeMem (correct) and AvailMem (wrong - should be -216)
- **-300**: Used by both SetTaskPri (wrong - should be -300 correct!) and ObtainSemaphore (wrong - should be -564)
- **-474**: CopyMem duplicate (remove - correct offset is -624)
- **-480**: CopyMemQuick duplicate (remove - correct offset is -630)

## Impact Assessment

**Functions Affected**: 26+
**Doors Impacted**: ANY door using:
- Semaphore synchronization (most complex doors)
- Device I/O (file doors, communication doors)
- List operations (data structure management)
- Interrupt control (timing-sensitive doors)

**Severity**:
- 🔴 CRITICAL (20 functions): Wrong function called, crashes/deadlocks
- 🟡 HIGH (6 functions): Minor offset errors, data corruption risk
- ⚠️ CONFLICTS (2 functions): Multiple functions at same offset

## Recommended Fix Strategy

### Phase 1: IMMEDIATE (Semaphore Functions - Deadlock Risk)
1. InitSemaphore: -348 → -558
2. ObtainSemaphore: -300 → -564
3. ReleaseSemaphore: -312 → -570
4. AttemptSemaphore: -588 → -576
5. FindSemaphore: -432 → -594
6. AddSemaphore: -438 → -600
7. RemSemaphore: -444 → -606

### Phase 2: I/O Functions (Device Failures)
8. DoIO: -516 → -456
9. SendIO: -522 → -462
10. CheckIO: -528 → -468
11. CreateIORequest: -504 → -654
12. DeleteIORequest: -510 → -660

### Phase 3: Interrupt Control (System Stability)
13. Disable: -162 → -120
14. Enable: -168 → -126
15. Forbid: -174 → -132
16. Permit: -180 → -138

### Phase 4: List Operations (Data Structures)
17. Insert: -252 → -234
18. AddHead: -258 → -240
19. AddTail: -264 → -246
20. Remove: -246 → -252
21. RemHead: -234 → -258
22. RemTail: -240 → -264

### Phase 5: Misc & Cleanup
23. SetTaskPri: -282 → -300 (VERIFY - already correct?)
24. AvailMem: -210 → -216
25. Remove CopyMem duplicate at -474 (keep -624)
26. Remove CopyMemQuick duplicate at -480 (keep -630)

### Phase 6: Verification
- Check for remaining offset conflicts
- Verify TypeScript compilation
- Re-run diagnostic tests
- Test semaphore-heavy doors

## Next Steps

1. ✅ Create exec.library audit report
2. ⏳ Fix all 26+ offsets systematically
3. ⏳ Remove duplicate case statements
4. ⏳ Verify TypeScript compilation
5. ⏳ Re-test with diagnostic door
6. ⏳ Complete remaining library audits (if any)

## Estimated Fix Time

- Fix all exec.library offsets: 1 hour
- Test and verify: 30 minutes
- **Total**: 1.5 hours

---

**Priority**: 🔴 BLOCKING - Critical system functions
**Severity**: CRITICAL - Affects semaphores, I/O, interrupts
**Combined with dos.library**: 51+ functions with wrong offsets system-wide
