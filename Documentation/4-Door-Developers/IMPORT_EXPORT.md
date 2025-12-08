# Amiga AmiExpress BBS Import/Export Implementation Plan

## Executive Summary

Implement full import/export functionality for Amiga AmiExpress BBS systems, enabling migration of complete BBS installations (users, conferences, messages, files, settings) between Amiga hardware and AmiExpress-Web.

**Reference Data**: `~/Downloads/BBS_COPY/` (reference-boardBBS - Real Production Amiga BBS)

---

## Data Structure Research (reference-boardBBS Analysis)

### Root Level Files

```
User.data           - User account records (464 bytes, binary struct)
User.keys           - User index/keys (112 bytes)
user.misc           - Extended user data (134KB, variable records)
acp.dat             - ACP (Amiga Control Panel) configuration
acpConnections.dat  - Network connections data
bbsConfig.info      - System configuration (Amiga .info format with key=value pairs)
batch0-batch6       - Batch upload/download queues
BBSHelp.txt         - Help text files
```

### Directory Structure

```
/Conf1-Conf14/          - Conference directories
  ├── Conf.DB           - Conference database (binary, 74KB in Conf1)
  ├── Menu.txt          - Conference menu
  ├── Dir0-Dir2         - File area directories
  ├── Dir0-Dir2.info    - File area metadata
  ├── MsgBase/          - Message base storage
  ├── Hold/             - Held files
  ├── Upload/           - Upload staging
  └── PartUpload/       - Partial uploads

/Node0-Node5/           - Node-specific data
  ├── CallersLog        - Caller history (binary, 123KB)
  ├── DoorLog           - Door execution log
  ├── ErrorLog          - Node error log
  ├── Answers           - User answers/responses (7MB)
  ├── PlayPen/          - Temporary node files
  ├── Modem/            - Modem configurations
  └── NRAMS/            - Node RAM settings

/Commands/              - Command/Door definitions
  ├── BBSCmd/           - BBS commands (.info files)
  ├── SysCmd/           - System commands
  ├── Conf*Cmd/         - Conference-specific commands
  └── Node*Cmd/         - Node-specific commands

/Access/                - Security/Access control
  ├── ACS.10.info       - Access level 10 (new users)
  ├── ACS.20.info       - Access level 20
  ├── ACS.50.info       - Access level 50
  ├── ACS.255.info      - Access level 255 (sysop)
  ├── AREA.*.info       - Area access presets
  └── PRESET.*.info     - User presets

/Bulletins/             - System bulletins
/Screens/               - ANSI/ASCII screens
/AmiXnet/               - Networking stack data
/AmiTCP/                - TCP/IP stack data
```

### Key File Formats

**1. User.data Structure** (See `UserDatabaseManager.ts`)
- Binary struct, fixed size per user
- Fields: username, passwordhash, realname, location, phone, email, security level, stats, etc.
- Already implemented in `UserDatabaseManager.userToStruct()`

**2. Conf.DB Structure**
- Binary database of conference settings
- Per-conference metadata, access levels, settings
- Needs reverse engineering or documentation lookup

**3. .info Files**
- Amiga Workbench icon/metadata format
- Contains binary icon data + embedded text configuration
- Format: Binary header + icon bitmap + tool types (key=value strings)
- Example from bbsConfig.info: `REGKEY=`, `SMTP_HOST=`, `FTPPORT=`, etc.

**4. Archive Formats**
- LHA (.lha) - Most common Amiga compression
- LZX (.lzx) - Advanced Amiga compression
- ZIP (.zip) - Cross-platform compatibility

---

## Phase 1: Foundation & Research

### Goals
- Extract and document all Amiga binary file formats
- Create TypeScript interfaces for all data structures
- Implement archive handling (LHA/LZX/ZIP)

### Todo List

- [ ] **1.1: Install Archive Utilities**
  - Install Node.js LHA extraction library (`node-lha` or native bindings)
  - Install LZX extraction library (may need WebAssembly or native)
  - Install ZIP extraction library (`adm-zip` or `yauzl`)
  - Create unified ArchiveExtractor service

- [ ] **1.2: Document Conf.DB Format**
  - Extract Conf.DB from all 14 conferences in reference-boardBBS
  - Analyze binary structure with hex editor
  - Compare differences between conferences
  - Create TypeScript interface `ConferenceDatabase`
  - Document field offsets, sizes, and types

- [ ] **1.3: Document .info File Format**
  - Research Amiga .info file specification (IFF ICON format)
  - Implement InfoFileParser class
  - Extract tool types (key=value pairs) from binary
  - Parse icon bitmap data (optional for display)
  - Test with bbsConfig.info, command .info files, access .info files

- [ ] **1.4: Document CallersLog Format**
  - Analyze Node1/CallersLog binary structure
  - Create TypeScript interface `CallersLogEntry`
  - Compare with existing `CallersLogManager.ts` implementation
  - Document record size and field layout

- [ ] **1.5: Document Message Base Format**
  - Analyze Conf1/MsgBase/* files
  - Document message header structure
  - Document message body storage
  - Create TypeScript interfaces for message data

- [ ] **1.6: Create Data Structure Interfaces**
  ```typescript
  // web/backend/src/types/amiga-import.ts
  interface AmigaBBSArchive {
    users: AmigaUserData[];
    conferences: AmigaConference[];
    nodes: AmigaNodeData[];
    commands: AmigaCommand[];
    access: AmigaAccessLevel[];
    config: AmigaBBSConfig;
    bulletins: AmigaBulletin[];
    screens: AmigaScreen[];
  }

  interface AmigaConference {
    id: number;
    name: string;
    database: ConferenceDatabase;
    messageBases: MessageBase[];
    fileAreas: FileArea[];
    menu: string;
  }

  interface ConferenceDatabase {
    // Extracted from Conf.DB binary
    conferenceNumber: number;
    conferenceName: string;
    accessLevel: number;
    flags: number;
    // ... other fields
  }

  interface AmigaBBSConfig {
    regKey: string;
    smtpHost?: string;
    smtpPort?: number;
    smtpUsername?: string;
    ftpPort?: number;
    ftpHost?: string;
    passwordSecurity: 'LEGACY' | 'BCRYPT';
    // ... all config keys from bbsConfig.info
  }
  ```

---

## Phase 2: Import Infrastructure

### Goals
- Build backend services for parsing Amiga files
- Create import pipeline for each data type
- Implement conflict resolution strategies

### Todo List

- [ ] **2.1: Create Archive Service**
  ```typescript
  // web/backend/src/services/archive.service.ts
  class ArchiveService {
    async extractArchive(filePath: string, format: 'lha' | 'lzx' | 'zip'): Promise<string>;
    async validateArchive(filePath: string): Promise<boolean>;
    async detectFormat(filePath: string): Promise<'lha' | 'lzx' | 'zip' | 'unknown'>;
  }
  ```

- [ ] **2.2: Create Amiga File Parser Service**
  ```typescript
  // web/backend/src/services/amiga-parser.service.ts
  class AmigaParserService {
    parseInfoFile(buffer: Buffer): { toolTypes: Map<string, string>; icon?: Buffer };
    parseUserData(buffer: Buffer): AmigaUserData[];
    parseUserKeys(buffer: Buffer): AmigaUserKey[];
    parseUserMisc(buffer: Buffer): AmigaUserMisc[];
    parseConferenceDB(buffer: Buffer): ConferenceDatabase;
    parseCallersLog(buffer: Buffer): CallersLogEntry[];
    parseMessageBase(dir: string): MessageBase;
  }
  ```

- [ ] **2.3: Create Import Validation Service**
  ```typescript
  // web/backend/src/services/import-validation.service.ts
  class ImportValidationService {
    validateUsers(users: AmigaUserData[]): ValidationResult;
    validateConferences(conferences: AmigaConference[]): ValidationResult;
    validateConfig(config: AmigaBBSConfig): ValidationResult;
    checkConflicts(existingData: any, importData: any): ConflictReport;
  }
  ```

- [ ] **2.4: Create Import Mapping Service**
  ```typescript
  // web/backend/src/services/import-mapping.service.ts
  class ImportMappingService {
    mapAmigaUserToModern(amigaUser: AmigaUserData): User;
    mapAmigaConferenceToModern(amigaConf: AmigaConference): Conference;
    mapAmigaAccessToModern(amigaAccess: AmigaAccessLevel): SecurityLevel;
    mapAmigaConfigToModern(amigaConfig: AmigaBBSConfig): SystemConfig;
  }
  ```

- [ ] **2.5: Create Import Transaction Service**
  ```typescript
  // web/backend/src/services/import-transaction.service.ts
  class ImportTransactionService {
    async beginImport(): Promise<ImportSession>;
    async commitImport(session: ImportSession): Promise<void>;
    async rollbackImport(session: ImportSession): Promise<void>;
    async importUsers(session: ImportSession, users: User[]): Promise<void>;
    async importConferences(session: ImportSession, confs: Conference[]): Promise<void>;
  }
  ```

- [ ] **2.6: Implement User Import**
  - Parse User.data, User.keys, user.misc
  - Map Amiga user fields to TypeScript User interface
  - Handle password hash migration (LEGACY → bcrypt option)
  - Preserve user stats, upload/download counts
  - Handle duplicate username conflicts
  - Sync to node files and SQLite

- [ ] **2.7: Implement Conference Import**
  - Parse Conf.DB for each conference
  - Create conference records in SQLite
  - Import conference menus (Menu.txt)
  - Map file areas (Dir0-Dir2)
  - Handle conference access levels
  - Preserve conference settings and flags

- [ ] **2.8: Implement Message Base Import**
  - Parse message headers from MsgBase/
  - Import message bodies
  - Preserve message metadata (from, to, date, subject)
  - Handle message threading/replies
  - Import into TypeScript message storage

- [ ] **2.9: Implement Node Data Import**
  - Parse CallersLog from each node
  - Import caller history
  - Preserve door logs
  - Import node-specific settings

- [ ] **2.10: Implement Command/Door Import**
  - Parse .info files from Commands/BBSCmd/
  - Extract command metadata and settings
  - Map to TypeScript command definitions
  - Handle door configurations
  - Import access restrictions

- [ ] **2.11: Implement Access Level Import**
  - Parse ACS.*.info files
  - Map Amiga security levels to TypeScript
  - Import area access presets
  - Preserve user presets

- [ ] **2.12: Implement Configuration Import**
  - Parse bbsConfig.info tool types
  - Map to TypeScript config system
  - Handle email/SMTP settings
  - Handle FTP settings
  - Preserve registration key

---

## Phase 3: Export Infrastructure

### Goals
- Build services for generating Amiga-compatible files
- Create export pipeline for each data type
- Generate importable archives

### Todo List

- [ ] **3.1: Create Amiga File Writer Service**
  ```typescript
  // web/backend/src/services/amiga-writer.service.ts
  class AmigaWriterService {
    writeInfoFile(toolTypes: Map<string, string>, icon?: Buffer): Buffer;
    writeUserData(users: User[]): Buffer;
    writeUserKeys(users: User[]): Buffer;
    writeUserMisc(users: User[]): Buffer;
    writeConferenceDB(conf: Conference): Buffer;
    writeCallersLog(entries: CallersLogEntry[]): Buffer;
  }
  ```

- [ ] **3.2: Create Export Mapping Service**
  ```typescript
  // web/backend/src/services/export-mapping.service.ts
  class ExportMappingService {
    mapModernUserToAmiga(user: User): AmigaUserData;
    mapModernConferenceToAmiga(conf: Conference): AmigaConference;
    mapModernAccessToAmiga(level: SecurityLevel): AmigaAccessLevel;
    mapModernConfigToAmiga(config: SystemConfig): AmigaBBSConfig;
  }
  ```

- [ ] **3.3: Create Archive Builder Service**
  ```typescript
  // web/backend/src/services/archive-builder.service.ts
  class ArchiveBuilderService {
    async createLHA(files: Map<string, Buffer>): Promise<Buffer>;
    async createLZX(files: Map<string, Buffer>): Promise<Buffer>;
    async createZIP(files: Map<string, Buffer>): Promise<Buffer>;
  }
  ```

- [ ] **3.4: Implement User Export**
  - Generate User.data from SQLite users
  - Generate User.keys index
  - Generate user.misc extended data
  - Preserve Amiga binary format compatibility

- [ ] **3.5: Implement Conference Export**
  - Generate Conf.DB for each conference
  - Export conference menus
  - Export file area definitions
  - Preserve conference structure

- [ ] **3.6: Implement Message Base Export**
  - Generate Amiga-compatible message headers
  - Export message bodies
  - Preserve message threading
  - Create MsgBase/ directory structure

- [ ] **3.7: Implement Node Data Export**
  - Generate CallersLog files
  - Export door logs
  - Create node directory structure

- [ ] **3.8: Implement Command/Door Export**
  - Generate .info files for commands
  - Export door configurations
  - Create Commands/ directory structure

- [ ] **3.9: Implement Access Level Export**
  - Generate ACS.*.info files
  - Export area access presets
  - Create Access/ directory

- [ ] **3.10: Implement Configuration Export**
  - Generate bbsConfig.info with tool types
  - Export system settings
  - Preserve registration key

- [ ] **3.11: Implement Full Archive Export**
  - Combine all exported data
  - Create complete BBS directory structure
  - Generate LHA/LZX/ZIP archive
  - Validate archive integrity

---

## Phase 4: Admin UI Integration

### Goals
- Add import/export to admin config app
- Provide progress tracking and error handling
- Enable conflict resolution UI

### Todo List

- [ ] **4.1: Create Import API Endpoints**
  ```typescript
  // web/backend/src/api/import-routes.ts
  POST   /api/import/upload          - Upload archive file
  POST   /api/import/validate        - Validate archive contents
  POST   /api/import/preview         - Preview import changes
  POST   /api/import/execute         - Execute import
  GET    /api/import/status/:id      - Check import progress
  POST   /api/import/resolve/:id     - Resolve conflicts
  DELETE /api/import/cancel/:id      - Cancel import
  ```

- [ ] **4.2: Create Export API Endpoints**
  ```typescript
  // web/backend/src/api/export-routes.ts
  POST   /api/export/create          - Create export job
  GET    /api/export/status/:id      - Check export progress
  GET    /api/export/download/:id    - Download archive
  DELETE /api/export/cancel/:id      - Cancel export
  ```

- [ ] **4.3: Create Import Page Component**
  ```typescript
  // web/config-app/src/pages/ImportExportPage.tsx
  - File upload dropzone (drag & drop)
  - Format detection (LHA/LZX/ZIP)
  - Validation results display
  - Conflict resolution interface
  - Preview changes before import
  - Progress bar during import
  - Error reporting
  ```

- [ ] **4.4: Create Export Configuration Component**
  ```typescript
  - Select data to export (users, conferences, messages, etc.)
  - Choose archive format (LHA/LZX/ZIP)
  - Set export options
  - Progress bar during export
  - Download button when complete
  ```

- [ ] **4.5: Create Conflict Resolution UI**
  ```typescript
  - Display conflicting records
  - Show side-by-side comparison
  - Provide resolution options:
    - Keep existing
    - Replace with import
    - Merge (where applicable)
    - Rename (for usernames)
  ```

- [ ] **4.6: Create Import Preview Component**
  ```typescript
  - Show summary of changes
  - Display new users count
  - Display new conferences count
  - Show configuration changes
  - List conflicts requiring resolution
  ```

- [ ] **4.7: Add Progress Tracking**
  - WebSocket connection for real-time progress
  - Progress percentage
  - Current operation display
  - Estimated time remaining
  - Cancel button

---

## Phase 5: Testing & Validation

### Goals
- Test with real Amiga BBS data
- Validate round-trip import/export
- Ensure data integrity

### Todo List

- [ ] **5.1: Test User Import/Export**
  - Import reference-boardBBS User.data
  - Validate all user fields
  - Export users to Amiga format
  - Compare original vs exported files
  - Test password hash preservation

- [ ] **5.2: Test Conference Import/Export**
  - Import all 14 conferences from reference-boardBBS
  - Validate conference settings
  - Test message base import
  - Test file area import
  - Export conferences
  - Compare original vs exported

- [ ] **5.3: Test Archive Handling**
  - Create test archives in LHA format
  - Create test archives in LZX format
  - Create test archives in ZIP format
  - Test extraction of each format
  - Test archive creation
  - Validate archive integrity

- [ ] **5.4: Test Conflict Resolution**
  - Import data with existing users
  - Test username conflict resolution
  - Test conference conflict resolution
  - Test merge scenarios
  - Validate rollback functionality

- [ ] **5.5: Test Full Import Workflow**
  - Upload reference-boardBBS archive
  - Validate archive
  - Preview import
  - Resolve conflicts
  - Execute import
  - Verify data integrity
  - Test BBS functionality with imported data

- [ ] **5.6: Test Full Export Workflow**
  - Export complete BBS
  - Download archive
  - Extract on Amiga (or emulator)
  - Test BBS startup with exported data
  - Verify user login
  - Verify conference access
  - Verify message bases

- [ ] **5.7: Performance Testing**
  - Test import of large user databases (1000+ users)
  - Test import of large message bases (10000+ messages)
  - Measure import speed
  - Measure export speed
  - Optimize slow operations

---

## Phase 6: Documentation & Deployment

### Goals
- Document import/export procedures
- Create migration guides
- Deploy to production

### Todo List

- [ ] **6.1: Write User Documentation**
  - Create "Importing from Amiga" guide
  - Create "Exporting to Amiga" guide
  - Document conflict resolution
  - Add troubleshooting section
  - Create video tutorial (optional)

- [ ] **6.2: Write Developer Documentation**
  - Document Amiga file formats
  - Document import pipeline
  - Document export pipeline
  - Add API reference
  - Document extension points

- [ ] **6.3: Create Migration Examples**
  - Example: Migrate from Amiga to AmiExpress-Web
  - Example: Sync between Amiga and Web
  - Example: Backup Amiga BBS to Web
  - Example: Test setup on Web before Amiga deployment

- [ ] **6.4: Update Admin Guide**
  - Add import/export section
  - Document backup best practices
  - Add security considerations
  - Document data retention

- [ ] **6.5: Deploy to Staging**
  - Test on staging environment
  - Perform full import test
  - Perform full export test
  - Gather feedback

- [ ] **6.6: Deploy to Production**
  - Merge to main branch
  - Deploy backend changes
  - Deploy admin UI changes
  - Monitor for errors
  - Announce feature

---

## Technical Considerations

### 1. Archive Format Support

**LHA (.lha)**
- Most common Amiga compression
- Node library: `lha` or `node-lha`
- May need native bindings
- Fallback: Shell out to `lha` command-line tool

**LZX (.lzx)**
- Advanced Amiga compression
- Limited Node.js support
- May need WebAssembly implementation
- Fallback: Shell out to `unlzx` command-line tool

**ZIP (.zip)**
- Cross-platform standard
- Excellent Node.js support: `adm-zip`, `yauzl`
- Recommended for modern transfers

### 2. Binary File Parsing

**Endianness**
- Amiga is big-endian (Motorola 68000)
- Modern systems are little-endian (x86/ARM)
- Must swap byte order when reading/writing
- Use Buffer.readUInt32BE(), Buffer.writeUInt32BE()

**Struct Alignment**
- C structs may have padding
- Must match exact Amiga struct layout
- Document padding bytes
- Test on real Amiga data

**String Encoding**
- Amiga uses ISO-8859-1 (Latin-1)
- May encounter non-ASCII characters
- Convert to UTF-8 for storage
- Preserve original encoding on export

### 3. Data Migration Strategies

**Users**
- IMPORT: Map Amiga security levels (0-255) to TypeScript levels
- EXPORT: Reverse mapping with bounds checking
- CONFLICT: Usernames must be unique
  - Resolution: Append number (user → user2)
  - Or: Prompt sysop to merge/rename

**Conferences**
- IMPORT: Conferences 1-14 map to database records
- EXPORT: Renumber if needed
- CONFLICT: Conference names must be unique
  - Resolution: Rename imported conference

**Messages**
- IMPORT: Preserve original dates, authors
- EXPORT: Generate Amiga-compatible headers
- CONFLICT: Message IDs may overlap
  - Resolution: Renumber on import

**Passwords**
- LEGACY: Amiga used DES or simple hashing
- MODERN: We use bcrypt
- IMPORT: Option to rehash on first login
- EXPORT: Option to export with placeholder (force password reset)

### 4. Transaction Safety

**Import Rollback**
- All changes in transaction
- Rollback on error
- Backup database before import
- Provide undo functionality

**Export Validation**
- Validate generated files
- Check file sizes
- Test archive extraction
- Verify critical files present

### 5. Progress Tracking

**Backend**
- Use job queue (Bull, BullMQ)
- Store progress in Redis or database
- Emit progress events via WebSocket

**Frontend**
- Display percentage complete
- Show current operation
- Allow cancellation
- Show errors immediately

---

## Success Criteria

### Import Must Support
- [x] All user accounts with full stats
- [x] All conferences with settings
- [x] All message bases with threading
- [x] All file areas with metadata
- [x] All command definitions
- [x] All access levels and permissions
- [x] System configuration
- [x] Caller logs
- [x] Bulletins and screens

### Export Must Generate
- [x] Amiga-bootable BBS structure
- [x] Binary-compatible files
- [x] All user data preserved
- [x] All conferences intact
- [x] All messages readable
- [x] All commands functional
- [x] Valid LHA/LZX/ZIP archives

### Quality Requirements
- [x] Round-trip preservation: Import → Export → Import yields identical data
- [x] No data loss during import/export
- [x] Handles archives up to 1GB
- [x] Imports 1000 users in < 5 seconds
- [x] Exports complete BBS in < 30 seconds
- [x] Zero downtime during import (optional: pause logins)
- [x] Comprehensive error handling and reporting

---

## Dependencies

### Node.js Libraries
```json
{
  "lha": "^1.0.0",              // LHA extraction
  "unlzx": "^1.0.0",            // LZX extraction (or native)
  "adm-zip": "^0.5.10",         // ZIP handling
  "iconv-lite": "^0.6.3",       // Character encoding
  "bull": "^4.10.0",            // Job queue
  "socket.io": "^4.6.0"         // WebSocket for progress
}
```

### System Requirements
- Node.js 18+
- 2GB RAM minimum (for large archives)
- Temp storage: 3x archive size
- Optional: lha/unlzx command-line tools

---

## Risk Mitigation

### Data Corruption
- **Risk**: Import corrupts database
- **Mitigation**: Transaction rollback, pre-import backup, validation before commit

### Format Changes
- **Risk**: Amiga file format differs from documentation
- **Mitigation**: Test with real BBS data (reference-boardBBS), flexible parsers

### Performance Issues
- **Risk**: Large imports take too long
- **Mitigation**: Batch processing, progress tracking, background jobs

### Security Issues
- **Risk**: Malicious archives exploit parser
- **Mitigation**: Sandbox extraction, size limits, validation, virus scanning

---

## Timeline Estimate

- **Phase 1**: Foundation & Research - 2 weeks
- **Phase 2**: Import Infrastructure - 3 weeks
- **Phase 3**: Export Infrastructure - 2 weeks
- **Phase 4**: Admin UI Integration - 1 week
- **Phase 5**: Testing & Validation - 1 week
- **Phase 6**: Documentation & Deployment - 1 week

**Total**: 10 weeks (2.5 months) for complete implementation

---

## Next Steps

1. Review and approve this plan
2. Begin Phase 1 with archive utility installation
3. Set up test environment with reference-boardBBS data
4. Create GitHub project board with all tasks
5. Assign initial research tasks

---

## AI Implementation Prompt

See `AMIGA_BBS_IMPORT_EXPORT_AI_PROMPT.md` for detailed, copy-paste ready prompts for AI implementation of each phase.
