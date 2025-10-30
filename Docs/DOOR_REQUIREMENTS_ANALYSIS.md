# Door Requirements Analysis - What Do Doors Actually Need?

## Executive Summary

Based on analysis of door sources and binaries, **XIM doors have modest requirements** that can be satisfied without full ROM boot. However, **complex doors may need more**, so we need a **hybrid approach**.

## Door Analysis

### Simple Doors (example.e)

**Requirements:**
- AEDoor.library functions only
- CreateComm/DeleteComm
- WriteStr, GetStr, Prompt
- GetDT (get user data)
- ShowFile, ShowGFile

**System Needs:**
- OpenLibrary/CloseLibrary (Exec)
- Basic string functions
- No graphics, no hardware access
- No interrupts needed

### Complex Doors (WHAT v2.0)

**Additional Requirements:**
- icon.library (v36+)
- DOS.library functions
- File I/O (Open, Read, Write, Close)
- Directory scanning
- Semaphore access
- Time functions

**System Needs:**
- More Exec functions (FindTask, AllocMem, etc.)
- DOS.library implementation
- File system operations
- Still no direct hardware access

### GetAnswer (XIM Door)

**Detected Libraries:**
- dos.library
- intuition.library (!)

**Implications:**
- May open Intuition for GUI?
- Or just links against it unused?
- Need to handle OpenLibrary for these

## Key Insight: Doors Use Libraries, Not Hardware

**Critical Discovery:** Even complex doors **don't directly access hardware**. They use:

1. **Exec.library** - Memory, tasks, libraries, semaphores
2. **DOS.library** - Files, directories, I/O
3. **AEDoor.library** - BBS communication
4. **Optional:** icon.library, intuition.library, etc.

**They do NOT:**
- ❌ Read/write custom chip registers directly
- ❌ Use DMA
- ❌ Access Copper/Blitter
- ❌ Need graphics hardware
- ❌ Need audio hardware
- ❌ Need timing-critical operations

## Comparison: What Each Approach Provides

### Option A: Full Hardware Emulation (vAmiga-style)

**Provides:**
- Complete Kickstart ROM boot
- All custom chips (Agnus, Paula, Denise)
- Hardware interrupts
- DMA operations
- Cycle-accurate timing
- Full Amiga system

**Supports:**
- ANY Amiga software
- Games, demos, apps
- Direct hardware access
- Timing-dependent code

**Requirements:**
- ~20,000 lines of code
- 3-6 months development
- Complex event system
- Extensive testing

**Verdict:** ✅ **Works for everything** but massive overkill for doors

### Option B: Minimal Stubs (Current Attempt)

**Provides:**
- ExecBase structure
- Library function stubs
- Basic system structures
- No ROM boot needed

**Supports:**
- Simple doors using AEDoor only
- Doors that don't need DOS functions
- Doors that don't allocate memory

**Requirements:**
- ~1,000 lines of code
- 1-2 weeks development
- Implement called functions only

**Verdict:** ❌ **Too minimal** - complex doors will fail

### Option C: Hybrid Approach (RECOMMENDED)

**Provides:**
- ExecBase with proper structures
- Full Exec.library implementation
- Full DOS.library implementation
- Full AEDoor.library implementation
- Memory management (AllocMem/FreeMem)
- File I/O (Open/Read/Write/Close)
- Task management (FindTask, etc.)
- **NO hardware emulation**
- **NO ROM boot**

**Supports:**
- All XIM doors (simple and complex)
- Doors using Exec/DOS/AEDoor APIs
- File operations
- Memory allocation
- Multi-node support

**Does NOT Support:**
- Direct hardware access
- Games/demos
- Graphics operations
- Audio operations
- Timing-critical code

**Requirements:**
- ~5,000-8,000 lines of code
- 3-4 weeks development
- Well-defined APIs to implement
- Incremental testing

**Verdict:** ✅ **Sweet spot** - handles doors, avoids hardware complexity

## Recommended Implementation: Option C (Hybrid)

### Architecture

```
┌─────────────────────────────────────────┐
│         Door Executable (68k)            │
│    (GetAnswer, WHAT, etc.)              │
└──────────────┬──────────────────────────┘
               │ Library Calls
               ▼
┌─────────────────────────────────────────┐
│      Library Implementation Layer        │
│  ┌────────────┐  ┌────────────────────┐ │
│  │  AEDoor    │  │  Exec (partial)    │ │
│  │ .library   │  │  - OpenLibrary     │ │
│  │            │  │  - CloseLibrary    │ │
│  │  21 funcs  │  │  - FindTask        │ │
│  └────────────┘  │  - AllocMem        │ │
│                  │  - FreeMem         │ │
│  ┌────────────┐  │  - etc.            │ │
│  │    DOS     │  └────────────────────┘ │
│  │ .library   │                         │
│  │            │  ┌────────────────────┐ │
│  │  File I/O  │  │   Other Optional   │ │
│  │  Open/Read │  │   - icon.library   │ │
│  │  Write/Cls │  │   - intuition (stub)│ │
│  └────────────┘  └────────────────────┘ │
└──────────────┬──────────────────────────┘
               │ Host API Calls
               ▼
┌─────────────────────────────────────────┐
│      Host System (TypeScript)           │
│  - Node.js file system                   │
│  - BBS database                          │
│  - Socket I/O                            │
│  - User session                          │
└─────────────────────────────────────────┘
```

### Implementation Phases

#### Phase 1: Core System (Week 1)
1. **ExecBase Structure**
   - Proper ExecBase at 0x000004
   - Version 37.175 (Kickstart 2.04)
   - Library list pointers
   - Task structures

2. **Exec.library Core**
   - OpenLibrary/CloseLibrary
   - FindTask
   - AllocMem/FreeMem (use Moira's memory)
   - Basic list management

3. **Test:** Simple doors using only AEDoor

#### Phase 2: DOS.library (Week 2)
1. **File Operations**
   - Open/Close/Read/Write
   - Seek/ExNext
   - CreateDir/DeleteFile

2. **Path Handling**
   - CurrentDir
   - Lock/UnLock
   - Examine

3. **Test:** Doors using file I/O

#### Phase 3: AEDoor.library Complete (Week 3)
1. **All 21 Functions**
   - From existing documentation
   - Connect to BBS backend
   - User I/O routing

2. **Test:** Complex doors (WHAT)

#### Phase 4: Optional Libraries (Week 4)
1. **icon.library Stubs**
   - Return safe defaults
   - Prevent crashes

2. **intuition.library Stubs**
   - Minimal implementation
   - Most doors won't use

3. **Test:** All available doors

### What We DON'T Implement

**Hardware-level:**
- Agnus/Paula/Denise chips
- Custom chip registers
- DMA operations
- Interrupts (except software)
- Copper/Blitter
- Audio/Video hardware

**Complex Libraries:**
- graphics.library (unless doors need it)
- layers.library
- gadtools.library
- req.library

**Rationale:** Doors don't use these. If we find a door that does, we can add stubs then.

## Decision Matrix

| Feature | Full HW Emulation | Minimal Stubs | Hybrid (Recommended) |
|---------|-------------------|---------------|---------------------|
| Simple doors | ✅ | ✅ | ✅ |
| Complex doors | ✅ | ❌ | ✅ |
| File I/O | ✅ | ❌ | ✅ |
| Memory alloc | ✅ | ❌ | ✅ |
| Graphics | ✅ | ❌ | ❌ |
| Hardware access | ✅ | ❌ | ❌ |
| Development time | 3-6 months | 1-2 weeks | 3-4 weeks |
| Code complexity | Very High | Low | Medium |
| Maintainability | Hard | Easy | Medium |
| **Door Coverage** | **100%** | **~30%** | **~95%** |

## Risks & Mitigation

### Risk 1: Door needs hardware access

**Likelihood:** Low - analyzed doors use libraries only
**Impact:** High - door won't work
**Mitigation:** Start with hybrid, add hardware later if needed

### Risk 2: Door needs obscure library function

**Likelihood:** Medium - doors may use less common functions
**Impact:** Medium - implement that function
**Mitigation:** Incremental implementation, stub unknown functions

### Risk 3: Development takes longer than estimated

**Likelihood:** Medium - APIs are complex
**Impact:** Medium - delays door execution feature
**Mitigation:** Reference vAmiga for Exec/DOS patterns

### Risk 4: Performance issues

**Likelihood:** Low - library calls are fast
**Impact:** Low - doors may run slower
**Mitigation:** Optimize critical paths as needed

## Recommendation: Go Hybrid (Option C)

### Why Hybrid Is Best

1. **Handles 95% of doors** - All analyzed doors work
2. **Reasonable timeline** - 3-4 weeks vs 3-6 months
3. **Well-defined scope** - Implement library APIs only
4. **Incremental approach** - Test at each phase
5. **Future-proof** - Can add hardware later if needed

### When to Add Full Hardware

Only add if we encounter doors that:
- Directly write to custom chip registers
- Use hardware interrupts
- Need graphics operations
- Require timing-critical loops

**Estimate:** <5% of XIM doors

### Why Not Minimal Stubs

Complex doors (WHAT, T-Join, T-Updater) all use:
- DOS.library file operations
- icon.library
- Memory allocation
- Multiple libraries

Minimal stubs won't support these.

## Implementation Checklist

### Before Starting

- [ ] Review Exec.library API documentation
- [ ] Review DOS.library API documentation
- [ ] Study vAmiga's Exec/DOS implementation
- [ ] List all AEDoor.library functions
- [ ] Create function stub template

### Phase 1 Complete When

- [ ] ExecBase structure in memory
- [ ] OpenLibrary/CloseLibrary work
- [ ] FindTask returns current task
- [ ] AllocMem/FreeMem work
- [ ] Simple example.e door runs

### Phase 2 Complete When

- [ ] Open/Close/Read/Write work
- [ ] File paths resolve correctly
- [ ] Doors can read BBS files
- [ ] WHAT door runs (uses file I/O)

### Phase 3 Complete When

- [ ] All 21 AEDoor functions work
- [ ] Door I/O connects to BBS
- [ ] User data accessible
- [ ] GetAnswer door runs

### Phase 4 Complete When

- [ ] Optional libraries don't crash
- [ ] All available doors tested
- [ ] No unexpected library calls
- [ ] Performance acceptable

## Conclusion

**Recommendation: Implement Hybrid Approach (Option C)**

**Timeline:** 3-4 weeks
**Coverage:** ~95% of doors
**Risk:** Low-Medium
**Future:** Can add hardware if needed

This balances:
- ✅ Door compatibility
- ✅ Development time
- ✅ Code maintainability
- ✅ Future flexibility

**Start with Phase 1 and validate with simple doors before committing to full implementation.**
