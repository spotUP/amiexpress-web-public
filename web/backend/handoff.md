# Handoff Document

## Current Status: Duplicate Screen Display Fix

### Just Completed
Fixed the issue where doors/screens were being displayed 3-4 times on some nodes during login:

**Root Cause:** Screen loading fallback logic was too aggressive:
1. NODE type screens (NODE_BULL) were falling back to global `Screens/` directory
2. This caused NODE_BULL to show the same `Screens/BULL.TXT` that BULL already displayed
3. Additional fallback logic was using `logon20.txt` when BULL screens weren't found, causing duplicate door execution

**Fix Applied (screen.handler.ts):**
1. Removed global `Screens/` fallback for NODE type screens (lines 1741-1749)
2. Removed the BULL/CONF_BULL fallback logic entirely - now shows informative error instead
3. Added comments referencing express.e:6544-6640 screen directory rules

### Previous Session: AROS ROM Memory Mapping
- Fixed AROS ROM memory mapping for 68K door emulation
- AROS requires separate mapping: aros-rom.bin at 0xF80000, aros-ext.bin at 0xE00000
- User confirmed it works locally

### Pending
- Deploy to Render with FORCE_REINIT_SCREENS=0 (fix is in code, not screen files)
- Test login flow to verify no duplicate door executions

### Key Files Modified
- web/backend/src/handlers/screen.handler.ts - Screen loading logic
- web/backend/src/amiga-emulation/KickstartRom.ts - AROS ROM support
- web/backend/src/amiga-emulation/cpu/MoiraEmulator.ts - Extension ROM loading
- web/backend/src/amiga-emulation/api/ExecLibrary.ts - Scan both ROM regions

### Node Configuration Status
- Node0, Node1: Have own BULL.TXT (bull1-5)
- Node2-40: No BULL.TXT - will simply not show NODE_BULL (correct behavior)
