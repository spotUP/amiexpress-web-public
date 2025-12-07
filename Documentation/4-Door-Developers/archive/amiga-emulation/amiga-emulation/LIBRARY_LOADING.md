# Amiga Library Loading - Current Limitations and Solutions

## Current Implementation

### How It Works Now

Our implementation uses **stub libraries** - JavaScript/TypeScript reimplementations of Amiga system libraries:

```typescript
// exec.library OpenLibrary()
switch (name) {
  case 'dos.library':
    baseAddress = 0xFFFF0000; // Fake base address
    break;
  case 'intuition.library':
    baseAddress = 0xFFFF1000; // Fake base address
    break;
}
```

**What happens:**
1. Door calls `OpenLibrary("dos.library", 0)`
2. Our exec.library returns fake base address (e.g., 0xFFFF0000)
3. Door calls `JSR (A6 + offset)` where A6 = library base
4. CPU jumps to fake address (e.g., 0xFFFFFFC4 for Output())
5. Our `read16()` detects library address and returns RTS
6. Trap handler calls JavaScript implementation
7. JavaScript function executes and returns

### What We DON'T Do

❌ **We do NOT load actual Amiga library files**
❌ **We do NOT execute real library code**
❌ **We do NOT parse library structures (jump tables, etc.)**

## Real Amiga Library System

On a real Amiga, libraries work like this:

1. **Library Files**: Binary files (e.g., `LIBS:dos.library`)
2. **Library Structure**:
   - Header with library info
   - Jump table with negative offsets
   - Actual 68000 code
3. **OpenLibrary**:
   - Loads library from disk (if not already loaded)
   - Returns pointer to library base structure
   - Base + negative offset = function entry point
4. **Function Call**:
   - JSR to (base + offset) jumps to REAL 68000 code
   - Library code executes
   - RTS returns to caller

## The Problem

**Many Amiga doors depend on shared libraries:**
- intuition.library (UI, windows, gadgets)
- graphics.library (drawing, screens)
- diskfont.library (fonts)
- commodities.library (hotkeys)
- asl.library (file requesters)
- rexxsyslib.library (REXX scripting)

**These libraries contain thousands of lines of 68000 assembly code that we'd need to:**
1. Load into memory
2. Parse the jump tables
3. Execute natively
4. Handle internal library dependencies
5. Deal with OS-specific hardware access

## Solutions

### Option 1: Stub Implementation (Current Approach) ✅

**What we're doing:**
- Reimplement commonly-used functions in JavaScript
- Return fake library bases
- Intercept calls and execute JS code
- Works for simple I/O operations

**Pros:**
- ✅ Fast to implement
- ✅ No need for library files
- ✅ Full control over behavior
- ✅ Easy to debug
- ✅ Works great for console-based doors

**Cons:**
- ❌ Limited to functions we implement
- ❌ Can't run doors requiring complex libraries
- ❌ Behavior may differ from real Amiga

**Best for:**
- Text-based doors
- Simple I/O (door games, utilities)
- Doors that only use dos.library and exec.library

### Option 2: Hybrid Approach (Recommended Next Step) 🎯

**Combine stubs with selective native execution:**

1. **Keep stubs for common functions** (dos.library I/O)
2. **Load library files for complex libraries**
3. **Parse jump tables and execute native code when needed**
4. **Fall back to stubs for unimplemented functions**

```typescript
class LibraryManager {
  private loadedLibraries = new Map<string, LoadedLibrary>();

  async loadLibrary(name: string): Promise<number> {
    // Try to load real library file
    const libPath = `LIBS:${name}`;
    if (fs.existsSync(libPath)) {
      const library = await this.parseLibraryFile(libPath);
      const base = this.installLibrary(library);
      return base;
    }

    // Fall back to stub
    return this.getStubLibraryBase(name);
  }

  private parseLibraryFile(path: string): LoadedLibrary {
    // Parse Amiga library format:
    // - Library header
    // - Jump table (negative offsets)
    // - Code segments
    // Returns structure with jump table and code
  }
}
```

**Pros:**
- ✅ Can run more complex doors
- ✅ Maintains compatibility with stubs
- ✅ Selective loading (only what's needed)

**Cons:**
- ⚠️ Requires library files (legal/licensing issues)
- ⚠️ Complex implementation
- ⚠️ May execute hardware-specific code

### Option 3: Full Emulation (Most Complete)

**Implement a complete AmigaOS ROM:**
- Load Kickstart ROM
- Implement full exec.library with multitasking
- Load all system libraries
- Handle hardware abstraction

**Pros:**
- ✅ Maximum compatibility
- ✅ Can run any Amiga software

**Cons:**
- ❌ Extremely complex (months of work)
- ❌ Requires ROM files (copyright issues)
- ❌ Need to emulate hardware (CIA, custom chips)
- ❌ Overkill for BBS doors

## Practical Recommendations

### For Your BBS (Short Term)

**Continue with stub approach, expand as needed:**

```typescript
// Add more stub implementations as you encounter them
case 'intuition.library':
  return new IntuitionStubs(emulator);
case 'graphics.library':
  return new GraphicsStubs(emulator);
```

**Most BBS doors only need:**
- ✅ dos.library (I/O) - **We have this**
- ✅ exec.library (memory, libraries) - **We have this**
- ⚠️ intuition.library (minimal - just for text mode)
- ⚠️ graphics.library (minimal - just for color codes)

### Detecting What Doors Need

Add logging to OpenLibrary:

```typescript
OpenLibrary(): void {
  const name = this.readString(namePtr);
  const version = this.emulator.getRegister(CPURegister.D0);

  console.log(`📚 Door requested: ${name} version ${version}`);

  // Track what libraries are requested
  this.trackLibraryRequest(name, version);
}
```

When a door fails, you'll see which libraries it needs, then implement just those functions.

### Priority Implementation Order

1. **dos.library** ✅ Done
2. **exec.library** ✅ Done
3. **intuition.library** - Stub out window/gadget functions (return dummy handles)
4. **graphics.library** - Stub out color/text functions (ignore or adapt to ANSI)
5. **Others** - Add on demand based on actual door requirements

## Example: Stubbing intuition.library

```typescript
// IntuitionLibrary.ts
export class IntuitionLibrary {
  // OpenWindow - offset -204
  OpenWindow(): void {
    const newWindow = this.emulator.getRegister(CPURegister.A0);
    console.log('[intuition.library] OpenWindow() - returning dummy handle');
    // Return fake window handle
    this.emulator.setRegister(CPURegister.D0, 0x12345678);
  }

  // CloseWindow - offset -72
  CloseWindow(): void {
    console.log('[intuition.library] CloseWindow() - no-op');
  }

  // SetWindowTitles - offset -276
  SetWindowTitles(): void {
    const title = this.readString(this.emulator.getRegister(CPURegister.A1));
    console.log(`[intuition.library] SetWindowTitles("${title}") - no-op`);
  }
}
```

## Conclusion

**Answer to your question:**

❌ **No, we cannot currently load real Amiga library files**

✅ **But that's okay for most BBS doors!**

**What we CAN do:**
- Run doors that use dos.library (most text doors)
- Stub out other libraries as needed
- Selectively implement functions doors actually use

**What you SHOULD do:**
1. Test real doors and see what they request
2. Log library calls to identify gaps
3. Implement stubs for missing functions
4. Focus on the doors users actually want

**Future enhancement:**
If you find doors absolutely requiring native library code, we can implement Option 2 (hybrid loading). But start with stubs - it's the 80/20 solution that will work for 80% of doors with 20% of the effort.

---

**TL;DR:** We use JavaScript stubs instead of loading real library files. This works great for console-based doors. If you need more, we can add specific stubs or implement hybrid loading.
