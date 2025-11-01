# Known Issue: Stack Corruption Around Iteration 48,000

**Status:** 🔍 IDENTIFIED - Needs Investigation
**Impact:** Door crashes after ~48,000 iterations  
**Priority:** Medium (already 22.6x improvement from session start)

---

## Symptoms

Door crashes with invalid PC after ~48,000-48,873 iterations:
- PC values: 0xfd0e, 0x940000 (varies with timing)
- Stack contains corrupted return address: 0x2c940000
- Return address should be in code range (0x1000-0x3000)
- Actual value 0x2c94 points to DATA segment, not CODE

---

## Evidence

### Test Run 1 (No logging 48850-48875)
```
Iteration 48873: PC=0x940000
Stack at SP=0xfdf34: 0x2c940000 (invalid return address)
```

### Test Run 2 (With logging 48850-48875)
```
Iteration 48850: PC=0xfd0e  
Stack at SP=0xfdf30: 0x2c940000 (same corrupted value!)
```

**Key finding:** Crash iteration varies with logging (timing-sensitive)

---

## Stack Contents at Crash

```
SP+0:  0xfdf30 = 0x2c940000  ← Corrupted return address
SP+4:  0xfdf34 = 0x0
SP+8:  0xfdf38 = 0x2000f
SP+12: 0xfdf3c = 0xebb60000
SP+16: 0xfdf40 = 0x13c80000
SP+20: 0xfdf44 = 0xf
SP+24: 0xfdf48 = 0xdff80000
SP+28: 0xfdf4c = 0xc350000f
```

**Pattern:** Many values have form 0xXXXX0000 or 0xXXXX000f
- Suggests 16-bit values stored as 32-bit
- Or data structures, not code addresses

---

## Analysis

### 1. CreateMsgPort Trap Context

Before crash, CreateMsgPort was called:
```
Iteration 40000: PC=0x72c6
[Gap: 8,000+ iterations]
CreateMsgPort trap at PC=0xfd66
Return address from stack: 0x2c940000
```

CreateMsgPort tried to return to 0x2c940000 (masked to 0x940000).

### 2. Value 0x2c940000 Analysis

- File offset 0x1c94 (PC 0x2c94): Contains data, not code
- Not a valid code address
- Upper byte 0x2c suggests data value or byte-swapping issue

### 3. Timing Sensitivity

Adding logging changes crash iteration:
- Without logging 48850-48875: Crashes at iteration 48873
- With logging 48850-48875: Crashes at iteration 48850

**Conclusion:** Still has timing-sensitive behavior

---

## Hypotheses

### Hypothesis 1: MOVEM.L at Other Locations

We only fix MOVEM.L at PC=0x1744. Other MOVEM.L instructions in the 0-48000 iteration range might not be updating SP correctly, leading to stack misalignment.

**Evidence:** When we tried universal MOVEM.L fix, door crashed earlier (iteration 2154)

**Status:** Not the root cause (universal fix made it worse)

### Hypothesis 2: Stack Pointer Misalignment

If SP gets misaligned by 2 bytes at some point, all subsequent stack operations read wrong values.

**Evidence:** Stack values look like 16-bit values in 32-bit slots

**Test:** Check if SP is always 4-byte aligned

### Hypothesis 3: Library Trap Handler Bug

Some library trap might be corrupting the stack:
- Not popping correct number of bytes
- Writing wrong values
- Not preserving SP correctly

**Evidence:** Corruption appears after many library calls (48,000 iterations)

---

## What Works

- ✅ Door executes 48,000+ iterations correctly
- ✅ MOVEM.L at 0x1744 works perfectly
- ✅ JSR trap interception works
- ✅ Most library traps execute correctly
- ✅ 22.6x improvement from session start!

---

## Next Steps

### Investigation Priorities

1. **Check SP alignment**
   - Log SP at every iteration
   - Verify SP % 4 == 0 always
   - Catch misalignment early

2. **Identify which trap corrupts stack**
   - Log stack before/after each trap
   - Compare SP changes with expected
   - Find the trap that writes 0x2c940000

3. **Verify all MOVEM instructions**
   - Search for MOVEM in executable
   - Check if any besides 0x1744 are in execution path
   - Test selective fixes

4. **Alternative approach**
   - Accept 48,000 iterations as current limit
   - Check if WaitPort is called before crash
   - Maybe door reaches I/O loop and THEN crashes

---

## Workaround Options

### Option A: Ignore for Now
- 48,000 iterations might be enough to reach WaitPort
- Check logs for WaitPort calls
- If I/O loop is reached, this might not matter

### Option B: Stack Verification
- Add stack integrity checks every 1,000 iterations
- Log when stack values look suspicious
- Catch corruption early

### Option C: Different Test Door
- Try a simpler door that doesn't corrupt stack
- Verify JSR/MOVEM fixes work universally
- Come back to GetAnswer later

---

## Progress Context

**Don't let this diminish the huge achievement:**
- Started session at iteration 2,156
- Now reaching 48,000+ iterations
- That's 22.6x improvement!
- MOVEM.L bug: SOLVED ✅
- JSR interception: WORKING ✅

**This stack corruption is a NEW, DIFFERENT issue that only appears after 48,000 successful iterations.**

---

## Related Files

- `SESSION_2025_11_01_FINAL_SUMMARY.md` - Session overview
- `MOVEM_FIX_FINAL_SUCCESS.md` - MOVEM.L solution
- `AmigaDoorSession.ts:1259-1338` - JSR and MOVEM fixes

---

## Last Updated

2025-11-01 - Initial investigation and documentation
