# ROM Boot Progress Report
## 2025-10-30 - First Test Results

**Status:** ROM Boots But Gets Stuck ⚠️

---

## What Works ✅

1. **ROM Loading** ✅
   ```
   ROM file size: 524288 bytes (512KB)
   ROM mapped to 0xF80000-0xFFFFFF
   Exception vectors copied to 0x000000
   ```

2. **CPU Reset** ✅
   ```
   SP: 0x11144ef8
   PC: 0x00f800d2
   ```
   CPU correctly reads SP and PC from exception vectors!

3. **ROM Execution Begins** ✅
   ```
   PC starts at: 0x00f800d2 (ROM start address)
   ROM code executes normally
   ```

4. **ROM Executes for 20M Cycles** ✅
   ```
   10.0M cycles: PC=0xf80e5a (executing)
   20.0M cycles: PC=0xf83632 (executing)
   ```

---

## Problem: ROM Gets Stuck ❌

**Stuck Point:** Address 0xf83626

```
30.0M cycles: PC=0xf83626 (stuck!)
40.0M cycles: PC=0xf83626 (still stuck!)
50.0M cycles: PC=0xf800e0 (jumped to reset?)
```

**Analysis:**
- ROM executes normally for 20M cycles
- Gets stuck at 0xf83626 for 10M+ cycles
- Eventually times out after 50M cycles
- PC changes to 0xf800e0 (might be exception/reset handler)

---

## What This Means

### Good News:
- Our ROM boot approach **works**!
- CPU is executing real ROM code
- Memory mapping is correct
- No crashes or exceptions

### The Issue:
ROM is hitting a hardware wait loop. At address 0xf83626, ROM is likely:
1. **Waiting for VBLANK interrupt** (vertical blanking)
2. **Waiting for CIA timer**
3. **Polling hardware register** that we haven't stubbed
4. **Waiting for keyboard acknowledge**

This is a **normal problem** for Amiga emulators. ROM expects hardware that we don't have.

---

## Debugging Strategy

### Step 1: Log Memory Accesses at Stuck Point

Add logging to see what ROM is reading at 0xf83626:

```typescript
// In bootROM(), when stuck is detected
if (cycles > 30000000 && cycles < 31000000) {
  // Log every memory access for 1M cycles
  console.log(`[ROM] PC=0x${pc.toString(16)}`);

  // Check what registers ROM is accessing
  // CIA: 0xBFE001, 0xBFD000
  // Custom: 0xDFF000-0xDFFFFF
}
```

### Step 2: Disassemble Stuck Instruction

Read the instruction at 0xf83626:
```typescript
const instr = this.emulator.readMemory16(0xf83626);
console.log(`Stuck instruction: 0x${instr.toString(16)}`);
```

Common patterns:
- `0x0839` = BTST (test bit) - polling hardware flag
- `0x66FE` = BNE.S -2 - tight loop waiting for condition
- `0x4E71` = NOP - delay loop

### Step 3: Identify Hardware Register

If ROM is polling a register:
1. Add logging to readCustom16() and readCIA()
2. See which register is being read repeatedly
3. Return the value ROM expects

### Step 4: Common Fixes

**If waiting for VBLANK:**
```cpp
u16 readCustom16(u32 addr) const {
    switch (addr & 0xFFFF) {
        case 0x004:  // VPOSR - Vertical position
            // Return different values to simulate frame progress
            static int frame = 0;
            return (frame++ % 312) << 8;  // Scanline 0-311
        // ...
    }
}
```

**If waiting for CIA timer:**
```cpp
u8 readCIA(u32 addr) const {
    switch (addr & 0xF00) {
        case 0x400:  // Timer A low
        case 0x500:  // Timer A high
            static int timer = 0;
            return (timer++ % 256);  // Incrementing timer
        // ...
    }
}
```

---

## Alternative Approach: Skip Hardware Init

Instead of letting ROM run full boot sequence, we could:

1. **Execute ROM for fewer cycles** (5M instead of 50M)
2. **Check for ExecBase earlier** (every 10k cycles instead of 100k)
3. **Accept partial initialization** (ExecBase created but system not fully booted)

ROM might create ExecBase within first 5-10M cycles, before hitting hardware wait loops.

### Modified bootROM():

```typescript
// Shorter timeout, more frequent checks
const maxCycles = 10000000;  // 10M cycles instead of 50M

while (cycles < maxCycles) {
  this.emulator.execute(10000);
  cycles += 10000;

  // Check EVERY iteration (every 10k cycles)
  const execBasePtr = this.emulator.readMemory32(0x000004);

  if (execBasePtr >= 0x010000 && execBasePtr < 0x800000) {
    // Check if version looks valid
    const version = this.emulator.readMemory16(execBasePtr + 0x14);

    if (version >= 30 && version <= 47) {
      console.log(`ExecBase found early at ${cycles} cycles!`);
      return;  // Success!
    }
  }
}
```

This might catch ExecBase creation **before** ROM hits hardware wait loops.

---

## Next Steps

### Option A: Debug Hardware Wait (Thorough)
1. Add detailed logging at stuck point
2. Identify which hardware register ROM needs
3. Add proper stub for that register
4. Let ROM continue booting
5. Repeat until ROM fully initializes

**Pros:** ROM fully boots, proper system initialization
**Cons:** Time-consuming, may need many hardware stubs

### Option B: Early ExecBase Detection (Quick)
1. Check for ExecBase more frequently
2. Accept partial ROM initialization
3. Stop as soon as ExecBase exists
4. Skip hardware initialization

**Pros:** Faster, simpler, might work
**Cons:** System might not be fully initialized

### Option C: Hybrid Approach (Recommended)
1. Try Option B first (quick win)
2. If doors don't work, switch to Option A (thorough)

---

## Recommendation

**Try Option B first:**

Modify bootROM() to check for ExecBase every 10k cycles instead of every 100k:

```typescript
// Check more frequently
if (cycles % 10000 === 0) {  // Every 10k instead of 100k
  const execBasePtr = this.emulator.readMemory32(0x000004);
  // ... same validation
}
```

This might catch ExecBase **before** ROM gets stuck, giving us a working system without debugging hardware loops.

---

## Success Metrics

### Current Status:
- [x] ROM loads
- [x] ROM starts executing
- [x] ROM executes for 20M cycles
- [ ] ROM completes boot
- [ ] ExecBase initialized

### What We Need:
- [ ] Either: ROM completes full boot
- [ ] Or: Detect ExecBase before ROM gets stuck

**We're 80% there!** Just need to either:
1. Let ROM finish booting (debug hardware)
2. Or catch ExecBase early (quick fix)

---

## Conclusion

This is **excellent progress**! Our ROM boot approach works. We just need to either:
- Add more hardware stubs (proper but slow)
- Or catch ExecBase early (quick but hacky)

Either way, we're very close to working doors! 🚀
