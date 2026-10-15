# Session 2025-11-01: Database to Disk File Migration

## Goal
Implement disk file storage alongside PostgreSQL for Amiga door compatibility. This is a 1:1 port requirement.

## Background
User clarified: **"we worked on moving all files from the database to disk as the real amiexpress is disk based. our new typescript doors could keep using the database though"**

This confirms hybrid approach is correct:
- Keep PostgreSQL for modern TypeScript doors
- Write disk files for Amiga 68k doors (they can't access PostgreSQL)

## Accomplishments

### 1. Database to Disk Mapping Analysis ✅
Created comprehensive mapping document: `DATABASE_TO_DISK_MAPPING.md`

**Tables Mapped:**
- users → user.data, user.keys, user.misc (239+54+256 bytes each)
- users (active) → node{n}.user, node{n}.userkeys (already partially done)
- conferences → Conf.DB
- messages → {num}.msg files
- file_areas → {area}.dir files
- node_sessions → Node{n}/ directories, CallersLog

**Priority Classification:**
- 🔴 HIGH: user.data/keys/misc, node files
- 🟡 MEDIUM: messages, file areas, conferences
- 🟢 LOW: statistics, chat (DB only)

### 2. UserFileManager Implementation ✅
Created `/web/backend/src/services/UserFileManager.ts` (800+ lines)

**Features:**
- Binary struct serialization matching E language exactly
- user.data (239 bytes) - main user database
- user.keys (54 bytes) - user settings
- user.misc (256 bytes) - email, password hash, etc.
- Exact field offsets from axobjects.e:11-100

**Struct Mapping:**
```typescript
// E: OBJECT user ... ENDOBJECT (axobjects.e:11-68)
interface UserFileStruct {
  name[31]: string,        // CHAR array
  pass[9]: string,
  location[30]: string,
  slotNumber: number,      // INT (2 bytes)
  secStatus: number,
  // ... 60+ more fields
}
```

**Binary Serialization:**
- Strings: null-padded to fixed width
- INTs: 2 bytes little-endian
- LONGs: 4 bytes little-endian
- CHARs: 1 byte

**Methods:**
- `writeUserFiles(user, slotNumber)` - Write all 3 files
- `readUserDataFile()` - Read user.data (deserialization TODO)
- `updateUserDataFile(user, slotNumber)` - Update specific user
- `initializeUserFiles()` - Create empty files

### 3. Database Sync Triggers ✅
Added to `/web/backend/src/database.ts`:

**On User Creation:**
```typescript
async createUser(...) {
  // DB insert
  stmt.run(...);

  // Sync to disk
  const newUser = await this.getUserById(id);
  const slotNumber = allUsers.length - 1;
  userFileManager.writeUserFiles(newUser, slotNumber);
}
```

**On User Update:**
```typescript
async updateUser(id, updates) {
  // DB update
  stmt.run(...);

  // Sync to disk
  const updatedUser = await this.getUserById(id);
  userFileManager.updateUserDataFile(updatedUser, slotNumber);
}
```

**On Database Init:**
```typescript
await this.initializeDefaultData();
userFileManager.initializeUserFiles(); // Create empty files
```

### 4. File Path Configuration ✅
Fixed BBS root path resolution:

**Problem:** `process.cwd()` from `/web/backend` gave wrong path
**Solution:** `path.join(__dirname, '../../../..')` to reach project root

**Verified Paths:**
```
BBS root: ~/Code/amiexpress-web
user.data: ~/Code/amiexpress-web/user.data
user.keys: ~/Code/amiexpress-web/user.keys
user.misc: ~/Code/amiexpress-web/user.misc
```

**Files Created:**
```bash
$ ls -lh user.*
-rw-r--r--@ 1 spot  staff     0B  1 Nov 20:44 user.data
-rw-r--r--@ 1 spot  staff     0B  1 Nov 20:44 user.keys
-rw-r--r--@ 1 spot  staff     0B  1 Nov 20:44 user.misc
```

## Current Status

### ✅ Completed
1. Database to disk mapping analysis
2. UserFileManager implementation
3. Database sync triggers (create/update)
4. File path configuration
5. Empty file initialization

### ⏳ In Progress
- Sync existing users from DB to disk files
  - Need to iterate all users and write to files
  - Assign slot numbers properly

### 🔜 Next Steps
1. Write script to sync existing users to disk files
2. Test user creation triggers new file writes
3. Test user update triggers file updates
4. Implement MessageFileManager for .msg files
5. Implement FileAreaManager for .dir files
6. Test WHO door with complete file system

## Technical Details

### E Struct Binary Layout
Must match EXACTLY or doors will read garbage data.

**Example: user struct (239 bytes total)**
```
Offset | Field          | Type  | Size
-------|----------------|-------|-----
0      | name           | CHAR  | 31
31     | pass           | CHAR  | 9
40     | location       | CHAR  | 30
70     | phoneNumber    | CHAR  | 13
83     | slotNumber     | INT   | 2
85     | secStatus      | INT   | 2
...    | ...            | ...   | ...
237    | lineLength     | CHAR  | 1
238    | newUser        | CHAR  | 1
```

### Slot Number Assignment
Currently uses array index (0-based). In production, should:
- Track deleted slots for reuse
- Store slot number in DB
- Or use fixed mapping (user ID → slot)

### File Operations
- **Create**: Append to file (allows multiple users)
- **Update**: Find by slot number, overwrite 239-byte block
- **Delete**: Mark as deleted? Or remove and repack?

## Files Modified

1. `/web/backend/src/services/UserFileManager.ts` - NEW (800 lines)
2. `/web/backend/src/database.ts` - Modified (3 locations)
3. `/Docs/DATABASE_TO_DISK_MAPPING.md` - NEW (comprehensive mapping)
4. `/Docs/SESSION_2025-11-01_DB_TO_DISK.md` - This file

## Key Insights

### User's Critical Feedback
> "our new typescript doors could keep using the database though"

This clarifies that:
- TypeScript doors CAN use PostgreSQL directly
- Amiga 68k doors MUST use disk files
- Hybrid approach is optimal

### Why Hybrid Works
1. **PostgreSQL Benefits:**
   - Fast queries for web interface
   - Transactions, backups, scalability
   - Easy to manage with modern tools

2. **Disk Files Benefits:**
   - Amiga door compatibility
   - Exact 1:1 port behavior
   - Doors can read with simple Open()/Read()

3. **Sync Strategy:**
   - DB is source of truth
   - Files are generated on change
   - Best-effort writes (don't fail if file write fails)

### Performance Considerations
- File writes are synchronous (blocking)
- Could queue writes for async processing
- For now, immediate sync is acceptable

## Testing Plan

### Unit Tests Needed
1. Binary serialization correctness
2. Field offset validation
3. Slot number assignment
4. File read/write operations

### Integration Tests Needed
1. User creation → file written
2. User update → file updated
3. Multiple users → correct slots
4. Door reads file successfully

### Test with WHO Door
After syncing existing users:
1. Login as sysop
2. Run WHO door
3. Verify it displays user list
4. Check node files created correctly

## Next Session

Priority tasks for next session:
1. Create sync script for existing users
2. Test create/update triggers work
3. Verify doors can read files
4. Implement MessageFileManager
5. Implement FileAreaManager

## Reference Files

- **E Structs:** `/AmiExpress-Sources/axobjects.e`
- **File Operations:** `/AmiExpress-Sources/express.e` (lines 8045-8075, 2935-2950)
- **Mapping Doc:** `/Docs/DATABASE_TO_DISK_MAPPING.md`
- **Implementation:** `/web/backend/src/services/UserFileManager.ts`
