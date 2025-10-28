# Amiga Door Manager - Implementation Complete

**Status:** Phase 1 Complete - Core Module Implemented

This document describes the new AmigaDoorManager module that implements 1:1 compatible door management with the real Amiga AmiExpress BBS.

## What Was Implemented

### 1. AmigaDOS Assign Resolution

Implemented proper AmigaDOS logical assign resolution:

```typescript
Doors:AquaScan/AquaScan.000  →  /path/to/BBS/Doors/AquaScan/AquaScan.000
BBS:Screens/Welcome          →  /path/to/BBS/Screens/Welcome
NODE0:work/temp.txt          →  /path/to/BBS/Node0/work/temp.txt
```

**Supported Assigns:**
- `BBS:` - BBS data root
- `Doors:` - Door programs
- `Screens:` - Display screens
- `Storage:` - Icon storage
- `NODE0-3:` - Node-specific data
- `Protocols:` - Transfer protocols
- `Utils:` - Utility programs

### 2. .info File Parser

Implemented binary .info file parser that extracts:
- `LOCATION=` - Door executable path (with assigns)
- `ACCESS=` - Minimum access level
- `TYPE=` - Door type (XIM, AIM, REXX, etc.)
- `STACK=` - Stack size
- `PRIORITY=` - Process priority
- `MULTINODE=` - Multi-node support
- `NAME=` - Optional door name

**Example:**
```
ACCESS=100
LOCATION=Doors:AquaScan/AquaScan.000
MULTINODE=YES
TYPE=XIM
STACK=65536
PRIORITY=SAME
```

### 3. Proper Door Scanning

**OLD WAY (WRONG):**
- Scanned `backend/doors/` for executable files
- No command definitions
- Flat directory structure

**NEW WAY (CORRECT):**
- Scans `BBS/Commands/BBSCmd/*.info` for door definitions
- Parses .info files to extract metadata
- Resolves AmigaDOS assigns to find executables
- Checks if door executable exists
- Returns complete door list with metadata

### 4. Proper Door Installation

**OLD WAY (WRONG):**
```
backend/doors/[DoorName]/
  ├── all files extracted here
  └── no structure
```

**NEW WAY (CORRECT):**
```
backend/data/bbs/BBS/
├── Commands/BBSCmd/
│   └── SCAN.info          ← Command definition
└── Doors/
    └── AquaScan/          ← Door program and data
        ├── AquaScan.000
        ├── AquaScanConfig
        └── ...
```

### 5. BBS Directory Structure

Created proper BBS directory structure:

```
backend/data/bbs/BBS/
├── Commands/
│   ├── BBSCmd/          # User commands
│   └── SYSCmd/          # Sysop commands
├── Doors/               # Door programs
├── Screens/             # Display screens
├── Storage/             # Icon storage
│   └── Icons/
├── Protocols/           # File transfer protocols
├── Utils/               # Utility programs
├── Node0/               # Node 0 data
├── Node1/               # Node 1 data
├── Node2/               # Node 2 data
└── Node3/               # Node 3 data
```

## Module API

### AmigaDoorManager Class

**Constructor:**
```typescript
const manager = new AmigaDoorManager(bbsRoot: string);
```

**Methods:**

#### scanInstalledDoors()
Scans Commands/BBSCmd/*.info for installed doors
```typescript
const doors: DoorInfo[] = await manager.scanInstalledDoors();
```

Returns array of DoorInfo objects with:
- command: Command name
- location: AmigaDOS path
- resolvedPath: Physical path
- access: Access level
- type: Door type
- installed: Whether executable exists

#### installDoor(archivePath)
Installs door from ZIP or LHA archive
```typescript
const result = await manager.installDoor('/path/to/door.lha');
// Returns: { success: boolean, message: string, door?: DoorInfo }
```

Handles:
- ZIP and LHA archives
- BBS/ subdirectory structure
- Flat archive structure
- Mixed archive structure
- Multiple .info files
- Door file extraction

#### resolveAssign(amigaPath)
Resolves AmigaDOS path to physical path
```typescript
const path = manager.resolveAssign('Doors:AquaScan/AquaScan.000');
// Returns: "/full/path/to/BBS/Doors/AquaScan/AquaScan.000"
```

#### parseInfoFile(infoPath)
Parses .info file to extract metadata
```typescript
const metadata = manager.parseInfoFile('/path/to/SCAN.info');
// Returns: Partial<DoorInfo>
```

#### analyzeDoorArchive(archivePath)
Analyzes archive structure before installation
```typescript
const analysis: DoorArchive = manager.analyzeDoorArchive('/path/to/door.lha');
```

Returns:
- filename, path, size, format
- files: All files in archive
- infoFiles: .info files found
- executables: Executable files found

### Singleton Helper

```typescript
import { getAmigaDoorManager } from './doors/amigaDoorManager';

const manager = getAmigaDoorManager();  // Uses default BBS root
// or
const manager = getAmigaDoorManager('/custom/bbs/root');
```

## Data Structures

### DoorInfo
```typescript
interface DoorInfo {
  command: string;           // Command name (e.g., "SCAN")
  location: string;          // AmigaDOS path (e.g., "Doors:AquaScan/AquaScan.000")
  resolvedPath: string;      // Physical path
  access: number;            // Minimum access level
  type: string;              // Door type (XIM, AIM, REXX)
  stack?: number;            // Stack size
  priority?: string;         // Priority setting
  multinode?: boolean;       // Multi-node support
  name?: string;             // Optional door name
  description?: string;      // Description
  installed: boolean;        // Executable exists?
  doorName?: string;         // Extracted door name
}
```

### DoorArchive
```typescript
interface DoorArchive {
  filename: string;
  path: string;
  size: number;
  format: 'ZIP' | 'LHA';
  uploadDate: Date;
  files: string[];
  infoFiles: string[];
  executables: string[];
  metadata?: {
    fileidDiz?: string;
    readme?: string;
    guide?: string;
  };
}
```

## Next Steps (TODO)

### 1. Update Door Manager UI
- Integrate `AmigaDoorManager` into Socket.IO handlers
- Replace old door scanning code
- Update door display to show .info metadata
- Update door installation endpoint

### 2. Test with Real Archives
- Test with CAL-WEEK.LHA from Example_BBS/
- Test with other door archives from `backend/doors/archives/`
- Verify .info files are parsed correctly
- Verify door executables are found

### 3. Update index.ts
Replace old door management functions (lines 2180-3210) with:
```typescript
import { getAmigaDoorManager } from './doors/amigaDoorManager';

async function displayDoorManager(socket: any, session: BBSSession) {
  const manager = getAmigaDoorManager();
  const doors = await manager.scanInstalledDoors();
  // Display doors to user
}
```

### 4. Documentation
- Add JSDoc comments
- Create usage examples
- Document door archive formats
- Document .info file format

## Compatibility Notes

### Matches Amiga Version
✓ Scans Commands/BBSCmd/*.info
✓ Parses .info file format
✓ Resolves AmigaDOS assigns
✓ Installs to Commands/BBSCmd/ and Doors/[Name]/
✓ Supports ZIP and LHA archives
✓ Handles BBS/ subdirectory structure
✓ Checks executable existence

### Not Yet Implemented
- Door execution
- Door output handling
- Door input handling
- Multi-node synchronization
- Stack allocation
- Priority management

## File Locations

**Module:**
- `~/Code/AmiExpress-Web/backend/src/doors/amigaDoorManager.ts`

**BBS Structure:**
- `~/Code/AmiExpress-Web/backend/data/bbs/BBS/`

**Reference Data:**
- `~/Code/AmiExpress-Web/Example_BBS/`

**Archives:**
- `~/Code/AmiExpress-Web/backend/doors/archives/`

## Testing

To test the module:

```typescript
import { getAmigaDoorManager } from './doors/amigaDoorManager';

// Test scanning
const manager = getAmigaDoorManager();
const doors = await manager.scanInstalledDoors();
console.log(`Found ${doors.length} doors`);

// Test installation
const result = await manager.installDoor('/path/to/door.lha');
console.log(result.message);

// Test assign resolution
const path = manager.resolveAssign('Doors:AquaScan/AquaScan.000');
console.log(`Resolved to: ${path}`);
```

## Known Issues

None yet - module just implemented.

## Related Documentation

- [AmiExpress Data Structure](AMIEXPRESS_DATA_STRUCTURE.md)
- [Door Installation Reference](DOOR_INSTALLATION_REFERENCE.md)
- [Amiga Door Research](AMIGA_DOOR_RESEARCH.md)
