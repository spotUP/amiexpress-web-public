# Example AmiExpress BBS Data Directory

This directory contains real data from an actual AmiExpress BBS installation. It serves as the **authoritative reference** for understanding the correct directory structure and file organization.

## Purpose

This example data is used for:
- Understanding proper door installation structure
- Reference for implementing the BBS data layer
- Testing door loading and execution
- Validating AmigaDOS path resolution

## Structure Overview

```
Example_BBS/
├── Commands/              # Command definitions (door menu entries)
│   ├── BBSCmd/           # User commands
│   └── SYSCmd/           # Sysop commands
├── Doors/                # Installed door programs
│   ├── AquaScan/        # Example: File scanner door
│   ├── FileDescription/  # Example: File description editor
│   └── ... (7 doors total)
├── Conf01/               # Conference 1 data
├── Conf02/               # Conference 2 data
├── Node0-3/              # Multi-node session data
├── Screens/              # Display screens
├── Storage/              # Icon storage
├── Access/               # Access level definitions
├── Documentation/        # BBS documentation
├── FCheck/               # File checking utilities
├── LCFile/               # Last caller file
├── Partdownload/         # Partial downloads
├── Protocols/            # File transfer protocols
├── SysopStats/           # Sysop statistics
├── Utils/                # Utility programs
├── user.data             # User database
├── user.keys             # User lookup keys
└── user.misc             # User miscellaneous data
```

## Key Discoveries

### 1. Door Installation Structure

Doors are **NOT** installed to a flat directory. The proper structure is:

```
Example_BBS/
├── Commands/BBSCmd/SCAN.info    ← Command definition (menu entry)
└── Doors/AquaScan/              ← Door program and data
    ├── AquaScan.000             ← Executable
    ├── AquaScanConfig           ← Configuration
    └── ... (support files)
```

### 2. Command Definitions

Each door has a `.info` file in `Commands/BBSCmd/` that defines:
- Command name (filename)
- Door executable location (LOCATION field)
- Access requirements
- Process settings

**Example: SCAN.info**
```
ACCESS=100
LOCATION=Doors:AquaScan/AquaScan.000
MULTINODE=YES
TYPE=XIM
STACK=65536
PRIORITY=SAME
```

### 3. AmigaDOS Assigns

The BBS uses logical path assigns:
- `BBS:` → `Example_BBS/`
- `Doors:` → `Example_BBS/Doors/`
- `Screens:` → `Example_BBS/Screens/`
- `NODE0:` → `Example_BBS/Node0/`

These must be resolved when reading `.info` files.

## Installed Doors (Examples)

| Command | Door Name | Directory |
|---------|-----------|-----------|
| SCAN | AquaScan | Doors/AquaScan/ |
| F | FileDescription | Doors/FileDescription/ |
| FR | FileDescription | Doors/FileDescription/ |
| CS | FileDescription | Doors/FileDescription/ |
| N | FileDescription | Doors/FileDescription/ |
| NSU | FileDescription | Doors/FileDescription/ |
| SENT | ? | ? |

## Multi-Node Support

The BBS supports 4 nodes (Node0-3), each with:
- `modem/` - Modem temporary files
- `playpen/` - Temporary working area
- `serial/` - Serial port files
- `work/` - Work directory

## Conference Structure

Each conference (Conf01, Conf02, etc.) contains:
- `Hold/` - Files on hold
- `Lcfiles/` - Last caller files
- `MsgBase/` - Message base
- `PartUpload/` - Partial uploads
- `Uploads/` - Uploaded files

## Usage in Development

When implementing door management:

1. **Reference this structure** for proper file placement
2. **Scan Commands/BBSCmd/*.info** to find installed doors
3. **Parse LOCATION field** to find door executables
4. **Resolve AmigaDOS assigns** to actual paths
5. **Check executable exists** before listing door

## Implementation Target

The web BBS should replicate this structure:
```
backend/data/bbs/Example_BBS/
├── Commands/BBSCmd/
├── Doors/
└── ... (same structure)
```

## Documentation

For complete documentation, see:
- [AmiExpress Data Structure](../Docs/AMIEXPRESS_DATA_STRUCTURE.md)
- [Door Installation Reference](../Docs/DOOR_INSTALLATION_REFERENCE.md)
- [Amiga Door Research](../Docs/AMIGA_DOOR_RESEARCH.md)

## Important Notes

- **DO NOT MODIFY** this directory - it's reference data
- Use this as a template for the actual BBS data structure
- All paths should be relative to support multiple installations
- AmigaDOS assigns must be emulated for door execution

## Origin

This data comes from a real AmiExpress BBS installation and represents the actual file structure used by the Amiga BBS software. It is the ground truth for understanding how AmiExpress organizes its data.
