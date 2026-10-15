# AmiExpress BBS Data Directory Structure

**Reference Data from Real AmiExpress BBS Installation**

This document describes the actual directory structure used by AmiExpress BBS, based on the example data in `~/Code/AmiExpress-Web/Example_`. This is the **authoritative reference** for understanding how to properly install and configure doors.

## Critical Discovery: Door Installation Structure

**IMPORTANT:** Our earlier door installation code was WRONG. Doors are NOT installed to a single flat directory. The proper structure is:

```
Example_
├── Commands/              ← Command definitions (door menu entries)
│   └── BBSCmd/           ← BBS user commands
│       └── *.info        ← Door command definition files
└── Doors/                ← Actual door programs and data
    └── [DoorName]/       ← Each door in its own subdirectory
        ├── [executable]  ← The door program (.000, .020, .x, etc.)
        ├── *.Config      ← Door configuration
        ├── *.Help        ← Door help files
        ├── *.Doc         ← Documentation
        └── [data files]  ← Door-specific data
```

## Complete Directory Structure

### Root Level (Example_)

```
Example_
├── Access/               # Access level definitions
├── Commands/             # Command definitions *** CRITICAL FOR DOORS ***
│   ├── BBSCmd/          # BBS user commands (door entries here)
│   └── SYSCmd/          # Sysop-only commands
├── Conf01/              # Conference 1 data
├── Conf02/              # Conference 2 data
├── Documentation/       # BBS documentation
├── Doors/               # Door programs *** CRITICAL FOR DOORS ***
├── FCheck/              # File checking utilities
├── LCFile/              # Last caller file
├── Node0/               # Node 0 session data
├── Node1/               # Node 1 session data
├── Node2/               # Node 2 session data
├── Node3/               # Node 3 session data
├── Partdownload/        # Partial downloads
├── Protocols/           # File transfer protocols
├── Screens/             # Display screens
├── Storage/             # Icon storage
├── SysopStats/          # Sysop statistics
├── Utils/               # Utility programs
├── SystemStats          # System statistics file
├── user.data            # User database
├── user.keys            # User lookup keys
└── user.misc            # User miscellaneous data
```

## Door Installation - THE CORRECT WAY

### Command Definition Files

**Location:** `Example_Commands/BBSCmd/[CommandName].info`

Each door has a `.info` file that defines the menu command.

**Example: SCAN.info (AquaScan door)**
```
ACCESS=100
LOCATION=Doors:AquaScan/AquaScan.000
MULTINODE=YES
TYPE=XIM
STACK=65536
PRIORITY=SAME
```

**Fields:**
- `LOCATION` - AmigaDOS path to door executable (uses `Doors:` assign)
- `ACCESS` - Minimum access level required
- `TYPE` - Door type (XIM, AIM, REXX, etc.)
- `STACK` - Stack size for door process
- `PRIORITY` - Process priority
- `MULTINODE` - Whether door supports multiple nodes

### Door Program Files

**Location:** `Example_Doors/[DoorName]/`

Each door is installed in its own subdirectory under `Example_Doors/`.

**Example: AquaScan Door**
```
Example_Doors/AquaScan/
├── AquaScan.000          # 68000 executable (34KB)
├── AquaScan.020          # 68020 executable (33KB)
├── AquaScan.Doc          # Documentation (22KB)
├── AquaScanConfig        # Configuration file (26KB)
├── AquaScan.UserData     # User data (10KB)
├── AquaScan.Help.*.txt   # Help files for each command
├── AquaScan.Date.*       # Date format files
├── AquaScan.Div.*        # Divider files
└── AquaScan.info         # Workbench icon (optional)
```

**Example: FileDescription Door**
```
Example_Doors/FileDescription/
├── FileDescription000.x      # 68000 executable
├── FileDescription020.x      # 68020 executable
├── FileDescription.Config    # Configuration
├── FileDescription.Doc       # Documentation
├── FileDescription.Help      # Help file
├── FileDescription.Logos     # Logo data
├── FileDescription.Strip     # Strip utility
├── FileDescription.Tagdata   # Tag database
└── FileDescription.Update    # Update utility
```

## Installed Doors in Example Data

| Door Command | Door Name | Location |
|--------------|-----------|----------|
| SCAN | AquaScan | Doors:AquaScan/AquaScan.000 |
| F | FileDescription | (Multiple commands) |
| FR | FileDescription | (File rating) |
| CS | FileDescription | (Comment strip) |
| N | FileDescription | (Name files) |
| NSU | FileDescription | (Name single upload) |
| SENT | ? | ? |

All doors are in: `Example_Doors/[DoorName]/`

## AmigaDOS Assigns (Path Mappings)

AmiExpress uses AmigaDOS logical assigns for paths:

```
BBS:     → Example_                    (BBS data root)
DOORS:   → Example_Doors/              (Door programs)
SCREENS: → Example_Screens/            (Screen files)
NODE0:   → Example_Node0/              (Node 0 data)
NODE1:   → Example_Node1/              (Node 1 data)
...
```

**Example Path Resolution:**
```
LOCATION=Doors:AquaScan/AquaScan.000
         └────┘ └──────────────────┘
         Assign  Relative Path

Resolves to: Example_Doors/AquaScan/AquaScan.000
```

## Conference Structure

Each conference (Conf01, Conf02, etc.) contains:

```
Conf01/
├── Hold/           # Files on hold
├── Lcfiles/        # Last caller files
├── MsgBase/        # Message base
├── PartUpload/     # Partial uploads
└── Uploads/        # Uploaded files
```

## Node Structure

Each node (Node0, Node1, etc.) contains:

```
Node0/
├── modem/          # Modem temporary files
├── playpen/        # Temporary working area
├── serial/         # Serial port temporary files
└── work/           # Work directory
```

## Correct Door Installation Process

Based on the real structure, doors should be installed as follows:

### 1. Extract Door Archive

Extract to temporary location to analyze contents.

### 2. Identify Door Components

Look for:
- **Command definition:** Files named `*.info` (goes to `Commands/BBSCmd/`)
- **Door executable:** Files like `*.000`, `*.020`, `*.x`, `*.XIM` (goes to `Doors/[Name]/`)
- **Support files:** Config, help, doc, data files (goes to `Doors/[Name]/`)

### 3. Install to Proper Locations

```bash
# Command definition file
Archive:Commands/BBSCmd/SCAN.info
  → Example_Commands/BBSCmd/SCAN.info

# Door program and support files
Archive:Doors/AquaScan/*
  → Example_Doors/AquaScan/*
```

### 4. Update Door Registry

Parse `.info` files in `Example_Commands/BBSCmd/` to build door list:
- Read LOCATION to find door executable
- Read TYPE to determine door type
- Read ACCESS to check permissions
- Read other metadata

## Door Archive Structure Patterns

Door archives typically follow one of these patterns:

### Pattern 1: Flat Root (Most Common)
```
archive.lha/
├── SCAN.info              → Commands/BBSCmd/
├── AquaScan.000          → Doors/AquaScan/
├── AquaScan.020          → Doors/AquaScan/
├── AquaScan.Doc          → Doors/AquaScan/
└── ...                   → Doors/AquaScan/
```

### Pattern 2: BBS Structure
```
archive.lha/
├── 
│   ├── Commands/
│   │   └── BBSCmd/
│   │       └── SCAN.info  → Commands/BBSCmd/
│   └── Doors/
│       └── AquaScan/      → Doors/AquaScan/
│           └── ...
└── Libs/                  → (special handling)
```

### Pattern 3: Mixed Structure
```
archive.lha/
├── Commands/
│   └── SCAN.info          → Commands/BBSCmd/
└── AquaScan/              → Doors/AquaScan/
    └── ...
```

## Implementation Requirements

### Current Code Problems

**File:** `backend/src/index.ts:3110-3188`

Current code extracts entire archive to:
```
backend/doors/[DoorName]/
```

This is WRONG. Should extract to proper BBS structure:
```
backend/data/bbs/Example_Commands/BBSCmd/
backend/data/bbs/Example_Doors/[DoorName]/
```

### Required Changes

1. **Create BBS Directory Structure**
   ```typescript
   const bbsRoot = path.join(__dirname, '../data/bbs/Data');
   const commandsPath = path.join(bbsRoot, 'Commands/BBSCmd');
   const doorsPath = path.join(bbsRoot, 'Doors');
   ```

2. **Extract to Temporary Location**
   ```typescript
   const tempPath = path.join(__dirname, '../temp/door-install');
   // Extract archive to temp
   ```

3. **Analyze Archive Structure**
   ```typescript
   // Find *.info files
   // Find door executables
   // Determine door name
   ```

4. **Install to Proper Locations**
   ```typescript
   // Copy *.info → Commands/BBSCmd/
   // Copy door files → Doors/[DoorName]/
   ```

5. **Scan Installed Doors**
   ```typescript
   // Read all *.info files from Commands/BBSCmd/
   // Parse LOCATION, TYPE, ACCESS
   // Check if door executable exists
   // Build door list
   ```

## Door Scanning Algorithm

To detect installed doors:

```typescript
1. Scan Example_Commands/BBSCmd/*.info
2. For each .info file:
   a. Parse file to extract metadata
   b. Read LOCATION field
   c. Resolve Doors: assign to Example_Doors/
   d. Check if executable exists
   e. Add to door list with metadata
3. Return complete door list
```

**Example:**
```
Found: Example_Commands/BBSCmd/SCAN.info
Parse: LOCATION=Doors:AquaScan/AquaScan.000
Resolve: Example_Doors/AquaScan/AquaScan.000
Check: Executable exists? YES
Add: { name: "SCAN", door: "AquaScan", path: "...", type: "XIM" }
```

## Key Takeaways

1. ✓ **Commands are separate from Doors**
   - Commands define menu entries (`.info` files)
   - Doors contain actual programs and data

2. ✓ **Each door gets its own directory**
   - `Example_Doors/AquaScan/`
   - `Example_Doors/FileDescription/`
   - NOT a flat structure!

3. ✓ **AmigaDOS assigns are path mappings**
   - `Doors:` → `Example_Doors/`
   - Must be resolved when reading `.info` files

4. ✓ **Door scanning reads command definitions**
   - NOT scanning for executables directly
   - Read `.info` files to find doors
   - Follow LOCATION to find executables

5. ✓ **Our current implementation is completely wrong**
   - Extracts to wrong location
   - Doesn't create proper structure
   - Doesn't handle command definitions
   - Doesn't scan correctly

## Next Steps

1. Rewrite door installation code (index.ts:3110-3188)
2. Create proper BBS directory structure
3. Implement correct archive parsing
4. Implement proper file placement
5. Rewrite door scanning (index.ts:2268+)
6. Test with real door archives

## Reference Files

- Example Data: `~/Code/AmiExpress-Web/Example_`
- Door Archives: `~/Code/AmiExpress-Web/backend/doors/archives/`
- Example Sources: `~/Code/AmiExpress-Web/backend/doors/with source/`

## Related Documentation

- [Door Manager Integration](DOOR_MANAGER_INTEGRATION.md)
- [Amiga Door Research](AMIGA_DOOR_RESEARCH.md)
- [Door Upload Testing](DOOR_UPLOAD_TEST_GUIDE.md)
