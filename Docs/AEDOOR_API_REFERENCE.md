# AEDoor.library API Reference

**Source:** `~/Code/amiexpress-web/Docs/Doors_with_Source/AEDOORS/`
**Date:** 2025-10-30
**Status:** Complete function list extracted from aedoor.m module file

## Overview

AEDoor.library is the door interface library for AmiExpress BBS. It provides high-level functions for door programs to communicate with the BBS system.

## Library Functions

### Core Communication

#### CreateComm(node: STRING): PTR
**Purpose:** Establish communication link with BBS
**Parameters:**
- `node` - Node number as string (passed via argv[1])

**Returns:** Communication interface pointer (diface)

**Example:**
```e
diface := CreateComm(arg[])
```

---

#### DeleteComm(diface: PTR): VOID
**Purpose:** Close communication link with BBS
**Parameters:**
- `diface` - Communication interface pointer

**Example:**
```e
DeleteComm(diface)
```

---

### Output Functions

#### WriteStr(diface: PTR, string: STRING, mode: LONG): VOID
**Purpose:** Write string to user's terminal
**Parameters:**
- `diface` - Communication interface pointer
- `string` - Text to display
- `mode` - `LF` (linefeed) or `NOLF` (no linefeed)

**Example:**
```e
WriteStr(diface, 'Hello World', LF)
WriteStr(diface, 'Name: ', NOLF)
```

**Note:** This is likely what maps to `aePuts()` in the C interface.

---

#### ShowFile(diface: PTR, filename: STRING): VOID
**Purpose:** Display AmigaDOS file to user
**Parameters:**
- `diface` - Communication interface pointer
- `filename` - DOS path (e.g., 'S:User-Startup')

**Example:**
```e
ShowFile(diface, 'S:User-Startup')
```

---

#### ShowGFile(diface: PTR, filename: STRING): VOID
**Purpose:** Display BBS/AmiExpress file to user
**Parameters:**
- `diface` - Communication interface pointer
- `filename` - BBS path (e.g., 'BBS:BULL30')

**Example:**
```e
ShowGFile(diface, 'BBS:BULL30')
```

---

### Input Functions

#### Prompt(diface: PTR, maxlen: LONG, prompt: STRING): PTR
**Purpose:** Display prompt and get user input
**Parameters:**
- `diface` - Communication interface pointer
- `maxlen` - Maximum input length
- `prompt` - Prompt text to display

**Returns:** Pointer to input string, or NIL if carrier lost

**Example:**
```e
IF (res := Prompt(diface, 80, '\nGimme some input: ')) <> NIL
    StrCopy(str, res, 80)
ENDIF
```

**Note:** This likely calls `aeGetCh()` internally for character input.

---

#### GetStr(diface: PTR, maxlen: LONG, default: STRING): PTR
**Purpose:** Get input with default value
**Parameters:**
- `diface` - Communication interface pointer
- `maxlen` - Maximum input length
- `default` - Default string if user presses RETURN

**Returns:** Pointer to input string, or NIL if carrier lost

**Example:**
```e
IF (res := GetStr(diface, 3, 'YES')) <> NIL
    IF StrCmp(res, 'YES', 3)
        // User said YES
    ENDIF
ENDIF
```

---

#### GetString(diface: PTR): PTR
**Purpose:** Get pointer to JHM_String field
**Returns:** Pointer to string buffer for subsequent operations

**Note:** Call once at start, reuse pointer for GetDT results

**Example:**
```e
strfield := GetString(diface)
// Later, after GetDT calls:
StrCopy(usern, strfield, 50)
```

---

### User Data Functions

#### GetDT(diface: PTR, datatype: LONG, dest: STRING): VOID
**Purpose:** Get user/system data
**Parameters:**
- `diface` - Communication interface pointer
- `datatype` - Data type constant (DT_* from constants)
- `dest` - Destination string, or 0 to use JHM_String

**Common Data Types:**
- `DT_NAME` - User name/handle
- `DT_PASSWORD` - User password
- `DT_LOCATION` - User location
- `DT_PHONENUMBER` - Phone number
- `DT_SLOTNUMBER` - Account slot number
- `DT_SECSTATUS` - Security level
- `DT_MESSAGESPOSTED` - Messages posted count
- `DT_UPLOADS` - Upload count
- `DT_DOWNLOADS` - Download count
- `DT_TIMESCALLED` - Times called
- `DT_TIMELASTON` - Last online time
- `DT_TIMEUSED` - Time used this session
- `DT_TIMELIMIT` - Time limit
- `DT_BYTESUPLOAD` - Bytes uploaded
- `DT_BYTEDOWNLOAD` - Bytes downloaded
- `DT_EXPERT` - Expert mode flag
- `DT_LINELENGTH` - Line length setting
- `DT_DUMP` - Dump user data structure to file

**Example:**
```e
GetDT(diface, DT_NAME, 0)
StrCopy(usern, strfield, 50)

GetDT(diface, DT_DUMP, 'T:user.dump')
```

---

#### SetDT(diface: PTR, datatype: LONG, value: STRING): VOID
**Purpose:** Set user/system data
**Parameters:**
- `diface` - Communication interface pointer
- `datatype` - Data type constant
- `value` - Value to set

---

### Command Functions

#### SendCmd(diface: PTR, command: LONG): VOID
**Purpose:** Send command to BBS
**Parameters:**
- `diface` - Communication interface pointer
- `command` - Command constant

**Common Commands:**
- `JH_LI` - Login
- `JH_REGISTER` - Register
- `JH_SHUTDOWN` - Shutdown
- `JH_WRITE` - Write
- `JH_SM` - System message
- `JH_PM` - Private message
- `JH_HK` - Hotkey
- `JH_SG` - System graphics
- `JH_SF` - Show file
- `JH_EF` - Edit file
- `JH_CO` - Console output
- `JH_BBSNAME` - BBS name
- `JH_SYSOP` - Sysop name
- `JH_FLAGFILE` - Flag file
- `JH_SHOWFLAGS` - Show flags

---

#### SendStrCmd(diface: PTR, command: LONG, string: STRING): VOID
**Purpose:** Send command with string parameter

---

#### SendDataCmd(diface: PTR, command: LONG, data: LONG): VOID
**Purpose:** Send command with data parameter

---

#### SendStrDataCmd(diface: PTR, command: LONG, string: STRING, data: LONG): VOID
**Purpose:** Send command with both string and data

---

### Data Retrieval

#### GetData(diface: PTR): LONG
**Purpose:** Get data value from BBS
**Returns:** Long integer value

---

### String Functions

#### CopyStr(dest: STRING, src: STRING, maxlen: LONG): VOID
**Purpose:** Copy string safely
**Parameters:**
- `dest` - Destination buffer
- `src` - Source string
- `maxlen` - Maximum length to copy

---

#### HotKey(diface: PTR): LONG
**Purpose:** Get hotkey input
**Returns:** Key code

---

## BBS Data Constants

### Conference/Area
- `BB_CONFNAME` - Conference name
- `BB_CONFLOCAL` - Conference local
- `BB_LOCAL` - Local flag
- `BB_STATUS` - Status
- `BB_COMMAND` - Command
- `BB_MAINLINE` - Main line
- `BB_CONFIG` - Config
- `BB_CONFNUM` - Conference number
- `BB_PCONFLOCAL` - Previous conference local
- `BB_PCONFNAME` - Previous conference name

### Node Information
- `BB_NODEID` - Node ID
- `NODE_DEVICE` - Node device
- `NODE_UNIT` - Node unit
- `NODE_BAUD` - Node baud rate
- `NODE_NUMBER` - Node number
- `NODE_BAUDRATE` - Node baud rate
- `BB_GETTASK` - Get task
- `BB_REMOVEPORT` - Remove port
- `BB_SOPT` - System options

### Screen/Display
- `SCREEN_ADDRESS` - Screen address
- `RAWSCREEN_ADDRESS` - Raw screen address
- `BB_TASKPRI` - Task priority
- `BB_SCRLEFT` - Screen left
- `BB_SCRTOP` - Screen top
- `BB_SCRWIDTH` - Screen width
- `BB_SCRHEIGHT` - Screen height
- `BB_PURGELINE` - Purge line
- `BB_PURGELINESTART` - Purge line start
- `BB_PURGELINEEND` - Purge line end
- `BB_NONSTOPTEXT` - Non-stop text
- `BB_LINECOUNT` - Line count

### Logging
- `BB_CALLERSLOG` - Callers log
- `BB_UDLOG` - Upload/download log
- `BB_LOGONTYPE` - Logon type

### Chat/Communication
- `BB_CHATFLAG` - Chat flag
- `BB_CHATSET` - Chat set

### Environment Status
- `ENV_IDLE` - Idle
- `ENV_DOWNLOADING` - Downloading
- `ENV_UPLOADING` - Uploading
- `ENV_DOORS` - In door
- `ENV_MAIL` - Mail
- `ENV_STATS` - Stats
- `ENV_ACCOUNT` - Account
- `ENV_ZOOM` - Zoom
- `ENV_FILES` - Files
- `ENV_BULLETINS` - Bulletins
- `ENV_VIEWING` - Viewing
- `ENV_LOGON` - Logon
- `ENV_LOGOFF` - Logoff
- `ENV_SYSOP` - Sysop mode
- `ENV_SHELL` - Shell
- `ENV_EMACS` - Emacs
- `ENV_JOIN` - Join
- `ENV_CHAT` - Chat
- `ENV_NOTACTIVE` - Not active
- `ENV_REQ_CHAT` - Request chat
- `ENV_CONNECT` - Connect
- `ENV_LOGGINGON` - Logging on
- `ENV_AWAITCONNECT` - Await connect
- `ENV_SCANNING` - Scanning
- `ENV_SHUTDOWN` - Shutdown
- `ENV_MULTICHAT` - Multi-chat
- `ENV_DROPPED` - Carrier dropped

### Other
- `ACTIVE_NODES` - Active nodes count
- `NB_LOAD` - Node load
- `CHG_USER` - Change user
- `RETURNCOMMAND` - Return command
- `ZMODEMSEND` - ZModem send
- `ZMODEMRECEIVE` - ZModem receive
- `EXPRESS_VERSION` - AmiExpress version
- `DT_TIMESTAMP_LASTON` - Last on timestamp
- `DT_STAMP_CTIME` - Current time stamp
- `DT_CURR_TIME` - Current time
- `DT_CONFACCESS` - Conference access
- `DT_LANGUAGE` - Language setting
- `DT_QUICKFLAG` - Quick flag
- `DT_GOODFILE` - Good file flag
- `DT_ADDBIT` - Add bit
- `DT_REMBIT` - Remove bit
- `DT_QUERYBIT` - Query bit

### Mode Constants
- `READIT` - Read mode
- `WRITEIT` - Write mode
- `LF` - Linefeed (add newline)
- `NOLF` - No linefeed (no newline)

## C Language Interface (Inferred)

Based on analysis of What.c door source, the C interface appears to use these functions:

```c
void DoorStart(char *node);           // Initialize door - calls CreateComm()
void sendmessage(char *text);         // Output text - calls WriteStr()
void putuserstring(int dt, int mode, char *str); // Set user data
void getuserstring(char *dest, int maxlen);      // Get user data
void end();                            // Close door - calls DeleteComm()

// Lower-level functions (used internally?)
void aePuts(char *string);            // Put string
int aeGetCh(void);                    // Get character (non-blocking)
void aePutCh(char ch);                // Put character
```

## Implementation Priority

For fixing the current door crash, implement in this order:

1. **CreateComm** - Initialize door communication
2. **WriteStr** - Basic output (maps to aePuts)
3. **GetString** - Get string buffer pointer
4. **GetDT** - Get user data
5. **DeleteComm** - Cleanup

## Next Steps

1. Analyze AEDoor.library binary to map function names to offsets
2. Implement critical functions in `AmiExpressLibrary.ts`
3. Test with AquaWho door
4. Iterate and add more functions as needed

---

**Copyright 1993 by SiNTAX/W•T**
