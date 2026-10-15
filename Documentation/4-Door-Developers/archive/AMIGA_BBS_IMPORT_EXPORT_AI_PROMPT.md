# AI Implementation Prompts for Amiga BBS Import/Export

This document contains detailed, copy-paste ready prompts for AI assistants to implement each phase of the Amiga BBS Import/Export system.

---

## Phase 1: Foundation & Research

### Prompt 1.1: Install Archive Utilities

```
TASK: Install and configure archive extraction utilities for Amiga BBS import/export

CONTEXT:
- Project: AmiExpress-Web (TypeScript BBS)
- Location: ~/Code/amiexpress-web
- Reference data: ~/Downloads/BBS_COPY (reference-boardBBS)

REQUIREMENTS:
1. Install Node.js libraries for archive handling:
   - LHA extraction (node-lha or lha-reader)
   - LZX extraction (research available options, may need native bindings)
   - ZIP extraction (adm-zip)

2. Create unified ArchiveService:
   - Location: web/backend/src/services/archive.service.ts
   - Methods:
     * async extractArchive(filePath: string, outputDir: string, format: 'lha' | 'lzx' | 'zip'): Promise<string[]>
     * async detectFormat(filePath: string): Promise<'lha' | 'lzx' | 'zip' | 'unknown'>
     * async validateArchive(filePath: string): Promise<boolean>
     * async listContents(filePath: string): Promise<string[]>

3. Add fallback to command-line tools if native libraries fail:
   - Check for `lha`, `unlzx` commands
   - Shell out if available
   - Provide clear error messages if not available

4. Write unit tests:
   - Create test archives in each format
   - Test extraction
   - Test format detection
   - Test validation

ACCEPTANCE CRITERIA:
- Can extract LHA archives
- Can extract LZX archives (or provide clear error)
- Can extract ZIP archives
- Can detect archive format from file magic
- All tests pass
- TypeScript compiles with zero errors

FILES TO CREATE:
- web/backend/src/services/archive.service.ts
- web/backend/src/services/archive.service.test.ts
- package.json (update dependencies)
```

### Prompt 1.2: Document Conf.DB Format

```
TASK: Reverse engineer and document the Amiga AmiExpress Conf.DB binary format

CONTEXT:
- Reference data: ~/Downloads/BBS_COPY/Conf1/Conf.DB (74,000 bytes)
- Additional data: ~/Downloads/BBS_COPY/Conf2-Conf14/Conf.DB
- This is the conference database file used by Amiga AmiExpress BBS

REQUIREMENTS:
1. Analyze binary structure:
   - Use hex editor or xxd to examine Conf.DB files
   - Compare Conf1/Conf.DB with other conference databases
   - Identify repeating patterns (record boundaries)
   - Determine record size and count
   - Look for text strings (conference names, paths)

2. Identify fields:
   - Conference number
   - Conference name (max 80 chars?)
   - Access level requirements
   - Flags/settings bitfield
   - Message base path
   - File area paths
   - Other metadata

3. Create TypeScript interfaces:
   ```typescript
   interface ConferenceDatabase {
     records: ConferenceRecord[];
   }

   interface ConferenceRecord {
     conferenceNumber: number;
     conferenceName: string;
     accessLevel: number;
     flags: number;
     // ... add all discovered fields
   }
   ```

4. Create parser function:
   ```typescript
   function parseConferenceDB(buffer: Buffer): ConferenceDatabase {
     // Implementation
   }
   ```

5. Document findings:
   - Create CONF_DB_FORMAT.md with:
     * Field offsets and sizes
     * Data types (uint8, uint16, uint32, string, etc.)
     * Endianness (Amiga is big-endian)
     * Example values from reference-boardBBS
     * Hexdump with annotations

COMMANDS TO RUN:
```bash
xxd ~/Downloads/BBS_COPY/Conf1/Conf.DB | head -100
xxd ~/Downloads/BBS_COPY/Conf2/Conf.DB | head -100
ls -la ~/Downloads/BBS_COPY/Conf*/Conf.DB
```

ACCEPTANCE CRITERIA:
- Conf.DB format fully documented
- TypeScript interfaces created
- Parser function implemented
- Successfully parses all 14 Conf.DB files from reference-boardBBS
- Extracted data matches expected conference names/settings

FILES TO CREATE:
- Documentation/3-Developers/CONF_DB_FORMAT.md
- web/backend/src/types/amiga-conference.ts
- web/backend/src/services/amiga-parser.service.ts (partial)
```

### Prompt 1.3: Document .info File Format

```
TASK: Implement Amiga .info file parser to extract configuration data

CONTEXT:
- Reference: bbsConfig.info contains system configuration as "tool types"
- Reference: Commands/BBSCmd/*.info files contain door configurations
- Reference: Access/*.info files contain access level settings
- Format: IFF ICON format with embedded key=value strings

REQUIREMENTS:
1. Research Amiga .info file format:
   - IFF (Interchange File Format) structure
   - ICON chunk format
   - Tool types storage (null-terminated strings)
   - Reference: Amiga ROM Kernel Reference Manual

2. Implement InfoFileParser:
   ```typescript
   class InfoFileParser {
     parseToolTypes(buffer: Buffer): Map<string, string>;
     parseIcon(buffer: Buffer): { width: number; height: number; data: Buffer } | null;
     writeToolTypes(toolTypes: Map<string, string>, icon?: Buffer): Buffer;
   }
   ```

3. Test with real files:
   - Parse bbsConfig.info
   - Extract REGKEY, SMTP_HOST, SMTP_PORT, etc.
   - Parse Commands/BBSCmd/chat.info
   - Parse Access/ACS.255.info

4. Handle edge cases:
   - Missing tool types section
   - Corrupted .info files
   - Files without icons

COMMANDS TO RUN:
```bash
xxd ~/Downloads/BBS_COPY/bbsConfig.info | head -200
strings ~/Downloads/BBS_COPY/bbsConfig.info
xxd ~/Downloads/BBS_COPY/Commands/BBSCmd/chat.info | head -100
```

ACCEPTANCE CRITERIA:
- Successfully extracts tool types from bbsConfig.info
- Correctly parses all values (REGKEY, SMTP_*, FTP*, etc.)
- Can write .info files with tool types
- Round-trip test: parse → write → parse yields same data
- TypeScript compiles with zero errors

FILES TO CREATE:
- web/backend/src/services/info-file-parser.ts
- web/backend/src/services/info-file-parser.test.ts
- Documentation/3-Developers/AMIGA_INFO_FILE_FORMAT.md
```

---

## Phase 2: Import Infrastructure

### Prompt 2.1-2.5: Create Import Services

```
TASK: Implement core import infrastructure services

CONTEXT:
- Building import system for Amiga BBS archives
- Must handle users, conferences, messages, files, configuration
- Existing services: UserDatabaseManager, UserFileManager

REQUIREMENTS:
1. Create ArchiveService (if not done in Phase 1)

2. Create AmigaParserService:
   ```typescript
   // web/backend/src/services/amiga-parser.service.ts
   export class AmigaParserService {
     constructor(private infoParser: InfoFileParser) {}

     async parseUserData(buffer: Buffer): Promise<AmigaUserData[]>;
     async parseUserKeys(buffer: Buffer): Promise<AmigaUserKey[]>;
     async parseUserMisc(buffer: Buffer): Promise<AmigaUserMisc[]>;
     async parseConferenceDB(buffer: Buffer): Promise<ConferenceDatabase>;
     async parseCallersLog(buffer: Buffer): Promise<CallersLogEntry[]>;
     async parseBBSConfig(infoBuffer: Buffer): Promise<AmigaBBSConfig>;
     async parseAccessLevel(infoBuffer: Buffer, level: number): Promise<AmigaAccessLevel>;
     async parseCommandInfo(infoBuffer: Buffer, name: string): Promise<AmigaCommand>;
   }
   ```

3. Create ImportValidationService:
   ```typescript
   // web/backend/src/services/import-validation.service.ts
   export class ImportValidationService {
     validateArchiveStructure(extractedPath: string): ValidationResult;
     validateUsers(users: AmigaUserData[]): ValidationResult;
     validateConferences(conferences: AmigaConference[]): ValidationResult;
     validateConfig(config: AmigaBBSConfig): ValidationResult;
     checkConflicts(db: Database, importData: ParsedImportData): ConflictReport;
   }

   interface ValidationResult {
     valid: boolean;
     errors: string[];
     warnings: string[];
   }

   interface ConflictReport {
     userConflicts: Array<{ existing: User; import: AmigaUserData; field: string }>;
     conferenceConflicts: Array<{ existing: Conference; import: AmigaConference }>;
     recommendations: string[];
   }
   ```

4. Create ImportMappingService:
   ```typescript
   // web/backend/src/services/import-mapping.service.ts
   export class ImportMappingService {
     mapAmigaUserToModern(amigaUser: AmigaUserData): Partial<User>;
     mapAmigaConferenceToModern(amigaConf: AmigaConference): Partial<Conference>;
     mapAmigaAccessToSecurityLevel(amigaAccess: AmigaAccessLevel): number;
     mapAmigaConfigToModern(amigaConfig: AmigaBBSConfig): Partial<SystemConfig>;

     // Password handling
     shouldRehashPassword(passwordHash: string): boolean;
     generateTemporaryPassword(): string;
   }
   ```

5. Create ImportTransactionService:
   ```typescript
   // web/backend/src/services/import-transaction.service.ts
   export class ImportTransactionService {
     constructor(private db: Database) {}

     async beginImport(userId: string): Promise<ImportSession>;
     async commitImport(session: ImportSession): Promise<void>;
     async rollbackImport(session: ImportSession): Promise<void>;

     async importUsers(session: ImportSession, users: User[]): Promise<void>;
     async importConferences(session: ImportSession, conferences: Conference[]): Promise<void>;
     async importMessages(session: ImportSession, confId: string, messages: Message[]): Promise<void>;
     async importConfig(session: ImportSession, config: SystemConfig): Promise<void>;
   }

   interface ImportSession {
     id: string;
     userId: string;
     startTime: Date;
     status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'rolled_back';
     progress: number;
     currentOperation: string;
     backupPath?: string;
   }
   ```

INTEGRATION:
- Use existing UserDatabaseManager for user file I/O
- Use existing Database class for SQLite operations
- Use existing ConferenceRepository for conference operations

TESTING:
- Unit tests for each service
- Integration test with reference-boardBBS User.data
- Integration test with reference-boardBBS Conf1/Conf.DB

ACCEPTANCE CRITERIA:
- All services implement interfaces correctly
- Can parse User.data from reference-boardBBS
- Can parse Conf.DB from reference-boardBBS
- Validation catches malformed data
- Conflict detection finds duplicate usernames
- Mapping preserves all critical data
- Transaction rollback works correctly
- TypeScript compiles with zero errors

FILES TO CREATE:
- web/backend/src/services/amiga-parser.service.ts
- web/backend/src/services/import-validation.service.ts
- web/backend/src/services/import-mapping.service.ts
- web/backend/src/services/import-transaction.service.ts
- web/backend/src/types/amiga-import.ts
- Tests for all services
```

### Prompt 2.6: Implement User Import

```
TASK: Implement complete user import from Amiga User.data/keys/misc files

CONTEXT:
- Existing code: UserDatabaseManager.ts reads Amiga user files
- Reference data: ~/Downloads/BBS_COPY/User.data, User.keys, user.misc
- Must import to SQLite and sync to node files

REQUIREMENTS:
1. Extend AmigaParserService with user parsing:
   ```typescript
   async parseUserFiles(extractedPath: string): Promise<AmigaUserData[]> {
     const userData = await fs.readFile(path.join(extractedPath, 'User.data'));
     const userKeys = await fs.readFile(path.join(extractedPath, 'User.keys'));
     const userMisc = await fs.readFile(path.join(extractedPath, 'user.misc'));

     // Parse using existing UserDatabaseManager methods
     // Return array of AmigaUserData
   }
   ```

2. Implement user import in ImportTransactionService:
   ```typescript
   async importUsers(session: ImportSession, users: AmigaUserData[]): Promise<void> {
     for (const amigaUser of users) {
       // Map to modern User type
       const modernUser = this.mappingService.mapAmigaUserToModern(amigaUser);

       // Check for conflicts
       const existing = await this.db.getUserByUsername(modernUser.username);
       if (existing) {
         // Handle conflict (store in session for resolution)
         session.conflicts.push({ type: 'user', existing, import: modernUser });
         continue;
       }

       // Create user
       await this.db.createUser(modernUser);

       // Update progress
       session.progress += 1 / users.length;
       await this.updateSession(session);
     }
   }
   ```

3. Handle password migration:
   - Option 1: Keep Amiga hashes (LEGACY mode)
   - Option 2: Force password reset (set temporary password)
   - Option 3: Prompt for password on first login
   - Store original hash format in user metadata

4. Preserve user statistics:
   - Upload/download counts and bytes
   - Call count
   - Time online
   - Security level
   - First login date
   - Last login date

5. Handle duplicate usernames:
   - Detect conflicts
   - Provide resolution options:
     * Skip (don't import)
     * Rename (append number: user → user2)
     * Merge (combine stats, keep higher security level)
     * Replace (delete existing, import new)

TEST DATA:
```bash
# Extract test users from reference-boardBBS
cp ~/Downloads/BBS_COPY/User.data /tmp/test_import/
cp ~/Downloads/BBS_COPY/User.keys /tmp/test_import/
cp ~/Downloads/BBS_COPY/user.misc /tmp/test_import/
```

ACCEPTANCE CRITERIA:
- Successfully imports all users from reference-boardBBS
- All user fields preserved (username, realname, location, stats, etc.)
- Security levels mapped correctly
- Password hashes preserved or handled safely
- Duplicate usernames detected and handled
- Users can log in after import
- User stats accurate
- TypeScript compiles with zero errors

FILES TO MODIFY:
- web/backend/src/services/amiga-parser.service.ts
- web/backend/src/services/import-transaction.service.ts
- web/backend/src/services/import-mapping.service.ts

FILES TO CREATE:
- web/backend/src/services/user-import.service.ts (optional abstraction)
- Tests for user import
```

### Prompt 2.7: Implement Conference Import

```
TASK: Implement complete conference import from Amiga Conf* directories

CONTEXT:
- Reference data: ~/Downloads/BBS_COPY/Conf1-Conf14/
- Each conference has: Conf.DB, Menu.txt, Dir*.info, MsgBase/
- Must create conferences in SQLite, import menus, file areas

REQUIREMENTS:
1. Parse conference structure:
   ```typescript
   async parseConferenceDirectory(confPath: string, confNum: number): Promise<AmigaConference> {
     const confDB = await this.parseConferenceDB(path.join(confPath, 'Conf.DB'));
     const menu = await fs.readFile(path.join(confPath, 'Menu.txt'), 'utf-8');
     const fileAreas = await this.parseFileAreas(confPath);

     return {
       number: confNum,
       database: confDB,
       menu: menu,
       fileAreas: fileAreas,
       // ... other fields
     };
   }
   ```

2. Map to modern Conference type:
   ```typescript
   mapAmigaConferenceToModern(amigaConf: AmigaConference): Conference {
     return {
       id: crypto.randomUUID(),
       name: amigaConf.database.conferenceName,
       type: 'MSGBBS', // or 'UPLOADS' based on flags
       minAccessLevel: amigaConf.database.accessLevel,
       description: amigaConf.menu.split('\n')[0], // First line of menu
       flags: this.mapConferenceFlags(amigaConf.database.flags),
       created: new Date(),
       updated: new Date()
     };
   }
   ```

3. Import file areas:
   - Parse Dir0.info, Dir1.info, Dir2.info
   - Extract file area names and paths
   - Create FileArea records
   - Map access levels

4. Import conference menus:
   - Store Menu.txt in database or filesystem
   - Preserve ANSI formatting
   - Map menu command references

5. Handle conference conflicts:
   - Check for existing conference with same name
   - Provide resolution options:
     * Skip
     * Rename (append number)
     * Replace
     * Merge (combine file areas, message bases)

TEST COMMAND:
```bash
# Test with Conf1 from reference-boardBBS
ls -la ~/Downloads/BBS_COPY/Conf1/
```

ACCEPTANCE CRITERIA:
- Successfully imports all 14 conferences from reference-boardBBS
- Conference names correct
- Access levels preserved
- Menus imported and displayed correctly
- File areas created with correct paths
- Conference settings preserved
- TypeScript compiles with zero errors

FILES TO CREATE:
- web/backend/src/services/conference-import.service.ts
- Tests for conference import
```

---

## Phase 3: Export Infrastructure

### Prompt 3.1-3.3: Create Export Services

```
TASK: Implement export services to generate Amiga-compatible BBS files

CONTEXT:
- Need to export modern TypeScript BBS data to Amiga binary format
- Must generate files compatible with real Amiga hardware
- Exported archives should be importable by original AmiExpress

REQUIREMENTS:
1. Create AmigaWriterService:
   ```typescript
   // web/backend/src/services/amiga-writer.service.ts
   export class AmigaWriterService {
     constructor(private infoWriter: InfoFileParser) {}

     writeUserData(users: User[]): Buffer;
     writeUserKeys(users: User[]): Buffer;
     writeUserMisc(users: User[]): Buffer;
     writeConferenceDB(conf: Conference, settings: ConferenceSettings): Buffer;
     writeBBSConfig(config: SystemConfig): Buffer; // Generates .info file
     writeAccessLevel(level: number, settings: AccessLevelSettings): Buffer;
     writeCommandInfo(command: Command): Buffer;
   }
   ```

2. Create ExportMappingService:
   ```typescript
   // web/backend/src/services/export-mapping.service.ts
   export class ExportMappingService {
     mapModernUserToAmiga(user: User): AmigaUserData;
     mapModernConferenceToAmiga(conf: Conference): AmigaConference;
     mapSecurityLevelToAmiga(level: number): number; // 0-255
     mapModernConfigToAmiga(config: SystemConfig): AmigaBBSConfig;

     // Reverse of import mapping
     // Must handle data that doesn't exist in Amiga format (use defaults)
   }
   ```

3. Create ArchiveBuilderService:
   ```typescript
   // web/backend/src/services/archive-builder.service.ts
   export class ArchiveBuilderService {
     async createBBSDirectory(exportData: ExportData): Promise<string>;
     async createLHA(directoryPath: string): Promise<string>;
     async createLZX(directoryPath: string): Promise<string>;
     async createZIP(directoryPath: string): Promise<string>;
     async validateExport(archivePath: string): Promise<ValidationResult>;
   }
   ```

4. Handle big-endian byte order:
   - All multi-byte values must be big-endian
   - Use Buffer.writeUInt32BE(), Buffer.writeUInt16BE()
   - Test on little-endian system (x86/ARM)

5. Preserve binary struct layout:
   - Match exact Amiga struct padding
   - No extra bytes
   - Verify with hexdump comparison

TESTING:
- Export test data
- Compare with original reference-boardBBS files
- Hexdump comparison for binary files
- Text comparison for .txt files
- Validate archive extraction

ACCEPTANCE CRITERIA:
- Generates valid User.data file
- Generates valid Conf.DB files
- Generates valid .info files with tool types
- Created archives extract correctly
- Binary files match expected format
- Big-endian byte order correct
- TypeScript compiles with zero errors

FILES TO CREATE:
- web/backend/src/services/amiga-writer.service.ts
- web/backend/src/services/export-mapping.service.ts
- web/backend/src/services/archive-builder.service.ts
- Tests for all services
```

---

## Phase 4: Admin UI Integration

### Prompt 4.1-4.2: Create Import/Export API

```
TASK: Create REST API endpoints for import/export operations

CONTEXT:
- Admin interface at /admin/ needs import/export functionality
- Must support file upload, progress tracking, conflict resolution
- Use existing auth middleware (authenticateToken, requireSysop)

REQUIREMENTS:
1. Create import routes:
   ```typescript
   // web/backend/src/api/import-routes.ts
   import { Router } from 'express';
   import multer from 'multer';
   import { ImportService } from '../services/import.service';

   const upload = multer({ dest: '/tmp/bbs-imports/' });
   const router = Router();

   // Upload archive file
   router.post('/upload', upload.single('archive'), async (req, res) => {
     // Save file, detect format, return upload ID
   });

   // Validate archive contents
   router.post('/validate/:uploadId', async (req, res) => {
     // Extract, parse, validate, return report
   });

   // Preview import (what will change)
   router.post('/preview/:uploadId', async (req, res) => {
     // Return summary: new users, conferences, conflicts
   });

   // Execute import
   router.post('/execute/:uploadId', async (req, res) => {
     // Start import job, return job ID
   });

   // Get import status/progress
   router.get('/status/:jobId', async (req, res) => {
     // Return progress, current operation, conflicts
   });

   // Resolve conflicts
   router.post('/resolve/:jobId', async (req, res) => {
     // Accept resolution decisions, continue import
   });

   // Cancel import
   router.delete('/cancel/:jobId', async (req, res) => {
     // Stop job, cleanup
   });

   export default router;
   ```

2. Create export routes:
   ```typescript
   // web/backend/src/api/export-routes.ts
   router.post('/create', async (req, res) => {
     // Start export job with options
     const { format, includeUsers, includeConferences, includeMessages } = req.body;
     // Return job ID
   });

   router.get('/status/:jobId', async (req, res) => {
     // Return export progress
   });

   router.get('/download/:jobId', async (req, res) => {
     // Stream archive file
     res.download(archivePath);
   });

   router.delete('/cancel/:jobId', async (req, res) => {
     // Cancel export job
   });
   ```

3. Integrate with job queue:
   - Use Bull or BullMQ for background jobs
   - Store job progress in Redis or database
   - Emit events for WebSocket updates

4. Add to main index.ts:
   ```typescript
   import importRoutes from './api/import-routes';
   import exportRoutes from './api/export-routes';

   app.use('/api/import', authenticateToken(db), requireSysop(), importRoutes);
   app.use('/api/export', authenticateToken(db), requireSysop(), exportRoutes);
   ```

SECURITY:
- Only sysop can import/export
- Validate uploaded files (size limit, magic bytes)
- Sandbox archive extraction
- Clean up temp files
- Rate limiting on uploads

ERROR HANDLING:
- Malformed archives
- Corrupted files
- Insufficient disk space
- Import conflicts
- Transaction failures

ACCEPTANCE CRITERIA:
- Can upload archive via API
- Validation returns detailed report
- Preview shows accurate summary
- Import executes successfully
- Progress updates in real-time
- Export generates valid archive
- Download works correctly
- TypeScript compiles with zero errors

FILES TO CREATE:
- web/backend/src/api/import-routes.ts
- web/backend/src/api/export-routes.ts
- web/backend/src/services/import.service.ts (high-level orchestration)
- web/backend/src/services/export.service.ts (high-level orchestration)
```

### Prompt 4.3-4.7: Create Admin UI

```
TASK: Create React admin interface for import/export

CONTEXT:
- Admin config app at web/config-app/ (React + TanStack Query)
- Add new page: ImportExportPage.tsx
- Must provide intuitive UI for complex operations

REQUIREMENTS:
1. Create ImportExportPage:
   ```typescript
   // web/config-app/src/pages/ImportExportPage.tsx
   export function ImportExportPage() {
     return (
       <div className="space-y-8">
         <ImportSection />
         <ExportSection />
         <ImportHistorySection />
       </div>
     );
   }
   ```

2. Create ImportSection component:
   ```typescript
   function ImportSection() {
     const [step, setStep] = useState<'upload' | 'validate' | 'preview' | 'resolve' | 'execute'>('upload');
     const [uploadId, setUploadId] = useState<string>();
     const [conflicts, setConflicts] = useState<Conflict[]>([]);

     return (
       <Card>
         <CardHeader>
           <h2>Import from Amiga BBS</h2>
         </CardHeader>
         <CardContent>
           {step === 'upload' && <FileUploadZone onUpload={handleUpload} />}
           {step === 'validate' && <ValidationProgress uploadId={uploadId} onComplete={handleValidated} />}
           {step === 'preview' && <ImportPreview uploadId={uploadId} onConfirm={handleConfirm} />}
           {step === 'resolve' && <ConflictResolution conflicts={conflicts} onResolve={handleResolve} />}
           {step === 'execute' && <ImportProgress uploadId={uploadId} onComplete={handleComplete} />}
         </CardContent>
       </Card>
     );
   }
   ```

3. Create FileUploadZone component:
   - Drag & drop support
   - File type validation (.lha, .lzx, .zip)
   - Progress bar during upload
   - Format auto-detection display
   - Clear error messages

4. Create ImportPreview component:
   ```typescript
   interface ImportPreviewData {
     totalUsers: number;
     newUsers: number;
     conflictUsers: number;

     totalConferences: number;
     newConferences: number;
     conflictConferences: number;

     totalMessages: number;

     configChanges: Array<{ key: string; oldValue: any; newValue: any }>;
   }

   function ImportPreview({ data }: { data: ImportPreviewData }) {
     return (
       <div className="space-y-4">
         <SummaryCard title="Users" {...data} />
         <SummaryCard title="Conferences" {...data} />
         <ConfigChangesTable changes={data.configChanges} />
         <Button onClick={onConfirm}>Proceed with Import</Button>
       </div>
     );
   }
   ```

5. Create ConflictResolution component:
   ```typescript
   function ConflictResolution({ conflicts }: { conflicts: Conflict[] }) {
     const [resolutions, setResolutions] = useState<Map<string, Resolution>>();

     return (
       <div className="space-y-4">
         {conflicts.map(conflict => (
           <ConflictCard
             key={conflict.id}
             conflict={conflict}
             onResolve={resolution => setResolutions(prev => prev.set(conflict.id, resolution))}
           />
         ))}
         <Button onClick={() => submitResolutions(resolutions)}>
           Continue Import
         </Button>
       </div>
     );
   }

   function ConflictCard({ conflict }: { conflict: Conflict }) {
     return (
       <Card>
         <CardHeader>
           <Badge>{conflict.type}</Badge>
           {conflict.type === 'user' && `Username: ${conflict.field}`}
         </CardHeader>
         <CardContent>
           <div className="grid grid-cols-2 gap-4">
             <div>
               <h4>Existing</h4>
               <pre>{JSON.stringify(conflict.existing, null, 2)}</pre>
             </div>
             <div>
               <h4>Import</h4>
               <pre>{JSON.stringify(conflict.import, null, 2)}</pre>
             </div>
           </div>
           <RadioGroup>
             <Radio value="skip">Skip (keep existing)</Radio>
             <Radio value="replace">Replace with import</Radio>
             <Radio value="rename">Rename import (user2)</Radio>
             <Radio value="merge">Merge (combine stats)</Radio>
           </RadioGroup>
         </CardContent>
       </Card>
     );
   }
   ```

6. Create ExportSection component:
   ```typescript
   function ExportSection() {
     const [options, setOptions] = useState<ExportOptions>({
       format: 'zip',
       includeUsers: true,
       includeConferences: true,
       includeMessages: true,
       includeFileAreas: true,
     });

     return (
       <Card>
         <CardHeader>
           <h2>Export to Amiga BBS</h2>
         </CardHeader>
         <CardContent>
           <ExportOptionsForm options={options} onChange={setOptions} />
           <Button onClick={() => startExport(options)}>
             Create Export Archive
           </Button>
         </CardContent>
       </Card>
     );
   }
   ```

7. Add WebSocket for progress updates:
   ```typescript
   useEffect(() => {
     const socket = io();
     socket.on(`import:${jobId}:progress`, (data) => {
       setProgress(data.percentage);
       setCurrentOperation(data.operation);
     });
     return () => socket.disconnect();
   }, [jobId]);
   ```

STYLING:
- Use Tailwind CSS (already configured)
- Use shadcn/ui components (if available)
- Responsive design
- Loading states
- Error states
- Success states

ACCEPTANCE CRITERIA:
- Can drag-drop archive files
- Shows upload progress
- Displays validation results
- Shows import preview with counts
- Conflict resolution UI works
- Progress bar updates in real-time
- Can download exported archive
- UI is responsive and polished
- TypeScript compiles with zero errors

FILES TO CREATE:
- web/config-app/src/pages/ImportExportPage.tsx
- web/config-app/src/components/import/FileUploadZone.tsx
- web/config-app/src/components/import/ImportPreview.tsx
- web/config-app/src/components/import/ConflictResolution.tsx
- web/config-app/src/components/export/ExportOptions.tsx
```

---

## Phase 5: Testing & Validation

### Prompt 5.1-5.7: Comprehensive Testing

```
TASK: Create comprehensive test suite for import/export system

CONTEXT:
- Must validate with real Amiga BBS data (reference-boardBBS)
- Test round-trip: Import → Export → Import
- Performance testing with large datasets

REQUIREMENTS:
1. Unit Tests:
   - All parser functions
   - All writer functions
   - Mapping functions
   - Validation functions

2. Integration Tests:
   ```typescript
   describe('Full Import Workflow', () => {
     test('imports reference-boardBBS user database', async () => {
       // Copy reference-boardBBS files to test directory
       // Run import
       // Verify all users created
       // Verify stats preserved
     });

     test('imports all conferences', async () => {
       // Import Conf1-Conf14
       // Verify conference names
       // Verify access levels
       // Verify file areas
     });

     test('handles duplicate usernames', async () => {
       // Create existing user
       // Import with same username
       // Verify conflict detected
       // Test resolution options
     });
   });
   ```

3. Round-Trip Tests:
   ```typescript
   describe('Import-Export Round Trip', () => {
     test('preserves user data exactly', async () => {
       const original = await parseUserData(originalFile);
       const imported = await importUsers(original);
       const exported = await exportUsers(imported);
       const reimported = await parseUserData(exported);

       expect(reimported).toEqual(original);
     });
   });
   ```

4. Performance Tests:
   ```typescript
   describe('Performance', () => {
     test('imports 1000 users in < 5 seconds', async () => {
       const start = Date.now();
       await importUsers(generate1000Users());
       const duration = Date.now() - start;
       expect(duration).toBeLessThan(5000);
     });

     test('exports complete BBS in < 30 seconds', async () => {
       const start = Date.now();
       await exportCompleteBBS();
       const duration = Date.now() - start;
       expect(duration).toBeLessThan(30000);
     });
   });
   ```

5. E2E Tests with Playwright:
   ```typescript
   test('complete import workflow', async ({ page }) => {
     await page.goto('http://localhost:3001/admin/import');

     // Upload archive
     await page.setInputFiles('input[type=file]', 'test-data/reference-board.zip');
     await expect(page.locator('.upload-success')).toBeVisible();

     // Validate
     await page.click('button:has-text("Validate")');
     await expect(page.locator('.validation-success')).toBeVisible();

     // Preview
     await page.click('button:has-text("Preview")');
     await expect(page.locator('.preview-summary')).toContainText('10 users');

     // Import
     await page.click('button:has-text("Import")');
     await expect(page.locator('.import-complete')).toBeVisible({ timeout: 30000 });
   });
   ```

6. Validation Tests:
   - Test with malformed archives
   - Test with corrupted files
   - Test with missing files
   - Test with invalid data
   - Test error handling and recovery

COMMANDS:
```bash
# Set up test data
cp -r ~/Downloads/BBS_COPY /tmp/test-reference-board-bbs
cd /tmp/test-reference-board-bbs && zip -r reference-board.zip .

# Run tests
npm test -- import-export
npm test -- --coverage

# Run E2E tests
npm run test:e2e
```

ACCEPTANCE CRITERIA:
- All unit tests pass
- Integration tests pass with reference-boardBBS data
- Round-trip tests preserve all data
- Performance tests meet targets
- E2E tests complete successfully
- Code coverage > 80%
- Zero TypeScript errors

FILES TO CREATE:
- web/backend/src/services/__tests__/import.test.ts
- web/backend/src/services/__tests__/export.test.ts
- web/backend/src/services/__tests__/round-trip.test.ts
- tests/e2e/import-export.spec.ts
```

---

## Usage Instructions

1. **Copy a prompt** from above
2. **Paste into your AI assistant** (Claude, GPT-4, etc.)
3. **Provide context** if needed (point to relevant files)
4. **Review generated code** carefully
5. **Test thoroughly** before moving to next phase
6. **Iterate** if issues found

## Important Notes

- **Reference Data**: Always use `~/Downloads/BBS_COPY` (reference-boardBBS) as ground truth
- **Existing Code**: Leverage `UserDatabaseManager.ts`, `UserFileManager.ts`, etc.
- **TypeScript**: Must compile with zero errors
- **Testing**: Each phase must have tests that pass
- **Git**: Commit after each completed prompt
- **Documentation**: Update docs as you discover new information

## Progress Tracking

- [ ] Phase 1: Foundation & Research
- [ ] Phase 2: Import Infrastructure
- [ ] Phase 3: Export Infrastructure
- [ ] Phase 4: Admin UI Integration
- [ ] Phase 5: Testing & Validation
- [ ] Phase 6: Documentation & Deployment

---

**Next Steps**: Begin with Prompt 1.1 (Install Archive Utilities)
