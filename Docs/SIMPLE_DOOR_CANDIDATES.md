# Simple Door Candidates for Testing

## Current Status (2025-10-30)

Bulls door (21KB) is too complex - requires full ROM emulation with function pointers.

## Recommended Test Doors (Ordered by Size)

### 1. GetAnswer - 8.0 KB (RECOMMENDED)
**File:** `doors/GetAnswer/GetAnswer`
**Type:** AmigaOS loadseg()ble executable (XIM door)
**Purpose:** Displays new user registration answers
**Library Dependencies:**
- dos.library (standard AmigaDOS)
- AEDoorPort (AmiExpress door interface)
- intuition.library (Amiga GUI - may not be used)
- Amixlib V1.1 (Amiga C library)

**Why Test This First:**
- Smallest Amiga door available (8KB vs 21KB Bulls)
- XIM door like Bulls, so uses same AEDoor.library interface
- Fewer dependencies = less likely to need ROM emulation
- Simple purpose: read user data files and display them

**Expected Behavior:**
- Should prompt for username (or accept wildcard pattern)
- Read user registration data from BBS files
- Display answers in formatted output
- Exit cleanly

**Command to Add:** Use available key (G for GetAnswer?)

---

### 2. aeclidoor - 14 KB
**File:** `doors/aeclidoor`
**Type:** AmigaOS loadseg()ble executable
**Purpose:** CLI door interface for AmiExpress

**Why Test:**
- Medium size (14KB)
- Provides command-line access from BBS
- May have fewer hardware dependencies

---

### 3. sqwk - 17 KB
**File:** `doors/sqwk`
**Type:** AmigaOS loadseg()ble executable
**Purpose:** QWK mail door

**Why Test:**
- Larger but still smaller than Bulls (17KB vs 21KB)
- QWK format is well-documented
- Mail doors are common and well-tested

---

## Already Tested

### AquaBulls (Bulls) - 11-21 KB
**File:** `doors/archives/otl-ab10/Doors/AquaBulls/AquaBulls`
**Status:** FAILS - Requires ROM emulation
**Problem:**
- Reads ROM addresses (0xFF0000, 0xFF0002)
- Expects valid function pointers in ROM
- Crashes at PC=0x0 (NULL) when we return 0
- Needs 256KB Kickstart ROM file

**What Works:**
- Door loads successfully
- Outputs "dos.library" text via aePuts()
- Library trap mechanism works
- Text I/O works

**What Doesn't Work:**
- ROM space reads (needs actual ROM data)
- Function vector tables
- Crashes after ROM reads

---

## TypeScript Doors (No Emulation Needed)

### hello-door
**File:** `doors/hello-door/index.ts`
**Type:** TypeScript (native execution)
**Purpose:** Simple "Hello World" test door

**Why Test:**
- No Amiga emulation required
- Direct access to Node.js environment
- Fastest to execute and debug
- Good for testing door framework

**Note:** This validates the door framework but not Amiga emulation.

---

## Recommendation

**Test in this order:**

1. **GetAnswer** (8KB) - Smallest Amiga door, likely simplest
   - If this works: Amiga door infrastructure is validated!
   - If this fails like Bulls: May need to implement basic ROM reads

2. **aeclidoor** (14KB) - Medium complexity
   - CLI interface may have different requirements
   - Could reveal different emulation needs

3. **hello-door** (TypeScript) - No emulation
   - If Amiga doors keep failing, validate framework works
   - Proves door loading and I/O infrastructure is correct

4. **sqwk** (17KB) - More complex but still smaller than Bulls
   - QWK format door
   - Good for mail subsystem testing

---

## Next Steps

1. Add GetAnswer to BBS menu with available command key (G?)
2. Test by typing command at BBS prompt
3. Monitor logs for:
   - Door loads successfully
   - Library function calls
   - Text output
   - Any ROM reads or crashes
4. If GetAnswer also needs ROM: Consider implementing minimal ROM stub
5. If GetAnswer works: CELEBRATE! Door infrastructure validated!

---

## Analysis Notes

**Key Difference Between Bulls and GetAnswer:**

- **Bulls (21KB):** Complex game door, likely reads ROM for graphics/sound
- **GetAnswer (8KB):** Simple data display, likely just reads files

GetAnswer is 62% smaller, which suggests significantly fewer dependencies.

**If GetAnswer works, it proves:**
- Door loading works
- Library traps work
- dos.library functions work
- AEDoor.library functions work
- Text I/O works
- File I/O works (reads user data)
- Door framework is correct

**If GetAnswer also fails:**
- May need to implement basic ROM space reads
- Could use vAmiga sources as reference
- Consider creating minimal ROM stub with safe defaults

---

## Door Size Comparison

```
GetAnswer:    8,192 bytes (smallest)  ← TEST THIS FIRST
AquaBulls:   11,264 bytes (crashes)
aeclidoor:   14,336 bytes
sqwk:        17,408 bytes
Bulls:       21,828 bytes (too complex)
FastDupe:    10,824 bytes (not tested)
```

Smaller = simpler = more likely to work without full ROM emulation.
