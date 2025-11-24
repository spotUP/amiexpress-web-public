# AmiExpress Configuration System Analysis

**Date:** 2025-11-12
**Purpose:** Complete analysis of original AmiExpress configuration system for web-based config app implementation
**Status:** Phase 1 Analysis Complete

---

## Executive Summary

The original AmiExpress BBS uses **Amiga ToolTypes** stored in .info files for all configuration, NOT a MUI graphical application embedded in the BBS code. The "MUI configuration app" referenced would be a separate external tool (like AmiExpress Setup) that edits these .info files with a graphical interface.

**Our Goal:** Create a web-based React configuration application that provides the same functionality as editing .info files, but through a modern web interface that stores configuration in our TypeScript BBS database.

---

## Configuration Architecture

### Original Amiga System

**Storage Format:**
- **File Type:** Amiga .info files (Icon Information files)
- **Content:** Binary files containing icon graphics + ToolTypes (key=value strings)
- **Location:** Same directory as the configured program/directory
- **Editing:** Via Workbench Icon Information window or external config tools

**ToolType Format:**
```
SETTING_NAME=value
BOOLEAN_FLAG
NUMBERED.1=value1
NUMBERED.2=value2
```

### TypeScript Port Equivalent

**Current Implementation:**
- **Storage:** SQLite database tables
- **Format:** JSON/relational data
- **Location:** `backend/data/bbs.db`
- **Editing:** Currently no admin interface (uses database directly)

**Required:** Web-based configuration app to replace .info file editing

---

## Configuration Categories

### 1. BBS Global Configuration (BBS.info)

**ToolType Constant:** `TOOLTYPE_BBSCONFIG`
**File:** `BBS.info` in BBS root directory
**Purpose:** System-wide BBS settings

#### Security & Authentication Settings

| ToolType | Type | Purpose | Values/Range |
|----------|------|---------|--------------|
| `MIN_PASSWORD_LENGTH` | Integer | Minimum password length | 0-32 (0=disabled) |
| `MIN_PASSWORD_STRENGTH` | Integer | Password complexity requirement | 0-4 (0=none, 4=all types required) |
| `MAX_PASSWORD_FAILS` | Integer | Failed login attempts before lockout | -1=unlimited, 0+=count |
| `PASSWORD_SECURITY` | Enum | Password hashing algorithm | LEGACY, PBKDF2_5, PBKDF2_50, PBKDF2_100, PBKDF2_1000, PBKDF2_10000 |
| `STRICT_PASSWORD_POLICY` | Boolean | Force password strength on login | Present=enabled |

**Password Strength Levels:**
- 0: No requirements
- 1: One character type (lowercase, uppercase, number, or symbol)
- 2: Two character types
- 3: Three character types
- 4: All four character types

#### Language & Translation Settings

| ToolType | Type | Purpose | Values/Range |
|----------|------|---------|--------------|
| `LANGUAGE_BASE` | Path | Base directory for translation files | Full or relative path |

#### System Settings (Inferred from code)

| ToolType | Type | Purpose | Notes |
|----------|------|---------|-------|
| `BBS_NAME` | String | BBS name | From user table/system config |
| `SYSOP_NAME` | String | Sysop name | From user table |
| `LOCATION` | String | BBS location | Geographic location |
| `PHONE` | String | BBS phone number | If dialup supported |

---

### 2. Node Configuration (Node[1-8].info)

**ToolType Constant:** `TOOLTYPE_NODE`
**Files:** `Node1.info`, `Node2.info`, etc.
**Purpose:** Per-node settings (multi-line support)

#### Node Settings from Node2.info

| ToolType | Type | Purpose | Example Value |
|----------|------|---------|---------------|
| `NODESTART` | Path | Startup location/command | `BBS:EXPRESS` |
| `CAPITOL_FILES` | Boolean | Capitalize filenames | Present=enabled |
| `SYSOP_CHAT_COLOR` | Integer | ANSI color for sysop chat | `33` (yellow) |
| `USER_CHAT_COLOR` | Integer | ANSI color for user chat | `32` (green) |
| `SENTBY_FILES` | Boolean | Add "sent by" to uploaded files | Present=enabled |
| `KEEP_UPLOAD_CREDIT` | Integer | Keep upload credits | `1` (enabled) |
| `FREE_RESUMING` | Boolean | Allow free file resume | Present=enabled |
| `CALLERS_LOG` | Boolean | Enable callers log | Present=enabled |
| `START_LOG` | Boolean | Log node startup | Present=enabled |
| `BREAK_CHAT` | Boolean | Allow Ctrl+C to break chat | Present=enabled |
| `DOOR_LOG` | Boolean | Log door executions | Present=enabled |
| `PRIORITY` | Integer | Task priority | `-1` to `20` |
| `UD_LOG` | Boolean | Upload/download log | Present=enabled |
| `DISABLE_QUICK_LOGONS` | Boolean | Disable quick logon | Present=enabled |
| `DEF_SCREENS` | Boolean | Use default screens | Present=enabled |
| `TELNET` | Boolean | Enable telnet on this node | Present=enabled |
| `NO_MCI_MSG` | Boolean | Disable MCI in messages | Present=enabled |
| `LOG_HOST` | Boolean | Log hostname/IP | Present=enabled |
| `FTP` | Boolean | Enable FTP on this node | Present=enabled |
| `VIEW_PASSWORD` | Boolean | Show password characters (debug) | Present=enabled |
| `NORADBOOGIE` | Boolean | Disable RAD boogie mode | Present=disabled boogie |

#### Serial/Modem Settings

| ToolType | Type | Purpose | Notes |
|----------|------|---------|-------|
| `NRAM.1` | String | Modem init string 1 | First init command |
| `NRAM.2` | String | Modem init string 2 | Second init command |
| `NRAM.n` | String | Additional init strings | Numbered sequence |

**ToolType Constant:** `TOOLTYPE_NRAMS`

---

### 3. Conference Configuration (Conf[1-n].info)

**ToolType Constant:** `TOOLTYPE_CONF`
**Files:** `Conf1.info`, `Conf2.info`, etc.
**Purpose:** Per-conference settings

#### Conference Settings from Conf11.info

| ToolType | Type | Purpose | Example |
|----------|------|---------|---------|
| `NDIRS` | Integer | Number of file directories | `2` |
| `DLPATH.1` | Path | Download path for dir 1 | `BBS:Conf11/Upload/` |
| `DLPATH.2` | Path | Download path for dir 2 | `BBS2:Conf11/Upload/` |
| `ULPATH.1` | Path | Upload path for dir 1 | `BBS:Conf11/Upload/` |
| `ULPATH.2` | Path | Upload path for dir 2 | `BBS2:Conf11/Upload/` |
| `FORCE_NEWSCAN` | Boolean | Force new file scan | Present=enabled |
| `NO_NEWSCAN` | Boolean | Disable new file scan | Opposite of FORCE |
| `SHOW_NEW_FILES` | Boolean | Show new files on login | Present=enabled |
| `NO_NEW_FILES` | Boolean | Hide new files on login | Opposite of SHOW |
| `EXCLUDE_FTP` | Boolean | Exclude from FTP access | Present=enabled |
| `CONFDB_SHARED` | Integer | Share database with conf# | Conference number |

#### Directory Settings (Numbered 1-n)

Pattern: `{SETTING}.{NUMBER}={value}`

**File Paths:**
- `DLPATH.n` - Download directory path
- `ULPATH.n` - Upload directory path
- `DIRNAME.n` - Directory name/title
- `DIRDESC.n` - Directory description

---

### 4. Message Base Configuration (MsgBase.info per conference)

**ToolType Constant:** `TOOLTYPE_MSGBASE`
**Files:** Per-conference message base config
**Purpose:** Message area settings

| ToolType | Type | Purpose | Example |
|----------|------|---------|---------|
| `NMSGBASES` | Integer | Number of message bases | `1` (default) |
| `NAME.1` | String | Message base 1 name | `General Discussion` |
| `NAME.n` | String | Additional base names | Numbered |
| `LOCATION.1` | Path | Message base 1 location | `BBS:Conf01/MsgBase/` |
| `LOCATION.n` | Path | Additional base locations | Numbered |

**Location Path Logic:**
- If contains `:` → Full path (e.g., `SYS:Messages/`)
- No `:` → Relative to conference location
- Default: `{ConfLocation}/MsgBase/`

---

### 5. Language Configuration (Languages.info)

**ToolType Constant:** `TOOLTYPE_LANGUAGES`
**File:** `Languages.info` in BBS root
**Purpose:** Multi-language support

#### Language Settings from Languages.info

| ToolType | Type | Purpose | Example |
|----------|------|---------|---------|
| `HOSTLANGUAGE` | String | Default/host language | `English` |
| `TITLE.1` | String | Language 1 display title | `English` |
| `TITLE.2` | String | Language 2 display title | `French` |
| `TITLE.n` | String | Additional language titles | Numbered |
| `LANGUAGE.1` | String | Language 1 code/name | `English` |
| `LANGUAGE.2` | String | Language 2 code/name | `French` |
| `LANGUAGE.n` | String | Additional language codes | Numbered |

**Translation Files:**
- Location: `{LANGUAGE_BASE}/{FROM_LANGUAGE}{TO_LANGUAGE}.TRN`
- Example: `BBS:Languages/EnglishFrench.TRN`
- Format: Binary translation table

---

### 6. Door/Command Configuration (.info per command)

**ToolType Constants:**
- `TOOLTYPE_SYSCMD` - System commands (SYS: priority)
- `TOOLTYPE_BBSCMD` - BBS commands (BBSCMD: priority)

**Files:** One .info file per command in `Commands/SysCmd/` or `Commands/BBSCmd/`
**Purpose:** External door and command configuration

#### Command .info Settings

| ToolType | Type | Purpose | Values/Notes |
|----------|------|---------|--------------|
| `TYPE` | Enum | Door execution type | SHELL, AMIGADOS, XPRSHELL, XPR, MCI, AEM, TS (TypeScript) |
| `BBSCMD` | String | Command name | Uppercase command text |
| `LOCATION` | Path | Door executable path | Full or relative path |
| `NAME` | String | Display name | Friendly door name |
| `DESCRIPTION` | String | Door description | Help text |
| `ACCESS` | Integer | Minimum security level | 0-200 (0=anyone) |
| `PASSWORD` | String | Door password (optional) | Plain text password |
| `PASS_PARAMETERS` | Integer | Pass command parameters | 0=no, 1=yes, >1=with params |
| `INTERNAL` | String | Internal command routing | Command to execute |
| `MCI_TEXT` | String | MCI code to display | For TYPE=MCI |
| `MULTINODE` | Boolean | Allow multiple simultaneous | YES/NO |
| `PRIORITY` | Enum | Execution priority | SYSCMD, BBSCMD, SAME |

**Door Types:**
- `SHELL` - Execute via AmigaShell
- `AMIGADOS` - Execute as AmigaDOS command
- `XPRSHELL` - XPR protocol via shell
- `XPR` - XPR protocol direct
- `MCI` - Display MCI codes
- `AEM` - ARexx/E module
- `TS` - TypeScript door (our extension)

---

### 7. Protocol Configuration (Protocols.info)

**File:** `Protocols.info` in BBS root
**Purpose:** File transfer protocol settings

| ToolType | Type | Purpose | Example |
|----------|------|---------|---------|
| `TITLE.1` | String | Protocol 1 display name | `ZModem` |
| `TITLE.n` | String | Additional protocol names | Numbered |
| `LIB.1` | String | XPR library name | `xprzmodem.library` |
| `LIB.n` | String | Additional XPR libraries | Numbered |

---

### 8. File Check Configuration (FCheck.info)

**File:** `FCheck.info` in BBS root
**Purpose:** Background file checking settings

*Settings to be determined from code analysis*

---

## Configuration Data Model

### Object Relationships

```
BBS (Global)
├── Nodes (1-8)
│   ├── Serial/Modem Settings
│   ├── Chat Settings
│   ├── Logging Options
│   └── Network Options (Telnet, FTP)
├── Conferences (1-n)
│   ├── Message Bases (1-n per conference)
│   ├── File Directories (1-n per conference)
│   └── Access Controls
├── Languages
│   ├── Host Language
│   └── Available Languages (1-n)
├── Commands/Doors
│   ├── System Commands (SysCmd/)
│   └── BBS Commands (BBSCmd/)
└── Protocols
    └── XPR Protocols (1-n)
```

### Entity Definitions

#### BBS Configuration

```typescript
interface BBSConfig {
  // Identity
  name: string;
  sysop: string;
  location: string;
  phone?: string;

  // Security
  minPasswordLength: number;          // 0=disabled
  minPasswordStrength: number;        // 0-4
  maxPasswordFails: number;           // -1=unlimited
  passwordSecurity: PasswordAlgorithm;
  strictPasswordPolicy: boolean;

  // Language
  languageBase?: string;              // Path to translation files

  // System
  // ... additional system settings
}

enum PasswordAlgorithm {
  LEGACY = 'LEGACY',
  PBKDF2_5 = 'PBKDF2_5',
  PBKDF2_50 = 'PBKDF2_50',
  PBKDF2_100 = 'PBKDF2_100',
  PBKDF2_1000 = 'PBKDF2_1000',
  PBKDF2_10000 = 'PBKDF2_10000',
}
```

#### Node Configuration

```typescript
interface NodeConfig {
  nodeNumber: number;                 // 1-8

  // Startup
  nodeStart: string;                  // Startup path/command
  priority: number;                   // -1 to 20

  // Display
  capitolFiles: boolean;
  defScreens: boolean;

  // Chat
  sysopChatColor: number;             // ANSI color code
  userChatColor: number;              // ANSI color code
  breakChat: boolean;

  // Uploads/Downloads
  sentbyFiles: boolean;
  keepUploadCredit: boolean;
  freeResuming: boolean;

  // Logging
  callersLog: boolean;
  startLog: boolean;
  doorLog: boolean;
  udLog: boolean;
  logHost: boolean;

  // Network
  telnet: boolean;
  ftp: boolean;

  // Misc
  disableQuickLogons: boolean;
  noMciMsg: boolean;
  viewPassword: boolean;              // DEBUG ONLY

  // Serial/Modem
  nrams: string[];                    // Init strings
  noRadBoogie: boolean;
}
```

#### Conference Configuration

```typescript
interface ConferenceConfig {
  confNumber: number;
  name: string;

  // Message Bases
  numMsgBases: number;
  msgBases: MessageBase[];

  // File Directories
  numDirs: number;
  directories: FileDirectory[];

  // Scanning
  forceNewscan: boolean;
  noNewscan: boolean;
  showNewFiles: boolean;
  noNewFiles: boolean;

  // Access
  excludeFtp: boolean;
  confDbShared?: number;              // Share with conf#
}

interface MessageBase {
  number: number;                     // 1-n
  name: string;
  location: string;                   // Full or relative path
}

interface FileDirectory {
  number: number;                     // 1-n
  name: string;
  description?: string;
  downloadPath: string;
  uploadPath: string;
}
```

#### Language Configuration

```typescript
interface LanguageConfig {
  hostLanguage: string;
  languages: Language[];
}

interface Language {
  number: number;                     // 1-n
  code: string;                       // Language code
  title: string;                      // Display title
  translationFile?: string;           // Path to .TRN file
}
```

#### Door/Command Configuration

```typescript
interface DoorConfig {
  // Identity
  bbsCmd: string;                     // Command name (uppercase)
  name: string;                       // Display name
  description?: string;

  // Execution
  type: DoorType;
  location: string;                   // Path to executable
  priority: CommandPriority;

  // Access
  access: number;                     // Security level 0-200
  password?: string;

  // Parameters
  passParameters: number;             // 0=no, 1=yes, >1=with params
  internal?: string;                  // Internal command routing
  mciText?: string;                   // For TYPE=MCI

  // Options
  multinode: boolean;
}

enum DoorType {
  SHELL = 'SHELL',
  AMIGADOS = 'AMIGADOS',
  XPRSHELL = 'XPRSHELL',
  XPR = 'XPR',
  MCI = 'MCI',
  AEM = 'AEM',
  TS = 'TS',                          // TypeScript (our extension)
}

enum CommandPriority {
  SYSCMD = 'SYSCMD',                  // Highest
  BBSCMD = 'BBSCMD',                  // Middle
  SAME = 'SAME',                      // Lowest (internal)
}
```

#### Protocol Configuration

```typescript
interface ProtocolConfig {
  protocols: Protocol[];
}

interface Protocol {
  number: number;                     // 1-n
  title: string;                      // Display name
  library: string;                    // XPR library name
}
```

---

## Configuration File Locations

### Original Amiga Structure

```
BBS:                              <- BBS root volume
├── BBS.info                      <- Global BBS config
├── Node1.info                    <- Node 1 config
├── Node2.info                    <- Node 2 config
├── Node[n].info                  <- Additional nodes
├── Languages.info                <- Language config
├── Protocols.info                <- Protocol config
├── FCheck.info                   <- File check config
├── Conf1.info                    <- Conference 1 config
├── Conf[n].info                  <- Additional conferences
├── Conf1/                        <- Conference 1 directory
│   ├── MsgBase/                  <- Default message base
│   ├── Upload/                   <- Upload directory
│   └── ... other conf files
├── Commands/
│   ├── SysCmd/                   <- System commands
│   │   ├── COMMAND1.info
│   │   └── ...
│   └── BBSCmd/                   <- BBS commands
│       ├── COMMAND2.info
│       └── ...
└── Languages/                    <- Translation files
    ├── EnglishFrench.TRN
    └── ...
```

### TypeScript Port Structure

```
project-root/
├── backend/
│   └── data/
│       └── bbs.db                <- SQLite database
│           ├── system_config     <- BBS global settings
│           ├── node_config       <- Node settings
│           ├── conferences       <- Conference list
│           ├── conference_config <- Conference settings
│           ├── message_bases     <- Message base configs
│           ├── file_directories  <- File directory configs
│           ├── languages         <- Language settings
│           ├── doors             <- Door/command configs
│           └── protocols         <- Protocol configs
└── web-config/                   <- React config app (TO BE CREATED)
```

---

## Configuration Operations

### Read Operations

**Original Amiga:**
```c
readToolType(TOOLTYPE_BBSCONFIG, 0, 'MIN_PASSWORD_LENGTH', value)
readToolTypeInt(TOOLTYPE_BBSCONFIG, 0, 'MIN_PASSWORD_LENGTH')
checkToolType(TOOLTYPE_BBSCONFIG, 0, 'PASSWORD_SECURITY', 'PBKDF2_10000')
checkToolTypeExists(TOOLTYPE_BBSCONFIG, 0, 'STRICT_PASSWORD_POLICY')
```

**TypeScript Port:**
```typescript
// Should provide equivalent functionality via database queries
const config = await getSystemConfig();
const minPasswordLength = config.minPasswordLength;
const passwordSecurity = config.passwordSecurity;
const strictPolicy = config.strictPasswordPolicy;
```

### Write Operations

**Original Amiga:**
- Edit .info file ToolTypes via Workbench Icon Information
- Use external MUI configuration tool
- Direct .info file manipulation

**TypeScript Port:**
```typescript
// Via API endpoint
PUT /api/config/system
{
  "minPasswordLength": 8,
  "passwordSecurity": "PBKDF2_10000",
  "strictPasswordPolicy": true
}

// Via React config app UI
// → Form submission → API call → Database update
```

---

## Migration Strategy

### Phase 1: Database Schema (Current State)

Map ToolType settings to database tables:

1. ✅ **system_config** table (BBS.info equivalents)
2. ⚠️ **node_config** table (Node.info equivalents) - PARTIAL
3. ✅ **conferences** table (Conf.info basic info)
4. ❌ **conference_config** table (Conf.info extended settings) - MISSING
5. ⚠️ **message_bases** table (MsgBase.info) - PARTIAL
6. ❌ **file_directories** table (directory settings) - MISSING
7. ❌ **languages** table (Languages.info) - MISSING
8. ⚠️ **doors** table (command .info files) - PARTIAL (only basic info)
9. ❌ **protocols** table (Protocols.info) - MISSING

### Phase 2: API Layer (TO BE CREATED)

Create REST API endpoints for CRUD operations on all config entities.

### Phase 3: React Config App (TO BE CREATED)

Build web-based configuration interface matching original functionality.

---

## Next Steps

1. ✅ Complete this analysis document
2. ⏳ Create gap analysis (CONFIG_APP_GAPS.md)
3. ⏳ Create implementation plan (CONFIG_APP_PLAN.md)
4. ⏳ Design database schema extensions
5. ⏳ Implement missing backend APIs
6. ⏳ Build React configuration app
7. ⏳ Test for 1:1 parity

---

## References

- **Source Code:** `express.e` lines 1-32248
- **ToolType Handler:** `tooltypes.e` module (imported at line 29)
- **Constants:** `axconsts.e` module (imported at line 28)
- **Sample .info Files:** Project root directory
- **Documentation:** Original AmiExpress manuals (if available)

---

**Document Status:** COMPLETE - Ready for gap analysis
**Last Updated:** 2025-11-12
**Next Document:** CONFIG_APP_GAPS.md
