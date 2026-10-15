# Complete Testing Checklist - Recent Implementations

## Overview

This document lists EVERYTHING implemented in the last few days that requires testing to ensure the 68K door emulation is 100% complete.

**Status Date**: 2025-12-15

---

## Part 1: Core 68K SDK Implementation

### 1.1 User Data Query Functions (5 functions) ✓ IMPLEMENTED

**File**: `sdk/68k/src/glue-amiga.c` lines 375-510

- [ ] **getlevel()** - Get user security level (0-255)
  - Test: Returns valid number in range
  - Test: Matches actual user security level
  - Test: Works via GetDT LVO -108 call

- [ ] **getname()** - Get user name
  - Test: Returns non-null pointer
  - Test: Returns non-empty string
  - Test: Matches logged-in user's name
  - Test: Static buffer remains valid

- [ ] **getlocation()** - Get user location
  - Test: Returns non-null pointer
  - Test: Returns location string
  - Test: Matches user's configured location

- [ ] **getnode()** - Get current node number
  - Test: Returns positive integer
  - Test: Matches actual node number
  - Test: Works on multi-node systems

- [ ] **getbbsname()** - Get BBS name
  - Test: Returns non-null pointer
  - Test: Returns BBS name from config
  - Test: Matches bbsConfig.info BBSNAME

### 1.2 argc/argv Support ✓ IMPLEMENTED

**File**: `sdk/68k/src/glue-amiga.c` lines 87-167

- [ ] **Command-line argument parsing**
  - Test: argc contains correct count
  - Test: argv[0] contains node number
  - Test: argv[1+] contains additional arguments
  - Test: Space-separated parsing works
  - Test: Newline termination handled correctly
  - Test: Maximum 32 arguments supported
  - Test: NULL-terminated argv array

**Backend Integration**:
- File: `web/backend/src/amiga-emulation/DoorLoader.ts` lines 140-199
- [ ] D0 register contains argument length
- [ ] A0 register points to argument string
- [ ] Argument string is newline-terminated
- [ ] Node number passed as first argument

### 1.3 Extended API Functions (40+ functions) ✓ IMPLEMENTED

**File**: `sdk/68k/src/glue-amiga.c` lines 630-1347

#### User Data Functions

- [ ] **getuserstring(char *, int)** - Get any DT_* field as string
  - Test: DT_NAME returns name
  - Test: DT_LOCATION returns location
  - Test: DT_SECSTATUS returns level as string
  - Test: DT_PHONENUMBER returns phone
  - Test: DT_UPLOADS returns upload count
  - Test: DT_DOWNLOADS returns download count
  - Test: All 40+ DT_* constants work

- [ ] **putuserstring(char *, int)** - Set user data field
  - Test: Can update user fields
  - Test: Changes persist in session
  - Test: SetDT LVO -102 called correctly

- [ ] **GetInfo(int)** - Get integer field
  - Test: Returns integer from DT_* constant
  - Test: Parses string result correctly
  - Test: Handles negative numbers

- [ ] **PutInfo(int, int)** - Set integer field
  - Test: Converts integer to string
  - Test: Calls SetDT correctly
  - Test: Updates BBS state

- [ ] **getspecdata(char *, char *, int)** - Get special data
  - Test: Wrapper for getuserstring works

#### File Display Functions

- [ ] **showfile(char *)** - Display text file
  - Test: Displays existing file
  - Test: Returns error for non-existent file
  - Test: Handles relative paths
  - Test: Handles absolute paths
  - Test: LVO -96 called correctly

- [ ] **showgfile(char *, int)** - Display graphics file
  - Test: Displays ANSI files
  - Test: gtype parameter passed
  - Test: LVO -90 called correctly

- [ ] **showfilensf(char *)** - Display without stop
  - Test: No pause prompts
  - Test: Displays complete file

- [ ] **showgfilensf(char *)** - Display graphics without stop
  - Test: Works for ANSI/ASCII art

#### File Transfer Functions

- [ ] **Download(char *)** - Initiate download
  - Test: Sends JH_DOWNLOAD (514) command
  - Test: BBS initiates protocol selection
  - Test: Filename parameter passed correctly
  - Test: Returns success/failure code

- [ ] **Upload(char *)** - Initiate upload
  - Test: Sends JH_UPLOAD (513) command
  - Test: BBS initiates protocol selection
  - Test: Destination filename passed

- [ ] **BatchDownload(APTR)** - Batch download (stub)
  - Test: Function exists
  - Test: Returns 0 (not implemented)

- [ ] **NetUpload(APTR)** - Network upload (stub)
  - Test: Function exists
  - Test: Returns 0 (not implemented)

- [ ] **NetDownload(char *)** - Network download (stub)
  - Test: Function exists
  - Test: Returns 0 (not implemented)

- [ ] **Editfile(char *, int)** - Edit file
  - Test: Invokes BBS editor
  - Test: Filename parameter passed
  - Test: EDITOR_STRUCT (546) command sent

- [ ] **FlagFile(char *)** - Flag file
  - Test: File flagged in BBS
  - Test: DT_FILECODE (545) command sent

#### System Functions

- [ ] **getsignal()** - Get signal number
  - Test: Returns ENVSTAT value
  - Test: Returns valid signal number

- [ ] **GetSemaphore()** - Get multicom semaphore
  - Test: Returns non-null pointer
  - Test: MULTICOM (531) command sent

- [ ] **CheckToDisplay(char *)** - Check display flag
  - Test: Returns 1 (always display)

- [ ] **TLock(char *)** - Time lock
  - Test: Returns 0 (handled by BBS)

- [ ] **AcsStat(int, int)** - Access status check
  - Test: DT_QUERYBIT (1002) command sent
  - Test: Returns access status

- [ ] **IsAccess(int)** - Check access level
  - Test: Compares getlevel() to parameter
  - Test: Returns 1 if user has access
  - Test: Returns 0 if user lacks access

#### Utility Functions

- [ ] **Chain(char *, int, int)** - Chain to door
  - Test: CHAIN (502) command sent
  - Test: Door name parameter passed
  - Test: BBS switches to new door

- [ ] **AcpCommand(char *, int, int)** - Send ACP command
  - Test: ACP_COMMAND (544) sent
  - Test: Command parameter passed
  - Test: Node parameter passed

- [ ] **LastCommand()** - Get last command
  - Test: BB_COMMAND (130) sent
  - Test: Returns last command string

- [ ] **FetchKey()** - Fetch key (alias for getkey)
  - Test: Alias works correctly

- [ ] **sigkey()** - Signal key check
  - Test: JH_CK (503) command sent
  - Test: Returns key status

- [ ] **QuicKey()** - Quick key input
  - Test: QUICK_KEY (504) command sent
  - Test: Returns key code

- [ ] **CloseOut()** - Close and exit (alias for ShutDown)
  - Test: Alias works correctly
  - Test: Door exits cleanly

#### Date/Time Functions

- [ ] **GetTheDate(long)** - Get date string
  - Test: Returns formatted date
  - Test: Uses DT_STAMP_LASTON (143)

- [ ] **GetTheTime(long)** - Get time string
  - Test: Returns formatted time
  - Test: Uses DT_CURR_TIME (145)

- [ ] **DateToString(ULONG, char *)** - Convert date
  - Test: Fills buffer with date string

- [ ] **TimeToString(ULONG, char *)** - Convert time
  - Test: Fills buffer with time string

- [ ] **getsystime(ULONG, char *, char *)** - Get both
  - Test: Fills both date and time buffers

#### Account Management Functions

- [ ] **Load_Account(int, APTR, APTR)** - Load user account
  - Test: LOAD_ACCOUNT (532) command sent
  - Test: User number parameter passed
  - Test: Returns user structure pointer

- [ ] **Save_Account(int, APTR, APTR)** - Save user account
  - Test: SAVE_ACCOUNT (533) command sent
  - Test: User data written to database

- [ ] **Save_ConfDB(int, int, APTR)** - Save conference data
  - Test: SAVE_CONFDB (538) command sent

- [ ] **Load_ConfDB(int, int, APTR)** - Load conference data
  - Test: LOAD_CONFDB (539) command sent

- [ ] **Search_Account(int, APTR)** - Search accounts
  - Test: SEARCH_ACCOUNT (534) command sent
  - Test: Returns found/not found status

- [ ] **New_Account(APTR, APTR)** - Create account
  - Test: APPEND_ACCOUNT (535) command sent

- [ ] **LastAccountNum()** - Get last account number
  - Test: LAST_ACCOUNTNUM (536) command sent
  - Test: Returns valid account number

- [ ] **Get_ConfName(APTR, APTR, int)** - Get conference name
  - Test: GET_CONFNUM (537) command sent
  - Test: Returns conference name and location

#### Advanced Functions

- [ ] **GetFiller1(APTR, int)** - Get filler data
  - Test: SendCmd called with command

- [ ] **PutFiller1(APTR, int)** - Put filler data
  - Test: SendCmd called with command

### 1.4 Standard C Library Functions ✓ IMPLEMENTED

**File**: `sdk/68k/src/glue-amiga.c` lines 1348+

- [ ] **strlen(const char *)** - String length
  - Test: Returns correct length
  - Test: Handles empty strings
  - Test: NULL-safe

- [ ] **strcpy(char *, const char *)** - String copy
  - Test: Copies string correctly
  - Test: NULL-terminates result

- [ ] **strncpy(char *, const char *, int)** - String copy with limit
  - Test: Copies up to N characters
  - Test: Pads with nulls if needed

- [ ] **strcmp(const char *, const char *)** - String compare
  - Test: Returns 0 for equal strings
  - Test: Returns non-zero for different strings

- [ ] **memset(void *, int, int)** - Fill memory
  - Test: Fills N bytes with value

- [ ] **memcpy(void *, const void *, int)** - Copy memory
  - Test: Copies N bytes correctly

---

## Part 2: Test Doors Created

### 2.1 comprehensive-test ✓ CREATED

**File**: `sdk/68k/doors/comprehensive-test/comprehensive-test.c`
**Command**: COMPTEST

- [ ] Build test: `make door NAME=comprehensive-test`
- [ ] Install test: `make install-door NAME=comprehensive-test`
- [ ] Run test: Type COMPTEST in BBS
- [ ] Verify: argc/argv displayed correctly
- [ ] Verify: User data queries return real data
- [ ] Verify: getuserstring works with all constants
- [ ] Verify: Input/output functions work
- [ ] Verify: GetInfo/PutInfo work
- [ ] Verify: Test summary shows passed/failed counts

### 2.2 file-ops-test ✓ CREATED

**File**: `sdk/68k/doors/file-ops-test/file-ops-test.c`
**Command**: FILETEST

- [ ] Build test: `make door NAME=file-ops-test`
- [ ] Install test: `make install-door NAME=file-ops-test`
- [ ] Run test: Type FILETEST in BBS
- [ ] Test menu option 1: showfile displays text file
- [ ] Test menu option 2: showgfile displays graphics file
- [ ] Test menu option 3: Download initiates transfer
- [ ] Test menu option 4: Upload initiates transfer
- [ ] Test menu option 5: Editfile opens editor
- [ ] Test menu option 6: FlagFile flags file
- [ ] Test menu option 7: showfilensf displays without pausing

### 2.3 advanced-test ✓ CREATED

**File**: `sdk/68k/doors/advanced-test/advanced-test.c`
**Command**: ADVTEST

- [ ] Build test: `make door NAME=advanced-test`
- [ ] Install test: `make install-door NAME=advanced-test`
- [ ] Run test: Type ADVTEST in BBS
- [ ] Test menu option 1: Date/Time functions return formatted strings
- [ ] Test menu option 2: Account management functions work
- [ ] Test menu option 3: Access control checks work
- [ ] Test menu option 4: System functions return valid data
- [ ] Test menu option 5: Utility functions work
- [ ] Test menu option 6: Conference functions query conference data

### 2.4 interactive-demo ✓ CREATED

**File**: `sdk/68k/doors/interactive-demo/interactive-demo.c`
**Command**: CDEMO

- [ ] Build test: `make door NAME=interactive-demo`
- [ ] Install test: `make install-door NAME=interactive-demo`
- [ ] Run test: Type CDEMO in BBS
- [ ] Verify: MCI color codes render correctly
- [ ] Verify: User information displays correctly
- [ ] Verify: Interactive input works
- [ ] Verify: File operations menu works
- [ ] Verify: System information displays
- [ ] Verify: Access level test shows correct results

### 2.5 diagnostic ✓ CREATED (NEW!)

**File**: `sdk/68k/doors/diagnostic/diagnostic.c`
**Command**: DIAGNOSTIC

- [ ] Build test: `make door NAME=diagnostic`
- [ ] Install test: `make install-door NAME=diagnostic`
- [ ] Run test: Type DIAGNOSTIC in BBS
- [ ] Verify: All test sections execute
- [ ] Verify: Debug output shows detailed information
- [ ] Verify: Test summary shows pass/fail counts
- [ ] Review: Any failed tests identify emulation gaps

**This is the PRIMARY diagnostic tool for debugging 68K emulation!**

---

## Part 3: Backend XIM Protocol Implementation

### 3.1 GetDT() Implementation ✓ IMPLEMENTED

**File**: `web/backend/src/amiga-emulation/api/AEDoorLibrary.ts` lines 489-510

- [ ] Test: LVO -108 called from C door
- [ ] Test: D0 register contains DT_* constant
- [ ] Test: A0 register contains destination buffer or NULL
- [ ] Test: dispatchCommand called with correct dataType
- [ ] Test: Result written to dif_String buffer
- [ ] Test: If A0 provided, result copied to A0 buffer
- [ ] Test: D0 returns pointer to string buffer

**All DT_* Constants to Test**:
- [ ] DT_NAME (100) - User name
- [ ] DT_PHONENUMBER (101) - Phone number
- [ ] DT_LOCATION (102) - Location
- [ ] DT_ORGANIZATION (103) - Organization
- [ ] DT_PASSWORD (104) - Password (masked?)
- [ ] DT_SECSTATUS (105) - Security level
- [ ] DT_USERSTATUS (106) - User status
- [ ] DT_CALLSIGN (107) - Call sign
- [ ] DT_MAILBOX (108) - Mailbox
- [ ] DT_MODEMTYPE (109) - Modem type
- [ ] DT_UPLOADS (110) - Upload count
- [ ] DT_DOWNLOADS (111) - Download count
- [ ] DT_TIMESCALLED (112) - Times called
- [ ] DT_TIMELASTON (113) - Last on time
- [ ] DT_TIMEUSED (114) - Time used
- [ ] DT_TIMELIMIT (115) - Time limit
- [ ] DT_TIMETOTAL (116) - Total time
- [ ] DT_BYTESUPLOAD (117) - Bytes uploaded
- [ ] DT_BYTEDOWNLOAD (118) - Bytes downloaded
- [ ] DT_DAILYBYTELIMIT (119) - Daily byte limit
- [ ] BB_CONFNAME (126) - Conference name
- [ ] BB_CONFLOCAL (127) - Conference local
- [ ] BB_LOCAL (128) - Local mode
- [ ] BB_STATUS (129) - Status
- [ ] BB_COMMAND (130) - Last command
- [ ] BB_MAINLINE (131) - Main line
- [ ] DT_STAMP_LASTON (143) - Last on timestamp
- [ ] DT_STAMP_CTIME (144) - Create time timestamp
- [ ] DT_CURR_TIME (145) - Current time
- [ ] DT_CONFACCESS (146) - Conference access
- [ ] BB_NODEID (149) - Node ID
- [ ] ENVSTAT (163) - Environment status

### 3.2 SetDT() Implementation

**File**: `web/backend/src/amiga-emulation/api/AEDoorLibrary.ts`

- [ ] Test: LVO -102 called from C door
- [ ] Test: D0 register contains DT_* constant
- [ ] Test: A0 register contains source string
- [ ] Test: User data updated in database/session

### 3.3 SendCmd() Implementation

- [ ] Test: LVO -42 called correctly
- [ ] Test: D0 contains command constant
- [ ] Test: XIM protocol message sent

### 3.4 SendStrCmd() Implementation

- [ ] Test: LVO -48 called correctly
- [ ] Test: D0 contains command constant
- [ ] Test: A0 contains string parameter
- [ ] Test: Both command and string sent via XIM

### 3.5 SendDataCmd() Implementation

- [ ] Test: LVO -54 called correctly
- [ ] Test: D0 contains command constant
- [ ] Test: D1 contains integer data
- [ ] Test: Both command and data sent via XIM

### 3.6 SendStrDataCmd() Implementation

- [ ] Test: LVO -60 called correctly
- [ ] Test: D0 contains command constant
- [ ] Test: A0 contains string parameter
- [ ] Test: D1 contains integer data
- [ ] Test: All parameters sent via XIM

---

## Part 4: Documentation Created

- [ ] Review: `sdk/68k/IMPLEMENTATION_COMPLETE.md`
- [ ] Review: `sdk/68k/C_DOORS_FEATURE_COMPLETE.md`
- [ ] Review: `sdk/68k/doors/TEST_DOORS_README.md`
- [ ] Review: `sdk/68k/README.md` - Updated with recently fixed items

---

## Part 5: Known Gaps to Test

### 5.1 AmigaDOS File I/O (NOT YET IMPLEMENTED)

**Status**: Intentionally not wrapped - doors can use dos.library directly

- [ ] Document: dos.library available via DOSBase
- [ ] Document: Open(), Read(), Write(), Close() not wrapped
- [ ] Note: BBS file operations should use showfile/Download/Upload

### 5.2 Batch/Network Operations (STUBS)

**Status**: Simplified stubs - require complex list handling

- [ ] BatchDownload - Always returns 0
- [ ] NetUpload - Always returns 0
- [ ] NetDownload - Always returns 0

### 5.3 Environment Variables

**Status**: May not be implemented yet

- [ ] Test: ENVSTAT readable
- [ ] Test: ENV_* variables set by BBS
- [ ] Test: Environment accessible from door
- [ ] Check: web/backend/src/amiga-emulation/DoorLoader.ts for ENV setup

---

## Testing Priority

### Priority 1: CRITICAL (Test First)
1. ✅ **DIAGNOSTIC door** - Run this FIRST to identify all issues
2. User data queries (getlevel, getname, getlocation, getnode, getbbsname)
3. argc/argv parsing
4. Basic I/O (sendmessage, prompt, Hotkey)

### Priority 2: HIGH (Test Next)
5. getuserstring with all DT_* constants
6. GetInfo/PutInfo integer conversion
7. File display (showfile, showgfile)
8. File transfer (Download, Upload)

### Priority 3: MEDIUM (Test After Core Works)
9. Date/time functions
10. Access control (IsAccess, AcsStat)
11. System functions (getsignal, GetSemaphore)
12. Conference functions

### Priority 4: LOW (Test Last)
13. Account management functions
14. Utility functions (Chain, AcpCommand)
15. Advanced functions (GetFiller1, PutFiller1)

---

## Testing Procedure

### Step 1: Build Diagnostic Door
```bash
cd sdk/68k
make door NAME=diagnostic
make install-door NAME=diagnostic
```

### Step 2: Run Diagnostic Tool
```bash
# Start BBS
./dev/scripts/start-servers.sh

# Connect to BBS (browser or telnet)
# Login as user
# Type: DIAGNOSTIC
# Watch for [PASS] and [FAIL] markers
# Review debug output
```

### Step 3: Identify Failures
- Review diagnostic output line by line
- Note which tests failed
- Check backend logs: `logs/door-68k-diagnostic-*.log`
- Check XIM debug: `logs/xim-debug.log` (if XIM_DEBUG=1)

### Step 4: Fix Issues
- For each failure, check:
  1. Is the LVO call correct in glue-amiga.c?
  2. Is the backend handling the LVO in AEDoorLibrary.ts?
  3. Is the XIM command implemented?
  4. Is the data query returning correct data?

### Step 5: Re-test
- Re-run DIAGNOSTIC after each fix
- Watch for test count improvement
- Goal: 100% pass rate

---

## Success Criteria

✅ **68K Door Emulation is 100% complete when:**

1. DIAGNOSTIC door shows: "ALL TESTS PASSED! 68K Door Emulation: 100% COMPLETE"
2. All 4 test doors (COMPTEST, FILETEST, ADVTEST, CDEMO) run without errors
3. All DT_* constants return valid data
4. File operations work (display, download, upload)
5. argc/argv passes correctly from BBS to door
6. All LVO calls (-108, -102, -96, -90, -84, -78, -66, -54, -48, -42) work
7. XIM protocol communication is bidirectional and complete
8. User data queries return actual BBS data (not hardcoded values)

---

## Quick Test Commands

```bash
# Build all test doors
cd sdk/68k
make door NAME=diagnostic
make door NAME=comprehensive-test
make door NAME=file-ops-test
make door NAME=advanced-test
make door NAME=interactive-demo

# Install all test doors
make install-door NAME=diagnostic
make install-door NAME=comprehensive-test
make install-door NAME=file-ops-test
make install-door NAME=advanced-test
make install-door NAME=interactive-demo

# Run in BBS
DIAGNOSTIC      # Primary diagnostic tool
COMPTEST        # Comprehensive test
FILETEST        # File operations test
ADVTEST         # Advanced functions test
CDEMO           # Interactive demo
```

---

**END OF TESTING CHECKLIST**

Total Items to Test: 150+ individual tests
Expected Time: 2-4 hours for complete validation
Priority: Test DIAGNOSTIC first, then fix identified issues
