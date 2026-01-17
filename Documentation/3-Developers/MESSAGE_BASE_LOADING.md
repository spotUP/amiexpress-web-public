# Message Base Loading - Disk-Based Configuration

## Critical Rule: DISK-BASED, NOT DATABASE

Message bases are configured via **disk files**, not the database (CLAUDE.md rule #10).

**Database is ONLY for:**
- Users
- Messages
- Call logs
- Statistics

**Configuration comes from DISK:**
- Conferences: ConfConfig.info
- Message bases: {ConfLocation}/MsgBases.info
- File areas: Conf{N}.info (NDIRS, DLPATH.n, ULPATH.n)
- Doors: doors/*.info
- Commands: Commands/*.info

## How AmiExpress Loads Message Bases

Based on express.e sources (lines 2048-2112):

### 1. Message Base Configuration File

**Location:** `{ConfLocation}/MsgBases.info` (plural, not MsgBase.info)

**Example:** If Conf1 is at `AmiExpress:Conf1/`, config is at `AmiExpress:Conf1/MsgBases.info`

### 2. Default Behavior (No MsgBases.info)

**If MsgBases.info doesn't exist:**
- Conference has **1 message base** (default)
- Message base name is empty string
- Message base location is `{ConfLocation}/MsgBase/`
- Conf.DB is at `{ConfLocation}/Conf.DB`

**This is the most common setup** - single message base per conference.

### 3. Multi-Message-Base Configuration

**Example MsgBases.info with 3 message bases:**

```
NMSGBASES=3
NAME.1=General Discussion
LOCATION.1=MsgBase/
NAME.2=Technical Support
LOCATION.2=TechSupport/
NAME.3=Shared Conference
LOCATION.3=Work:SharedConf/MsgBase/
REALNAME.1
INTERNETNAME.2
EXTSEND.3
```

**Tooltypes:**
- `NMSGBASES` - Number of message bases in this conference
- `NAME.n` - Name of message base n
- `LOCATION.n` - Location of message base n (relative or absolute with `:`)
- `REALNAME.n` - Use real names in message base n (flag, no value)
- `INTERNETNAME.n` - Use internet names in message base n (flag, no value)
- `EXTSEND.n` - Enable external send in message base n (flag, no value)

### 4. Express.e Functions

**getConfMsgBaseCount(confNum)** - express.e:2048-2052
- Reads `NMSGBASES` from MsgBases.info
- Returns 1 if file doesn't exist or value is -1
- **Never returns 0** - every conference has at least 1 message base

**getMsgBaseName(confNum, msgBaseNum)** - express.e:2054-2059
- Reads `NAME.n` from MsgBases.info
- Returns empty string if not found

**getMsgBaseLocation(confNum, msgBaseNum)** - express.e:2061-2082
- Reads `LOCATION.n` from MsgBases.info
- If location contains `:` (volume name), treats as absolute path
- Otherwise treats as relative to conference location
- **Defaults to `{ConfLocation}/MsgBase/`** if not found

**getConfDbFileName(confNum, msgBaseNum)** - express.e:2102-2112
- If conference has >1 message base: `Conf.DB` is in message base location
- If conference has 1 message base: `Conf.DB` is in conference root
- This allows per-message-base user message pointers

## TypeScript Implementation

### MessageBaseLoaderService

**Location:** `web/backend/src/services/message-base-loader.service.ts`

**Methods:**
- `getConfMsgBaseCount(confLocation)` - Get message base count (default 1)
- `getMsgBaseName(confLocation, msgBaseNum)` - Get message base name
- `getMsgBaseLocation(confLocation, msgBaseNum, msgBaseCount)` - Get message base location
- `getMsgBaseFlags(confLocation, msgBaseNum)` - Get REALNAME/INTERNETNAME/EXTSEND flags
- `loadMessageBasesForConference(confId, confLocation)` - Load all bases for one conference
- `loadAllMessageBases(conferences)` - Load all bases for all conferences

### Usage in initialization.ts

```typescript
// Load message bases from disk (CRITICAL: Disk-based, not database)
const { MessageBaseLoaderService } = await import('../services/message-base-loader.service.js');
const messageBaseLoader = new MessageBaseLoaderService(bbsRoot);
messageBases = messageBaseLoader.loadAllMessageBases(conferences);
```

### MessageBase Interface

```typescript
interface MessageBase {
  id: number;              // Sequential ID for TypeScript code
  conferenceId: number;    // Conference this message base belongs to
  name: string;            // Message base name (from NAME.n)
  location: string;        // Full path to message base directory
  useRealName?: boolean;   // REALNAME.n flag
  useInternetName?: boolean; // INTERNETNAME.n flag
  extSend?: boolean;       // EXTSEND.n flag
}
```

## Common Setups

### Single Message Base (Default)

**No MsgBases.info needed:**
```
Conf1/
  MsgBase/          <- Default message base location
  Conf.DB           <- User message pointers
  Bulletins/
  Files/
  Upload/
  ...
```

**Behavior:**
- 1 message base per conference
- No message base name (empty string)
- Location: `{ConfLocation}/MsgBase/`

### Multiple Message Bases

**Requires MsgBases.info:**
```
Conf1/
  MsgBases.info     <- Configuration file
  MsgBase/          <- Message base 1
    Conf.DB         <- Per-base message pointers
  TechSupport/      <- Message base 2
    Conf.DB
  OffTopic/         <- Message base 3
    Conf.DB
  Bulletins/
  Files/
  ...
```

**MsgBases.info:**
```
NMSGBASES=3
NAME.1=General Discussion
LOCATION.1=MsgBase/
NAME.2=Technical Support
LOCATION.2=TechSupport/
NAME.3=Off-Topic
LOCATION.3=OffTopic/
```

### Shared Message Base

**Cross-conference message sharing:**
```
NMSGBASES=2
NAME.1=Local Discussion
LOCATION.1=MsgBase/
NAME.2=Shared Network
LOCATION.2=Work:NetConf/MsgBase/
```

**Behavior:**
- Message base 2 points to external location
- Multiple conferences can share the same message base
- Each conference has its own `Conf.DB` for user pointers

## History: Why We Had Database Message Bases

**Previous bug (fixed 2026-01-17):**
- Message bases were loaded from database via `db.getMessageBases(conf.id)`
- Violated CLAUDE.md rule #10 (disk-based config)
- Caused conferences 4-14 to have no message bases (database was empty)
- Users saw "Message Base Number (1-0): 1" - trying to select from 0 bases

**Root cause:**
- Database was used for configuration instead of disk
- When ConfConfig.info had 14 conferences but database only had 3, conferences 4-14 broke
- Express.e never has this issue because it ALWAYS reads from disk

**Fix:**
- Created `MessageBaseLoaderService` to read from disk
- Updated `initialization.ts` to use disk-based loading
- Removed database-based message base loading entirely
- Now follows express.e pattern exactly

## Testing

**Verify message bases are loaded from disk:**

```bash
# Start servers
./dev/scripts/start-servers.sh

# Check logs for:
# [MessageBaseLoader] Loaded N message bases from disk
```

**Test conference join:**

```bash
# All conferences should work now
j 1    # Should work
j 4    # Should work (was broken before)
j 14   # Should work (was broken before)
```

**Expected behavior:**
- Conferences 1-14 each have 1 message base (default)
- No "Message Base Number (1-0)" errors
- All conferences joinable

## Future: Adding Multiple Message Bases

To add multiple message bases to a conference:

1. Create `MsgBases.info` in conference directory
2. Set `NMSGBASES=N`
3. Add `NAME.n` and `LOCATION.n` for each base
4. Create directories for each message base location
5. Restart server to reload from disk

**Example:**

```bash
# Create MsgBases.info for Conf1
cat > Conf1/MsgBases.info <<EOF
NMSGBASES=2
NAME.1=General
LOCATION.1=MsgBase/
NAME.2=Technical
LOCATION.2=Tech/
EOF

# Create directories
mkdir -p Conf1/Tech

# Restart server
./dev/scripts/kill-servers.sh
./dev/scripts/start-servers.sh
```

## References

- **Express.e sources:** Lines 2048-2112 (message base functions)
- **Express.e sources:** Lines 31791+ (ConfConfig.info reading)
- **Express.e sources:** tooltypes.e lines 51-55 (TOOLTYPE_MSGBASE)
- **CLAUDE.md:** Rule #10 (Disk-Based Configuration)
