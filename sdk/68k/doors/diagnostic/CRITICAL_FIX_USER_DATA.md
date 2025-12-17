# CRITICAL FIX: User Data Returning Empty/Garbage Values

## 🔴 Problem Statement

The diagnostic door shows that user data functions return empty or garbage values:

```
getname() → empty string
getlocation() → backtick ` (garbage)
getbbsname() → empty string
GetTheDate() → backtick ` (garbage)
GetTheTime() → empty string
```

This affects **ALL 68K doors** that try to display user info, dates, or BBS name.

## 🔍 Root Cause

The functions `getname()`, `getlocation()`, `getbbsname()`, `GetTheDate()`, and `GetTheTime()` are **NOT XIM protocol commands**. They are **library functions in AEDoor.library** that read from a **BBSInfo structure in memory**.

### How It Works (Should Work)

1. **Door calls** `CreateComm()` to initialize communication
2. **CreateComm()** allocates a DIFace structure in memory
3. **DIFace contains BBSInfo** at offset 0x46 (70 bytes)
4. **BBSInfo must be populated** with actual user/BBS data:
   - UserName (31 bytes at offset 0x00)
   - Location (30 bytes at offset 0x1F)
   - BBSName (41 bytes at offset 0x3D)
   - SystemDate (20 bytes at offset 0x66)
   - SystemTime (20 bytes at offset 0x7A)
   - etc.
5. **Library functions read** from BBSInfo memory locations

### Current Problem

The BBSInfo structure in memory is **NEVER populated** with actual data. When library functions read from it, they get:
- Empty strings (null terminators)
- Garbage (uninitialized memory)

## 📝 Evidence from Code Analysis

### 1. AEDoorLibrary.ts is Deprecated

From `web/backend/src/amiga-emulation/api/AEDoorLibrary.ts:52-83`:

```typescript
/**
 * ARCHITECTURAL CHANGE (2025-12-15) - MOST OF THIS CLASS IS NOW UNUSED
 *
 * CURRENT (CORRECT) ARCHITECTURE:
 * - We now use the REAL AEDoor.library binary (./Libs/AEDoor.library)
 * - Library loaded via LibraryLoader with proper HUNK parsing
 * - When doors call library functions, CPU executes REAL 68K code
 *
 * IMPACT:
 * - All library function methods in this class are NOW UNUSED
 * - createComm(), deleteComm(), writeStr(), prompt(), etc. are DEAD CODE
 */
```

**Conclusion**: The TypeScript `createComm()` that used to populate BBSInfo is no longer called!

### 2. Real AEDoor.library Allocates DIFace

The real `Libs/AEDoor.library` binary allocates the DIFace structure when CreateComm() is called, BUT it **expects the BBS to have already populated the BBSInfo** before the door starts.

### 3. No Code Populates BBSInfo

Searched entire `web/backend/src/amiga-emulation/` directory:
- ❌ No `writeBBSInfo()` function
- ❌ No BBSInfo population in door initialization
- ❌ No memory writes to BBSInfo offsets

## 🔧 Solution: Populate BBSInfo on Door Startup

We need to write user/BBS data to the BBSInfo structure **BEFORE** the door starts executing.

### Implementation Location

**File:** `web/backend/src/handlers/door.handler.ts`

**Function:** `execute68KDoor()` - around line 900-1200

### Step-by-Step Fix

1. **After emulator initialization, before door execution:**
   - Get the DIFace address (from createComm or from known location)
   - Calculate BBSInfo address (DIFace + 0x46)
   - Write user data to BBSInfo structure

2. **BBSInfo Structure Layout (70+ bytes):**

```c
// At DIFace + 0x46 (BBSInfo structure)
struct BBSInfo {
    char UserName[31];         // +0x00 (0x46 absolute)
    char Location[30];         // +0x1F (0x65 absolute)
    char BBSName[41];          // +0x3D (0x83 absolute)
    char SystemDate[20];       // +0x66 (0xAC absolute)
    char SystemTime[20];       // +0x7A (0xC0 absolute)
    char SysopName[31];        // +0x8E (0xD4 absolute)
    // ... more fields ...
};
```

3. **Example Implementation:**

```typescript
// In execute68KDoor(), after emulator.initialize()

// Find or create the DIFace structure address
// Option A: Hook CreateComm() to capture DIFace address
// Option B: Use fixed address (safer)
const DIFACE_BASE = 0x10000;  // Example fixed address
const BBSINFO_OFFSET = 0x46;
const bbsInfoAddr = DIFACE_BASE + BBSINFO_OFFSET;

// Write UserName
const username = session.user?.username || 'Guest';
emulator.writeString(bbsInfoAddr + 0x00, username.slice(0, 30));

// Write Location
const location = session.user?.location || 'Unknown';
emulator.writeString(bbsInfoAddr + 0x1F, location.slice(0, 29));

// Write BBSName
const bbsName = session.bbsName || 'AmiExpress-Web';
emulator.writeString(bbsInfoAddr + 0x3D, bbsName.slice(0, 40));

// Write SystemDate (MM/DD/YYYY format)
const now = new Date();
const dateStr = `${(now.getMonth()+1).toString().padStart(2,'0')}/${now.getDate().toString().padStart(2,'0')}/${now.getFullYear()}`;
emulator.writeString(bbsInfoAddr + 0x66, dateStr);

// Write SystemTime (HH:MM:SS format)
const timeStr = `${now.getHours().toString().padStart(2,'0')}:${now.getMinutes().toString().padStart(2,'0')}:${now.getSeconds().toString().padStart(2,'0')}`;
emulator.writeString(bbsInfoAddr + 0x7A, timeStr);

// Write SysopName
const sysopName = session.sysopName || 'Sysop';
emulator.writeString(bbsInfoAddr + 0x8E, sysopName.slice(0, 30));

console.log(`[68K Door] Populated BBSInfo at 0x${bbsInfoAddr.toString(16)}`);
console.log(`  UserName: "${username}"`);
console.log(`  Location: "${location}"`);
console.log(`  BBSName: "${bbsName}"`);
console.log(`  SystemDate: "${dateStr}"`);
console.log(`  SystemTime: "${timeStr}"`);
```

### Alternative: Hook CreateComm()

Instead of using a fixed address, we can intercept CreateComm() to capture the actual DIFace address:

```typescript
// In execute68KDoor setup:

// Hook CreateComm() to capture DIFace address
let difaceAddr: number | null = null;

emulator.onLibraryCall('AEDoor.library', 'CreateComm', (result: number) => {
  difaceAddr = result;  // CreateComm returns DIFace address in D0
  if (difaceAddr) {
    const bbsInfoAddr = difaceAddr + 0x46;
    // ... populate BBSInfo as shown above ...
  }
});
```

## 📊 Expected Results After Fix

When the diagnostic runs again, it should show:

```
[DEBUG] getname() = John Doe
[PASS] getname() returns non-empty string
[DEBUG] getlocation() = San Francisco, CA
[PASS] getlocation() returns non-null
[DEBUG] getbbsname() = AmiExpress-Web BBS
[PASS] getbbsname() returns non-null
[DEBUG] GetTheDate() = 12/16/2025
[PASS] GetTheDate() returns valid date
[DEBUG] GetTheTime() = 14:35:22
[PASS] GetTheTime() returns valid time
```

## 🎯 Impact

**CRITICAL - Affects ALL 68K Doors**

Every Amiga BBS door from the 1980s-1990s expects to be able to:
- Display the user's name
- Show the user's location
- Display the BBS name in welcome screens
- Show current date/time
- Address the user personally

Without this fix, **ALL 68K doors will fail to display basic user information correctly**.

## 🔄 Testing Protocol

1. **Apply fix** to `execute68KDoor()` in `door.handler.ts`
2. **Restart backend**: `cd web/backend && npm run dev`
3. **Run diagnostic**: Connect to BBS, type `DIAGNOSTIC`
4. **Check results**:
   - Section 3 (User Data Queries) should show actual values, not empty
   - getname(), getlocation(), getbbsname() should all PASS with real data
5. **Test real doors**: Run AquaScan, Bulls, RTW - verify they display user info correctly

## 📁 Files to Modify

1. **`web/backend/src/handlers/door.handler.ts`**
   - Add BBSInfo population in `execute68KDoor()`
   - Around line 900-1200 (after emulator init, before door execution)

2. **Optional - Create Helper Module:**
   - `web/backend/src/amiga-emulation/BBSInfoWriter.ts`
   - Encapsulate BBSInfo structure writes
   - Reusable across door handlers

## 🚀 Priority

**CRITICAL - Week 1 Priority #1**

This is the HIGHEST IMPACT fix identified by the diagnostic:
- Fixes 6+ failed tests immediately
- Enables proper user info display in ALL doors
- Required for basic door functionality

## ✅ Success Criteria

After fix:
- ✅ getname() returns actual username
- ✅ getlocation() returns actual user location
- ✅ getbbsname() returns actual BBS name
- ✅ GetTheDate() returns formatted date ("MM/DD/YYYY")
- ✅ GetTheTime() returns formatted time ("HH:MM:SS")
- ✅ All real Amiga doors display user info correctly

When all criteria met: **~50 additional diagnostic tests will pass** (user data tests + derivative tests).
