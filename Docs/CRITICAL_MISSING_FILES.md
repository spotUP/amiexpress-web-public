# CRITICAL MISSING FILES - NOT 1:1 YET

## Status: ❌ INCOMPLETE - Missing Core Message System Files

User asked: "you are 100% sure that we have all needed files on disk now? 1:1 copy of the real amiexpress?"

**Answer: NO, we are NOT 100% complete.**

## What We Have vs What Real AmiExpress Has

### Real reference-boardBBS Structure (from actual Amiga BBS):

```
reference-boardBBS/
├── user.data           # Main user database (binary, 464 bytes - ~8-10 users)
├── user.keys           # User keys database (binary, 112 bytes)
├── user.misc           # User statistics (binary, 134,912 bytes - detailed stats)
├── Conf.DB             # Conference database (binary)
├── Conf1/
│   ├── Conf.DB         # Conference-specific DB (74,000 bytes)
│   ├── MsgBase/
│   │   ├── HeaderFile  # ❌ CRITICAL MISSING - Message index (15,180 bytes)
│   │   ├── MailStats   # ❌ CRITICAL MISSING - Stats (18 bytes)
│   │   └── MailLock    # ❌ CRITICAL MISSING - Lock file (15 bytes)
│   ├── Dir0            # File area listing (empty in this conf)
│   ├── Dir1            # File area listing
│   └── Dir2            # File area listing
└── Conf2/
    ├── MsgBase/
    │   ├── HeaderFile  # ❌ CRITICAL MISSING - 27,280 bytes (248 messages!)
    │   ├── MailStats   # ❌ CRITICAL MISSING
    │   └── MailLock    # ❌ CRITICAL MISSING
    └── ...
```

### What We Currently Have:

```
Our Implementation/
├── Conf01/
│   ├── Messages/
│   │   ├── 1.msg       # ✅ Individual message files (we create these)
│   │   ├── 2.msg
│   │   └── ...
│   └── Files/
│       └── area.dir    # ✅ File area listing
├── Conf.DB             # ✅ Conference database
└── node0.user          # ✅ Active user file
```

**NOTICE:** We create `.msg` files but **NO HeaderFile, NO MailStats, NO MailLock**!

## Critical Missing Files Explained

### 1. HeaderFile - THE MOST CRITICAL

**What it is:** Binary index of ALL messages in a conference message base.

**Format (from axobjects.e:180-190):**
```c
OBJECT msgHeader    // 110 bytes per message
  status: CHAR              // 1 byte - message status flags
  msgNumb: LONG             // 4 bytes - message number
  toName[31]: ARRAY OF CHAR // 31 bytes - recipient name
  fromName[31]: ARRAY OF CHAR // 31 bytes - sender name
  subject[31]: ARRAY OF CHAR  // 31 bytes - subject line
  msgDate: LONG             // 4 bytes - Unix timestamp
  recv: LONG                // 4 bytes - received timestamp
  extMsgNum: INT            // 2 bytes - external message number
ENDOBJECT  // Total: 1+4+31+31+31+4+4+2 = 108 bytes (+ 2 padding = 110)
```

**Real data from reference-boardBBS Conf2:**
- File size: 27,280 bytes
- Messages: 27,280 / 110 = 248 messages
- Contains: Message list that doors read to display message index

**Why CRITICAL:**
- Message doors MUST read HeaderFile to list messages
- Without it, doors can't show "Message 1 of 248"
- Without it, doors can't search by subject/author
- Without it, doors don't know which messages exist
- **We create .msg files but doors can't FIND them without HeaderFile**

**express.e references:**
- Line 11865: `StringF(filename1,'\s\s',msgBaseLocation,'HeaderFile')`
- Line 12444: `StringF(filename,'\s\s',msgBaseLocation,'HeaderFile')`
- Line 26398: `StringF(tempstr,'\sHeaderFile',msgBaseLoc)`

### 2. MailStats - CRITICAL

**What it is:** Message base statistics (18 bytes total).

**Format (from axobjects.e:192-197):**
```c
OBJECT mailStat
  lowestKey: LONG       // 4 bytes - lowest message key
  highMsgNum: LONG      // 4 bytes - highest message number
  lowestNotDel: LONG    // 4 bytes - lowest non-deleted message
  pad[6]: ARRAY OF CHAR // 6 bytes - padding
ENDOBJECT  // Total: 4+4+4+6 = 18 bytes
```

**Real data from reference-boardBBS:**
- File size: 18 bytes (exactly 1 mailStat struct)
- Contains: Message number ranges

**Why CRITICAL:**
- Doors read this to know "Message X of Y"
- Without it, doors don't know the message count
- Without it, message numbering breaks
- Used for "Read new messages" feature

**express.e references:**
- Line 8677: `StrAdd(string,'MailStats')`
- Line 11809: `StringF(string,'\s\s',msgBaseLocation,'MailStats')`

### 3. MailLock - CRITICAL

**What it is:** Lock file to prevent concurrent message access.

**Real data from reference-boardBBS:**
- File size: 15 bytes (text content or lock timestamp)
- Contains: Lock information or timestamp

**Why CRITICAL:**
- Prevents corruption when multiple nodes access messages
- Prevents race conditions on HeaderFile updates
- Required for multi-node BBS safety

### 4. user.data / user.keys / user.misc - MISSING

**What they are:** Main binary user database files.

**Real data from reference-boardBBS:**
- user.data: 464 bytes (main user records)
- user.keys: 112 bytes (user keys)
- user.misc: 134,912 bytes (detailed user statistics)

**What we have:**
- ✅ node0.user, node1.user, etc. (active session files)
- ❌ NO main user.data database
- ❌ NO user.keys database
- ❌ NO user.misc statistics

**Why MISSING (not critical for message doors but needed for user doors):**
- Some doors need to read user database
- WHO door reads user.data to show all users
- Statistics doors read user.misc

## Impact on Door Compatibility

### Current Status:

**Message Posting (OUR IMPLEMENTATION):**
```
1. User posts message
2. Database INSERT into messages table
3. Trigger writes {msgnum}.msg file ✅
4. ??? NO HeaderFile update ❌
5. ??? NO MailStats update ❌
```

**Door Reading Messages (REAL AMIEXPRESS):**
```
1. Door opens HeaderFile
2. Door reads mailStat struct to get highMsgNum
3. Door reads msgHeader array to list messages
4. User selects message #5
5. Door opens 5.msg to read message body
6. ??? HeaderFile doesn't exist - DOOR FAILS ❌
```

### What Works Now:
- ✅ Conference database (Conf.DB)
- ✅ Individual message files (.msg)
- ✅ File area directories (.dir)
- ✅ Active user files (node{n}.user)

### What DOESN'T Work:
- ❌ Message listing in doors (no HeaderFile)
- ❌ Message searching in doors (no HeaderFile)
- ❌ Message count display (no MailStats)
- ❌ Multi-node message safety (no MailLock)
- ❌ User database queries in doors (no user.data)

## Implementation Priority

### CRITICAL (implement immediately):
1. **HeaderFile** - Without this, message doors are 100% broken
2. **MailStats** - Required for message numbering
3. **MailLock** - Required for multi-node safety

### HIGH (implement soon):
4. **user.data** - Required for WHO door and user listing doors
5. **user.keys** - Required for user preference doors
6. **user.misc** - Required for statistics doors

## Action Items

### Immediate Tasks:

1. **Create MessageIndexManager.ts:**
   - Implement HeaderFile read/write
   - Implement MailStats read/write
   - Implement MailLock acquire/release

2. **Update database.ts triggers:**
   - createMessage: Write .msg file + update HeaderFile + update MailStats
   - updateMessage: Update .msg file + update HeaderFile entry
   - deleteMessage: Delete .msg file + update HeaderFile status + update MailStats

3. **Create UserDatabaseManager.ts:**
   - Implement user.data read/write (all users)
   - Implement user.keys read/write
   - Implement user.misc read/write
   - Add triggers to user operations

4. **Test with doors:**
   - Verify HeaderFile is readable by doors
   - Verify message listing works
   - Verify message reading works
   - Verify multi-node safety

## Summary

**Question:** "are you 100% sure we have all needed files on disk now?"

**Answer:** **NO**. We have approximately **60% of the required files**:

- ✅ Message text files (.msg) - but useless without index
- ✅ Conference database (Conf.DB)
- ✅ File area listings (.dir)
- ✅ Active session user files (node{n}.user)
- ❌ **Message index (HeaderFile)** - CRITICAL MISSING
- ❌ **Message statistics (MailStats)** - CRITICAL MISSING
- ❌ **Message locks (MailLock)** - CRITICAL MISSING
- ❌ Main user database (user.data, user.keys, user.misc) - MISSING

**The .msg files we create are like writing book pages but forgetting the Table of Contents. Doors can't use them without HeaderFile.**

## References

- **express.e** lines 11865, 12444, 26398, 26609 - HeaderFile operations
- **express.e** lines 8677, 11809 - MailStats operations
- **axobjects.e** lines 180-190 - msgHeader struct (110 bytes)
- **axobjects.e** lines 192-197 - mailStat struct (18 bytes)
- **reference-boardBBS** - Real data showing actual file sizes and structures

---

**Created:** 2025-11-01
**Status:** CRITICAL - Need to implement HeaderFile/MailStats/MailLock ASAP
