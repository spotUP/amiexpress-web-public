# AquaScan FR Root Cause Analysis

## The Real Problem

AquaScan FR is failing **BEFORE** it even tries to scan files. The issue is NOT with file access or case-sensitivity - it's an **initialization failure**.

## Evidence

### Working Amiga Log (from developer)
AquaScan makes 14+ XIM requests during startup:
```
1   - JH_REGISTER
104 - DT_SLOTNUMBER
163 - ENVSTAT (returns "8")
525 - BB_NONSTOPTEXT
501 - RAWARROW
131 - BB_MAINLINE
152 - EXPRESS_VERSION
131 - BB_MAINLINE (returns "v5.3")
122 - DT_LINELENGTH (returns "FR"?)
100 - ?
4   - JH_SM
105 - DT_SECSTATUS
127 - BB_CONFLOCAL
150 - BB_CALLERSLOG
4   - JH_SM ("Reverse-scanning dir 1...")
4   - JH_SM (" Ok!")
[Then displays files successfully]
```

### Our Failing Log
AquaScan makes ONLY 3 XIM requests:
```
127 - BB_CONFLOCAL
150 - BB_CALLERSLOG
4   - JH_SM ("Reverse-scanning dir 1...")
4   - JH_SM (" Nothing found!")
```

## The Smoking Gun

**AquaScan never makes the JH_REGISTER (request 1) call!**

This means:
- XIM protocol is NOT being initialized properly
- AquaScan doesn't gather BBS configuration data
- Without proper initialization, AquaScan gives up immediately with "Nothing found!"

## What Was Wrong With Previous Analysis

I incorrectly focused on:
1. ❌ Case-insensitive file lookups (red herring - already works)
2. ❌ AquaScan.Date files being in future (red herring - already fixed)
3. ❌ Dir1 file being detected as file vs directory (symptom, not cause)

The REAL issue: **AquaScan never initializes the XIM protocol properly!**

## Next Steps

1. Find out WHY AquaScan doesn't make JH_REGISTER call
2. Check if door is crashing/exiting early before XIM init
3. Check if there's a missing library call or initialization sequence
4. Compare working vs failing door startup execution flow

## File Operations That Never Happen

The Lock("BBS:Conf2/Dir1") and Examine() calls I was analyzing happen LATER, during a RETRY/CLEANUP phase after AquaScan has already given up. These are NOT the cause of the failure - they're a consequence of AquaScan trying to clean up after failing to initialize.

## Status

**Investigation Status**: ROOT CAUSE IDENTIFIED - Initialization Failure
**Fix Status**: NOT YET IMPLEMENTED - Need to find why JH_REGISTER doesn't happen
**Confidence**: HIGH - Evidence is clear from XIM request comparison
