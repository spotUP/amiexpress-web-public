# AmiExpress Configuration App - Implementation Plan

**Date:** 2025-11-12
**Purpose:** Complete technical implementation plan for web-based configuration system
**Status:** Phase 1 Planning Complete - Ready for Phase 2 Implementation

---

## Executive Summary

**Project:** Build production-ready React configuration application for AmiExpress BBS
**Goal:** Provide 1:1 feature parity with original Amiga ToolType configuration system
**Timeline:** 9 weeks (4 phases)
**Outcome:** Web-based admin interface to replace manual .info file editing

**Success Metric:** Sysop can configure entire BBS through web interface without touching code/database

---

## Architecture Overview

### System Design

```
┌─────────────────────────────────────────────────────────────┐
│                     Web Browser                              │
│  ┌────────────────────────────────────────────────────────┐ │
│  │          React Config App (Port 5174)                  │ │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────────────────┐ │ │
│  │  │ Dashboard│  │  System  │  │   Conference Mgmt    │ │ │
│  │  │          │  │  Config  │  │                      │ │ │
│  │  └──────────┘  └──────────┘  └──────────────────────┘ │ │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────────────────┐ │ │
│  │  │   Door   │  │   Node   │  │   Language Settings  │ │ │
│  │  │  Manager │  │  Config  │  │                      │ │ │
│  │  └──────────┘  └──────────┘  └──────────────────────┘ │ │
│  └────────────────────────────────────────────────────────┘ │
└─────────────────────────┬───────────────────────────────────┘
                          │ HTTPS/REST API
                          │
┌─────────────────────────▼───────────────────────────────────┐
│              Express Backend (Port 3001)                     │
│  ┌────────────────────────────────────────────────────────┐ │
│  │              API Layer (Express Router)                 │ │
│  │  /api/config/system, /api/config/nodes, etc.          │ │
│  └────────────────────────┬───────────────────────────────┘ │
│  ┌────────────────────────▼───────────────────────────────┐ │
│  │         Middleware (Auth, Validation, Audit)           │ │
│  │  - ensureSysop() - Security check                      │ │
│  │  - validateConfig() - Input validation                 │ │
│  │  - auditLog() - Change tracking                        │ │
│  └────────────────────────┬───────────────────────────────┘ │
│  ┌────────────────────────▼───────────────────────────────┐ │
│  │           Service Layer (Business Logic)               │ │
│  │  ConfigService, NodeService, DoorService              │ │
│  └────────────────────────┬───────────────────────────────┘ │
│  ┌────────────────────────▼───────────────────────────────┐ │
│  │        Repository Layer (Database Access)              │ │
│  │  ConfigRepository, NodeRepository, etc.               │ │
│  └────────────────────────┬───────────────────────────────┘ │
└──────────────────────────┼─────────────────────────────────┘
                           │
┌──────────────────────────▼─────────────────────────────────┐
│                 SQLite Database                             │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐  │
│  │ system_  │  │  node_   │  │ doors    │  │languages │  │
│  │ config   │  │ config   │  │          │  │          │  │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘  │
│  ┌──────────────────────────────────────────────────────┐  │
│  │          conference_config, protocols, etc.          │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

### Data Flow

**Read Configuration:**
1. User opens config page in React app
2. React component calls API endpoint
3. Express route validates sysop auth
4. Service layer fetches from database
5. Repository returns data
6. JSON response sent to React
7. UI displays configuration form

**Write Configuration:**
1. User edits form and clicks Save
2. React validates input (client-side)
3. API request sent with changes
4. Express validates auth + input (server-side)
5. Service layer checks business rules
6. Audit log entry created
7. Repository updates database
8. Success response with new data
9. UI updates and shows confirmation

---

## Technology Stack

### Backend (Express API)

| Component | Technology | Version | Purpose |
|-----------|-----------|---------|---------|
| Runtime | Node.js | 18+ | JavaScript runtime |
| Framework | Express | 4.x | Web framework |
| Database | better-sqlite3 | 8.x | SQLite driver |
| Validation | Zod | 3.x | Schema validation |
| Authentication | JWT | 9.x | Token-based auth |
| Testing | Jest | 29.x | Unit testing |
| Testing | Supertest | 6.x | API testing |
| Documentation | Swagger/OpenAPI | 3.0 | API docs |

### Frontend (React Config App)

| Component | Technology | Version | Purpose |
|-----------|-----------|---------|---------|
| Framework | React | 18+ | UI framework |
| Language | TypeScript | 5.x | Type safety |
| Build Tool | Vite | 5.x | Fast dev server |
| Styling | Tailwind CSS | 3.x | Utility CSS (match SDK) |
| Router | React Router | 6.x | Client-side routing |
| Forms | React Hook Form | 7.x | Form management |
| Validation | Zod | 3.x | Schema validation |
| API Client | TanStack Query | 5.x | Data fetching |
| Icons | Lucide React | Latest | Icon library |
| Testing | Vitest | Latest | Unit testing |
| E2E Testing | Playwright | Latest | E2E testing |

### Development Tools

| Tool | Purpose |
|------|---------|
| ESLint | Code linting |
| Prettier | Code formatting |
| Husky | Git hooks |
| TypeScript | Type checking |
| Nodemon | Auto-restart dev server |

---

## Database Schema Design

### Schema Overview

**8 New Configuration Tables:**

1. `system_config` - Global BBS settings (singleton)
2. `node_config` - Per-node settings (1-8 nodes)
3. `conference_config` - Extended conference settings
4. `doors` - Door/command definitions
5. `system_languages` - Host language (singleton)
6. `languages` - Available languages list
7. `protocols` - File transfer protocols
8. `config_audit_log` - Change tracking

**2 Schema Updates:**

1. `message_bases` - Add `base_number`, `location` columns
2. `file_areas` - Add `dir_number` column

### Detailed Schema

#### 1. system_config (Global BBS Settings)

```sql
CREATE TABLE system_config (
  id INTEGER PRIMARY KEY DEFAULT 1,

  -- Identity
  bbs_name TEXT NOT NULL DEFAULT 'AmiExpress BBS',
  sysop_name TEXT NOT NULL DEFAULT 'Sysop',
  location TEXT DEFAULT '',
  phone TEXT DEFAULT '',
  email TEXT DEFAULT '',
  website TEXT DEFAULT '',

  -- Security & Authentication
  min_password_length INTEGER DEFAULT 8 CHECK (min_password_length >= 0 AND min_password_length <= 32),
  min_password_strength INTEGER DEFAULT 0 CHECK (min_password_strength >= 0 AND min_password_strength <= 4),
  max_password_fails INTEGER DEFAULT -1,  -- -1 = unlimited
  password_security TEXT DEFAULT 'bcrypt' CHECK (password_security IN ('LEGACY', 'PBKDF2_5', 'PBKDF2_50', 'PBKDF2_100', 'PBKDF2_1000', 'PBKDF2_10000', 'bcrypt')),
  strict_password_policy INTEGER DEFAULT 0,

  -- Session Settings
  default_time_limit INTEGER DEFAULT 60,  -- Minutes
  max_session_time INTEGER DEFAULT 120,  -- Minutes
  idle_timeout INTEGER DEFAULT 10,  -- Minutes

  -- Display Settings
  default_lines_per_screen INTEGER DEFAULT 23,
  ansi_enabled INTEGER DEFAULT 1,

  -- Language
  language_base TEXT DEFAULT '',  -- Path to translation files

  -- Network
  telnet_port INTEGER DEFAULT 3001,
  http_port INTEGER DEFAULT 5173,

  -- File Limits
  max_upload_size INTEGER DEFAULT 10485760,  -- 10MB in bytes
  max_files_per_upload INTEGER DEFAULT 5,

  -- Metadata
  created_at INTEGER DEFAULT (strftime('%s', 'now')),
  updated_at INTEGER DEFAULT (strftime('%s', 'now')),

  -- Ensure only one row
  CHECK (id = 1)
);

-- Insert default row
INSERT OR IGNORE INTO system_config (id) VALUES (1);

-- Trigger to update timestamp
CREATE TRIGGER update_system_config_timestamp
AFTER UPDATE ON system_config
BEGIN
  UPDATE system_config SET updated_at = strftime('%s', 'now') WHERE id = 1;
END;
```

#### 2. node_config (Node Settings)

```sql
CREATE TABLE node_config (
  node_number INTEGER PRIMARY KEY CHECK (node_number BETWEEN 1 AND 8),

  -- Startup
  node_start TEXT DEFAULT 'BBS:EXPRESS',
  priority INTEGER DEFAULT -1 CHECK (priority BETWEEN -20 AND 20),
  enabled INTEGER DEFAULT 1,

  -- Display
  capitol_files INTEGER DEFAULT 0,
  def_screens INTEGER DEFAULT 1,

  -- Chat
  sysop_chat_color INTEGER DEFAULT 33,  -- ANSI yellow
  user_chat_color INTEGER DEFAULT 32,   -- ANSI green
  break_chat INTEGER DEFAULT 1,

  -- Uploads/Downloads
  sentby_files INTEGER DEFAULT 0,
  keep_upload_credit INTEGER DEFAULT 1,
  free_resuming INTEGER DEFAULT 0,

  -- Logging
  callers_log INTEGER DEFAULT 1,
  start_log INTEGER DEFAULT 1,
  door_log INTEGER DEFAULT 1,
  ud_log INTEGER DEFAULT 1,  -- Upload/download log
  log_host INTEGER DEFAULT 1,

  -- Network
  telnet_enabled INTEGER DEFAULT 1,
  ftp_enabled INTEGER DEFAULT 0,

  -- Misc
  disable_quick_logons INTEGER DEFAULT 0,
  no_mci_msg INTEGER DEFAULT 0,
  view_password INTEGER DEFAULT 0,  -- DEBUG ONLY

  -- Metadata
  created_at INTEGER DEFAULT (strftime('%s', 'now')),
  updated_at INTEGER DEFAULT (strftime('%s', 'now'))
);

-- Insert default nodes (1-8)
INSERT OR IGNORE INTO node_config (node_number) VALUES (1), (2), (3), (4), (5), (6), (7), (8);

-- Trigger to update timestamp
CREATE TRIGGER update_node_config_timestamp
AFTER UPDATE ON node_config
BEGIN
  UPDATE node_config SET updated_at = strftime('%s', 'now') WHERE node_number = NEW.node_number;
END;
```

#### 3. conference_config (Extended Conference Settings)

```sql
CREATE TABLE conference_config (
  conference_id INTEGER PRIMARY KEY REFERENCES conferences(id) ON DELETE CASCADE,

  -- Directory Settings
  num_dirs INTEGER DEFAULT 1 CHECK (num_dirs >= 0 AND num_dirs <= 100),

  -- Scanning Behavior
  force_newscan INTEGER DEFAULT 0,
  no_newscan INTEGER DEFAULT 0,
  show_new_files INTEGER DEFAULT 1,
  no_new_files INTEGER DEFAULT 0,

  -- Access Control
  exclude_ftp INTEGER DEFAULT 0,
  confdb_shared INTEGER REFERENCES conferences(id),  -- Share database with conference #

  -- Display
  max_files_display INTEGER DEFAULT 100,

  -- Metadata
  created_at INTEGER DEFAULT (strftime('%s', 'now')),
  updated_at INTEGER DEFAULT (strftime('%s', 'now'))
);

-- Trigger to update timestamp
CREATE TRIGGER update_conference_config_timestamp
AFTER UPDATE ON conference_config
BEGIN
  UPDATE conference_config SET updated_at = strftime('%s', 'now') WHERE conference_id = NEW.conference_id;
END;
```

#### 4. doors (Door/Command Definitions)

```sql
CREATE TABLE doors (
  id INTEGER PRIMARY KEY AUTOINCREMENT,

  -- Identity
  bbs_cmd TEXT NOT NULL UNIQUE COLLATE NOCASE,  -- Command name (case-insensitive unique)
  name TEXT NOT NULL,  -- Display name
  description TEXT DEFAULT '',

  -- Execution
  type TEXT NOT NULL DEFAULT 'TS' CHECK (type IN ('SHELL', 'AMIGADOS', 'XPRSHELL', 'XPR', 'MCI', 'AEM', 'TS')),
  location TEXT NOT NULL,  -- Path to executable
  priority TEXT NOT NULL DEFAULT 'BBSCMD' CHECK (priority IN ('SYSCMD', 'BBSCMD', 'SAME')),

  -- Access Control
  access INTEGER DEFAULT 0 CHECK (access >= 0 AND access <= 200),  -- Security level
  password TEXT DEFAULT NULL,  -- Optional password

  -- Parameters
  pass_parameters INTEGER DEFAULT 0,  -- 0=no, 1=yes, >1=custom
  internal TEXT DEFAULT NULL,  -- Internal command routing
  mci_text TEXT DEFAULT NULL,  -- For TYPE=MCI

  -- Options
  multinode INTEGER DEFAULT 1,
  enabled INTEGER DEFAULT 1,

  -- Runtime (TypeScript doors)
  runtime TEXT DEFAULT NULL CHECK (runtime IS NULL OR runtime IN ('server', 'client', 'hybrid')),

  -- Metadata
  created_at INTEGER DEFAULT (strftime('%s', 'now')),
  updated_at INTEGER DEFAULT (strftime('%s', 'now')),
  created_by TEXT REFERENCES users(id),
  updated_by TEXT REFERENCES users(id)
);

-- Indexes
CREATE INDEX idx_doors_type ON doors(type);
CREATE INDEX idx_doors_priority ON doors(priority);
CREATE INDEX idx_doors_enabled ON doors(enabled);
CREATE INDEX idx_doors_access ON doors(access);

-- Trigger to update timestamp
CREATE TRIGGER update_doors_timestamp
AFTER UPDATE ON doors
BEGIN
  UPDATE doors SET updated_at = strftime('%s', 'now') WHERE id = NEW.id;
END;
```

#### 5. system_languages (Host Language Setting)

```sql
CREATE TABLE system_languages (
  id INTEGER PRIMARY KEY DEFAULT 1,
  host_language TEXT NOT NULL DEFAULT 'English',
  created_at INTEGER DEFAULT (strftime('%s', 'now')),
  updated_at INTEGER DEFAULT (strftime('%s', 'now')),

  -- Ensure only one row
  CHECK (id = 1)
);

-- Insert default row
INSERT OR IGNORE INTO system_languages (id) VALUES (1);

-- Trigger to update timestamp
CREATE TRIGGER update_system_languages_timestamp
AFTER UPDATE ON system_languages
BEGIN
  UPDATE system_languages SET updated_at = strftime('%s', 'now') WHERE id = 1;
END;
```

#### 6. languages (Available Languages)

```sql
CREATE TABLE languages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  language_number INTEGER NOT NULL UNIQUE CHECK (language_number >= 1),
  code TEXT NOT NULL UNIQUE,  -- ISO code (en, fr, de, etc.)
  title TEXT NOT NULL,  -- Display name
  translation_file TEXT DEFAULT NULL,  -- Path to .TRN file
  enabled INTEGER DEFAULT 1,
  created_at INTEGER DEFAULT (strftime('%s', 'now')),
  updated_at INTEGER DEFAULT (strftime('%s', 'now'))
);

-- Insert default language
INSERT OR IGNORE INTO languages (language_number, code, title) VALUES (1, 'English', 'English');

-- Trigger to update timestamp
CREATE TRIGGER update_languages_timestamp
AFTER UPDATE ON languages
BEGIN
  UPDATE languages SET updated_at = strftime('%s', 'now') WHERE id = NEW.id;
END;
```

#### 7. protocols (File Transfer Protocols)

```sql
CREATE TABLE protocols (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  protocol_number INTEGER NOT NULL UNIQUE CHECK (protocol_number >= 1),
  title TEXT NOT NULL UNIQUE,  -- Display name
  library TEXT DEFAULT NULL,  -- XPR library name (legacy)
  enabled INTEGER DEFAULT 1,
  created_at INTEGER DEFAULT (strftime('%s', 'now')),
  updated_at INTEGER DEFAULT (strftime('%s', 'now'))
);

-- Insert default protocols
INSERT OR IGNORE INTO protocols (protocol_number, title) VALUES
  (1, 'ZModem'),
  (2, 'YModem'),
  (3, 'XModem'),
  (4, 'ASCII');

-- Trigger to update timestamp
CREATE TRIGGER update_protocols_timestamp
AFTER UPDATE ON protocols
BEGIN
  UPDATE protocols SET updated_at = strftime('%s', 'now') WHERE id = NEW.id;
END;
```

#### 8. config_audit_log (Change Tracking)

```sql
CREATE TABLE config_audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,

  -- What changed
  table_name TEXT NOT NULL,
  record_id TEXT NOT NULL,  -- Can be integer or text ID
  action TEXT NOT NULL CHECK (action IN ('CREATE', 'UPDATE', 'DELETE')),

  -- Changes
  field_name TEXT,
  old_value TEXT,
  new_value TEXT,

  -- Who & When
  user_id TEXT NOT NULL REFERENCES users(id),
  username TEXT NOT NULL,
  timestamp INTEGER DEFAULT (strftime('%s', 'now')),

  -- Context
  ip_address TEXT,
  user_agent TEXT,

  -- Full record snapshots (JSON)
  old_record TEXT,  -- JSON before change
  new_record TEXT   -- JSON after change
);

-- Indexes
CREATE INDEX idx_audit_log_table ON config_audit_log(table_name, timestamp DESC);
CREATE INDEX idx_audit_log_user ON config_audit_log(user_id, timestamp DESC);
CREATE INDEX idx_audit_log_record ON config_audit_log(table_name, record_id, timestamp DESC);
```

#### Schema Updates (Existing Tables)

```sql
-- Add to message_bases table
ALTER TABLE message_bases ADD COLUMN base_number INTEGER DEFAULT 1;
ALTER TABLE message_bases ADD COLUMN location TEXT DEFAULT '';

-- Add to file_areas table
ALTER TABLE file_areas ADD COLUMN dir_number INTEGER DEFAULT 1;
```

---

## API Design

### API Architecture

**Base URL:** `http://localhost:3001/api/config`

**Authentication:** JWT Bearer token (sysop-only)

**Request Headers:**
```
Authorization: Bearer <jwt_token>
Content-Type: application/json
```

**Response Format:**
```json
{
  "success": true,
  "data": { /* response data */ },
  "message": "Operation successful",
  "timestamp": 1699999999
}
```

**Error Format:**
```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid input",
    "details": [
      { "field": "min_password_length", "message": "Must be between 0 and 32" }
    ]
  },
  "timestamp": 1699999999
}
```

### API Endpoints - Complete Specification

#### System Configuration

```typescript
// Get system configuration
GET /api/config/system
Response: {
  success: true,
  data: {
    id: 1,
    bbs_name: "AmiExpress BBS",
    sysop_name: "Sysop",
    location: "Cyberspace",
    // ... all system_config fields
  }
}

// Update system configuration
PUT /api/config/system
Request: {
  bbs_name: "My BBS",
  sysop_name: "Admin",
  min_password_length: 10
  // ... any system_config fields
}
Response: {
  success: true,
  data: { /* updated config */ },
  message: "System configuration updated"
}

// Get BBS version info
GET /api/config/system/version
Response: {
  success: true,
  data: {
    version: "5.0.0",
    build_date: "2025-11-12",
    express_version: "!X 5.0",
    platform: "web"
  }
}

// Get system statistics
GET /api/config/system/stats
Response: {
  success: true,
  data: {
    total_users: 42,
    total_calls: 1234,
    total_messages: 5678,
    uptime: 86400,
    disk_usage: {
      total: 10000000,
      used: 5000000,
      free: 5000000
    }
  }
}
```

#### Node Configuration

```typescript
// List all node configs
GET /api/config/nodes
Response: {
  success: true,
  data: [
    {
      node_number: 1,
      enabled: 1,
      telnet_enabled: 1,
      // ... all fields
    },
    // ... nodes 2-8
  ]
}

// Get specific node config
GET /api/config/nodes/:nodeNumber
Response: {
  success: true,
  data: {
    node_number: 1,
    node_start: "BBS:EXPRESS",
    // ... all node_config fields
  }
}

// Update node config
PUT /api/config/nodes/:nodeNumber
Request: {
  telnet_enabled: 1,
  door_log: 1,
  sysop_chat_color: 33
}
Response: {
  success: true,
  data: { /* updated node config */ },
  message: "Node 1 configuration updated"
}

// Reset node to defaults
POST /api/config/nodes/:nodeNumber/reset
Response: {
  success: true,
  data: { /* default node config */ },
  message: "Node 1 reset to defaults"
}
```

#### Conference Configuration

```typescript
// List all conferences with config
GET /api/config/conferences
Response: {
  success: true,
  data: [
    {
      id: 1,
      name: "General",
      description: "General discussion",
      config: {
        num_dirs: 2,
        force_newscan: 0,
        // ... conference_config fields
      }
    }
  ]
}

// Get conference details + config
GET /api/config/conferences/:id
Response: {
  success: true,
  data: {
    id: 1,
    name: "General",
    description: "General discussion",
    config: { /* conference_config */ },
    message_bases: [ /* message bases */ ],
    file_areas: [ /* file areas */ ]
  }
}

// Create conference
POST /api/config/conferences
Request: {
  name: "New Conference",
  description: "A new conference",
  config: {
    num_dirs: 1,
    force_newscan: 0
  }
}
Response: {
  success: true,
  data: { /* new conference */ },
  message: "Conference created"
}

// Update conference basic info
PUT /api/config/conferences/:id
Request: {
  name: "Updated Name",
  description: "Updated description"
}
Response: {
  success: true,
  data: { /* updated conference */ },
  message: "Conference updated"
}

// Update conference settings
PUT /api/config/conferences/:id/settings
Request: {
  force_newscan: 1,
  show_new_files: 1,
  num_dirs: 3
}
Response: {
  success: true,
  data: { /* updated config */ },
  message: "Conference settings updated"
}

// Delete conference
DELETE /api/config/conferences/:id
Response: {
  success: true,
  message: "Conference deleted"
}
```

#### Message Base Configuration

```typescript
// List message bases for conference
GET /api/config/conferences/:confId/msgbases
Response: {
  success: true,
  data: [
    {
      id: 1,
      name: "General Discussion",
      conference_id: 1,
      base_number: 1,
      location: "BBS:Conf01/MsgBase/"
    }
  ]
}

// Create message base
POST /api/config/conferences/:confId/msgbases
Request: {
  name: "Tech Support",
  base_number: 2,
  location: "BBS:Conf01/Tech/"
}
Response: {
  success: true,
  data: { /* new message base */ },
  message: "Message base created"
}

// Update message base
PUT /api/config/conferences/:confId/msgbases/:id
Request: {
  name: "Updated Name",
  location: "BBS:Conf01/Updated/"
}
Response: {
  success: true,
  data: { /* updated message base */ },
  message: "Message base updated"
}

// Delete message base
DELETE /api/config/conferences/:confId/msgbases/:id
Response: {
  success: true,
  message: "Message base deleted"
}
```

#### Door Configuration

```typescript
// List all doors
GET /api/config/doors
Query params:
  ?enabled=1          // Filter by enabled status
  ?type=TS            // Filter by type
  ?priority=BBSCMD    // Filter by priority
Response: {
  success: true,
  data: [
    {
      id: 1,
      bbs_cmd: "TELNET",
      name: "Telnet Connect",
      type: "TS",
      enabled: 1,
      // ... all fields
    }
  ]
}

// Get door details
GET /api/config/doors/:id
Response: {
  success: true,
  data: {
    id: 1,
    bbs_cmd: "TELNET",
    name: "Telnet Connect",
    description: "Connect to other BBSes",
    type: "TS",
    location: "doors/telnet-connect",
    priority: "BBSCMD",
    access: 0,
    // ... all door fields
  }
}

// Create door
POST /api/config/doors
Request: {
  bbs_cmd: "NEWDOOR",
  name: "New Door",
  description: "A new door",
  type: "TS",
  location: "doors/new-door",
  priority: "BBSCMD",
  access: 10
}
Response: {
  success: true,
  data: { /* new door */ },
  message: "Door created"
}

// Update door
PUT /api/config/doors/:id
Request: {
  name: "Updated Name",
  description: "Updated description",
  access: 20
}
Response: {
  success: true,
  data: { /* updated door */ },
  message: "Door updated"
}

// Update door settings
PUT /api/config/doors/:id/settings
Request: {
  pass_parameters: 1,
  multinode: 1,
  enabled: 1
}
Response: {
  success: true,
  data: { /* updated door */ },
  message: "Door settings updated"
}

// Test door execution
POST /api/config/doors/:id/test
Response: {
  success: true,
  data: {
    test_result: "pass",
    execution_time: 150,
    output: "Door executed successfully"
  }
}

// Get door execution logs
GET /api/config/doors/:id/logs
Query params:
  ?limit=50
  ?offset=0
Response: {
  success: true,
  data: {
    logs: [
      {
        timestamp: 1699999999,
        user: "testuser",
        duration: 300,
        exit_code: 0
      }
    ],
    total: 100
  }
}

// Delete door
DELETE /api/config/doors/:id
Response: {
  success: true,
  message: "Door deleted"
}
```

#### Language Configuration

```typescript
// List all languages
GET /api/config/languages
Response: {
  success: true,
  data: {
    host_language: "English",
    languages: [
      {
        id: 1,
        language_number: 1,
        code: "English",
        title: "English",
        enabled: 1
      }
    ]
  }
}

// Get host language
GET /api/config/languages/host
Response: {
  success: true,
  data: {
    id: 1,
    host_language: "English"
  }
}

// Set host language
PUT /api/config/languages/host
Request: {
  host_language: "French"
}
Response: {
  success: true,
  data: { /* updated */ },
  message: "Host language updated"
}

// Add new language
POST /api/config/languages
Request: {
  code: "French",
  title: "French",
  translation_file: "BBS:Languages/EnglishFrench.TRN"
}
Response: {
  success: true,
  data: { /* new language */ },
  message: "Language added"
}

// Update language
PUT /api/config/languages/:id
Request: {
  title: "Français",
  enabled: 1
}
Response: {
  success: true,
  data: { /* updated language */ },
  message: "Language updated"
}

// Delete language
DELETE /api/config/languages/:id
Response: {
  success: true,
  message: "Language deleted"
}
```

#### Protocol Configuration

```typescript
// List protocols
GET /api/config/protocols
Response: {
  success: true,
  data: [
    {
      id: 1,
      protocol_number: 1,
      title: "ZModem",
      enabled: 1
    }
  ]
}

// Add protocol
POST /api/config/protocols
Request: {
  title: "Kermit",
  library: "xprkermit.library"
}
Response: {
  success: true,
  data: { /* new protocol */ },
  message: "Protocol added"
}

// Update protocol
PUT /api/config/protocols/:id
Request: {
  title: "ZModem 8K",
  enabled: 1
}
Response: {
  success: true,
  data: { /* updated protocol */ },
  message: "Protocol updated"
}

// Delete protocol
DELETE /api/config/protocols/:id
Response: {
  success: true,
  message: "Protocol deleted"
}
```

#### Configuration Management

```typescript
// Export all configuration as JSON
GET /api/config/export
Response: {
  success: true,
  data: {
    version: "1.0",
    export_date: "2025-11-12T10:00:00Z",
    system: { /* system_config */ },
    nodes: [ /* all nodes */ ],
    conferences: [ /* all conferences */ ],
    doors: [ /* all doors */ ],
    languages: [ /* all languages */ ],
    protocols: [ /* all protocols */ ]
  }
}

// Import configuration from JSON
POST /api/config/import
Request: {
  data: { /* exported config JSON */ },
  merge: true,  // Merge with existing or replace
  backup: true  // Create backup first
}
Response: {
  success: true,
  data: {
    imported: {
      system: 1,
      nodes: 8,
      conferences: 5,
      doors: 20,
      languages: 3,
      protocols: 4
    }
  },
  message: "Configuration imported"
}

// Create backup
POST /api/config/backup
Response: {
  success: true,
  data: {
    backup_id: "backup_20251112_100000",
    filename: "config_backup_20251112_100000.json",
    size: 52428
  }
}

// List backups
GET /api/config/backups
Response: {
  success: true,
  data: [
    {
      id: "backup_20251112_100000",
      filename: "config_backup_20251112_100000.json",
      created_at: 1699999999,
      size: 52428
    }
  ]
}

// Restore from backup
POST /api/config/restore/:backupId
Response: {
  success: true,
  message: "Configuration restored from backup"
}

// Clear cache
POST /api/config/cache/clear
Response: {
  success: true,
  message: "Configuration cache cleared"
}
```

#### Audit Logs

```typescript
// Get configuration change history
GET /api/config/audit
Query params:
  ?table_name=doors
  ?user_id=user123
  ?start_date=2025-01-01
  ?end_date=2025-12-31
  ?limit=50
  ?offset=0
Response: {
  success: true,
  data: {
    logs: [
      {
        id: 1,
        table_name: "doors",
        record_id: "5",
        action: "UPDATE",
        field_name: "enabled",
        old_value: "0",
        new_value: "1",
        user_id: "user123",
        username: "admin",
        timestamp: 1699999999
      }
    ],
    total: 250
  }
}

// Get specific record history
GET /api/config/audit/:tableName/:recordId
Response: {
  success: true,
  data: {
    record: { /* current record */ },
    history: [
      {
        action: "UPDATE",
        timestamp: 1699999999,
        user: "admin",
        changes: [
          {
            field: "enabled",
            old_value: "0",
            new_value: "1"
          }
        ]
      }
    ]
  }
}
```

---

## React Component Hierarchy

### Project Structure

```
web/config-app/
├── public/
│   └── favicon.ico
├── src/
│   ├── components/
│   │   ├── layout/
│   │   │   ├── ConfigLayout.tsx          # Main layout wrapper
│   │   │   ├── Sidebar.tsx               # Navigation sidebar
│   │   │   ├── Header.tsx                # Top header bar
│   │   │   └── Footer.tsx                # Footer
│   │   ├── forms/
│   │   │   ├── SystemConfigForm.tsx      # System settings form
│   │   │   ├── NodeConfigForm.tsx        # Node settings form
│   │   │   ├── ConferenceForm.tsx        # Conference create/edit
│   │   │   ├── MessageBaseForm.tsx       # Message base create/edit
│   │   │   ├── DoorForm.tsx              # Door create/edit
│   │   │   ├── LanguageForm.tsx          # Language create/edit
│   │   │   └── ProtocolForm.tsx          # Protocol create/edit
│   │   ├── tables/
│   │   │   ├── NodeTable.tsx             # Nodes list table
│   │   │   ├── ConferenceTable.tsx       # Conferences list
│   │   │   ├── DoorTable.tsx             # Doors list
│   │   │   ├── LanguageTable.tsx         # Languages list
│   │   │   └── ProtocolTable.tsx         # Protocols list
│   │   ├── shared/
│   │   │   ├── FormField.tsx             # Reusable form field
│   │   │   ├── ValidationMessage.tsx     # Error display
│   │   │   ├── ConfirmDialog.tsx         # Confirm modal
│   │   │   ├── LoadingSpinner.tsx        # Loading indicator
│   │   │   ├── EmptyState.tsx            # Empty state display
│   │   │   ├── ErrorBoundary.tsx         # Error boundary
│   │   │   ├── Toast.tsx                 # Toast notifications
│   │   │   ├── Card.tsx                  # Card container
│   │   │   ├── Button.tsx                # Button component
│   │   │   ├── Input.tsx                 # Input component
│   │   │   ├── Select.tsx                # Select component
│   │   │   ├── Checkbox.tsx              # Checkbox component
│   │   │   ├── Switch.tsx                # Toggle switch
│   │   │   └── Badge.tsx                 # Badge/label
│   │   └── charts/
│   │       ├── StatsCard.tsx             # Dashboard stat card
│   │       └── ActivityChart.tsx         # Activity chart
│   ├── pages/
│   │   ├── Dashboard.tsx                 # Dashboard overview
│   │   ├── SystemConfig.tsx              # System configuration
│   │   ├── NodeManagement.tsx            # Node list & edit
│   │   ├── NodeDetail.tsx                # Single node detail
│   │   ├── Conferences.tsx               # Conference list
│   │   ├── ConferenceDetail.tsx          # Single conference detail
│   │   ├── Doors.tsx                     # Door list
│   │   ├── DoorDetail.tsx                # Single door detail
│   │   ├── Languages.tsx                 # Language settings
│   │   ├── Protocols.tsx                 # Protocol settings
│   │   ├── AuditLog.tsx                  # Change history
│   │   ├── Import.tsx                    # Import config
│   │   ├── Export.tsx                    # Export config
│   │   └── NotFound.tsx                  # 404 page
│   ├── hooks/
│   │   ├── useConfig.ts                  # System config hook
│   │   ├── useNodes.ts                   # Nodes hook
│   │   ├── useConferences.ts             # Conferences hook
│   │   ├── useDoors.ts                   # Doors hook
│   │   ├── useLanguages.ts               # Languages hook
│   │   ├── useProtocols.ts               # Protocols hook
│   │   ├── useAudit.ts                   # Audit log hook
│   │   ├── useAuth.ts                    # Authentication hook
│   │   └── useToast.ts                   # Toast notification hook
│   ├── services/
│   │   ├── api.ts                        # Base API client
│   │   ├── config-api.ts                 # Config API methods
│   │   └── auth.ts                       # Auth service
│   ├── types/
│   │   ├── config.types.ts               # Config interfaces
│   │   ├── user.types.ts                 # User interfaces
│   │   └── api.types.ts                  # API interfaces
│   ├── utils/
│   │   ├── validation.ts                 # Validation schemas
│   │   ├── formatting.ts                 # Formatters
│   │   ├── export.ts                     # Export helpers
│   │   └── constants.ts                  # Constants
│   ├── styles/
│   │   └── index.css                     # Global styles
│   ├── App.tsx                           # Root component
│   ├── main.tsx                          # Entry point
│   └── routes.tsx                        # Route definitions
├── package.json
├── vite.config.ts
├── tsconfig.json
├── tailwind.config.js
└── README.md
```

### Key Component Specs

#### ConfigLayout.tsx

```typescript
interface ConfigLayoutProps {
  children: React.ReactNode;
}

// Features:
// - Responsive sidebar (collapsible on mobile)
// - Header with user info and logout
// - Breadcrumb navigation
// - Toast notification container
```

#### SystemConfigForm.tsx

```typescript
interface SystemConfigFormProps {
  initialData?: SystemConfig;
  onSave: (data: SystemConfig) => Promise<void>;
  onCancel: () => void;
}

// Fields:
// - Identity: BBS name, sysop, location, phone, email
// - Security: Password policies, session settings
// - Display: ANSI, lines per screen
// - Network: Ports
// - File limits

// Features:
// - Client-side validation with Zod
// - Field-level error display
// - Unsaved changes warning
// - Reset to defaults button
// - Live preview of settings
```

#### DoorTable.tsx

```typescript
interface DoorTableProps {
  doors: Door[];
  onEdit: (door: Door) => void;
  onDelete: (door: Door) => void;
  onTest: (door: Door) => void;
}

// Features:
// - Sortable columns
// - Search/filter
// - Enable/disable toggle
// - Quick actions (edit, delete, test)
// - Pagination
// - Bulk actions (enable/disable multiple)
```

#### DoorForm.tsx

```typescript
interface DoorFormProps {
  initialData?: Door;
  onSave: (data: Door) => Promise<void>;
  onCancel: () => void;
}

// Fields:
// - Identity: Command, name, description
// - Execution: Type, location, priority
// - Access: Security level, password
// - Options: Parameters, multinode, enabled

// Features:
// - Type-specific fields (show/hide based on type)
// - Path browser for location
// - Test button (executes door)
// - Command preview
```

---

## Security Model

### Authentication

**JWT Token-Based:**
- Login generates JWT with user info + sysop flag
- Token stored in localStorage
- Token sent in Authorization header
- Token expires after 24 hours

**Middleware:**
```typescript
export const ensureSysop = (req: Request, res: Response, next: NextFunction) => {
  // 1. Extract JWT from Authorization header
  // 2. Verify JWT signature
  // 3. Check user exists and is sysop (secLevel >= 200)
  // 4. Attach user to req.user
  // 5. Continue or return 403
};
```

### Authorization

**Sysop-Only Access:**
- All `/api/config/*` endpoints require sysop
- Security level check: `secLevel >= 200`
- Non-sysops get 403 Forbidden

**Role Hierarchy:**
- Sysop (200): Full config access
- Co-Sysop (150): Read-only config access (future)
- User (<150): No config access

### Input Validation

**Server-Side Validation (Zod):**
```typescript
const SystemConfigSchema = z.object({
  bbs_name: z.string().min(1).max(100),
  sysop_name: z.string().min(1).max(50),
  min_password_length: z.number().int().min(0).max(32),
  min_password_strength: z.number().int().min(0).max(4),
  // ... all fields with constraints
});

export const validateSystemConfig = (req: Request, res: Response, next: NextFunction) => {
  try {
    const validated = SystemConfigSchema.parse(req.body);
    req.body = validated;
    next();
  } catch (error) {
    res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid input',
        details: error.errors
      }
    });
  }
};
```

**Client-Side Validation (Zod + React Hook Form):**
```typescript
const form = useForm<SystemConfig>({
  resolver: zodResolver(SystemConfigSchema),
  defaultValues: initialData
});

// Validation happens on blur and submit
// Real-time error messages displayed
```

### Audit Logging

**Track All Changes:**
```typescript
export const auditLog = async (
  tableName: string,
  recordId: string,
  action: 'CREATE' | 'UPDATE' | 'DELETE',
  oldValue: any,
  newValue: any,
  userId: string,
  username: string
) => {
  await db.run(`
    INSERT INTO config_audit_log
    (table_name, record_id, action, old_record, new_record, user_id, username)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `, [
    tableName,
    recordId,
    action,
    JSON.stringify(oldValue),
    JSON.stringify(newValue),
    userId,
    username
  ]);
};
```

**Audit Log Middleware:**
```typescript
export const auditMiddleware = (tableName: string) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    // Capture old state before change
    const oldState = await fetchCurrentState(tableName, req.params.id);

    // Store in res.locals for post-response logging
    res.locals.oldState = oldState;
    res.locals.tableName = tableName;

    next();
  };
};
```

### SQL Injection Prevention

**Prepared Statements Only:**
```typescript
// GOOD - Uses prepared statement
db.prepare('SELECT * FROM users WHERE id = ?').get(userId);

// BAD - Never do this
db.prepare(`SELECT * FROM users WHERE id = ${userId}`).get();
```

### XSS Prevention

**React Auto-Escapes:**
- React automatically escapes all output
- Use `dangerouslySetInnerHTML` only when necessary
- Sanitize HTML input on backend

### CSRF Protection

**SameSite Cookies:**
```typescript
res.cookie('jwt', token, {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict'
});
```

---

## Implementation Phases

### Phase 1: Backend Foundation (Weeks 1-2)

#### Week 1: Database & Core Services

**Tasks:**
1. Create database migration file
   - Add 8 new configuration tables
   - Add triggers for timestamps
   - Insert default data
2. Create `ConfigRepository.ts`
   - CRUD methods for all tables
   - Transaction support
   - Error handling
3. Create `ConfigService.ts`
   - Business logic layer
   - Validation
   - Audit logging
4. Write unit tests (100% coverage)

**Deliverables:**
- `migrations/add-config-tables.sql`
- `repositories/config-repository.ts`
- `services/config.service.ts`
- Unit tests

#### Week 2: API Layer

**Tasks:**
1. Create `config-routes.ts`
   - All GET/PUT/POST/DELETE endpoints
   - Middleware integration
2. Create middleware
   - `ensureSysop()` - Auth check
   - `validateConfig()` - Input validation
   - `auditMiddleware()` - Change tracking
3. Create validation schemas (Zod)
4. Write integration tests
5. Generate API documentation (Swagger)

**Deliverables:**
- `api/config-routes.ts`
- `middleware/config-middleware.ts`
- `validation/config-schemas.ts`
- Integration tests
- Swagger documentation

**Testing Checklist:**
- [ ] All endpoints return 403 for non-sysops
- [ ] All endpoints validate input
- [ ] All changes are audit logged
- [ ] Transactions rollback on error
- [ ] Database constraints enforced
- [ ] API docs generated

---

### Phase 2: Extended Configuration (Weeks 3-4)

#### Week 3: Advanced Features

**Tasks:**
1. Implement import/export
   - Export to JSON
   - Import from JSON
   - Validation on import
2. Implement backup/restore
   - Create backup
   - List backups
   - Restore from backup
3. Implement cache management
   - Configuration caching
   - Cache invalidation
   - Clear cache endpoint
4. Write tests for new features

**Deliverables:**
- Import/export functionality
- Backup/restore system
- Cache management
- Tests

#### Week 4: Edge Cases & Polish

**Tasks:**
1. Handle edge cases
   - Concurrent modifications
   - Database constraints violations
   - Network errors
2. Performance optimization
   - Add database indexes
   - Query optimization
   - Response caching
3. Security hardening
   - Rate limiting
   - Input sanitization
   - Error message sanitization
4. Complete test coverage

**Deliverables:**
- Edge case handling
- Performance improvements
- Security enhancements
- 100% test coverage

**Testing Checklist:**
- [ ] Import validates all data
- [ ] Export includes all config
- [ ] Backup restores correctly
- [ ] Cache invalidates properly
- [ ] Performance meets SLA (<200ms)
- [ ] Security audit passes

---

### Phase 3: React Configuration App (Weeks 5-8)

#### Week 5: Project Setup & Design System

**Tasks:**
1. Initialize React project
   - Vite setup
   - TypeScript configuration
   - Tailwind CSS setup
2. Create design system
   - Match SDK preview styling
   - Create shared components
   - Set up theming
3. Set up routing
   - React Router configuration
   - Protected routes
   - 404 handling
4. Set up API client
   - TanStack Query setup
   - API service layer
   - Error handling

**Deliverables:**
- React project scaffolding
- Shared components library
- Routing configuration
- API client setup

#### Week 6: Core Pages

**Tasks:**
1. Implement Dashboard page
   - System overview
   - Recent activity
   - Quick stats
   - Quick actions
2. Implement System Config page
   - System config form
   - Save/reset functionality
   - Validation
3. Implement Node Management page
   - Node list table
   - Node detail forms
   - Enable/disable toggles
4. Write component tests

**Deliverables:**
- Dashboard page
- System Config page
- Node Management page
- Component tests

#### Week 7: Entity Management Pages

**Tasks:**
1. Implement Conferences page
   - Conference list
   - Conference detail
   - Message base management
   - File area management
2. Implement Doors page
   - Door list table
   - Door detail form
   - Test execution
   - Log viewer
3. Implement Languages page
   - Language list
   - Host language setting
   - Add/edit/delete
4. Implement Protocols page
5. Write component tests

**Deliverables:**
- Conferences page
- Doors page
- Languages page
- Protocols page
- Component tests

#### Week 8: Advanced Features & Polish

**Tasks:**
1. Implement import/export UI
   - Export button
   - Import upload
   - Preview before import
2. Implement audit log viewer
   - Change history table
   - Filters
   - User/date filters
3. Implement search & filters
   - Global search
   - Per-table filters
   - Saved filters
4. Add keyboard shortcuts
5. Add accessibility features
6. Write E2E tests

**Deliverables:**
- Import/Export UI
- Audit log viewer
- Search & filters
- Keyboard shortcuts
- Accessibility features
- E2E tests

**Testing Checklist:**
- [ ] All pages render correctly
- [ ] All forms validate
- [ ] All API calls work
- [ ] Error states display
- [ ] Loading states display
- [ ] Keyboard navigation works
- [ ] Screen reader compatible
- [ ] Mobile responsive
- [ ] Cross-browser tested
- [ ] E2E tests passing

---

### Phase 4: Testing & Production Readiness (Week 9)

#### Week 9: Final Testing & Launch

**Tasks:**
1. Feature parity verification
   - Compare vs original ToolTypes
   - Check every setting
   - Verify workflows
2. Security audit
   - Penetration testing
   - Authentication testing
   - Authorization testing
   - Input validation testing
3. Performance testing
   - Load testing
   - Stress testing
   - API response times
   - Page load times
4. Accessibility audit
   - WCAG 2.1 Level AA compliance
   - Screen reader testing
   - Keyboard navigation
5. Documentation
   - User guide
   - Sysop guide
   - API documentation
   - Developer documentation
6. Deployment preparation
   - Build optimization
   - Environment configuration
   - Deployment scripts

**Deliverables:**
- Feature parity report
- Security audit report
- Performance benchmarks
- Accessibility audit report
- Complete documentation
- Production build
- Deployment guide

**Final Checklist:**
- [ ] All ToolType settings configurable
- [ ] Zero TypeScript errors
- [ ] Zero ESLint warnings
- [ ] 100% test coverage (backend)
- [ ] >80% test coverage (frontend)
- [ ] Security audit passed
- [ ] Performance SLA met (<200ms API, <2s page load)
- [ ] Accessibility WCAG 2.1 AA compliant
- [ ] Documentation complete
- [ ] Production build tested
- [ ] Deployment procedure documented

---

## Testing Strategy

### Unit Tests (Jest)

**Backend Coverage:** 100%

**Test Categories:**
- Database operations (CRUD)
- Service methods (business logic)
- Validation schemas
- Utility functions

**Example:**
```typescript
describe('ConfigService', () => {
  describe('getSystemConfig', () => {
    it('should return system config', async () => {
      const config = await configService.getSystemConfig();
      expect(config).toBeDefined();
      expect(config.id).toBe(1);
      expect(config.bbs_name).toBeDefined();
    });

    it('should create default config if missing', async () => {
      await db.run('DELETE FROM system_config');
      const config = await configService.getSystemConfig();
      expect(config).toBeDefined();
      expect(config.bbs_name).toBe('AmiExpress BBS');
    });
  });

  describe('updateSystemConfig', () => {
    it('should update system config', async () => {
      const updated = await configService.updateSystemConfig({
        bbs_name: 'New Name'
      });
      expect(updated.bbs_name).toBe('New Name');
    });

    it('should validate input', async () => {
      await expect(
        configService.updateSystemConfig({
          min_password_length: -1
        })
      ).rejects.toThrow('Invalid password length');
    });

    it('should audit log changes', async () => {
      await configService.updateSystemConfig({
        bbs_name: 'New Name'
      }, 'user123', 'admin');

      const logs = await db.query(
        'SELECT * FROM config_audit_log WHERE table_name = ?',
        ['system_config']
      );
      expect(logs.rows).toHaveLength(1);
    });
  });
});
```

### Integration Tests (Supertest)

**Backend Coverage:** All API endpoints

**Test Categories:**
- Full CRUD workflows
- Authentication/authorization
- Validation errors
- Error handling
- Transaction rollbacks

**Example:**
```typescript
describe('POST /api/config/doors', () => {
  it('should create door (sysop)', async () => {
    const response = await request(app)
      .post('/api/config/doors')
      .set('Authorization', `Bearer ${sysopToken}`)
      .send({
        bbs_cmd: 'TESTDOOR',
        name: 'Test Door',
        type: 'TS',
        location: 'doors/test',
        priority: 'BBSCMD'
      });

    expect(response.status).toBe(201);
    expect(response.body.success).toBe(true);
    expect(response.body.data.bbs_cmd).toBe('TESTDOOR');
  });

  it('should return 403 for non-sysop', async () => {
    const response = await request(app)
      .post('/api/config/doors')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ /* ... */ });

    expect(response.status).toBe(403);
  });

  it('should validate input', async () => {
    const response = await request(app)
      .post('/api/config/doors')
      .set('Authorization', `Bearer ${sysopToken}`)
      .send({
        bbs_cmd: '',  // Invalid
        name: 'Test Door'
      });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });
});
```

### Component Tests (Vitest + React Testing Library)

**Frontend Coverage:** >80%

**Test Categories:**
- Component rendering
- User interactions
- Form validation
- API integration (mocked)
- Error states
- Loading states

**Example:**
```typescript
describe('SystemConfigForm', () => {
  it('should render form fields', () => {
    render(<SystemConfigForm onSave={jest.fn()} onCancel={jest.fn()} />);

    expect(screen.getByLabelText('BBS Name')).toBeInTheDocument();
    expect(screen.getByLabelText('Sysop Name')).toBeInTheDocument();
  });

  it('should validate required fields', async () => {
    const onSave = jest.fn();
    render(<SystemConfigForm onSave={onSave} onCancel={jest.fn()} />);

    const saveButton = screen.getByText('Save');
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(screen.getByText('BBS Name is required')).toBeInTheDocument();
    });
    expect(onSave).not.toHaveBeenCalled();
  });

  it('should call onSave with valid data', async () => {
    const onSave = jest.fn().mockResolvedValue(undefined);
    render(<SystemConfigForm onSave={onSave} onCancel={jest.fn()} />);

    fireEvent.change(screen.getByLabelText('BBS Name'), {
      target: { value: 'My BBS' }
    });
    fireEvent.change(screen.getByLabelText('Sysop Name'), {
      target: { value: 'Admin' }
    });

    fireEvent.click(screen.getByText('Save'));

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith(
        expect.objectContaining({
          bbs_name: 'My BBS',
          sysop_name: 'Admin'
        })
      );
    });
  });
});
```

### E2E Tests (Playwright)

**Frontend Coverage:** All user workflows

**Test Scenarios:**
- Complete configuration workflows
- Import/export
- Multi-user scenarios
- Error recovery

**Example:**
```typescript
test('complete door configuration workflow', async ({ page }) => {
  // Login as sysop
  await page.goto('http://localhost:5174/login');
  await page.fill('[name=username]', 'sysop');
  await page.fill('[name=password]', 'password');
  await page.click('button[type=submit]');

  // Navigate to doors page
  await page.click('text=Doors');
  await expect(page).toHaveURL(/.*doors/);

  // Create new door
  await page.click('text=Add Door');
  await page.fill('[name=bbs_cmd]', 'TESTDOOR');
  await page.fill('[name=name]', 'Test Door');
  await page.selectOption('[name=type]', 'TS');
  await page.fill('[name=location]', 'doors/test');
  await page.click('button:has-text("Save")');

  // Verify door created
  await expect(page.locator('text=Door created')).toBeVisible();
  await expect(page.locator('text=TESTDOOR')).toBeVisible();

  // Edit door
  await page.click('text=TESTDOOR');
  await page.click('button:has-text("Edit")');
  await page.fill('[name=access]', '10');
  await page.click('button:has-text("Save")');

  // Verify door updated
  await expect(page.locator('text=Door updated')).toBeVisible();

  // Delete door
  await page.click('button:has-text("Delete")');
  await page.click('button:has-text("Confirm")');

  // Verify door deleted
  await expect(page.locator('text=Door deleted')).toBeVisible();
  await expect(page.locator('text=TESTDOOR')).not.toBeVisible();
});
```

---

## Success Criteria

### Functional Requirements

- [ ] All 8 configuration categories implemented
- [ ] All ToolType settings configurable
- [ ] Import/export working
- [ ] Backup/restore working
- [ ] Audit logging complete
- [ ] No hardcoded configuration
- [ ] Real-time validation
- [ ] Proper error handling

### Technical Requirements

- [ ] Zero TypeScript errors
- [ ] Zero ESLint warnings
- [ ] 100% backend test coverage
- [ ] >80% frontend test coverage
- [ ] All E2E tests passing
- [ ] API response time <200ms (p95)
- [ ] Page load time <2s (p95)
- [ ] Database queries optimized

### Security Requirements

- [ ] Sysop-only access enforced
- [ ] All inputs validated (client + server)
- [ ] SQL injection prevented
- [ ] XSS prevented
- [ ] CSRF protection enabled
- [ ] Audit logging working
- [ ] Security audit passed

### UX Requirements

- [ ] Matches SDK preview design
- [ ] Loading states everywhere
- [ ] Error messages clear
- [ ] Confirmation dialogs appropriate
- [ ] Keyboard navigation works
- [ ] Mobile responsive
- [ ] WCAG 2.1 AA compliant
- [ ] Unsaved changes warnings

### Documentation Requirements

- [ ] User guide complete
- [ ] Sysop guide complete
- [ ] API documentation generated
- [ ] Developer documentation complete
- [ ] Inline code documentation
- [ ] Deployment guide complete

---

## Risk Mitigation

### High-Risk Items

**Risk:** Database migration fails on production
**Mitigation:**
- Test migration on copy of production DB
- Create backup before migration
- Rollback procedure documented
- Default values for all new columns

**Risk:** Breaking changes to existing API
**Mitigation:**
- Version API endpoints (`/api/v1/config`)
- Maintain backward compatibility
- Gradual rollout
- Feature flags

**Risk:** Performance degradation with many config changes
**Mitigation:**
- Add database indexes
- Implement caching
- Optimize queries
- Load testing before launch

### Medium-Risk Items

**Risk:** Concurrent modifications cause conflicts
**Mitigation:**
- Optimistic locking (version numbers)
- Last-write-wins strategy
- Conflict detection
- User notification

**Risk:** Import overwrites critical settings
**Mitigation:**
- Preview before import
- Require confirmation
- Create automatic backup
- Rollback capability

**Risk:** Complex forms confuse users
**Mitigation:**
- Progressive disclosure
- Help text for all fields
- Field-level documentation
- Example values

---

## Deployment Strategy

### Development Environment

```bash
# Backend
cd web/backend
npm install
npm run dev  # Port 3001

# Frontend
cd web/frontend
npm install
npm run dev  # Port 5173

# Config App
cd web/config-app
npm install
npm run dev  # Port 5174
```

### Production Build

```bash
# Backend - no build needed (TypeScript compiled on-the-fly)
cd web/backend
npm install --production

# Config App
cd web/config-app
npm run build  # Outputs to dist/
```

### Production Deployment

**Option 1: Serve config app from backend**
```bash
# Copy config app build to backend public directory
cp -r web/config-app/dist web/backend/public/config

# Backend serves at /config/
# Access at: http://localhost:3001/config/
```

**Option 2: Separate deployment**
```bash
# Config app on separate port/domain
# Requires CORS configuration
# Access at: http://config.yourbbs.com/
```

### Environment Variables

```bash
# Backend .env
NODE_ENV=production
DATABASE_DIR=./data
DATABASE_FILE=amiexpress.db
JWT_SECRET=<your-secret>
PORT=3001
CORS_ORIGIN=http://config.yourbbs.com

# Config App .env
VITE_API_URL=http://localhost:3001
VITE_APP_NAME=AmiExpress Configuration
```

---

## Maintenance & Future Enhancements

### Ongoing Maintenance

**Weekly:**
- Review audit logs
- Check for failed configs
- Monitor performance metrics

**Monthly:**
- Database backup
- Security patches
- Dependency updates

**Quarterly:**
- Security audit
- Performance review
- User feedback review

### Future Enhancements

**Phase 2 (Post-Launch):**
- Role-based access (co-sysop read-only)
- Configuration templates
- Bulk operations
- Advanced search
- Configuration comparison (diff)
- Schedule changes (effective date)

**Phase 3 (Advanced):**
- Multi-tenant support
- Configuration inheritance
- A/B testing configurations
- Configuration versioning (git-like)
- API webhooks for changes
- GraphQL API

---

## Conclusion

This implementation plan provides a comprehensive roadmap for building a production-ready React configuration application for AmiExpress BBS with 1:1 feature parity to the original Amiga ToolType system.

**Total Timeline:** 9 weeks
**Total Effort:** ~360 hours (1 developer full-time)

**Key Milestones:**
- Week 2: Backend API complete
- Week 4: Extended features complete
- Week 8: React app complete
- Week 9: Production ready

**Next Steps:**
1. ✅ Review and approve this plan
2. ⏳ Create database migration
3. ⏳ Implement Phase 1 (Backend)
4. ⏳ Implement Phase 2 (Extended)
5. ⏳ Implement Phase 3 (React App)
6. ⏳ Implement Phase 4 (Testing & Launch)

---

**Document Status:** COMPLETE - Ready for implementation
**Last Updated:** 2025-11-12
**Approval Required:** Yes
**Next Action:** Begin Phase 1 - Week 1 implementation
