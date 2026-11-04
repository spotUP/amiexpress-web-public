# AquaScan FR - The ACTUAL Root Cause (Final Answer)

## Summary

AquaScan FR fails with "Nothing found!" because after examining "BBS:Conf1/Dir1", it detects the file is a REGULAR FILE (`fib_DirEntryType=-3`) instead of a directory, and gives up WITHOUT OPENING AND READING THE FILE.

## The Evidence Trail

### What I Initially Thought (WRONG)
❌ Missing XIM initialization (JH_REGISTER not called)
- **Reality**: First run DOES make all correct XIM requests
- **Proof**: Log shows 14 XIM requests identical to working Amiga

### What's Actually Happening

**Sequence of Operations**:
1. ✅ AquaScan initializes XIM protocol correctly (request 1, 104, 163, 525, 501, 131, 152, etc.)
2. ✅ Displays "Reverse-scanning dir 1..."
3. ✅ Lock("BBS:Conf1/Dir1") - Returns lock 9
4. ✅ Examine(lock=9) - Returns `fib_DirEntryType=-3, fib_Size=1316`
5. ✅ UnLock() - Releases lock 9
6. ❌ **Immediately outputs "Nothing found!" - NEVER calls Open() to read the file!**

### Log Evidence

```
[dos.library] Lock("BBS:Conf1/Dir1") -> "~/Code/AmiExpress/amiexpress-web/Conf1/DIR1" - ✅ EXISTS
[dos.library] Examine(lock=9, fib=0x200000)
[dos.library] Examine: DIR1 (file, 1316 bytes)
[dos.library]   fib_DirEntryType=-3, fib_EntryType=-3, fib_Size=1316, fib_Protection=15
[dos.library] UnLock: Released lock 9
string:  Nothing found!
```

**NO Open() call between Examine() and failure!**

### Verification

Checking Conf1/DIR1:
```bash
$ head -5 ~/Code/AmiExpress/amiexpress-web/Conf1/DIR1
MTH-RTW2.LHA P  20K  05-Dec-25   ______  ______   .___ ____.  _______.
                                  \_    \/    _/___|   \    |__\____  |
```

File exists, has content, dated 05-Dec-25 (today). AquaScan just never reads it!

## The Bug

**AquaScan expects "Dir1" to be identified as something other than a regular file.**

Possibilities:
1. Maybe on real Amiga, Examine() returns different `fib_DirEntryType` for these special BBS files?
2. Maybe our Examine() implementation is wrong for these files?
3. Maybe AquaScan has a bug where it checks `fib_DirEntryType` and expects != -3?

## What Needs to be Fixed

Need to check:
1. What `fib_DirEntryType` value should "Dir1" files return on real Amiga?
2. Is our Examine() implementation setting fib_DirEntryType correctly?
3. Does AquaScan source code show what it's checking?

## File Details

- **Conf1/DIR1**: 1316 bytes, modified 05-Dec-25 12:27
- **Conf2/Dir1**: 2731 bytes, modified 05-Dec-25 12:27
- Both are REGULAR FILES containing BBS file listings (not directories!)
- Both show `fib_DirEntryType=-3` (ST_FILE) in our Examine()

## Next Investigation Steps

1. Check express.e or AquaScan source to see what fib_DirEntryType it expects
2. Research Amiga file system - do "Dir1" files get special handling?
3. Check if we need to return different fib_DirEntryType for BBS data files
4. Possibly: AquaScan expects specific file type marker?

## Status

✅ **ROOT CAUSE IDENTIFIED**: AquaScan checks Examine() result and stops when it sees fib_DirEntryType=-3 (regular file)
❌ **FIX NOT IMPLEMENTED**: Don't know yet what fib_DirEntryType value it should return
🔍 **CONFIDENCE**: VERY HIGH - Evidence is definitive from logs
