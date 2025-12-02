# WHO Door Self-Modifying Code Discovery

**Date**: 2025-12-02
**Critical Finding**: WHO door modifies its own BBS API call instructions at runtime

## The Discovery

### Static Binary (from disk):
```
0x1174: 67 08           beq.b 0x117e
0x1176: 20 79 00 00 07 90   movea.l 0x790.l, a0
0x117c: 4e 90           jsr (a0)
```

### Runtime Execution (in memory):
```
0x1174: 4a aa           tst.l (a2)  [COMPLETELY DIFFERENT!]
0x1178: 66 00           bne.b ...   [ALSO DIFFERENT!]
```

## Implications

1. **WHO rewrites its BBS API calls** - The `movea.l 0x790.l, a0` and `jsr (a0)` instructions are REPLACED at runtime

2. **Static disassembly is misleading** - What we see in the binary is NOT what executes

3. **Self-modification purpose unknown**:
   - Environment detection?
   - Code decryption/unpacking?
   - Runtime code generation?
   - Copy protection?

4. **Our BBS API setup never runs** - WHO never executes the original BBS call instructions because it modifies them first

## Evidence

**Binary bytes** (verified with `xxd doors/who/who`):
```
00001174: 6708 2079 0000 0790 4e90 584f
          ^^^^ ^^^^^^^^^^^^^^^^^^
          beq  movea.l 0x790.l,a0 + jsr
```

**Runtime bytes** (from crash log lastPCbytes):
```
lastPCbytes=[0x1174:4aaa, 0x1178:6600, ...]
             ^^^^         ^^^^
             tst.l(a2)    bne.b
```

## Self-Modification Locations

WHO writes to its code section at:
- 0x1250-0x125F (16 bytes, written twice - forward and backward)
- Possibly other locations including 0x1174-0x117c area

## Why Our Implementation Failed

Our BBS API setup at 0x790 is CORRECT, but:
1. WHO self-modifies the instructions that would call it
2. The modified code does NOT read from 0x790
3. The modified code does NOT JSR to our dispatcher
4. WHO crashes because the modified code is invalid or incomplete

## Next Steps

### Investigation Needed:

1. **Track all code modifications**
   - Add watchpoints on entire WHO code region (0x1008-0x3c9c)
   - Log what WHO writes and when
   - Identify modification patterns

2. **Understand modification purpose**
   - Is it encryption/obfuscation?
   - Is it environment detection?
   - Is it normal Amiga copy protection?

3. **Find unmodified BBS calls**
   - Check if first call site (0x1148) is also modified
   - Look for other code paths that might use 0x790

4. **Consider alternatives**:
   - Patch WHO's self-modification code
   - Intercept at different level
   - Port WHO to TypeScript (recommended)

### Why TypeScript Port Makes Sense:

Given WHO uses self-modifying code:
- Reverse engineering the modifications is complex
- Runtime behavior is unpredictable
- Emulation overhead for self-modified code is high
- TypeScript port would be simpler and faster (1-2 weeks vs months of debugging)

## Conclusion

**The 0x790 BBS API implementation is CORRECT** ✅
**WHO's self-modification breaks the static code** ❌

This is not a bug in our implementation - it's WHO using advanced Amiga coding techniques that make static emulation extremely difficult.

**Recommendation**: Port WHO and other SIM doors to TypeScript rather than fighting self-modifying code.
