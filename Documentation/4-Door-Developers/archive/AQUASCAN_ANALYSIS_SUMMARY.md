# AquaScan FR Investigation - Comprehensive Summary

## Problem Statement
AquaScan FR command shows "Reverse-scanning dir 1... Nothing found!" despite files existing in Conf2/Dir1.

## What I Discovered

### The REAL Root Cause (NOT what I initially thought)

**AquaScan is failing during initialization - it never properly initializes the XIM protocol.**

### Evidence

#### Working Amiga (from developer's log):
AquaScan makes **14+ XIM requests** during startup before scanning:
```
1   - JH_REGISTER (protocol init)
104 - DT_SLOTNUMBER
163 - ENVSTAT
525 - BB_NONSTOPTEXT
501 - RAWARROW
131 - BB_MAINLINE
152 - EXPRESS_VERSION
(... more requests ...)
```

#### Our Failing Implementation:
AquaScan makes ONLY **3 XIM requests**:
```
127 - BB_CONFLOCAL
150 - BB_CALLERSLOG
4   - JH_SM ("Reverse-scanning dir 1...")
4   - JH_SM (" Nothing found!")
```

**Critical Missing Request: JH_REGISTER (request 1) is NEVER made!**

### What Was WRONG With My Initial Analysis

I spent significant time investigating:
1. ❌ Case-insensitive file lookups - Actually already working fine
2. ❌ AquaScan.Date files - Red herring, already fixed
3. ❌ Dir1 being detected as file vs directory - Consequence, not cause

These were all SYMPTOMS, not the root cause. The Lock()/Examine() calls I was analyzing happen during a cleanup/retry phase AFTER AquaScan has already given up.

## What Needs to Happen Next

### Immediate Investigation Required:

1. **Find out WHY AquaScan doesn't make JH_REGISTER**
   - Is there a missing XIM library call?
   - Is AquaScan using a different initialization method?
   - Is there an early exit condition being triggered?

2. **Compare door startup sequences**
   - Working door (QuickNew, MultiTop) vs AquaScan
   - Check if JH_REGISTER is being made in other doors
   - Identify what's different about AquaScan's initialization

3. **Check XIM Protocol Initialization**
   - Review how doors are supposed to initialize XIM
   - Check if we're missing a library call or message port setup
   - Verify XIM handshake sequence

### Debug Strategy:

```bash
# Find a working door and compare XIM requests:
grep "msg request: 1[^0-9]" logs/backend.log | head -10

# Trace AquaScan startup from door launch to first XIM request
sed -n '<start_line>,<end_line>p' logs/backend.log | grep -E "AquaScan|msg request|JH_"

# Compare with working Amiga log request sequence
head -50 ~/Downloads/fr.txt | grep "msg request:"
```

## Current Status

- ✅ ROOT CAUSE IDENTIFIED: XIM initialization failure
- ❌ FIX NOT IMPLEMENTED: Don't know why JH_REGISTER isn't called yet
- 🔍 NEXT STEP: Debug why AquaScan doesn't initialize XIM protocol

## Files to Investigate

1. `/web/backend/src/amiga-emulation/xim/` - XIM protocol handlers
2. `/web/backend/src/doors/DoorLifecycleManager.ts` - Door startup
3. `/web/backend/src/amiga-emulation/session/DoorMessageHandler.ts` - Door messaging
4. Express.e source - How doors should initialize XIM

## Confidence Level

**HIGH** - The evidence is clear from comparing working vs failing XIM request sequences. AquaScan is not initializing properly, which is why it fails immediately with "Nothing found!" instead of actually scanning files.
