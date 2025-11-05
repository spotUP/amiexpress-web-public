# Quick Start: Door File I/O Testing

## 🎯 YOU ARE HERE

**All door file I/O is implemented and ready to test!**

---

## ⚡ Quick Test (5 minutes)

### 1. Start Backend
```bash
cd ~/Code/amiexpress-web/web/backend
npm run dev
```

### 2. Watch Logs
```bash
# In another terminal:
tail -f /tmp/backend.log | grep -E "PROGDIR|Lock|CreateDir|DeleteFile"
```

### 3. Run AquaWho Door
- Open browser: http://localhost:5173
- Login: sysop/sysop
- Run AquaWho door command
- Watch logs for file operations

### 4. Verify Files Created
```bash
# Check AquaWho door directory:
ls -la ~/Code/amiexpress-web/Doors/AquaWho/

# Should see NEW files created by door:
# - Tot.dat (total statistics)
# - 0.dat, 1.dat, etc. (per-node statistics)
```

---

## 🔍 What to Look For

### Successful Setup Logs
```
[AmigaDoorSession] Set door directory: ~/Code/amiexpress-web/Doors/AquaWho
[dos.library] PROGDIR: device set to ~/Code/amiexpress-web/Doors/AquaWho
[dos.library] Current directory set to ~/Code/amiexpress-web/Doors/AquaWho
```

### Successful File Operations
```
[dos.library] Open("Doors:AquaWho/Tot.dat")
[dos.library] Resolving Amiga path: "Doors:AquaWho/Tot.dat"
[dos.library] Write: Writing 128 bytes at position 0
[dos.library] Close: Wrote 128 bytes to ~/Code/amiexpress-web/Doors/AquaWho/Tot.dat
```

### Successful BBS File Access
```
[dos.library] Open("BBS:user.data")
[dos.library] BBS: device -> ~/Code/amiexpress-web/user.data
[dos.library] Read: Reading 256 bytes from position 0
[dos.library] Read: Read 256 bytes
```

---

## ✅ What Was Implemented

**7 Functions Converted from STUB to REAL:**
- Lock() - Creates filesystem locks
- UnLock() - Releases locks
- CurrentDir() - Changes working directory
- CreateDir() - Creates directories
- DeleteFile() - Deletes files
- Examine() - Gets file/directory info
- ExNext() - Iterates directory contents

**3 Logical Devices:**
- PROGDIR: device - Door's own directory
- Doors: device - Doors directory root
- BBS: device - BBS system files

**Result:** Doors can now fully manage their own files!

---

## 🚨 Troubleshooting

### Backend Won't Compile
```bash
cd ~/Code/amiexpress-web/web/backend
npm run build

# If errors, check:
# - DosLibrary.ts has Lock interface defined
# - All imports at top of file are correct
```

### Door Can't Find Files
```bash
# Check logs:
grep "PROGDIR:" /tmp/backend.log

# Should show door directory was set
# If not, check AmigaDoorSession.ts lines 135-140
```

### Files Created in Wrong Location
```bash
# Check path resolution logs:
grep "Resolving Amiga path" /tmp/backend.log

# Should show PROGDIR: device resolving correctly
```

---

## 📖 Quick Reference

### Doors: Device (AquaWho Example)
```c
// AquaWho creates files in Doors:AquaWho/ directory
Open("Doors:AquaWho/Tot.dat", MODE_NEWFILE);
// Opens: /Doors/AquaWho/Tot.dat
```

### BBS: Device
```c
// Opens: ~/Code/amiexpress-web/user.data
Open("BBS:user.data", MODE_OLDFILE);
```

### PROGDIR: Device (Door's Own Directory)
```c
// Opens: /Doors/AquaWho/config.txt
Open("PROGDIR:config.txt", MODE_OLDFILE);
```

---

## 📚 Full Documentation

- **RESTART_2025-11-01_DOOR_IO_COMPLETE.md** - Complete restart guide
- **SESSION_2025-11-01_DOOR_FILE_IO_COMPLETE.md** - Implementation details
- **DOOR_FILE_IO_STATUS.md** - Before/after analysis

---

## ✨ Success Criteria

✅ Backend starts without errors
✅ Logs show "PROGDIR: device set to..."
✅ AquaWho creates Tot.dat and {node}.dat files
✅ Files appear at Doors/AquaWho/ directory
✅ BBS: device reads user.data correctly

**If all above pass: Door file I/O is working perfectly! 🎉**

---

**Date:** 2025-11-01
**Status:** ✅ READY TO TEST
**Next:** Run a door and verify file creation
