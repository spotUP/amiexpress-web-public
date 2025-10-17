# Door Manager - AmiExpress-Web

A comprehensive TypeScript door for managing BBS doors in AmiExpress-Web.

## Features

✅ **List All Installed Doors**
- View all TypeScript, Amiga, and archived doors
- Color-coded by type (TS/AMI/ARC)
- Shows installation status
- Displays file sizes

✅ **Arrow Key Navigation**
- Navigate with ↑/↓ arrow keys
- Selected door has blue background highlight
- Automatic page scrolling (15 doors per page)

✅ **File Upload**
- Upload door archives (ZIP format)
- Automatic extraction of metadata
- Immediate display of door information after upload

✅ **Door Information Page**
- Comprehensive door details:
  - Name, type, size, date
  - Author, version (from FILE_ID.DIZ)
  - Installation status
  - Executable name
- Displays FILE_ID.DIZ content
- Shows description from metadata

✅ **Install/Uninstall**
- One-key install from archives
- One-key uninstall of installed doors
- Automatic file extraction
- Permission handling (Unix)

✅ **Documentation Viewer**
- Auto-detects README files
- Auto-detects .NFO files
- Scrollable viewer (20 lines per page)
- Arrow key navigation

---

## Installation

### 1. Add Dependency

The `adm-zip` package is required for ZIP archive handling:

```bash
cd backend
npm install adm-zip
```

### 2. Create Directories

```bash
mkdir -p backend/doors/archives
```

### 3. Integrate with BBS

Add the Door Manager to your door list in `index.ts`:

```typescript
// In the door command handler
if (command === 'DOORMAN' || command === 'DM') {
  const { executeDoor } = await import('./doors/DoorManager');
  await executeDoor(socket);
  return;
}
```

Or add to door menu in your BBS configuration.

---

## Usage

### For BBS Users

1. **Launch Door Manager**
   ```
   Command: DOORMAN
   ```

2. **Navigate the List**
   - Press ↑/↓ to move between doors
   - Selected door has blue background

3. **View Door Information**
   - Press ENTER on a door to see details
   - View FILE_ID.DIZ, author, version, etc.

4. **Upload a Door**
   - Press U from the door list
   - Select a ZIP file containing the door
   - View info page automatically after upload

5. **Install a Door**
   - Navigate to a door (archived)
   - Press ENTER to view info
   - Press I to install
   - Door is extracted and ready to use

6. **Uninstall a Door**
   - Navigate to an installed door
   - Press ENTER to view info
   - Press U to uninstall
   - Door file is removed

7. **View Documentation**
   - On door info page
   - Press D if documentation is available
   - Scroll with ↑/↓ arrows
   - Press B to go back

8. **Exit**
   - Press Q from any screen

---

## Door Archive Format

Doors should be packaged as ZIP archives with the following structure:

```
mydoor.zip
├── FILE_ID.DIZ          # Door metadata (required)
├── mydoor.exe           # Executable (or .ts, .js)
├── README.TXT           # Documentation (optional)
├── INSTALL.NFO          # Additional info (optional)
└── ... other files
```

### FILE_ID.DIZ Format

```
My Awesome Door v1.0
A great BBS door game

Author: John Doe
Version: 1.0
Type: Text Adventure

Description:
This door provides an exciting
text-based adventure experience
for your BBS users.
```

The Door Manager will parse this to extract:
- Name (first line)
- Author (looks for "Author:", "by", etc.)
- Version (looks for "Version:", "v", etc.)
- Description (remaining text)

---

## Keyboard Commands

### Door List Screen

| Key | Action |
|-----|--------|
| ↑ | Move selection up |
| ↓ | Move selection down |
| ENTER | View door information |
| U | Upload new door |
| Q | Quit/Exit door manager |

### Door Info Screen

| Key | Action |
|-----|--------|
| I | Install door (if not installed) |
| U | Uninstall door (if installed) |
| D | View documentation (if available) |
| B | Back to door list |
| Q | Quit/Exit door manager |

### Documentation Viewer

| Key | Action |
|-----|--------|
| ↑ | Scroll up |
| ↓ | Scroll down |
| B | Back to door info |
| Q | Quit/Exit door manager |

---

## File Locations

```
backend/
├── doors/                    # Installed door executables
│   ├── mydoor.exe           # Amiga doors
│   ├── mygame.ts            # TypeScript doors
│   └── archives/            # Uploaded archives
│       ├── mydoor.zip       # Archived doors (not yet installed)
│       └── anotherdoor.zip
└── src/
    └── doors/
        └── DoorManager.ts   # Door Manager source
```

---

## Technical Details

### Supported Door Types

1. **TypeScript Doors (.ts, .js)**
   - Natively executable
   - Direct integration with BBS
   - Full Socket.io access

2. **Amiga Doors (binary, .exe)**
   - Requires Amiga emulation layer
   - 68000 CPU emulation via WebAssembly
   - See `amiga-emulation/` for details

3. **Archived Doors (.zip)**
   - ZIP format only (currently)
   - Can contain any door type
   - Extracted on install

### Archive Processing

When an archive is uploaded:

1. **Scan Archive**
   - Extract file list
   - Identify executable
   - Find FILE_ID.DIZ
   - Find README/NFO files

2. **Parse Metadata**
   - Read FILE_ID.DIZ
   - Extract author, version, description
   - Cache for display

3. **Store Archive**
   - Save to `doors/archives/`
   - Mark as "not installed"
   - Available for browsing

4. **On Install**
   - Extract executable to `doors/`
   - Set permissions (Unix: 755)
   - Mark as "installed"
   - Ready to launch

### FILE_ID.DIZ Parsing

The parser looks for these patterns:

- **Author**: `by`, `author`, `coded by`, `written by`
- **Version**: `v`, `version`, `ver`
- **Description**: All remaining text after metadata

Example:
```
Space Quest BBS Door v2.1
By John Smith

An adventure game for your BBS
featuring space exploration and
multiple endings.
```

Parsed as:
- Name: "Space Quest BBS Door"
- Version: "2.1"
- Author: "John Smith"
- Description: "An adventure game for your BBS..."

---

## Integration with BBS

### Option 1: Door Command

Add to main BBS command handler:

```typescript
// In index.ts or door handler
socket.on('terminal-input', async (data: string) => {
  const command = data.trim().toUpperCase();

  if (command === 'DOORMAN' || command === 'DM') {
    const { executeDoor } = await import('./doors/DoorManager');
    await executeDoor(socket);
    return;
  }

  // ... other commands
});
```

### Option 2: Door Menu Entry

Add to doors menu configuration:

```typescript
const doors = [
  {
    id: 'doorman',
    name: 'Door Manager',
    description: 'Manage and install BBS doors',
    handler: async (socket) => {
      const { executeDoor } = await import('./doors/DoorManager');
      await executeDoor(socket);
    }
  },
  // ... other doors
];
```

### Option 3: Sysop Menu

Add to sysop-only menu:

```typescript
if (session.user.securityLevel >= 255) {
  menu.addItem('DOORMAN', 'Door Manager', async () => {
    const { executeDoor } = await import('./doors/DoorManager');
    await executeDoor(socket);
  });
}
```

---

## Security Considerations

### File Upload Security

- **Max Size**: 10MB (configurable)
- **Format**: ZIP only (validated)
- **Destination**: Restricted to `doors/archives/`
- **Filename**: Sanitized to prevent path traversal

### Installation Security

- **Permissions**: Executable files set to 755 (Unix)
- **Path Validation**: No directory traversal allowed
- **Overwrite Protection**: Existing files not overwritten without confirmation

### Access Control

Recommended: Restrict Door Manager to sysops (security level 255):

```typescript
if (session.user.securityLevel < 255) {
  socket.emit('ansi-output', '\x1b[31mAccess Denied: Sysop Only\x1b[0m\r\n');
  return;
}
```

---

## Troubleshooting

### "No doors installed"

**Solution**: Upload or copy door files to `backend/doors/`

### Upload not working

**Check:**
1. `doors/archives/` directory exists
2. Write permissions on directory
3. File size under 10MB
4. File is valid ZIP format

### Door won't install

**Check:**
1. Archive contains executable file
2. `doors/` directory is writable
3. No conflicting filename
4. Valid door archive format

### FILE_ID.DIZ not showing

**Check:**
1. File is named exactly `FILE_ID.DIZ`
2. File is in root of ZIP archive
3. File is valid text format
4. No special characters causing parse errors

### Documentation not available

**Check:**
1. Archive contains README.TXT or .NFO file
2. File is in root of ZIP archive
3. File is valid text format

---

## Future Enhancements

Planned features:

- [ ] Support for LHA archives
- [ ] Direct door testing from manager
- [ ] Door configuration editor
- [ ] Usage statistics
- [ ] Door ratings/reviews
- [ ] Automatic door updates
- [ ] Door dependency management
- [ ] Multi-file door support
- [ ] Door categories/tags
- [ ] Search/filter functionality

---

## Example Door Package

Here's how to create a door package:

```bash
# 1. Create directory
mkdir mydoor
cd mydoor

# 2. Create FILE_ID.DIZ
cat > FILE_ID.DIZ << 'EOF'
My Awesome Door v1.0
By John Doe

A fun text adventure game
for AmiExpress-Web BBS.

Features:
- Multiple rooms
- Inventory system
- Save/Load game
EOF

# 3. Create README
cat > README.TXT << 'EOF'
My Awesome Door
===============

Installation:
Just install via Door Manager!

Usage:
Navigate with N/S/E/W commands
Use INVENTORY to see items
Use SAVE to save your game

Enjoy!
EOF

# 4. Copy your door executable
cp ../mydoor.ts .

# 5. Create ZIP
zip -r mydoor.zip *

# 6. Upload to BBS via Door Manager
```

---

## Support

For issues or questions:

1. Check this README
2. Review door archive format
3. Check file permissions
4. Review BBS logs
5. Open GitHub issue

---

## License

Part of AmiExpress-Web
See main project LICENSE file

---

**Created:** October 17, 2025
**Version:** 1.0.0
**Status:** Production Ready
