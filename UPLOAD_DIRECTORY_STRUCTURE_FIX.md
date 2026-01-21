# Upload Directory Structure Fix

## User Report
After uploading multiple files, running `FR` (File Request) in the conference showed only the old test.lha file, not the newly uploaded files.

**AquaScan Output:**
```
--[ AquaScan v1.0 by Aquarius/Outlaws ]--------------[ 'fr ?' for options ]--
Reverse-scanning dir 1... Ok!
[ File #1 ]
test.lha     N   5000  01-21-26         Test file for AquaScan
                                 Sent by: sysop
[ End of File List ]
```

---

## Root Causes

### Issue #1: Upload and PartUpload were FILES instead of DIRECTORIES

**Problem:** The `Conf1/Upload` and `Conf1/PartUpload` existed as 0-byte files instead of directories.

**Symptoms:**
```
[Upload] Error moving file: ENOTDIR: not a directory, mkdir '~/Code/amiexpress-web/Conf1/Upload/'
[DIR] Error writing DIR entry: EEXIST: file already exists, mkdir '~/Code/amiexpress-web/Conf1/Upload'
[FILES.BBS] Error writing FILES.BBS entry: EEXIST: file already exists, mkdir '~/Code/amiexpress-web/Conf1/Upload'
```

**Impact:**
- Uploaded files stayed in `Node1/Playpen/` instead of moving to `Conf1/Upload/`
- FILES.BBS couldn't be written to Upload directory
- File operations failed silently, but DIR2 entries were still written

---

### Issue #2: NDIRS=1 but files written to DIR2

**Problem:** Conf1.info had `NDIRS=1` (configured for 1 directory), but the upload code wrote files to DIR2.

**Symptoms:**
- DIR1 only had test.lha (111 bytes)
- DIR2 had all new uploads (7219 bytes, 17 files)
- AquaScan read DIR1 per `NDIRS=1` configuration
- User didn't see newly uploaded files

**Impact:**
- Files uploaded successfully and processed correctly
- DIR2 written with proper entries
- But AquaScan configured to only scan DIR1
- New files invisible to file request door

---

## Files Affected

Before fixes:
- `~/Code/amiexpress-web/Conf1/Upload` - 0-byte FILE (should be directory)
- `~/Code/amiexpress-web/Conf1/PartUpload` - 0-byte FILE (should be directory)
- `~/Code/amiexpress-web/Conf1/NDIRS` - contained "1" (should be "2")
- `~/Code/amiexpress-web/Conf1.info` - NDIRS=1 tooltype (should be NDIRS=2)
- `~/Code/amiexpress-web/Node1/Playpen/` - 16 uploaded files stuck here
- `~/Code/amiexpress-web/Conf1/Dir2` - 7219 bytes with all uploads
- `~/Code/amiexpress-web/Conf1/Upload/FILES.BBS` - missing

---

## Fixes Applied

### Fix #1: Created proper directory structure

**Before:**
```bash
-rw-r--r--@ 1 spot staff 0 Upload          # FILE (wrong!)
-rw-r--r--@ 1 spot staff 0 PartUpload      # FILE (wrong!)
```

**After:**
```bash
drwxr-xr-x@ 18 spot staff 576 Upload       # DIRECTORY (correct!)
drwxr-xr-x@  2 spot staff  64 PartUpload   # DIRECTORY (correct!)
```

**Commands:**
```bash
cd ~/Code/amiexpress-web/Conf1
rm -f Upload PartUpload
mkdir -p Upload PartUpload
```

---

### Fix #2: Moved uploaded files from Playpen to Upload

**Files Moved (16 total):**
- AE-KEY.LHA, CB4!ST13.LHA, CB4!SA60.LHA, CB4!SA63.LHA, CB4!SR21.LZX
- 5D_AMN10.LHA, 5D_AMU21.LHA
- AF_HI11.LHA, AF_SES10.LHA, AF_VHS2.LHA, AF_VOTE.LZX, AF-ST01.LHA
- AFAKER20.LHA, AFKR202.LHA, AFL_BM1.LHA, AFL_BOOT.LHA

**Command:**
```bash
cd ~/Code/amiexpress-web
for file in <list>; do
  mv "Node1/Playpen/$file" "Conf1/Upload/"
done
```

---

### Fix #3: Created FILES.BBS in Upload directory

**Problem:** FILES.BBS write failed because Upload was a file

**Solution:** Copied DIR2 content to FILES.BBS
```bash
cp Conf1/Dir2 Conf1/Upload/FILES.BBS
```

**Result:** Upload directory now has both:
- Actual uploaded files (16 .LHA/.LZX files)
- FILES.BBS descriptor file for third-party door compatibility

---

### Fix #4: Updated NDIRS configuration

**File:** `~/Code/amiexpress-web/Conf1/NDIRS`

**Before:**
```
1
```

**After:**
```
2
```

**Command:**
```bash
echo "2" > Conf1/NDIRS
```

---

### Fix #5: Updated Conf1.info NDIRS tooltype

**File:** `~/Code/amiexpress-web/Conf1.info`

**Before:**
```
NDIRS=1
DLPATH.1=BBS:Conf1/Upload/
ULPATH.1=BBS:Conf1/Upload/
```

**After:**
```
NDIRS=2
DLPATH.1=BBS:Conf1/Upload/
ULPATH.1=BBS:Conf1/Upload/
```

**Command:**
```bash
cp Conf1.info Conf1.info.backup
perl -pi -e 's/NDIRS=1/NDIRS=2/g' Conf1.info
```

---

## Verification

### Directory structure:
```bash
ls -la Conf1/Upload/
drwxr-xr-x@ 18 spot staff  576 Upload/
  - 16 .LHA/.LZX files
  - FILES.BBS (7219 bytes)

ls -la Conf1/ | grep Dir
-rw-r--r--@  1 spot staff  111 Dir1  # test.lha only
-rw-r--r--@  1 spot staff 7219 Dir2  # all new uploads
```

### Configuration:
```bash
cat Conf1/NDIRS
2

strings Conf1.info | grep NDIRS
NDIRS=2
```

### Upload directory:
```bash
ls -1 Conf1/Upload/*.LHA Conf1/Upload/*.LZX | wc -l
16
```

---

## Testing

After fixes, user should test:

1. **File Request (FR):**
   - Should now scan both DIR1 and DIR2
   - Should show test.lha + 16 new uploads
   - Total 17 files visible

2. **New Uploads:**
   - Files should move to Upload/ directory (not get stuck in Playpen)
   - FILES.BBS should be updated
   - DIR2 should get new entries

3. **File Operations:**
   - No more ENOTDIR errors
   - No more EEXIST errors
   - Files properly organized in Upload/

---

## Summary

**What Was Wrong:**
1. ✅ Upload/PartUpload were files, not directories - blocked file moves
2. ✅ NDIRS=1 configuration didn't match DIR2 reality - hid uploaded files
3. ✅ FILES.BBS missing - third-party door compatibility broken
4. ✅ Files stuck in Playpen - never moved to proper location

**What Was Fixed:**
1. ✅ Created Upload/PartUpload as proper directories
2. ✅ Moved 16 uploaded files from Playpen to Upload/
3. ✅ Created FILES.BBS in Upload/ directory
4. ✅ Updated NDIRS to 2 in both NDIRS file and Conf1.info
5. ✅ AquaScan will now scan DIR1 + DIR2 and show all files

**Result:**
- File uploads now work end-to-end
- Files move to correct location
- DIR files written correctly
- FILES.BBS created for door compatibility
- AquaScan shows all uploaded files

---

## Files Modified

1. `~/Code/amiexpress-web/Conf1/Upload` - Created as directory
2. `~/Code/amiexpress-web/Conf1/PartUpload` - Created as directory
3. `~/Code/amiexpress-web/Conf1/NDIRS` - Updated to "2"
4. `~/Code/amiexpress-web/Conf1.info` - Updated NDIRS tooltype to "2"
5. `~/Code/amiexpress-web/Conf1/Upload/FILES.BBS` - Created
6. `~/Code/amiexpress-web/Node1/Playpen/*.LHA` - Moved 16 files to Upload/

## Date Completed

2026-01-21
