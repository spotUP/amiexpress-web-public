# AmiExpress Configuration App - Gap Analysis

**Date:** 2025-11-12
**Purpose:** Compare original AmiExpress configuration vs current TypeScript BBS implementation
**Status:** Phase 1 Complete - Ready for Phase 2 Implementation

---

## Executive Summary

**Current State:** The TypeScript BBS has **partial** configuration support. Most configuration is hardcoded or missing entirely.

**Gap Summary:**
- ✅ **5 categories PARTIAL** - Basic functionality exists but incomplete
- ❌ **3 categories MISSING** - No implementation at all
- 🔴 **P0 Critical:** System config, node config, door config
- 🟡 **P1 High:** Conference settings, language support
- 🟢 **P2 Medium:** Protocols, file check settings

**Recommended Action:** Implement configuration tables → API layer → React config app in 3 phases

---

## Detailed Gap Analysis

### 1. BBS Global Configuration

**Status:** ❌ **MISSING** (Priority: P0 - Critical)

| Feature Category | Original (ToolType) | Current Implementation | Status | Priority |
|-----------------|---------------------|------------------------|--------|----------|
| System Identity | `BBS_NAME`, `SYSOP_NAME`, `LOCATION`, `PHONE` | Hardcoded in code/not configurable | ❌ Missing | P0 |
| Password Security | `MIN_PASSWORD_LENGTH` | Hardcoded (8 chars) | ❌ Missing | P0 |
| Password Security | `MIN_PASSWORD_STRENGTH` | Not implemented | ❌ Missing | P0 |
| Password Security | `MAX_PASSWORD_FAILS` | Not implemented | ❌ Missing | P0 |
| Password Security | `PASSWORD_SECURITY` (algorithm) | Hardcoded (bcrypt) | ❌ Missing | P0 |
| Password Security | `STRICT_PASSWORD_POLICY` | Not implemented | ❌ Missing | P0 |
| Language Support | `LANGUAGE_BASE` (path) | Not implemented | ❌ Missing | P1 |

**Database Table:** ❌ **Does not exist** - `system_config` table needs to be created

**Required Schema:**
```sql
CREATE TABLE system_config (
  id INTEGER PRIMARY KEY DEFAULT 1,
  bbs_name TEXT NOT NULL DEFAULT 'AmiExpress BBS',
  sysop_name TEXT NOT NULL DEFAULT 'Sysop',
  location TEXT,
  phone TEXT,
  min_password_length INTEGER DEFAULT 8,
  min_password_strength INTEGER DEFAULT 0,
  max_password_fails INTEGER DEFAULT -1,
  password_security TEXT DEFAULT 'bcrypt',
  strict_password_policy INTEGER DEFAULT 0,
  language_base TEXT,
  created_at INTEGER DEFAULT (strftime('%s', 'now')),
  updated_at INTEGER DEFAULT (strftime('%s', 'now')),
  CHECK (id = 1)  -- Ensure only one row
);
```

**API Endpoints Needed:**
- `GET /api/config/system` - Get global config
- `PUT /api/config/system` - Update global config
- `GET /api/config/system/version` - Get BBS version info
- `GET /api/config/system/stats` - Get system statistics

---

### 2. Node Configuration

**Status:** ❌ **MISSING** (Priority: P0 - Critical)

| Feature Category | Original (ToolType) | Current Implementation | Status | Priority |
|-----------------|---------------------|------------------------|--------|----------|
| Node Management | Node1-8.info files | Not implemented | ❌ Missing | P0 |
| Startup Settings | `NODESTART`, `PRIORITY` | Hardcoded | ❌ Missing | P0 |
| Display Settings | `CAPITOL_FILES`, `DEF_SCREENS` | Hardcoded | ❌ Missing | P1 |
| Chat Settings | `SYSOP_CHAT_COLOR`, `USER_CHAT_COLOR` | Hardcoded ANSI codes | ❌ Missing | P1 |
| Chat Settings | `BREAK_CHAT` | Not implemented | ❌ Missing | P1 |
| Upload/Download | `SENTBY_FILES`, `KEEP_UPLOAD_CREDIT` | Hardcoded behavior | ❌ Missing | P1 |
| Upload/Download | `FREE_RESUMING` | Not implemented | ❌ Missing | P1 |
| Logging | `CALLERS_LOG`, `START_LOG`, `DOOR_LOG`, `UD_LOG` | Partial (some logs exist) | ⚠️ Partial | P1 |
| Logging | `LOG_HOST` | Implemented | ✅ Complete | - |
| Network | `TELNET`, `FTP` | Implemented (telnet only) | ⚠️ Partial | P1 |
| Misc | `DISABLE_QUICK_LOGONS` | Not implemented | ❌ Missing | P2 |
| Misc | `NO_MCI_MSG` | Not implemented | ❌ Missing | P2 |
| Misc | `VIEW_PASSWORD` (DEBUG) | Not implemented | ❌ Missing | P3 |
| Serial/Modem | `NRAM.1`, `NRAM.2`, etc. | Not applicable (web-based) | ✅ N/A | - |
| Serial/Modem | `NORADBOOGIE` | Not applicable (web-based) | ✅ N/A | - |

**Database Table:** ❌ **Does not exist** - `node_config` table needs to be created

**Required Schema:**
```sql
CREATE TABLE node_config (
  node_number INTEGER PRIMARY KEY CHECK (node_number BETWEEN 1 AND 8),
  node_start TEXT DEFAULT 'BBS:EXPRESS',
  priority INTEGER DEFAULT -1,
  capitol_files INTEGER DEFAULT 0,
  def_screens INTEGER DEFAULT 1,
  sysop_chat_color INTEGER DEFAULT 33,
  user_chat_color INTEGER DEFAULT 32,
  break_chat INTEGER DEFAULT 1,
  sentby_files INTEGER DEFAULT 0,
  keep_upload_credit INTEGER DEFAULT 1,
  free_resuming INTEGER DEFAULT 0,
  callers_log INTEGER DEFAULT 1,
  start_log INTEGER DEFAULT 1,
  door_log INTEGER DEFAULT 1,
  ud_log INTEGER DEFAULT 1,
  log_host INTEGER DEFAULT 1,
  telnet_enabled INTEGER DEFAULT 1,
  ftp_enabled INTEGER DEFAULT 0,
  disable_quick_logons INTEGER DEFAULT 0,
  no_mci_msg INTEGER DEFAULT 0,
  view_password INTEGER DEFAULT 0,
  created_at INTEGER DEFAULT (strftime('%s', 'now')),
  updated_at INTEGER DEFAULT (strftime('%s', 'now'))
);
```

**API Endpoints Needed:**
- `GET /api/config/nodes` - List all node configs
- `GET /api/config/nodes/:id` - Get specific node config
- `PUT /api/config/nodes/:id` - Update node config
- `POST /api/config/nodes/:id/reset` - Reset node to defaults

**Note:** Most BBS deployments will use node 1 only. Multi-node support is for future scalability.

---

### 3. Conference Configuration

**Status:** ⚠️ **PARTIAL** (Priority: P1 - High)

| Feature Category | Original (ToolType) | Current Implementation | Status | Priority |
|-----------------|---------------------|------------------------|--------|----------|
| Basic Info | `conferences` table | Implemented (id, name, description) | ✅ Complete | - |
| Extended Settings | `NDIRS`, directory counts | Not implemented | ❌ Missing | P1 |
| File Directories | `DLPATH.n`, `ULPATH.n` | Partial (`file_areas` table exists) | ⚠️ Partial | P1 |
| Directory Names | `DIRNAME.n`, `DIRDESC.n` | Partial (name/desc in file_areas) | ⚠️ Partial | P1 |
| Message Bases | `NMSGBASES`, base counts | Partial (`message_bases` table exists) | ⚠️ Partial | P1 |
| Scanning | `FORCE_NEWSCAN`, `NO_NEWSCAN` | Not implemented | ❌ Missing | P1 |
| File Display | `SHOW_NEW_FILES`, `NO_NEW_FILES` | Not implemented | ❌ Missing | P1 |
| FTP Access | `EXCLUDE_FTP` | Not implemented | ❌ Missing | P2 |
| Database Sharing | `CONFDB_SHARED` | Not implemented | ❌ Missing | P2 |

**Database Tables:**
- ✅ `conferences` - EXISTS (basic info only)
- ❌ `conference_config` - MISSING (extended settings)
- ⚠️ `file_areas` - EXISTS but incomplete
- ⚠️ `message_bases` - EXISTS but incomplete

**Required New Schema:**
```sql
CREATE TABLE conference_config (
  conference_id INTEGER PRIMARY KEY REFERENCES conferences(id) ON DELETE CASCADE,
  num_dirs INTEGER DEFAULT 1,
  force_newscan INTEGER DEFAULT 0,
  no_newscan INTEGER DEFAULT 0,
  show_new_files INTEGER DEFAULT 1,
  no_new_files INTEGER DEFAULT 0,
  exclude_ftp INTEGER DEFAULT 0,
  confdb_shared INTEGER,  -- Share with conference #
  created_at INTEGER DEFAULT (strftime('%s', 'now')),
  updated_at INTEGER DEFAULT (strftime('%s', 'now'))
);
```

**Required Schema Updates:**
```sql
-- Add message base location to message_bases table
ALTER TABLE message_bases ADD COLUMN location TEXT;

-- file_areas table already has most fields
-- May need to add directory number field
ALTER TABLE file_areas ADD COLUMN dir_number INTEGER DEFAULT 1;
```

**API Endpoints Needed:**
- `GET /api/config/conferences` - List all conferences with config
- `GET /api/config/conferences/:id` - Get conference details + config
- `PUT /api/config/conferences/:id` - Update conference basic info
- `PUT /api/config/conferences/:id/settings` - Update extended settings
- `PUT /api/config/conferences/:id/access` - Update access rules

---

### 4. Message Base Configuration

**Status:** ⚠️ **PARTIAL** (Priority: P1 - High)

| Feature Category | Original (ToolType) | Current Implementation | Status | Priority |
|-----------------|---------------------|------------------------|--------|----------|
| Basic Info | `message_bases` table | Implemented (id, name, conference_id) | ✅ Complete | - |
| Message Base Count | `NMSGBASES` per conference | Not tracked | ❌ Missing | P1 |
| Location Path | `LOCATION.n` paths | Not implemented | ❌ Missing | P1 |
| Naming | `NAME.n` numbered bases | Implemented | ✅ Complete | - |

**Database Table:** ⚠️ `message_bases` - EXISTS but incomplete

**Required Schema Updates:**
```sql
ALTER TABLE message_bases ADD COLUMN base_number INTEGER DEFAULT 1;
ALTER TABLE message_bases ADD COLUMN location TEXT;
```

**API Endpoints Needed:**
- `GET /api/config/conferences/:confId/msgbases` - List message bases
- `POST /api/config/conferences/:confId/msgbases` - Create message base
- `PUT /api/config/conferences/:confId/msgbases/:id` - Update message base
- `DELETE /api/config/conferences/:confId/msgbases/:id` - Delete message base

---

### 5. Language Configuration

**Status:** ❌ **MISSING** (Priority: P1 - High)

| Feature Category | Original (ToolType) | Current Implementation | Status | Priority |
|-----------------|---------------------|------------------------|--------|----------|
| Language Management | Languages.info file | Not implemented | ❌ Missing | P1 |
| Host Language | `HOSTLANGUAGE` | Hardcoded (English) | ❌ Missing | P1 |
| Language List | `LANGUAGE.n`, `TITLE.n` | Not implemented | ❌ Missing | P1 |
| Translation Files | .TRN files | Not implemented | ❌ Missing | P2 |

**Database Table:** ❌ **Does not exist** - `languages` table needs to be created

**Required Schema:**
```sql
CREATE TABLE system_languages (
  id INTEGER PRIMARY KEY DEFAULT 1,
  host_language TEXT NOT NULL DEFAULT 'English',
  created_at INTEGER DEFAULT (strftime('%s', 'now')),
  updated_at INTEGER DEFAULT (strftime('%s', 'now')),
  CHECK (id = 1)  -- Ensure only one row
);

CREATE TABLE languages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  language_number INTEGER NOT NULL CHECK (language_number >= 1),
  code TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  translation_file TEXT,
  enabled INTEGER DEFAULT 1,
  created_at INTEGER DEFAULT (strftime('%s', 'now')),
  updated_at INTEGER DEFAULT (strftime('%s', 'now')),
  UNIQUE (language_number)
);
```

**API Endpoints Needed:**
- `GET /api/config/languages` - List all languages
- `GET /api/config/languages/host` - Get host language
- `PUT /api/config/languages/host` - Set host language
- `POST /api/config/languages` - Add new language
- `PUT /api/config/languages/:id` - Update language
- `DELETE /api/config/languages/:id` - Remove language

---

### 6. Door/Command Configuration

**Status:** ❌ **MISSING** (Priority: P0 - Critical)

| Feature Category | Original (ToolType) | Current Implementation | Status | Priority |
|-----------------|---------------------|------------------------|--------|----------|
| Door Registry | .info files in Commands/ | Not implemented | ❌ Missing | P0 |
| Command Name | `BBSCMD` | Not configurable | ❌ Missing | P0 |
| Door Type | `TYPE` (SHELL, MCI, TS, etc.) | Hardcoded in code | ❌ Missing | P0 |
| Execution Path | `LOCATION` | Hardcoded paths | ❌ Missing | P0 |
| Display Name | `NAME` | Not implemented | ❌ Missing | P0 |
| Description | `DESCRIPTION` | Not implemented | ❌ Missing | P1 |
| Access Level | `ACCESS` (security level) | Hardcoded | ❌ Missing | P0 |
| Password | `PASSWORD` (optional) | Not implemented | ❌ Missing | P2 |
| Parameters | `PASS_PARAMETERS` | Hardcoded | ❌ Missing | P1 |
| Internal Routing | `INTERNAL` | Not implemented | ❌ Missing | P1 |
| MCI Text | `MCI_TEXT` (for TYPE=MCI) | Not implemented | ❌ Missing | P2 |
| Multinode | `MULTINODE` | Not implemented | ❌ Missing | P1 |
| Priority | `PRIORITY` (SYSCMD, BBSCMD, SAME) | Hardcoded logic | ❌ Missing | P1 |

**Database Table:** ❌ **Does not exist** - `doors` table needs to be created

**Required Schema:**
```sql
CREATE TABLE doors (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  bbs_cmd TEXT NOT NULL UNIQUE,  -- Command name (uppercase)
  name TEXT NOT NULL,  -- Display name
  description TEXT,
  type TEXT NOT NULL CHECK (type IN ('SHELL', 'AMIGADOS', 'XPRSHELL', 'XPR', 'MCI', 'AEM', 'TS')),
  location TEXT NOT NULL,  -- Path to executable
  priority TEXT NOT NULL DEFAULT 'BBSCMD' CHECK (priority IN ('SYSCMD', 'BBSCMD', 'SAME')),
  access INTEGER DEFAULT 0,  -- Security level 0-200
  password TEXT,
  pass_parameters INTEGER DEFAULT 0,
  internal TEXT,  -- Internal command routing
  mci_text TEXT,  -- For TYPE=MCI
  multinode INTEGER DEFAULT 1,
  enabled INTEGER DEFAULT 1,
  created_at INTEGER DEFAULT (strftime('%s', 'now')),
  updated_at INTEGER DEFAULT (strftime('%s', 'now'))
);
```

**API Endpoints Needed:**
- `GET /api/config/doors` - List all doors
- `GET /api/config/doors/:id` - Get door details
- `POST /api/config/doors` - Create new door
- `PUT /api/config/doors/:id` - Update door config
- `DELETE /api/config/doors/:id` - Delete door
- `PUT /api/config/doors/:id/settings` - Update door settings
- `POST /api/config/doors/:id/test` - Test door execution
- `GET /api/config/doors/:id/logs` - View door execution logs

---

### 7. Protocol Configuration

**Status:** ❌ **MISSING** (Priority: P2 - Medium)

| Feature Category | Original (ToolType) | Current Implementation | Status | Priority |
|-----------------|---------------------|------------------------|--------|----------|
| Protocol Registry | Protocols.info file | Not implemented | ❌ Missing | P2 |
| Protocol Names | `TITLE.n` | Hardcoded | ❌ Missing | P2 |
| XPR Libraries | `LIB.n` | Not applicable (web-based) | ✅ N/A | - |

**Database Table:** ❌ **Does not exist** - `protocols` table needed (low priority for web)

**Required Schema:**
```sql
CREATE TABLE protocols (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  protocol_number INTEGER NOT NULL CHECK (protocol_number >= 1),
  title TEXT NOT NULL UNIQUE,
  library TEXT,  -- XPR library name (legacy)
  enabled INTEGER DEFAULT 1,
  created_at INTEGER DEFAULT (strftime('%s', 'now')),
  updated_at INTEGER DEFAULT (strftime('%s', 'now')),
  UNIQUE (protocol_number)
);
```

**API Endpoints Needed:**
- `GET /api/config/protocols` - List protocols
- `POST /api/config/protocols` - Add protocol
- `PUT /api/config/protocols/:id` - Update protocol
- `DELETE /api/config/protocols/:id` - Remove protocol

**Note:** Web-based BBS may not need full XPR protocol support. HTTP uploads/downloads are primary.

---

### 8. File Check Configuration

**Status:** ❌ **MISSING** (Priority: P3 - Low)

| Feature Category | Original (ToolType) | Current Implementation | Status | Priority |
|-----------------|---------------------|------------------------|--------|----------|
| Background Check | FCheck.info settings | Not implemented | ❌ Missing | P3 |
| Check Scheduling | Background file scanning | Not implemented | ❌ Missing | P3 |

**Database Table:** ❌ **Does not exist** - `file_check_config` table needed (low priority)

**Note:** File checking is less critical for web-based BBS. Can be manual or on-demand.

---

## Current Database Schema Summary

### ✅ Existing Tables (27 total)

**Core Data:**
- `users` - User accounts (extensive, well-implemented)
- `conferences` - Conference list (basic info only)
- `message_bases` - Message base list (incomplete)
- `messages` - Message storage
- `file_areas` - File area list (incomplete)
- `file_entries` - File list
- `bulletins` - Bulletin board posts

**Sessions & Activity:**
- `sessions` - User sessions
- `node_sessions` - Node status tracking
- `user_sessions` - Login session history
- `daily_stats` - Daily activity statistics
- `caller_activity` - Caller log

**Chat System:**
- `chat_sessions` - 1-on-1 chat sessions
- `chat_messages` - 1-on-1 chat history
- `chat_rooms` - Chat room definitions
- `chat_room_members` - Room membership
- `chat_room_messages` - Room chat history
- `online_messages` - Online messaging system

**User Data:**
- `conf_base` - Per-user conference settings
- `user_stats` - User statistics
- `command_history` - Command history per user
- `flagged_files` - User file flags

**Voting System:**
- `vote_topics` - Vote topic definitions
- `vote_questions` - Vote questions
- `vote_answers` - Vote answer options
- `vote_results` - User votes
- `vote_status` - Vote completion tracking

**Other:**
- `mail_stats` - Message base statistics
- `webhooks` - Webhook integrations

### ❌ Missing Configuration Tables (8 needed)

1. `system_config` - Global BBS settings (P0)
2. `node_config` - Node-specific settings (P0)
3. `conference_config` - Extended conference settings (P1)
4. `doors` - Door/command definitions (P0)
5. `system_languages` - Host language setting (P1)
6. `languages` - Available languages (P1)
7. `protocols` - File transfer protocols (P2)
8. `file_check_config` - File checking settings (P3)

---

## Priority Ranking

### P0: Critical (Must Have)

**Immediate blocking issues for production use:**

1. **System Configuration** (`system_config` table)
   - BBS identity (name, sysop, location)
   - Password security policies
   - Essential for multi-tenant or production deployment

2. **Node Configuration** (`node_config` table)
   - Logging settings (critical for debugging)
   - Network settings (telnet/FTP enable/disable)
   - Chat configuration

3. **Door Configuration** (`doors` table)
   - Door registry and management
   - Access control
   - Command routing
   - **Blocks:** Adding new doors without code changes

### P1: High (Should Have)

**Important for full feature parity:**

4. **Conference Extended Settings** (`conference_config` table)
   - File scanning behavior
   - Directory counts
   - Access controls

5. **Message Base Configuration**
   - Location paths
   - Base numbering

6. **Language Support** (`system_languages`, `languages` tables)
   - Multi-language BBS
   - Translation management

### P2: Medium (Nice to Have)

**Enhances functionality but not blocking:**

7. **Protocol Configuration** (`protocols` table)
   - File transfer protocol management
   - Low priority for web-based BBS

8. **Extended Door Settings**
   - MCI text configuration
   - Password protection
   - Internal routing

### P3: Low (Can Defer)

**Future enhancements:**

9. **File Check Configuration** (`file_check_config` table)
   - Background file scanning
   - Can be manual for now

10. **Debug Settings**
    - Password visibility (debug only)
    - Advanced logging

---

## Implementation Roadmap

### Phase 1: Foundation (Weeks 1-2)

**Goal:** Add P0 critical configuration tables and APIs

**Tasks:**
1. Create database migration for P0 tables:
   - `system_config`
   - `node_config`
   - `doors`
2. Create service layer for config management
3. Create REST API endpoints for P0 tables
4. Write unit tests for all endpoints
5. Document API with OpenAPI/Swagger

**Deliverables:**
- Database migration SQL file
- Config service (ConfigService.ts)
- API routes (config-routes.ts)
- Unit tests (100% coverage)
- API documentation

### Phase 2: Extended Configuration (Weeks 3-4)

**Goal:** Add P1 high priority configuration

**Tasks:**
1. Create database migration for P1 tables:
   - `conference_config`
   - `system_languages`
   - `languages`
2. Update existing tables:
   - Add `location` to `message_bases`
   - Add `dir_number` to `file_areas`
3. Create service layer methods
4. Create REST API endpoints
5. Write integration tests

**Deliverables:**
- Database migration SQL file
- Extended service methods
- API endpoints for P1 features
- Integration tests

### Phase 3: React Configuration App (Weeks 5-8)

**Goal:** Build web-based configuration interface

**Tasks:**
1. Set up React project in `web/config-app/`
2. Implement design system (match SDK preview)
3. Build configuration screens:
   - Dashboard (overview)
   - System Configuration
   - Node Management
   - Conference Management
   - Door Management
   - Language Settings
4. Implement forms with validation
5. Add import/export functionality
6. Write E2E tests

**Deliverables:**
- React config app (production-ready)
- Complete UI for all config entities
- Import/export functionality
- E2E tests
- User documentation

### Phase 4: Testing & Polish (Week 9)

**Goal:** Achieve 1:1 parity and production readiness

**Tasks:**
1. Compare all features against original .info files
2. Manual testing against checklist
3. Security audit
4. Performance optimization
5. Accessibility compliance
6. Final documentation

**Deliverables:**
- Feature parity verification report
- Security audit report
- Performance benchmarks
- Complete documentation

---

## Testing Strategy

### Unit Tests

**Coverage:** 100% of backend code

**Test:**
- All database operations
- All service methods
- All API endpoints
- Input validation
- Error handling

**Tools:** Jest, Supertest

### Integration Tests

**Coverage:** All workflows

**Test:**
- Complete CRUD operations
- Permission checks
- Data consistency
- Transaction rollbacks
- Error scenarios

**Tools:** Jest, SQLite in-memory

### E2E Tests

**Coverage:** All user workflows

**Test:**
- Config app navigation
- Form submissions
- Import/export
- Multi-user scenarios
- Error messages

**Tools:** Playwright, Cypress

### Manual Testing

**Coverage:** Feature checklist

**Test:**
- Every original ToolType setting
- All edge cases
- Cross-browser compatibility
- Mobile responsiveness

**Documentation:** Test checklist with sign-off

---

## Success Criteria

**The configuration system is complete when:**

1. ✅ All P0 tables implemented and tested
2. ✅ All P1 tables implemented and tested
3. ✅ All API endpoints functional with 100% test coverage
4. ✅ React config app matches SDK preview design
5. ✅ Every original ToolType setting is configurable
6. ✅ No hardcoded configuration in code
7. ✅ Import/export works for all config
8. ✅ Backup/restore functionality tested
9. ✅ Security audit passed
10. ✅ User documentation complete
11. ✅ Sysop can configure entire BBS without touching code/database
12. ✅ Zero TypeScript errors
13. ✅ Zero ESLint warnings
14. ✅ Production checklist verified

---

## Risk Assessment

### High Risk

**Missing P0 Configuration:**
- **Impact:** Cannot add doors without code changes
- **Mitigation:** Implement Phase 1 immediately

**No Admin Interface:**
- **Impact:** Requires database/code access to configure
- **Mitigation:** Prioritize React app in Phase 3

### Medium Risk

**Data Migration:**
- **Impact:** Existing deployments need migration path
- **Mitigation:** Create migration scripts with defaults

**Testing Complexity:**
- **Impact:** 8 new tables, 40+ endpoints to test
- **Mitigation:** Automated testing from day 1

### Low Risk

**Performance:**
- **Impact:** Config queries might be slow
- **Mitigation:** Add indexes, cache frequently accessed config

**Compatibility:**
- **Impact:** Breaking changes to existing APIs
- **Mitigation:** Versioned API endpoints

---

## Dependencies

**Required Before Starting:**
- ✅ CONFIG_APP_ANALYSIS.md complete
- ✅ Current database schema analyzed
- ⏳ CONFIG_APP_PLAN.md (next step)

**Required During Development:**
- Database migration tools
- API testing framework
- React development environment
- CI/CD pipeline for testing

**Required for Completion:**
- User acceptance testing
- Documentation review
- Security audit
- Performance benchmarking

---

## Notes

**Design Decisions:**

1. **SQLite vs JSON config files:**
   - Chose SQLite for consistency with existing system
   - Easier querying and relationships
   - Transaction support

2. **Single system_config row:**
   - CHECK (id = 1) constraint ensures singleton
   - Simpler API (no ID needed in URL)

3. **Separate tables vs JSON columns:**
   - Chose separate tables for type safety
   - Better querying and indexing
   - Clearer schema

4. **Node count (8 max):**
   - Matches original AmiExpress limit
   - Most deployments use 1-2 nodes
   - Web-based BBS scales differently than serial

5. **Web vs Amiga differences:**
   - Serial/modem settings → N/A (web)
   - XPR protocols → Less relevant (HTTP)
   - Focus on core BBS functionality

---

**Document Status:** COMPLETE - Ready for CONFIG_APP_PLAN.md
**Last Updated:** 2025-11-12
**Next Document:** CONFIG_APP_PLAN.md (Implementation Plan)
