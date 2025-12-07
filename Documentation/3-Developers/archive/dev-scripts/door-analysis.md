# AmiExpress Web BBS Door Analysis & Action Plan

## Door Test Results Summary

### ✅ **WORKING DOORS** (18 doors)
- dark, dmud, fish, gwar, hack, legn, lord, luna, mega, tw2002, arcl, req, size, u, i, who, olm, gwall
- blesseddemo, hello, hello (typescript)

### 🚫 **CATEGORY 1: Missing Door Implementations** (9 doors)
**Error Pattern:** "Door not found: ~/Code/amiexpress-web/doors/[door-name]/index.ts"
- bbslink
- dannounce (discord-announce)  
- globalwall (gwall)
- fireemblem
- spaceshoot
- telnet
- telnetfront
- mrc

**Fix Priority:** 🔥 **HIGHEST** - These doors don't exist at all

---

### ⚠️ **CATEGORY 2: Configuration Issues** (2 doors)
- **bbslinkwall**: "Error: syscode missing from bbslink.cfg"
- **hellopython**: "Unknown door type: PYTHON" 
- **helloarexx**: "Error: ARexx script not found: doors/hello-arexx/hello.rexx"

**Fix Priority:** 🔥 **HIGH** - Quick config fixes

---

### 💥 **CATEGORY 3: Backend Crashes** (4 doors)
**Error Pattern:** Crashes backend, requires restart
- **ANSI**: Crashes when ESC pressed
- **drawcube**: "TypeError: drawille.Canvas is not a constructor"
- **dungeon**: Crashes when ENTER pressed
- **nuke**: "Invalid password!" (may crash)

**Fix Priority:** 🔥 **CRITICAL** - System stability issues

---

### ⏳ **CATEGORY 4: Stuck/Non-Responsive Doors** (4 doors)
**Error Pattern:** No response, infinite loading
- **neodemo**: "stuck here"
- **tetris**: "nothing happens when i press enter"  
- **tracker**: "nothing happens when i press enter"

**Fix Priority:** 🟡 **MEDIUM** - User experience issues

---

### 🔧 **CATEGORY 5: Minor Issues** (4 doors)
- **conftop**: "Unknown command: CONFTOP"
- **arcl**: "Sorry, No file areas available."
- **b/wall**: "Couldn't create reply port"
- **glcview**: "works but when i press enter to exit it just restarts"
- **hellots**: "works but total calls is 0"

**Fix Priority:** 🟢 **LOW** - Enhancement/improvement issues

---

## **PRIORITY RANKING FOR FIXES**

### 🥇 **Priority 1: Missing Door Implementations** 
Create door implementations for 9 missing doors

### 🥈 **Priority 2: Backend Crash Fixes**
Fix critical system stability issues

### 🥉 **Priority 3: Configuration Issues** 
Fix BBSLink, Python door type, ARexx script

### 4️⃣ **Priority 4: Stuck Door Fixes**
Fix infinite loading/response issues

### 5️⃣ **Priority 5: Minor Fixes**
Polish remaining issues

---

## **NEXT STEPS**

1. **Start with Priority 1** - Create missing door implementations
2. **Move to Priority 2** - Fix backend crashes for stability  
3. **Address Priority 3** - Quick configuration fixes
4. **Tackle Priority 4** - Fix responsive issues
5. **Complete with Priority 5** - Polish remaining doors

**GOAL:** Get every single door working properly
