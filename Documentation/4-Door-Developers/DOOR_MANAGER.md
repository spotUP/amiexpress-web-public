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

TypeScript door archives are **self-contained** and include only the minimal files.
The SDK is not bundled; the BBS already has it installed.

```
Commands/BBSCmd/MYDOOR.info
Doors/mydoor/
  package.json
  package-lock.json
  dist/
    client.bundle.js     # hybrid only
  assets/                # optional
  data/                  # optional
FILE_ID.DIZ              # optional
README.TXT               # optional
```

You can generate this structure with the SDK packer:

```bash
# From your door repo root (must include Commands/BBSCmd/<DOOR>.info)
npm run pack

# Upload the resulting archive via Door Manager
```

The Door Manager enforces this structure for TypeScript doors and will reject archives
missing `Commands/BBSCmd/*.info` or required runtime files.

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

---

## Merged from AmigaGuide Support in Door Manager

### Overview

The Door Manager now supports **AmigaGuide (.guide)** format documentation, the native hypertext documentation format from AmigaOS. This provides an authentic Amiga experience for viewing door documentation.

#### What is AmigaGuide?

AmigaGuide is a hypertext documentation system similar to Windows .hlp files or HTML, but designed specifically for the Amiga. It uses simple markup with @-commands and supports:

- **Nodes**: Separate pages/sections
- **Links**: Hypertext navigation between nodes
- **Formatting**: Bold, underline, italic
- **Navigation**: Next/Previous/TOC/Index
- **Commands**: Database info, author, version

---


### Features Implemented

#### 1. AmigaGuide Parser (`AmigaGuideParser.ts`)

**Supports:**
- `@node` / `@endnode` - Node definitions
- `@database` - Document title
- `@author`, `@version`, `@copyright` - Metadata
- `@{text link target}` - Inline hyperlinks
- `@{b}` / `@{ub}` - Bold formatting
- `@{u}` / `@{uu}` - Underline formatting
- `@{i}` / `@{ui}` - Italic formatting
- `@prev`, `@next`, `@toc`, `@index`, `@help` - Navigation links

#### 2. AmigaGuide Viewer (`AmigaGuideViewer.ts`)

**Features:**
- Interactive node-based navigation
- Hyperlink selection with number keys
- Scrolling for long content
- Navigation history (back button)
- Built-in help screen
- Amiga-compatible ASCII output

#### 3. Door Manager Integration

**Capabilities:**
- Auto-detects `.guide` files in door archives
- Shows "AmigaGuide" indicator in documentation option
- Choice menu if both README and .guide exist
- Seamless integration with existing documentation viewer

---


### Keyboard Navigation

#### AmigaGuide Viewer

| Key | Action |
|-----|--------|
| **UP/DOWN** | Scroll content up/down |
| **PGUP/PGDN** | Page up/down |
| **1-9** | Follow numbered link |
| **N** | Next node (if available) |
| **P** | Previous node (if available) |
| **T** | Table of contents (if available) |
| **I** | Index (if available) |
| **H** | Help screen |
| **B** | Back to previous node |
| **Q** | Quit viewer |

#### Door Info Screen

| Key | Description |
|-----|-------------|
| **D** | View documentation |

If both README and AmigaGuide are present, you'll see:
```
Documentation (README+Guide)
```

When pressed, you can choose:
- `[1]` README (Text)
- `[2]` AmigaGuide (Interactive)

---


### AmigaGuide Format Example

#### Basic Structure

```
@database "My Door Documentation"
@author "John Doe"
@version "1.0"

@node Main "Main Page"

Welcome to My Door!

This door provides @{amazing features link Features}.

@{b}Features:@{ub}
- Feature 1
- Feature 2
- Feature 3

@endnode

@node Features "Features Page"
@prev Main
@next Installation

Here are the amazing features:

1. @{Feature One link FeatureOne}
2. @{Feature Two link FeatureTwo}
3. @{Feature Three link FeatureThree}

@endnode

@node FeatureOne "Feature One"
@prev Features

@{b}Feature One@{ub}

This is a detailed description of Feature One.

Use @{B} to go back, or @{N} for the next page.

@endnode
```

#### Commands Reference

**Document Commands:**
```
@database "Title"       - Document title
@author "Name"          - Author name
@version "1.0"          - Version number
@copyright "Text"       - Copyright notice
@master "NodeName"      - Master node (optional)
```

**Node Commands:**
```
@node Name "Title"      - Start a new node
@endnode                - End current node
@prev NodeName          - Previous node link
@next NodeName          - Next node link
@toc NodeName           - Table of contents link
@index NodeName         - Index link
@help NodeName          - Help link
```

**Inline Formatting:**
```
@{b} ... @{ub}          - Bold text
@{u} ... @{uu}          - Underline text
@{i} ... @{ui}          - Italic text
@{text link NodeName}   - Create hyperlink
@{NodeName}             - Simple link
```

---


### How to Add AmigaGuide to Your Door

#### 1. Create the .guide File

```bash
# Create your guide file
nano mydoor.guide
```

#### 2. Add to Door Archive

When packaging your door as a ZIP:

```
mydoor.zip
├── FILE_ID.DIZ          # Description
├── README.TXT           # Plain text docs (optional)
├── mydoor.guide         # AmigaGuide docs
└── mydoor.ts            # Door executable
```

#### 3. Upload to Door Manager

1. Access Door Manager (DOORMAN command)
2. Press **[U]** to upload
3. Select your ZIP file
4. The system automatically detects the .guide file

#### 4. Viewing

When viewing door info:
- Press **[D]** for documentation
- If both README and .guide exist, choose format
- Navigate using keyboard commands

---


### Parser Implementation Details

#### Node Parsing

The parser reads the .guide file line by line:
1. Identifies `@-commands`
2. Extracts node definitions
3. Parses inline links
4. Processes formatting codes

#### Link Detection

Links are detected in two formats:
- `@{text link target}` - Full format
- `@{target}` - Simple format

Each link is assigned a number for keyboard selection.

#### Rendering

Content is rendered with:
- ANSI color codes for links (cyan/yellow)
- Bold/underline/italic conversion to ANSI
- Word wrapping to fit screen width
- Scroll support for long content

#### Navigation

The viewer maintains:
- Current node name
- Scroll offset
- Navigation history stack
- Available navigation links

---


### Technical Specifications

#### File Format

- **Extension:** `.guide`
- **Encoding:** UTF-8 or ASCII
- **Line Endings:** LF or CRLF
- **Commands:** Case-insensitive

#### Display Settings

- **Width:** 80 columns
- **Height:** 20 lines per page
- **Links:** Numbered 1-N
- **Colors:** ANSI escape codes

#### Limitations

- No graphics/images
- No custom colors (uses ANSI defaults)
- No sounds
- No external file inclusion

---


### Comparison: README vs AmigaGuide

| Feature | README | AmigaGuide |
|---------|--------|------------|
| **Format** | Plain text | Hypertext |
| **Navigation** | Scroll only | Links + nodes |
| **Structure** | Linear | Non-linear |
| **Formatting** | None | Bold/underline/italic |
| **Links** | No | Yes |
| **Sections** | No | Yes (nodes) |
| **Search** | No | No (future) |
| **Size** | Smaller | Larger |
| **Complexity** | Simple | Moderate |

#### When to Use Each

**Use README for:**
- Simple, short documentation
- Quick reference
- Installation notes
- Change logs

**Use AmigaGuide for:**
- Complex documentation
- Multiple sections
- Cross-referenced content
- Tutorial/help systems
- Large manuals

---


### Testing

#### Test with Sample Door

1. Create a test door archive:
```bash
mkdir test-door
cd test-door

# Create simple guide
cat > test.guide << 'EOF'
@database "Test Door"
@author "Test"

@node Main "Test Door Help"

This is a @{test link TestNode}.

Press 1 to follow the link!

@endnode

@node TestNode "Test Node"
@prev Main

You followed the link!

Press B to go back.

@endnode
EOF

# Create door
echo 'console.log("Test door");' > test-door.ts

# Create package
zip test-door.zip test.guide test-door.ts
```

2. Upload via Door Manager
3. View documentation
4. Test navigation

---


### Resources

#### AmigaGuide Specifications

- [AmigaGuide 101](https://wiki.amigaos.net/wiki/AmigaGuide_101)
- [AmigaOS Documentation](http://wiki.amigaos.net/)
- [AmigaGuide Format Reference](http://amigadev.elowar.com/read/ADCD_2.1/Libraries_Manual_guide/node0385.html)

#### Creating AmigaGuide Files

- Use any text editor
- Save with `.guide` extension
- Test in Door Manager
- Validate links and navigation

#### Tools

- **Text Editor:** Any editor (nano, vim, VS Code)
- **Validator:** Built-in parser (shows errors)
- **Tester:** Door Manager documentation viewer

---


### Summary

**AmigaGuide support brings authentic Amiga-style hypertext documentation to the Door Manager**, providing:

✅ **Interactive navigation** - Jump between sections with links
✅ **Rich formatting** - Bold, underline, italic
✅ **Structured content** - Organized in nodes
✅ **History support** - Back button for navigation
✅ **Keyboard-driven** - No mouse required
✅ **Amiga-authentic** - True to the original format

**Perfect for complex door documentation that needs cross-referencing, multiple sections, or tutorial-style content.**

---

**Status:** ✅ PRODUCTION READY
**Version:** 1.0
**Platform:** AmiExpress-Web Door Manager
**Compatibility:** 100% Amiga ASCII compatible

### Example Door Package (from AMIGAGUIDE)

Here's a complete example door package with AmigaGuide documentation:

### mydoor.guide

```
@database "SuperDoor v2.0"
@author "AmiExpress Team"
@version "2.0"
@copyright "2025"

@node Main "SuperDoor Documentation"
@next Installation
@toc TableOfContents
@index Index

@{b}SuperDoor v2.0@{ub}
@{i}The Ultimate BBS Door@{ui}

Welcome to SuperDoor, the most amazing door for your BBS!

@{b}Quick Start:@{ub}
1. @{Installation link Installation}
2. @{Configuration link Configuration}
3. @{Usage link Usage}

@{b}Features:@{ub}
- Feature 1: Amazing stuff
- Feature 2: More amazing stuff
- Feature 3: Even more amazing stuff

Press @{N} for installation instructions.

@endnode

@node Installation "Installation"
@prev Main
@next Configuration

@{b}Installation@{ub}

SuperDoor is already installed via the Door Manager!

Simply run it from the door menu and enjoy.

For advanced configuration, see @{Configuration link Configuration}.

@endnode

@node Configuration "Configuration"
@prev Installation
@next Usage

@{b}Configuration@{ub}

SuperDoor can be configured by editing the config file:

  doors/superdoor.config

Available options:
- option1=value
- option2=value

@endnode

@node Usage "Using SuperDoor"
@prev Configuration
@toc TableOfContents

@{b}Usage@{ub}

To use SuperDoor:

1. Select it from the door menu
2. Follow the on-screen prompts
3. Press Q to quit

@{b}Commands:@{ub}
- H - Help
- Q - Quit
- ? - Show this help

@endnode

@node TableOfContents "Contents"

@{b}Table of Contents@{ub}

1. @{Main Page link Main}
2. @{Installation link Installation}
3. @{Configuration link Configuration}
4. @{Usage link Usage}

@endnode

@node Index "Index"

@{b}Index@{ub}

C
  @{Configuration link Configuration}

I
  @{Installation link Installation}

U
  @{Usage link Usage}

@endnode
```

---

### Future Enhancements (from AMIGAGUIDE)

Potential improvements:
- [ ] Search functionality
- [ ] Bookmark support
- [ ] Node history with forward button
- [ ] External file @include support
- [ ] Custom color schemes
- [ ] Export to HTML
- [ ] Full-text search across all nodes
- [ ] Print support (save to file)

---
