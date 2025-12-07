# QUICK START - WHO Door Testing

## Status: COMPLETE FILE SYSTEM IMPLEMENTED ✅

All critical disk file operations are now working.
Ready to test WHO door!

## Files Implemented

✅ node{n}.user / node{n}.userkeys (239 + 54 bytes)
✅ Node{n}/CallersLog (text activity log)
✅ DOOR.SYS (52-line drop file)
✅ DORINFOx.DEF (alternative drop file)
✅ user.data / user.keys / user.misc (239 + 54 + 256 bytes per user)

## Test WHO Door Now

```bash
# 1. Start backend (if not running)
~/Code/amiexpress-web/dev/scripts/start-backend.sh

# 2. Open browser
open http://localhost:5173

# 3. Login: sysop / sysop

# 4. Verify files created:
ls -lh node*.user node*.userkeys
cat Node0/CallersLog | tail -5

# 5. Run WHO door:
# In BBS terminal, type: WHO <Enter>

# 6. Check drop files:
cat Node0/DOOR.SYS | head -20
cat Node0/DORINFO0.DEF

# 7. Verify WHO shows user list!
```

## Expected Result

WHO door should display:
```
WHO's Online
Node  User      Location       Activity
0     sysop     Server Room    Main Menu
1 user(s) online
```

## If WHO Doesn't Work

Check backend logs:
```bash
tail -100 /tmp/backend.log | grep -E "WHO|Door|Open"
```

See `/Docs/RESTART_SESSION_INSTRUCTIONS.md` for full debug steps.

## All Code Is Ready

- UserFileManager.ts - user database files
- CallersLogManager.ts - activity logging
- DoorDropFileManager.ts - door drop files
- All triggers in database.ts, index.ts, door.handler.ts

**Just test it!** 🎯
