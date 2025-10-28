# Door Installation Quick Reference

**CRITICAL:** This is the correct way to install AmiExpress doors.

## TL;DR - The Problem

Our current door installation code is **COMPLETELY WRONG**. It extracts doors to a flat directory structure, but AmiExpress requires a specific hierarchical structure.

## The Correct Structure

```
Example_BBS/
├── Commands/
│   └── BBSCmd/
│       └── SCAN.info          ← Command definition (menu entry)
└── Doors/
    └── AquaScan/              ← Door program directory
        ├── AquaScan.000       ← Actual door executable
        ├── AquaScanConfig     ← Door configuration
        └── ...                ← Other door files
```

## Example: SCAN.info File

```
ACCESS=100
LOCATION=Doors:AquaScan/AquaScan.000
MULTINODE=YES
TYPE=XIM
STACK=65536
PRIORITY=SAME
```

**Key Point:** `LOCATION=Doors:AquaScan/AquaScan.000`
- `Doors:` is an AmigaDOS assign pointing to `Example_BBS/Doors/`
- The path is `Doors:AquaScan/AquaScan.000`
- This resolves to `Example_BBS/Doors/AquaScan/AquaScan.000`

## Correct Installation Steps

### 1. Create BBS Structure (if not exists)
```
backend/data/bbs/Example_BBS/
├── Commands/BBSCmd/
└── Doors/
```

### 2. Extract Archive to Temp
```
backend/temp/door-install/[archive-name]/
```

### 3. Analyze Contents
- Find `*.info` files → These are command definitions
- Find executables (`.000`, `.020`, `.x`, `.XIM`) → These are door programs
- Determine door name from files

### 4. Install Files

**Command Definition:**
```
[temp]/SCAN.info
  → Example_BBS/Commands/BBSCmd/SCAN.info
```

**Door Program and Data:**
```
[temp]/AquaScan.000
[temp]/AquaScan.020
[temp]/AquaScanConfig
[temp]/...
  → Example_BBS/Doors/AquaScan/AquaScan.000
  → Example_BBS/Doors/AquaScan/AquaScan.020
  → Example_BBS/Doors/AquaScan/AquaScanConfig
  → Example_BBS/Doors/AquaScan/...
```

### 5. Handle BBS/ Subdirectory (if present)

Some archives have a `BBS/` subdirectory:
```
archive.lha/
└── BBS/
    ├── Commands/BBSCmd/*.info  → Example_BBS/Commands/BBSCmd/
    └── Doors/[Name]/*          → Example_BBS/Doors/[Name]/
```

Strip the `BBS/` prefix and install to proper locations.

## Scanning for Installed Doors

**WRONG Way (Current Code):**
```typescript
// Scans backend/doors/ for executable files
const files = fs.readdirSync(doorsPath);
```

**CORRECT Way:**
```typescript
// 1. Scan Example_BBS/Commands/BBSCmd/*.info
const infoFiles = fs.readdirSync('Example_BBS/Commands/BBSCmd');

// 2. For each .info file:
for (const infoFile of infoFiles) {
  // Parse the .info file
  const metadata = parseInfoFile(infoFile);

  // Extract LOCATION
  // Example: "Doors:AquaScan/AquaScan.000"
  const location = metadata.LOCATION;

  // Resolve Doors: assign to Example_BBS/Doors/
  const doorPath = location.replace('Doors:', 'Example_BBS/Doors/');

  // Check if executable exists
  if (fs.existsSync(doorPath)) {
    // Add to door list
    doors.push({
      command: path.basename(infoFile, '.info'),
      name: extractDoorName(doorPath),
      path: doorPath,
      type: metadata.TYPE,
      access: metadata.ACCESS
    });
  }
}
```

## AmigaDOS Assigns (Path Resolution)

| Assign | Maps To | Purpose |
|--------|---------|---------|
| `BBS:` | `Example_BBS/` | BBS data root |
| `Doors:` | `Example_BBS/Doors/` | Door programs |
| `Screens:` | `Example_BBS/Screens/` | Display screens |
| `NODE0:` | `Example_BBS/Node0/` | Node 0 data |

**Example Resolution:**
```
LOCATION=Doors:AquaScan/AquaScan.000
         ↓
Example_BBS/Doors/AquaScan/AquaScan.000
```

## Real Examples from Example_BBS/

### Installed Doors:
1. **AquaScan** (File scanner)
   - Command: `SCAN.info`
   - Location: `Doors:AquaScan/AquaScan.000`
   - Directory: `Example_BBS/Doors/AquaScan/`

2. **FileDescription** (File description editor)
   - Commands: `F.info`, `FR.info`, `CS.info`, `N.info`, `NSU.info`
   - Location: Multiple executables
   - Directory: `Example_BBS/Doors/FileDescription/`

3. **DLT_FileCheck** (File checker)
   - Directory: `Example_BBS/Doors/DLT_FileCheck/`

4. **ExeCheck** (Executable checker)
   - Directory: `Example_BBS/Doors/ExeCheck/`

5. **Mapus** (File viewer/editor)
   - Directory: `Example_BBS/Doors/Mapus/`

6. **ZipCheck** (ZIP file checker)
   - Directory: `Example_BBS/Doors/ZipCheck/`

7. **FullScreenEditor** (Message editor)
   - Directory: `Example_BBS/Doors/FullScreenEditor/`

## Implementation Checklist

- [ ] Create `backend/data/bbs/Example_BBS/` structure
- [ ] Create `Commands/BBSCmd/` subdirectory
- [ ] Create `Doors/` subdirectory
- [ ] Rewrite extraction to use temp directory
- [ ] Implement `.info` file parser
- [ ] Implement archive structure detection
- [ ] Implement proper file placement
- [ ] Rewrite door scanner to read `.info` files
- [ ] Implement AmigaDOS assign resolution
- [ ] Test with real door archives

## Code Locations to Update

1. **Door Installation:** `backend/src/index.ts:3110-3188`
2. **Door Scanning:** `backend/src/index.ts:2268-2309`
3. **Door Display:** `backend/src/index.ts:2478+`

## Testing

Use the example data to verify correct structure:
```bash
# Check structure matches
diff -r Example_BBS/ backend/data/bbs/Example_BBS/

# Verify .info files are in Commands/BBSCmd/
ls backend/data/bbs/Example_BBS/Commands/BBSCmd/*.info

# Verify doors are in Doors/[Name]/
ls -d backend/data/bbs/Example_BBS/Doors/*/
```

## See Also

- [AmiExpress Data Structure](AMIEXPRESS_DATA_STRUCTURE.md) - Full documentation
- [Amiga Door Research](AMIGA_DOOR_RESEARCH.md) - Door execution research
- [Door Manager Integration](DOOR_MANAGER_INTEGRATION.md) - Current (incorrect) implementation
