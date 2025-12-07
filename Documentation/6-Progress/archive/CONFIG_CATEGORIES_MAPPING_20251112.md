# Configuration Categories: Complete TOOLTYPE Mapping

**Date**: 2025-11-12
**Purpose**: Map Amiga config app categories to express.e TOOLTYPE constants

---

## User's 9 Missing Categories

The user identified these categories in the Amiga config app that are NOT in our web config app:

1. restricted
2. security
3. server
4. drives
5. backup
6. computers
7. screen types
8. file checkers
9. tools

---

## TOOLTYPE Mapping Analysis

### Express.e TOOLTYPE Constants Found:

| TOOLTYPE Constant | Usage Count | Purpose |
|-------------------|-------------|---------|
| TOOLTYPE_BBSCONFIG | 100+ | System-wide BBS configuration |
| TOOLTYPE_NODE | 80+ | Per-node settings (1-8 nodes) |
| TOOLTYPE_CONF | 50+ | Conference configuration |
| TOOLTYPE_MSGBASE | 17 | Message base configuration (per conference) |
| TOOLTYPE_ACCESS | 3 | Security access control (per level) |
| TOOLTYPE_DRIVES | 2 | Drive list configuration |
| TOOLTYPE_SCREENTYPES | 2 | Screen type definitions |
| TOOLTYPE_COMPUTERLIST | 2 | Computer type list |
| TOOLTYPE_FCHECK | 10 | File checker configuration |
| TOOLTYPE_XFERLIB | 14 | Transfer protocol settings (FTP/HTTP/Hydra) |
| TOOLTYPE_XPRTYPES | 2 | XPR protocol type definitions |
| TOOLTYPE_LANGUAGES | 6 | Language configuration |
| TOOLTYPE_SYSCMD | 2 | System command definitions |
| TOOLTYPE_BBSCMD | 2 | BBS command definitions |
| TOOLTYPE_NODECMD | 2 | Node-specific commands |
| TOOLTYPE_NODESYSCMD | 2 | Node-specific system commands |
| TOOLTYPE_CONFCMD | 4 | Conference-specific commands |
| TOOLTYPE_NRAMS | 2 | Modem NRAM settings |

---

## Category to TOOLTYPE Mapping

### 1. RESTRICTED ❌ NOT A CONFIG CATEGORY
**Finding**: `restricted()` is a **function** (express.e:9579), not a TOOLTYPE category.

**What it does**:
- Checks if file comment contains "Restricted" string
- Prevents viewing/downloading restricted files
- Logs attempts to access restricted files

**Implementation**: Already handled in file operations, NOT a configuration table.

---

### 2. SECURITY → TOOLTYPE_ACCESS ✅
**Status**: NEW TABLE REQUIRED

**Express.e References**:
- Lines 3029, 8497, 28540: TOOLTYPE_ACCESS usage
- 182+ ACS_* flags found in express.e
- Per-security-level configuration (1-255 levels)

**reference-boardBBS Example**: `Access.info`
```
ACS.READ_MESSAGE
ACS.ENTER_MESSAGE
ACS.DOWNLOAD
ACS.UPLOAD
ACS.PAGE_SYSOP
ACS.FILE_LISTINGS
ACS.NEW_FILES_SINCE
ACS.VIEW_A_FILE
ACS.EDIT_USER_INFO
ACS.ZIPPY_TEXT_SEARCH
... (20+ more flags)
```

**Database Schema**:
```typescript
interface SecurityLevelAccess {
  id: number;
  security_level: number;        // 1-255
  acs_flag: string;              // e.g., "READ_MESSAGE", "DOWNLOAD"
  enabled: boolean;
  description?: string;
  created_at: Date;
  updated_at: Date;
}
```

**Notes**: Need to populate all 182+ ACS_* flags from express.e

---

### 3. SERVER → TOOLTYPE_BBSCONFIG (Extend) ✅
**Status**: EXTEND EXISTING system_config TABLE

**Express.e References**:
- Lines 938-949: PASSWORD_SECURITY settings
- Lines 910, 915, 1010: Password strength settings
- reference-boardBBS bbsConfig.info: FTP, SMTP, HTTP settings

**Fields to Add to system_config**:
```typescript
// Network Services
smtp_host: string;
smtp_port: number;
smtp_username: string;
smtp_password: string;  // encrypted
smtp_ssl: boolean;
smtp_from_email: string;

ftp_host: string;
ftp_port: number;
ftp_data_ports: string;  // "50101,50102,50103..."

http_port: number;
http_host: string;

// Password Security
password_security: string;  // "LEGACY", "PBKDF2_5", "PBKDF2_50", etc.
min_password_length: number;
min_password_strength: number;
max_password_fails: number;

// System Behavior
quiet_join: boolean;
convert_to_mb: boolean;
```

---

### 4. DRIVES → TOOLTYPE_DRIVES ✅
**Status**: NEW TABLE REQUIRED

**Express.e References**:
- Lines 17412-17418: Drive enumeration and free space calculation
- Lines 31677-31681: Drive path configuration

**reference-boardBBS Example**: `Drives.info`
```
DRIVE.1=DH1:
DRIVE.2=DH2:
```

**Database Schema**:
```typescript
interface DriveConfig {
  id: number;
  drive_number: number;      // 1-N
  drive_path: string;        // e.g., "DH1:", "/data/drive1"
  enabled: boolean;
  description?: string;
  created_at: Date;
  updated_at: Date;
}
```

---

### 5. BACKUP ❌ NOT FOUND
**Status**: NO EVIDENCE IN EXPRESS.E

**Findings**:
- Searched for: TOOLTYPE_BACKUP, "backup config", "archive"
- Found 0 results in express.e
- reference-boardBBS backup.info is an image file (not config)

**Conclusion**: Either:
1. UI-only category with no backend configuration
2. Not actually in the Amiga config app
3. Uses different naming convention we haven't found

**Action**: Skip for now, ask user if they have more details

---

### 6. COMPUTERS → TOOLTYPE_COMPUTERLIST ✅
**Status**: NEW TABLE REQUIRED

**Express.e References**:
- Lines 31954-31965: Computer list loading
- Reads COMPUTER.NUM and COMPUTER.1-N

**reference-boardBBS Example**: `ComputerList.info`
```
COMPUTER.NUM=8
COMPUTER.1=AMiGA 500
COMPUTER.2=AMiGA 2000
COMPUTER.3=AMiGA 3000
COMPUTER.4=AMiGA 4000
COMPUTER.5=AMiGA 1200
COMPUTER.6=PC
COMPUTER.7=mAC
COMPUTER.8=OTHER!
```

**Database Schema**:
```typescript
interface ComputerType {
  id: number;
  computer_number: number;   // 1-N
  computer_name: string;     // e.g., "AMiGA 500", "PC"
  enabled: boolean;
  created_at: Date;
  updated_at: Date;
}
```

---

### 7. SCREEN TYPES → TOOLTYPE_SCREENTYPES ✅
**Status**: NEW TABLE REQUIRED

**Express.e References**:
- Lines 31905-31915: Screen type enumeration
- Reads TYPE.N and TITLE.N pairs

**reference-boardBBS Example**: `ScreenTypes.info`
```
TYPE.1=TXT.GR
TITLE.1=Amiga Ansi
TYPE.2=IBM
TITLE.2=IBM Ansi
```

**Database Schema**:
```typescript
interface ScreenType {
  id: number;
  screen_number: number;     // 1-N
  screen_type: string;       // e.g., "TXT.GR", "IBM"
  screen_title: string;      // e.g., "Amiga Ansi", "IBM Ansi"
  enabled: boolean;
  created_at: Date;
  updated_at: Date;
}
```

---

### 8. FILE CHECKERS → TOOLTYPE_FCHECK ✅
**Status**: NEW TABLE REQUIRED

**Express.e References**:
- Lines 18556-18614: File checker execution
- Lines 31677-31681: File checker directory setup
- Supports multiple file checker profiles

**Fields from express.e**:
- CHECKER: Path to checker program
- OPTIONS: Command-line options
- STACK: Stack size for checker process
- PRIORITY: Process priority
- SCRIPT: Post-check script
- ERROR.1, ERROR.2, etc.: Error pattern matching

**Database Schema**:
```typescript
interface FileChecker {
  id: number;
  checker_name: string;      // e.g., "Virus Scanner", "Archive Validator"
  checker_path: string;      // Path to checker executable
  options: string;           // Command-line options
  stack_size: number;        // Default 4096
  priority: number;          // Default 0
  script_path?: string;      // Post-check script
  enabled: boolean;
  created_at: Date;
  updated_at: Date;
}

interface FileCheckerError {
  id: number;
  file_checker_id: number;
  error_number: number;      // 1-N
  error_pattern: string;     // String to match in output
  created_at: Date;
  updated_at: Date;
}
```

---

### 9. TOOLS ❓ UNCLEAR
**Status**: AMBIGUOUS

**Possible Mappings**:
1. **TOOLTYPE_XPRTYPES** (XPR protocol libraries)
   - Lines 31883-31893: XPR library enumeration
   - Reads TITLE.N and LIBRARY.N pairs

2. **External Utilities** (archive tools, virus scanners)
   - Could overlap with File Checkers

3. **UI-only Grouping**
   - Might just be a UI category grouping related tools

**Action**: Ask user to clarify what "tools" category contains

---

## Implementation Priority

### Phase 1: Clear Mappings (6 categories) ✅
1. ✅ Security (TOOLTYPE_ACCESS) - 182+ ACS flags
2. ✅ Server (Extend system_config) - Network + password settings
3. ✅ Drives (TOOLTYPE_DRIVES) - Simple drive list
4. ✅ Computers (TOOLTYPE_COMPUTERLIST) - Computer type list
5. ✅ Screen Types (TOOLTYPE_SCREENTYPES) - Screen format list
6. ✅ File Checkers (TOOLTYPE_FCHECK) - File validation tools

### Phase 2: Unclear/Skip (3 categories) ⏸️
7. ❌ Restricted - NOT A CONFIG (it's a runtime function)
8. ❌ Backup - NOT FOUND in express.e
9. ❓ Tools - CLARIFY with user

---

## Database Tables to Create

```sql
-- 1. Security Access Control
CREATE TABLE security_level_access (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  security_level INTEGER NOT NULL,
  acs_flag TEXT NOT NULL,
  enabled INTEGER DEFAULT 1,
  description TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(security_level, acs_flag)
);

-- 2. Server Settings (Extend system_config - already exists)
-- ALTER TABLE system_config ADD COLUMN ... (multiple columns)

-- 3. Drives
CREATE TABLE drives (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  drive_number INTEGER NOT NULL UNIQUE,
  drive_path TEXT NOT NULL,
  enabled INTEGER DEFAULT 1,
  description TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- 4. Computer Types
CREATE TABLE computer_types (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  computer_number INTEGER NOT NULL UNIQUE,
  computer_name TEXT NOT NULL,
  enabled INTEGER DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- 5. Screen Types
CREATE TABLE screen_types (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  screen_number INTEGER NOT NULL UNIQUE,
  screen_type TEXT NOT NULL,
  screen_title TEXT NOT NULL,
  enabled INTEGER DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- 6. File Checkers
CREATE TABLE file_checkers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  checker_name TEXT NOT NULL,
  checker_path TEXT NOT NULL,
  options TEXT DEFAULT '',
  stack_size INTEGER DEFAULT 4096,
  priority INTEGER DEFAULT 0,
  script_path TEXT,
  enabled INTEGER DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE file_checker_errors (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  file_checker_id INTEGER NOT NULL,
  error_number INTEGER NOT NULL,
  error_pattern TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (file_checker_id) REFERENCES file_checkers(id) ON DELETE CASCADE,
  UNIQUE(file_checker_id, error_number)
);
```

---

## Next Steps

1. ✅ Complete TOOLTYPE mapping analysis (DONE)
2. Create TypeScript interfaces for all 6 categories
3. Create database migration script
4. Update database.ts with CREATE TABLE statements
5. Implement repository layer (6 new repos)
6. Implement service layer with Zod validation
7. Create API routes
8. Create React components
9. Create seed script with express.e defaults
10. Test end-to-end

---

## Questions for User

1. **"restricted"** - This is NOT a config category, it's a runtime file check. Should we skip it?
2. **"backup"** - Can't find this in express.e. What does this category contain in the Amiga config app?
3. **"tools"** - What does this category contain? XPR protocols? External utilities?

---

## Summary

**Ready to Implement**: 6 categories
**Needs Clarification**: 3 categories
**Total New Tables**: 5 (plus extending system_config)
**Total New Fields**: 50+ across all tables
