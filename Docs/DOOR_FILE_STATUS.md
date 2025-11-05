# Door File Status Report

**Date**: 2025-11-01  
**Total Doors Registered**: 60 (58 BBSCMD + 2 web doors)

## Summary

- ✅ **54 doors** have files in correct locations and are ready to test
- ❌ **4 doors** have path resolution issues
- ⚠️ **2 web doors** (SAL, CHECKUP) are hardcoded and need verification

## Working Doors (54)

These doors have their executables in the expected locations:

| Command | Type | Location | Status |
|---------|------|----------|--------|
| B | XIM | doors/EmP_Tools/Bulls | ✅ Found |
| CTOP | XIM | doors/CONFTOP/ctop | ✅ Found |
| DEL | XIM | doors/-mgs!-MgzListMan/MGZLISTMAN | ✅ Found |
| ED | XIM | Doors/5D-Edit/5D-Edit | ✅ Found |
| GA | XIM | Doors/GetAnswer/GetAnswer | ✅ Found |
| GWALL | XIM | doors/GWall/GWall | ✅ Found |
| I | XIM | doors/EPUtils/SysInfo/SysInfo | ✅ Found |
| MRC | XIM | doors/mrc/mrc_door | ✅ Found |
| MRCSTAT1 | XIM | doors/mrc/mrcstat1 | ✅ Found |
| MRCSTAT2 | XIM | doors/mrc/mrcstat2 | ✅ Found |
| OLM | XIM | doors/!!!WAR!!!/WAROLM/WAROLM | ✅ Found |
| SENT | XIM | doors/FILEID/FILEID | ✅ Found |
| SIZE | XIM | doors/SizeCheck/SizeCheck | ✅ Found |
| STUPID | XIM | doors/FILEID/FILEID | ✅ Found |
| TESTRESTRICT | XIM | Doors/TestRestrict | ✅ Found |
| TLIST | XIM | Doors/SRH/TList/TLP2 | ✅ Found |
| U | XIM | doors/FILEID/FILEID | ✅ Found |
| ULIST | XIM | Doors/5D-User/5D-User | ✅ Found |
| WHAT | XIM | doors/What/What | ✅ Found |
| WHO | XIM | doors/RTW/RTW | ✅ Found |

**BBSLink Doors (33)**: All pointing to Doors/bbslink/bbslink
- ARCL, ASSN, BBSC, BCR, BORD, BRE, DARK, DKNS, DMAS, DMUD
- FALC, FHON, FISH, GGAM, GWAR, HACK, JUNK, LEGN, LINKMENU
- LMON, LORD, LORD2, LUNA, MEGA, MMOT, MZKL, NETR, OOII
- TEOS, TEST, TW2002, USRP, VSYS

**Note**: LINKWALL points to Doors/bbslink/bbslinkwall (different from bbslink)

## Doors with Path Issues (4)

### 1. CONFLIST - MCI Type Door
- **Command**: CONFLIST
- **Type**: MCI (not a binary executable)
- **Location in .info**: `Commands/BBSCmd/CONFLIST`
- **Issue**: MCI doors don't have separate executables - the .info file contains the MCI text
- **Fix Needed**: Handle MCI type doors differently - execute inline MCI code instead of looking for binary

### 2. GL - Amiga Assign Not Resolved
- **Command**: GL (GLC Viewer)
- **Type**: XIM
- **Location in .info**: `DOORS:glc/glcviewer`
- **Converted to**: `doors/glc/glcviewer`
- **Actual location**: `Doors/glcviewer/glcviewer` (capital D, different path)
- **Issue**: Parser converts `DOORS:` to `doors/` but actual file is in `Doors/glcviewer/`
- **Fix Needed**: Update .info LOCATION or move file to match expected path

### 3. NUKE - Relative Path Issue
- **Command**: NUKE (Bossnuke)
- **Type**: XIM
- **Location in .info**: `Bossnuke` (bare filename, no path)
- **Actual location**: `Doors/Bossnuke/Bossnuke`
- **Issue**: .info file has incomplete LOCATION (should be `Doors:Bossnuke/Bossnuke`)
- **Fix Needed**: Update .info file with correct LOCATION

### 4. REQ - Path Format Issue
- **Command**: REQ (Request)
- **Type**: XIM
- **Location in .info**: `BBS/Doors/Request/Request`
- **Tried path**: `~/Code/amiexpress-web/backend/data/bbs/BBS/Doors/Request/Request`
- **Actual location**: `Doors/Request/Request`
- **Issue**: .info has BBS-relative path instead of assign format
- **Fix Needed**: Update .info LOCATION to `Doors:Request/Request`

## Web Doors (2)

These are hardcoded in `door.handler.ts` and don't have .info files:

| Command | Path | Status |
|---------|------|--------|
| SAL | doors/POTTYSRC/PottySrc/Pot/Source/SAL/SAmiLog.s | ⚠️ Needs verification |
| CHECKUP | doors/Y-CU04/tAJcHECKUP/CheckUP | ⚠️ Needs verification |

## Next Steps

1. **Fix .info files** for NUKE, GL, REQ with correct LOCATION paths
2. **Implement MCI door handler** for CONFLIST and other MCI type doors
3. **Verify web doors** (SAL, CHECKUP) have files at specified paths
4. **Test all 54 working doors** systematically to identify execution issues
5. **Document failure patterns** for doors that don't execute properly

## Testing Priority

**High Priority (Known Good Candidates)**:
- TESTRESTRICT - Simple test door
- GA - GetAnswer (known working, has execution issues but runs)
- WHO - RTW utility
- WHAT - Info utility

**Medium Priority (BBSLink Doors)**:
- Test one BBSLink door to verify the handler works
- If working, all 33 should work the same way

**Low Priority (Needs Path Fixes First)**:
- CONFLIST (MCI)
- GL (path fix)
- NUKE (path fix)
- REQ (path fix)

---

*Generated: 2025-11-01*  
*Related Files*:
- `web/backend/src/handlers/door.handler.ts` - Door initialization
- `web/backend/src/utils/amiga-command-parser.util.ts` - .info parsing
- `Commands/BBSCmd/*.info` - Door configuration files
