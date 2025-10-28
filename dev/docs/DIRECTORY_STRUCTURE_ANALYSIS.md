# Directory Structure Analysis: reference-boardBBS vs Current Project

## Analysis Date
2025-10-28

## Overview
This document compares the real AmiExpress BBS structure (reference-boardBBS) with our current project structure to identify reorganization needs.

---

## reference-boardBBS Structure (Real AmiExpress BBS)

### Root Level Directories
```
reference-boardBBS/
├── Access/              # User access level definitions
├── AmiTCP/              # TCP/IP stack configuration
├── AmiXnet/             # Network configuration
├── Bulletins/           # System bulletins
├── Commands/            # BBS command definitions
├── Conf1/ - Conf14/     # Conference areas (message & file)
├── Doors/               # Door programs
├── FCheck/              # File checker configuration
├── HELP/                # Help files (.HLP, .guide)
├── Languages/           # Translation files (.trn)
├── Libs/                # System libraries
├── Node0/ - Node6/      # Node-specific directories
├── Protocols/           # File transfer protocols (XPR)
├── Screens/             # **IMPORTANT: Display screens/ANSI art**
├── Storage/             # File storage areas
├── SysopStats/          # Sysop statistics
├── Utils/               # Utility programs
└── Zoom/                # Zoom configuration
```

### Conference Structure (Example: Conf8, Conf14)
Each conference directory contains:
```
ConfX/
├── Bulletins/           # Conference-specific bulletins
├── MsgBase/             # Message base files
│   ├── HeaderFile       # Message headers
│   ├── MailLock         # Lock file
│   └── MailStats        # Statistics
├── Hold/                # Held messages
├── Upload/              # Uploaded files
├── PartUpload/          # Partial uploads
├── LCFiles/             # Last callers files
├── Dir0, Dir1, Dir2     # File area directories
├── Conf.DB              # Conference database
├── Menu.txt             # Conference menu
├── menu250.txt.GR       # Graphical menu variant
├── downloadmsg.txt      # Download message
├── uploadmsg.txt        # Upload message
├── bull20.txt           # Bulletin
├── NDIRS                # Number of directories
└── NumULs               # Number of uploads
```

### Screens Directory Structure
```
Screens/
├── Various .txt files   # Screen files
├── flt/                 # File listing templates
│   ├── 001.flt.txt
│   ├── 002.flt.txt
│   ├── 003.flt.txt
│   ├── 004.flt.txt
│   └── 005.flt.txt
├── logoff/              # Logoff screens
│   ├── 001.logoff.txt
│   ├── 002.logoff.txt
│   └── 003.logoff.txt
└── reference-board/           # Custom screens
```

---

## Current Project Structure

### Root Level Directories
```
amiexpress-web/
├── Access/              ✓ Matches
├── AmiExpress-Sources/  ⚠️ Source code (not in reference-boardBBS)
├── AmiTCP/              ✓ Matches
├── AmiXnet/             ✓ Matches
├── backend/             ⚠️ Modern web backend
├── BBS/                 ⚠️ Empty directory
├── Bulletins/           ✓ Matches
├── client/              ⚠️ Modern web client
├── Commands/            ✓ Matches
├── Conf1/ - Conf14/     ✓ Matches (needs verification)
├── Docs/                ⚠️ Modern documentation
├── Doors/               ✓ Matches
├── FCheck/              ✓ Matches
├── frontend/            ⚠️ Modern web frontend
├── HELP/                ✓ Matches
├── Languages/           ✓ Matches
├── Libs/                ✓ Matches
├── Node0/ - Node6/      ✓ Matches
├── old/                 ⚠️ Archive directory
├── Protocols/           ✓ Matches
├── Scripts/             ⚠️ Modern scripts
├── server/              ⚠️ Modern web server
├── src/                 ⚠️ Modern source
├── Storage/             ✓ Matches
├── SysopStats/          ✓ Matches
├── unlzx/               ⚠️ Extraction utility
├── Utils/               ✓ Matches
└── Zoom/                ✓ Matches
```

**CRITICAL MISSING:**
- **Screens/** directory at root level

---

## Key Differences & Issues

### 1. Missing Screens/ Directory ❌
**Problem:** The traditional AmiExpress `Screens/` directory is missing from root level
**Impact:** Display screens, ANSI art, FLT templates should be in a centralized location
**Action Required:** Create `Screens/` at root with subdirectories:
  - `flt/` - File listing templates
  - `logoff/` - Logoff screens
  - `reference-board/` or custom themed subdirectories

### 2. Modern Web Components 
**Current:** Mixed with traditional BBS structure
**Suggested Organization:**
```
amiexpress-web/
├── [Traditional BBS directories...]
├── web/                 # NEW: Modern web components container
│   ├── backend/
│   ├── frontend/
│   ├── client/
│   └── server/
└── dev/                 # NEW: Development resources
    ├── docs/            # Modern documentation
    ├── scripts/         # Development scripts
    └── tools/           # Development tools
```

### 3. Conference Directory Consistency
**Need to verify:** All Conf1-Conf14 directories have proper subdirectories:
- Bulletins/
- MsgBase/
- Hold/
- Upload/
- PartUpload/
- LCFiles/
- DirX directories

### 4. Miscellaneous Directories
- `BBS/` - Currently empty, purpose unclear
- `old/` - Archive directory (acceptable)
- `unlzx/` - Extraction utility (could move to Utils/)
- `AmiExpress-Sources/` - Source code (keep at root for historical reference)

---

## Recommended Reorganization Plan

### Phase 1: Create Missing Directories ✓
1. Create `Screens/` at root level
2. Create subdirectories: `Screens/flt/`, `Screens/logoff/`, `Screens/custom/`

### Phase 2: Standardize Conference Directories
1. Audit all Conf1-Conf14 directories
2. Create missing subdirectories in each conference:
   - Bulletins/
   - MsgBase/
   - Hold/
   - Upload/
   - PartUpload/
   - LCFiles/
3. Ensure standard files exist (Menu.txt, downloadmsg.txt, uploadmsg.txt)

### Phase 3: Organize Modern Components
1. Create `web/` container directory
2. Move `backend/`, `frontend/`, `client/`, `server/` into `web/`
3. Create `dev/` directory for development resources
4. Move `Docs/` → `dev/docs/`
5. Move `Scripts/` → `dev/scripts/`

### Phase 4: Clean Up Miscellaneous
1. Evaluate `BBS/` directory - remove if truly unused
2. Consider moving `unlzx/` → `Utils/unlzx/`
3. Keep `old/` for archives
4. Keep `AmiExpress-Sources/` at root for reference

---

## Standard Conference Template

Each conference should have this structure:
```
ConfX/
├── Bulletins/
├── MsgBase/
│   ├── HeaderFile
│   ├── MailLock (created at runtime)
│   └── MailStats (created at runtime)
├── Hold/
├── Upload/
├── PartUpload/
├── LCFiles/
├── Dir0/
├── Dir1/
├── Dir2/
├── Conf.DB
├── Menu.txt
├── downloadmsg.txt
├── uploadmsg.txt
└── NDIRS (file containing number of directories)
```

---

## Implementation Priority

### HIGH PRIORITY
1. ✅ Create `Screens/` directory structure
2. ✅ Verify and standardize all conference directories

### MEDIUM PRIORITY
3. Create `web/` container for modern components
4. Create `dev/` directory for development resources
5. Move modern documentation and scripts

### LOW PRIORITY
6. Clean up miscellaneous directories
7. Consider `unlzx/` relocation

---

## Benefits of Reorganization

1. **Authenticity:** Matches real AmiExpress BBS structure
2. **Clarity:** Separates traditional BBS from modern web components
3. **Maintainability:** Standard structure easier to maintain
4. **Documentation:** Clearer for developers understanding the project
5. **Compatibility:** Easier to port/reference real AmiExpress configurations

---

## Notes

- Keep modern web components functional during reorganization
- Maintain backward compatibility with existing database references
- Update any hardcoded paths in configuration files
- Document all changes in CHANGELOG

---

## Next Steps

1. Present this analysis for approval
2. Create Screens/ directory structure
3. Audit and standardize conference directories
4. Begin phased reorganization of modern components
5. Update all documentation with new structure