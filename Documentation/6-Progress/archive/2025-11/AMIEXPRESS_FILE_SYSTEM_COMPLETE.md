# AmiExpress BBS - Complete File System Documentation

**CRITICAL: This is a 1:1 port - ALL files must be implemented for 100% compatibility**

Analyzed from: `~/Code/Reference/AmiExpress-Sources/express.e`

---

## Table of Contents

1. [User Account Files](#user-account-files)
2. [Node Session Files](#node-session-files)
3. [Conference Files](#conference-files)
4. [Message Base Files](#message-base-files)
5. [Voting System Files](#voting-system-files)
6. [Statistics & Logs](#statistics--logs)
7. [Bulletin Files](#bulletin-files)
8. [File Area Files](#file-area-files)
9. [System Configuration Files](#system-configuration-files)
10. [Door/External Program Files](#doorexternal-program-files)

---

## 1. User Account Files

### `BBS:user.data` (User Data File)
**Location:** Lines 31937, 111, 7983-8045, 11428-11486, 21078-24091, 30490

**Structure:** Binary, fixed-record format
```
OBJECT user (68 bytes per record)
  name[31]:ARRAY OF CHAR           - Username (null-terminated)
  pass[9]:ARRAY OF CHAR            - Password hash (8 chars + null)
  location[30]:ARRAY OF CHAR       - User's location
  phoneNumber[13]:ARRAY OF CHAR    - Phone number
  slotNumber: INT                  - User slot/account number
  secStatus: INT                   - Security level (0-255)
  secBoard: INT                    - File/Byte ratio
  secLibrary: INT                  - Library ratio
  secBulletin: INT                 - Computer type index
  messagesPosted: INT              - Total messages posted
  newSinceDate: LONG               - Last "new since" scan date
  pwdHash: LONG                    - Legacy password hash
  confRead2: LONG                  - (unused)
  confRead3: LONG                  - (unused)
  zoomType: INT                    - Zoom mail type
  unknown: INT                     - (unused)
  unknown2: INT                    - (unused)
  unknown3: INT                    - (unused)
  xferProtocol: INT                - Transfer protocol index
  filler2: INT                     - (unused)
  lcFiles: INT                     - (unused)
  badFiles: INT                    - (unused)
  accountDate: LONG                - Account creation date (Unix timestamp)
  screenType: INT                  - Terminal type (ANSI/ASCII/RIP)
  editorType: INT                  - Message editor type
  conferenceAccess[10]: ARRAY OF CHAR - Conference access flags
  uploads: INT                     - Total uploads
  downloads: INT                   - Total downloads
  confRJoin: INT                   - Conference rejoin number
  timesCalled: INT                 - Total calls
  timeLastOn: LONG                 - Last logon time
  timeUsed: LONG                   - Time used this session
  timeLimit: LONG                  - Daily time limit
  timeTotal: LONG                  - Total time online
  bytesDownload: LONG              - Total bytes downloaded
  bytesUpload: LONG                - Total bytes uploaded
  dailyBytesLimit: LONG            - Daily download limit
  dailyBytesDld: LONG              - Today's downloads
  expert: CHAR                     - Expert mode flag
  chatRemain: LONG                 - Chat time remaining
  chatLimit: LONG                  - Chat time limit
  creditDays: LONG                 - Credit account days
  creditAmount: LONG               - Credit amount paid
  creditStartDate: LONG            - Credit start date
  creditTotalToDate: LONG          - Total credits to date
  creditTotalDate: LONG            - Credit total date
  creditTracking: CHAR             - Credit tracking flags
  translatorID: CHAR               - Language translator ID
  msgBaseRJoin:INT                 - Message base rejoin number
  confYM9: LONG                    - (unused)
  todaysBytesLimit : LONG          - Today's byte limit
  protocol: CHAR                   - (unused)
  uucpa: CHAR                      - UUCP flag
  lineLength: CHAR                 - Line length setting
  newUser: CHAR                    - New user flag
ENDOBJECT
```

**Operations:**
- **Read:** Lines 7983-8004 (load user by slot number)
- **Write:** Lines 8045-8074 (save user after changes)
- **Search:** Lines 11428-11486 (find user by username)

**File Path Construction:**
```e
StringF(userDataFile,'\suser.data',cmds.bbsLoc)
```

---

### `BBS:user.keys` (User Keys File)
**Location:** Lines 31943, 112, 7993-8058, 11428-11486, 21753-24093

**Structure:** Binary, fixed-record format
```
OBJECT userKeys (24 bytes per record)
  userName[31]: ARRAY OF CHAR      - Username lookup key
  number: LONG                     - User slot number
  newUser: CHAR                    - New user flag
  oldUpCPS: INT                    - Legacy upload CPS (max 64k)
  oldDnCPS: INT                    - Legacy download CPS (max 64k)
  userFlags: INT                   - User flags bitfield
  baud: INT                        - Last online baud rate
  upCPS2: LONG                     - Upload CPS (>64k support)
  dnCPS2: LONG                     - Download CPS (>64k support)
  timesOnToday: INT                - Calls today counter
ENDOBJECT
```

**Operations:**
- **Read:** Lines 7993-8058 (load user keys by slot)
- **Write:** Lines 8058-8074 (save user keys)
- **Search:** Lines 11428-11486 (username → slot lookup)

**Purpose:** Index file for fast username lookups

---

### `BBS:user.misc` (User Misc File)
**Location:** Lines 31949, 113, 8004-8074, 11486-11503, 23696-24093

**Structure:** Binary, fixed-record format
```
OBJECT userMisc (256 bytes per record)
  internetName[10]:ARRAY OF CHAR   - Internet name (max 9 chars)
  realName[26]:ARRAY OF CHAR       - Real name (max 25 chars)
  downloadBytesBCD[8]:ARRAY OF CHAR - Download bytes (BCD format)
  uploadBytesBCD[8]:ARRAY OF CHAR   - Upload bytes (BCD format)
  eMail[50]:ARRAY OF CHAR          - Email address
  lastDlCPS:LONG                   - Last download CPS
  pwdHash[32]:ARRAY OF CHAR        - SHA-256 password hash
  salt[8]:ARRAY OF CHAR            - Password salt
  pwdType:CHAR                     - Password type (0=legacy, 1=SHA256)
  forcePwdReset:CHAR               - Force password reset flag
  accountLocked:CHAR               - Account locked flag
  invalidAttempts:CHAR             - Invalid login attempts
  pwdLastUpdated:LONG              - Password last updated date
  lastIP:LONG                      - Last IP address
  ipMask:LONG                      - IP address mask
  unused[86]:ARRAY OF CHAR         - Reserved
ENDOBJECT
```

**Operations:**
- **Read:** Lines 8004-8074
- **Write:** Lines 8074
- **Security:** Password hashing (SHA-256), account locking

---

## 2. Node Session Files

### `BBS:Node{N}/node.user` (Node User File)
**Location:** Already documented in current implementation

**Structure:** Binary copy of `user` struct for active session

**Path Pattern:**
```
BBS:Node{nodeNumber}/node.user
```

---

### `BBS:Node{N}/node.userkeys` (Node User Keys File)
**Location:** Already documented

**Structure:** Binary copy of `userKeys` struct for active session

---

### `BBS:Node{N}/CallersLog` (Node Callers Log)
**Location:** Lines 7775-7785, 9493-9546, 24475-24504

**Structure:** Text file, append-only

**Format:**
```
[timestamp] Event description
[timestamp] Username logged on
[timestamp] Downloaded: filename (size bytes)
[timestamp] Uploaded: filename (size bytes)
[timestamp] **Input timed out **
[timestamp] * Password Failure *
**************************************************************
```

**Operations:**
- **Append:** Line 9493 `callersLog(stringout: PTR TO CHAR,linefeed=TRUE)`
- **Read/Display:** Lines 9067-9099 `displayCallersLog(filename,tf)`
- **Divider:** Line 9575 (60 asterisks)

**Path Construction:**
```e
StringF(buff,'\sNode\d/CallersLog',cmds.bbsLoc,node)
```

---

### `BBS:Node{N}/CallerIDlog` (Caller ID Log)
**Location:** Lines 9546-9576

**Structure:** Text file, append-only

**Format:**
```
[date] [time] [number] [name]
```

**Operations:**
- **Append:** Line 7300 `callerIDLog(1)`
- **View:** Lines 9551-9566

**Path Construction:**
```e
StringF(tempstr,'\sNode\d/CallerIDlog',cmds.bbsLoc,node)
```

---

### `ram:logoff{N}.log` (Logoff Log - Temporary)
**Location:** Line 8104

**Structure:** Text file, temporary

**Purpose:** Session statistics written at logoff, deleted after display

**Path:**
```e
StringF(fname,'ram:logoff\d.log',node)
```

---

## 3. Conference Files

### `{ConfDir}/Conf.DB` (Conference Database)
**Location:** Lines 31931-31932, 171, 2102-2111, 4819-4895, 22344-22622

**Structure:** Binary, array of conference accounting records

**Array Size:** Dynamically sized based on user count

**Record Structure:**
```
OBJECT confBase (80 bytes per record, one per user)
  handle[16]: ARRAY OF CHAR          - Voting handles (16 bits = 128 topics)
  downloadBytesBCD[8]:ARRAY OF CHAR  - Conference download bytes (BCD)
  uploadBytesBCD[8]:ARRAY OF CHAR    - Conference upload bytes (BCD)
  newSinceDate: LONG                 - Last "new since" date
  confRead: LONG                     - Last message read
  confYM: LONG                       - Your mail pointer
  bytesDownload: LONG                - Bytes downloaded in conf
  bytesUpload: LONG                  - Bytes uploaded in conf
  uploadTracking: INT                - Upload tracking flags
  unused: INT                        - (unused)
  unused2:LONG                       - (unused, was dailyBytesDld)
  upload: INT                        - Files uploaded
  downloads: INT                     - Files downloaded
  ratioType: INT                     - Ratio type override
  ratio: INT                         - Ratio value override
  messagesPosted: INT                - Messages posted in conf
  access: INT                        - Access level override
  active:INT                         - Conference active flag
ENDOBJECT
```

**Path Construction:**
```e
getConfDbFileName(confNum,msgBaseNum,outConfDbFile)
  cn:=readToolTypeInt(TOOLTYPE_CONF,confNum,'CONFDB_SHARED')
  IF cn>0
    getMsgBaseLocation(confNum,msgBaseNum,outConfDbFile)
  ELSE
    getConfLocation(confNum,outConfDbFile)
  ENDIF
  StrAdd(outConfDbFile,confDBName)  -> "Conf.DB"
```

**Shared vs Per-MsgBase:**
- If `CONFDB_SHARED` tooltype is set, one Conf.DB per message base
- Otherwise, one Conf.DB for entire conference

**Operations:**
- **Load:** Line 4819 `loadConfDB(account,confNum,msgBase,addr,force=FALSE)`
- **Save:** Line 4855 `saveConfDB(account,confNum,msgBase,addr,force=FALSE)`
- **Resize:** Line 22584 `resizeConfDB(confnum,msgBaseNum,newSize)`
- **Update All Users:** Line 22459 `updateAllUsers(confnum,msgBaseNum,updateType, newVal)`
- **Dump Stats:** Line 22521 `dumpUserStats(confnum,msgBaseNum)`

**Update Types (line 22459):**
- `UPDATE_RATIO` - Change ratio for all users
- `UPDATE_RATIO_TYPE` - Change ratio type
- `UPDATE_MAILSCAN_PTRS` - Reset mail scan pointers
- `UPDATE_LAST_MESSAGE` - Reset last message read
- `UPDATE_NEW_MAIL_SCAN` - Enable/disable new mail scan
- `UPDATE_NEW_FILE_SCAN` - Enable/disable new file scan
- `UPDATE_DEFAULT_ZOOM_FLAG` - Set zoom mail default
- `UPDATE_MESSAGES_POSTED` - Reset message counter
- `UPDATE_RESET_VOTING` - Clear voting flags

---

### `{ConfDir}/Conf{N}.Stats` (Conference Statistics Export)
**Location:** Line 22530

**Structure:** Text file, CSV-like format

**Purpose:** Dump of all user statistics for sysop analysis

**Path:**
```e
StringF(confStatFile,'\sConf\d.Stats',cmds.bbsLoc,confnum)
```

**Generated By:** Line 22797 `dumpUserStats(conf,msgBase)`

---

## 4. Message Base Files

### `{MsgBaseLoc}/{msgnum}` (Message Body File)
**Location:** Lines 9718-9770, 10694-10715, 11144-11148, 11853-11898

**Structure:** Binary message body

**Format:**
- Line 1: Message text (variable length)
- Additional lines: Message body text
- End marker: (implementation specific)

**Path Construction:**
```e
StringF(tempStr,'\s\d',msgBaseLocation,mailHeader.msgNumb)
```

**Operations:**
- **Read:** Lines 9718-9770 (display message)
- **Write:** Lines 10694-10715 (save new message)
- **Delete:** Lines 11932-11940 (delete message body)
- **Move:** Lines 11853-11898 (move between conferences)

---

### `{MsgBaseLoc}/F{msgnum}` (File Attachments Directory)
**Location:** Lines 9618-9669, 10722-10744

**Structure:** Directory containing attached files

**Path Construction:**
```e
StringF(str,'\sF\d',msgBaseLocation,num)
```

**Contents:**
- Individual files attached to message
- Each file stored with original filename
- Line 9625: `StringF(image,'\sF\d/\s',msgBaseLocation,num,fBlock.filename)`

**Operations:**
- **Check:** Lines 9618-9640 (check if attachments exist)
- **Download:** Lines 9669-9692 (download attached files)
- **Create:** Lines 10722-10744 (save attachments on send)

---

### `{MsgBaseLoc}/A{msgnum}` (Attachment Index File)
**Location:** Lines 9640-9669, 9692-9718, 10708-10715

**Structure:** Binary attachment metadata

**Path Construction:**
```e
StringF(image,'\sA\d',msgBaseLocation,num)
```

**Purpose:** Stores attachment filenames and metadata for message

---

### `{MsgBaseLoc}/HeaderFile` (Message Header File)
**Location:** Lines 11865-11873, 12444-12450, 26398, 26609

**Structure:** Binary array of message headers

**Record Structure:**
```
OBJECT mailHeader (110 bytes per record)
  status: CHAR                - Message status flags
  msgNumb: LONG               - Message number
  toName[31]: ARRAY OF CHAR   - Recipient name
  fromName[31]: ARRAY OF CHAR - Sender name
  subject[31]: ARRAY OF CHAR  - Message subject
  msgDate: LONG               - Message date/time
  recv: LONG                  - Received date/time
  extMsgNum: INT              - External message number
ENDOBJECT
```

**Path Construction:**
```e
StringF(filename,'\s\s',msgBaseLocation,'HeaderFile')
```

**Operations:**
- **Scan:** Lines 11665-11790 (search for new mail)
- **Read:** Lines 12444-12477 (mail scan function)

---

### `{MsgBaseLoc}/MailStats` (Message Base Statistics)
**Location:** Lines 8672-8701, 11789-11828, 11926-11940

**Structure:** Binary statistics record

**Record Structure:**
```
OBJECT mailStat (18 bytes)
  lowestKey : LONG       - Lowest message key
  highMsgNum : LONG      - Highest message number
  lowestNotDel : LONG    - Lowest non-deleted message
  pad[6]:ARRAY OF CHAR   - Padding
ENDOBJECT
```

**Path Construction:**
```e
StringF(string,'\s\s',msgBaseLocation,'MailStats')
```

**Operations:**
- **Load:** Lines 8672-8701 `getMailStatFile(confNum,msgBaseNum)`
- **Update:** Lines 10603-10639 (increment on message save)
- **Failure Handling:** Line 8683 `myError(ERR_MSGBASE)`

**Critical:** This file tracks message numbering. If missing/corrupt, message base is broken.

---

### `{MsgBaseLoc}/MailLock` (Message Base Lock File)
**Location:** Lines 11944-11963

**Structure:** Lock file (empty or minimal content)

**Purpose:** Prevent concurrent writes to message base

**Path Construction:**
```e
StringF(tempstr,'\sMailLock',msgBaseLocation)
```

**Lock Mechanism:**
```e
PROC lockMsgBase()
  lock:=Lock(tempstr,EXCLUSIVE_LOCK)
  IF lock=0
    aePuts('Can''t Lock MsgBase, Message not Deleted!\b\n')
  ENDIF
ENDPROC lock
```

**Usage:**
- Lines 10652-10744 (message save)
- Lines 11925-11940 (message delete)

---

### `{MsgBaseLoc}/{msgnum}.msg` (External Message Storage)
**Location:** Lines 10656-10687

**Structure:** Text file for external message processors

**Purpose:** Used when `EXTSEND.{msgBaseNum}` tooltype is set

**Format:**
- Line 1: Message header info
- Line 2+: Message body

**Path Construction:**
```e
StringF(tempStr2,'\s/\d.msg',tempStr,i)
```

**Condition:** Only created if conference has external message processor configured

---

## 5. Voting System Files

### `{ConfDir}/Vote/VoteLock` (Vote Lock File)
**Location:** Lines 20577-20580, 20991-20994

**Structure:** Empty lock file

**Purpose:** Prevent concurrent vote modifications

**Path:**
```e
StringF(votefile,'\sVote/VoteLock',currentConfDir)
```

**Created:** Lines 20577-20580 (if doesn't exist on topic create)

---

### `{ConfDir}/Vote/Vote{NN}.def` (Vote Topic Definition)
**Location:** Lines 20545-20590, 20648-20656, 20697-20723, 20795-20820, 21029-21035

**Structure:** Text file, string list format

**Format:**
```
Line 1: Topic title
Line 2: Topic description
Line 3+: Additional topic info
```

**Path Construction:**
```e
StringF(votefile,'\sVote/Vote\r\z\d[2].def',currentConfDir,topicNum)
```
Note: `\r\z\d[2]` = zero-padded 2-digit topic number (01, 02, 03, etc.)

**Operations:**
- **Check Exists:** Line 20546 `IF fileExists(votefile)`
- **Create:** Lines 20590-20602 `saveMsg(votefile)`
- **Delete:** Lines 20656 `DeleteFile(votefile)`
- **Edit:** Lines 20718-20723

---

### `{ConfDir}/Vote/Vote{NN}.{QQ}.qst` (Vote Question)
**Location:** Lines 20613-20625, 20660-20671, 20730-20750, 20853-20898, 20926-20987

**Structure:** Text file, string list format

**Format:**
```
Line 1: Question text
Line 2+: Additional question info
```

**Path Construction:**
```e
StringF(votefile,'\sVote/Vote\r\z\d[2].\r\z\d[2].qst',currentConfDir,topicNum,questNum)
```

**NN:** Topic number (zero-padded 2 digits)
**QQ:** Question number (zero-padded 2 digits)

---

### `{ConfDir}/Vote/Vote{NN}.{QQ}.cnt` (Question Vote Count)
**Location:** Lines 20663-20664, 20862-20873, 20935-20975

**Structure:** Binary counter file

**Purpose:** Stores total votes for this question

**Path Construction:**
```e
StringF(votefile,'\sVote/Vote\r\z\d[2].\r\z\d[2].cnt',currentConfDir,topicNum,questNum)
```

---

### `{ConfDir}/Vote/Vote{NN}.{QQ}.{A}.cnt` (Answer Vote Count)
**Location:** Lines 20670-20671, 20873-20877, 20975-20979

**Structure:** Binary counter file

**Purpose:** Stores vote count for specific answer

**Path Construction:**
```e
StringF(votefile,'\sVote/Vote\r\z\d[2].\r\z\d[2].\c.cnt',currentConfDir,topicNum,questNum,ans)
```

**A:** Answer character (a, b, c, d, etc.)

---

### `{ConfDir}/Vote/Vote{NN}.{QQ}.{A}` (Answer Text)
**Location:** Lines 20624-20625, 20667-20671

**Structure:** Text file, string list format

**Format:**
```
Line 1: Answer text
Line 2+: Additional answer info
```

**Path Construction:**
```e
StringF(votefile,'\sVote/Vote\r\z\d[2].\z\d[2].\c',currentConfDir,topicNum,questNum,ans)
```

**Operations:**
- **Save:** Line 20625 `saveMsg(votefile)`
- **Delete:** Lines 20668-20671

---

## 6. Statistics & Logs

### `BBS:SystemStats` (System Statistics File)
**Location:** Lines 2857-2862

**Structure:** Binary statistics record

**Purpose:** Global BBS statistics (calls, uploads, downloads, etc.)

**Path:**
```e
StringF(tempStr,'\sSystemStats',cmds.bbsLoc)
```

**Operations:**
- **Load:** Line 2857
- **Save:** Line 2862

---

### `BBS:SysopStats/NumULs_{N}` (Sysop Upload Statistics)
**Location:** Lines 18718-18746, 18772-18797

**Structure:** Binary statistics per conference

**Purpose:** Track number of uploads per conference for sysop stats

**Path Construction:**
```e
StringF(str,'\sSysopStats/NumULs_\d',cmds.bbsLoc,currentConf)
```

**Used By:**
- Line 18746 `displaySysopULStats()` - Display stats
- Line 18772 `sysopULStats(holdflag)` - Update stats

---

## 7. Bulletin Files

### `{ConfDir}/Bulletins/Bull{N}` (Conference Bulletin)
**Location:** Lines 24613-24652

**Structure:** Text file (ANSI/ASCII)

**Numbering:** 1-based (Bull1, Bull2, Bull3, etc.)

**Path Construction:**
```e
StringF(str,'\sBulletins/Bull\d',confScreenDir,stat)
```

**Related Files:**
- `{ConfDir}/Bulletins/BullHelp.txt` - Bulletin help text
- `{ConfDir}/Bulletins/BullHelp` - Bulletin help screen (ANSI)

**Display:** Lines 24634-24652

---

## 8. File Area Files

**Note:** File area structures are referenced but not fully detailed in express.e. Based on grep results:

### `.dircache` (Directory Cache File)
**Location:** Line 22663

**Structure:** Cached directory listing

**Purpose:** Speed up file area listings

**Detection:**
```e
IF (StrCmp('.dircache',f_info.filename)=FALSE)
```

**Note:** Skipped during directory scans

---

### File Metadata (Implementation Specific)
The following patterns appear but exact format requires deeper analysis:
- File descriptions
- Upload metadata
- Download counters
- File area indexes

---

## 9. System Configuration Files

### `BBS:DRIVES.info` (Drive Configuration)
**Location:** Line 17421

**Structure:** Workbench .info file (icon)

**Purpose:** Configure available drives/volumes

**Error Message:**
```e
StringF(tempstr,'\b\nThe file \sDRIVES.info is missing!!!\b\n\b\n',cmds.bbsLoc)
```

**Critical:** Required for file area access

---

### Configuration Tooltypes (.info files)
Referenced throughout express.e via tooltypes.e module:

**Node Tooltypes:**
- `CONF_DB` - Conference database filename override
- `CONFDB_SHARED` - Share conference DB across message bases
- `SHOW_CACHE_STATS` - Display cache statistics
- `EXTSEND.{N}` - External message send program
- And many more...

**Tooltype Functions:**
- `readToolType(type,num,name,output)` - Read tooltype value
- `readToolTypeInt(type,num,name)` - Read integer tooltype
- `checkToolTypeExists(type,num,name)` - Check if tooltype exists

---

## 10. Door/External Program Files

### Process Output Capture Files
**Location:** Lines 3308-3319

**Structure:** Temporary text files

**Purpose:** Capture door program output

**Variables:**
```e
DEF processOutFile[255]:STRING
doorTrapFH:=Open(processOutFile,MODE_NEWFILE)
```

**Note:** Path determined at runtime, typically in RAM: or T:

---

## File Path Helpers

### Key Variables (express.e lines 96-113)

```e
DEF nodeScreenDir[255]:STRING      - Node screen directory
DEF confScreenDir[255]:STRING      - Conference screen directory
DEF nodeWorkDir[255]:STRING        - Node working directory
DEF currentConfName[255]:STRING    - Current conference name
DEF currentConfDir[255]:STRING     - Current conference directory
DEF msgBaseLocation[255]:STRING    - Message base location
DEF userDataFile[255]:STRING       - Path to user.data
DEF userKeysFile[255]:STRING       - Path to user.keys
DEF userMiscFile[255]:STRING       - Path to user.misc
```

### Path Construction Functions

```e
getConfLocation(confNum,outString) - Get conference directory
getMsgBaseLocation(confNum,msgBaseNum,outString) - Get message base dir
getMsgBaseName(confNum,msgBaseNum,outString) - Get message base name
getConfDbFileName(confNum,msgBaseNum,outString) - Get Conf.DB path
```

---

## Critical Implementation Notes

### File Locking
1. **MailLock** - Lines 11944-11963
   - Exclusive lock for message base writes
   - Must be acquired before saving/deleting messages
   - Prevents concurrent corruption

2. **VoteLock** - Lines 20577-20580
   - Lock file for vote system
   - Created on first vote topic creation

### Binary File Formats

All binary files use **Amiga big-endian** format:
- `INT` = 16-bit signed integer (big-endian)
- `LONG` = 32-bit signed integer (big-endian)
- `CHAR` = 8-bit character/byte
- Arrays are fixed-size, null-terminated for strings

### BCD (Binary Coded Decimal) Fields

Several byte count fields use BCD format:
- `downloadBytesBCD[8]` in userMisc
- `uploadBytesBCD[8]` in userMisc
- `downloadBytesBCD[8]` in confBase
- `uploadBytesBCD[8]` in confBase

**BCD Format:** Each byte represents 2 decimal digits (0-99)
- Example: `[0x12, 0x34, 0x56, 0x78, 0x90, 0x12, 0x34, 0x56]` = 1234567890123456 bytes

### Error Handling

**Error Types (errors.e):**
- `ERR_MSGBASE` - Message base file error (lines 8522, 8683, 8701, 11790, 11798, 11812, 11870, 12393, 12402, 12450)

**Error Handler:**
```e
myError(ERR_MSGBASE)
```

Displays error to user and logs to callerslog

---

## Implementation Checklist for 1:1 Port

### User System
- [ ] user.data - Read/write user records
- [ ] user.keys - Username index lookup
- [ ] user.misc - Extended user data
- [ ] SHA-256 password hashing (userMisc.pwdHash)
- [ ] Account locking (userMisc.accountLocked)
- [ ] Slot number management

### Node System
- [ ] node.user - Active session user copy
- [ ] node.userkeys - Active session keys copy
- [ ] CallersLog - Session event logging
- [ ] CallerIDlog - Caller ID tracking
- [ ] ram:logoff{N}.log - Temporary logoff stats

### Conference System
- [ ] Conf.DB - Per-user conference accounting
- [ ] Shared vs per-msgbase Conf.DB support
- [ ] Conference statistics export
- [ ] Update all users functionality

### Message System
- [ ] Message body files ({msgnum})
- [ ] HeaderFile - Message header array
- [ ] MailStats - Message base statistics
- [ ] MailLock - Concurrent write protection
- [ ] File attachments (F{msgnum} directory)
- [ ] Attachment index (A{msgnum})
- [ ] External message export (.msg files)

### Voting System
- [ ] VoteLock - Lock file
- [ ] Vote{NN}.def - Topic definitions
- [ ] Vote{NN}.{QQ}.qst - Questions
- [ ] Vote{NN}.{QQ}.cnt - Question vote counts
- [ ] Vote{NN}.{QQ}.{A} - Answer text
- [ ] Vote{NN}.{QQ}.{A}.cnt - Answer vote counts
- [ ] Voting handle tracking (confBase.handle[16])

### Statistics
- [ ] SystemStats - Global statistics
- [ ] SysopStats/NumULs_{N} - Upload stats per conf
- [ ] Conf{N}.Stats - Conference stat dumps

### Bulletins
- [ ] Bull{N} - Bulletin files
- [ ] BullHelp.txt / BullHelp - Help files

### File Areas
- [ ] .dircache - Directory caching
- [ ] File metadata storage
- [ ] Upload/download tracking

### Configuration
- [ ] DRIVES.info - Drive configuration
- [ ] Tooltype reading (.info files)

### Door Support
- [ ] Process output capture
- [ ] Door communication files

---

## File Compatibility Matrix

| File Type | Binary/Text | Endian | Record Size | Index Required | Lock Required |
|-----------|-------------|--------|-------------|----------------|---------------|
| user.data | Binary | Big | 68 bytes | Yes (user.keys) | No |
| user.keys | Binary | Big | 24 bytes | No | No |
| user.misc | Binary | Big | 256 bytes | No | No |
| node.user | Binary | Big | 68 bytes | No | No |
| node.userkeys | Binary | Big | 24 bytes | No | No |
| Conf.DB | Binary | Big | 80 bytes | No | No |
| HeaderFile | Binary | Big | 110 bytes | No | No |
| MailStats | Binary | Big | 18 bytes | No | No |
| {msgnum} | Text/Binary | N/A | Variable | Yes (HeaderFile) | Yes (MailLock) |
| CallersLog | Text | N/A | Variable | No | No |
| CallerIDlog | Text | N/A | Variable | No | No |
| Vote*.def | Text | N/A | Variable | No | Yes (VoteLock) |
| Vote*.qst | Text | N/A | Variable | No | Yes (VoteLock) |
| Vote*.cnt | Binary | Big | 4 bytes | No | Yes (VoteLock) |
| SystemStats | Binary | Big | Variable | No | No |
| Bull{N} | Text (ANSI) | N/A | Variable | No | No |

---

## References

**Source Files:**
- `~/Code/Reference/AmiExpress-Sources/express.e` - Main program
- `~/Code/Reference/AmiExpress-Sources/axobjects.e` - Data structures
- `~/Code/Reference/AmiExpress-Sources/tooltypes.e` - Configuration system

**Line References:**
All line numbers refer to express.e unless otherwise noted.

---

**Document Version:** 1.0
**Date:** 2025-11-01
**Analysis Source:** AmiExpress 5 E sources (express.e, axobjects.e)
