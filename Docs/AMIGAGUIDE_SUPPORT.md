# AmigaGuide Support in Door Manager

**Date:** 2025-10-17
**Status:** ✅ Implemented
**Feature:** Interactive AmigaGuide documentation viewer

---

## Overview

The Door Manager now supports **AmigaGuide (.guide)** format documentation, the native hypertext documentation format from AmigaOS. This provides an authentic Amiga experience for viewing door documentation.

### What is AmigaGuide?

AmigaGuide is a hypertext documentation system similar to Windows .hlp files or HTML, but designed specifically for the Amiga. It uses simple markup with @-commands and supports:

- **Nodes**: Separate pages/sections
- **Links**: Hypertext navigation between nodes
- **Formatting**: Bold, underline, italic
- **Navigation**: Next/Previous/TOC/Index
- **Commands**: Database info, author, version

---

## Features Implemented

### 1. AmigaGuide Parser (`AmigaGuideParser.ts`)

**Supports:**
- `@node` / `@endnode` - Node definitions
- `@database` - Document title
- `@author`, `@version`, `@copyright` - Metadata
- `@{text link target}` - Inline hyperlinks
- `@{b}` / `@{ub}` - Bold formatting
- `@{u}` / `@{uu}` - Underline formatting
- `@{i}` / `@{ui}` - Italic formatting
- `@prev`, `@next`, `@toc`, `@index`, `@help` - Navigation links

### 2. AmigaGuide Viewer (`AmigaGuideViewer.ts`)

**Features:**
- Interactive node-based navigation
- Hyperlink selection with number keys
- Scrolling for long content
- Navigation history (back button)
- Built-in help screen
- Amiga-compatible ASCII output

### 3. Door Manager Integration

**Capabilities:**
- Auto-detects `.guide` files in door archives
- Shows "AmigaGuide" indicator in documentation option
- Choice menu if both README and .guide exist
- Seamless integration with existing documentation viewer

---

## Keyboard Navigation

### AmigaGuide Viewer

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

### Door Info Screen

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

## AmigaGuide Format Example

### Basic Structure

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

### Commands Reference

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

## How to Add AmigaGuide to Your Door

### 1. Create the .guide File

```bash
# Create your guide file
nano mydoor.guide
```

### 2. Add to Door Archive

When packaging your door as a ZIP:

```
mydoor.zip
├── FILE_ID.DIZ          # Description
├── README.TXT           # Plain text docs (optional)
├── mydoor.guide         # AmigaGuide docs
└── mydoor.ts            # Door executable
```

### 3. Upload to Door Manager

1. Access Door Manager (DOORMAN command)
2. Press **[U]** to upload
3. Select your ZIP file
4. The system automatically detects the .guide file

### 4. Viewing

When viewing door info:
- Press **[D]** for documentation
- If both README and .guide exist, choose format
- Navigate using keyboard commands

---

## Example Door Package

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

## Parser Implementation Details

### Node Parsing

The parser reads the .guide file line by line:
1. Identifies `@-commands`
2. Extracts node definitions
3. Parses inline links
4. Processes formatting codes

### Link Detection

Links are detected in two formats:
- `@{text link target}` - Full format
- `@{target}` - Simple format

Each link is assigned a number for keyboard selection.

### Rendering

Content is rendered with:
- ANSI color codes for links (cyan/yellow)
- Bold/underline/italic conversion to ANSI
- Word wrapping to fit screen width
- Scroll support for long content

### Navigation

The viewer maintains:
- Current node name
- Scroll offset
- Navigation history stack
- Available navigation links

---

## Technical Specifications

### File Format

- **Extension:** `.guide`
- **Encoding:** UTF-8 or ASCII
- **Line Endings:** LF or CRLF
- **Commands:** Case-insensitive

### Display Settings

- **Width:** 80 columns
- **Height:** 20 lines per page
- **Links:** Numbered 1-N
- **Colors:** ANSI escape codes

### Limitations

- No graphics/images
- No custom colors (uses ANSI defaults)
- No sounds
- No external file inclusion

---

## Comparison: README vs AmigaGuide

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

### When to Use Each

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

## Testing

### Test with Sample Door

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

## Future Enhancements

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

## Resources

### AmigaGuide Specifications

- [AmigaGuide 101](https://wiki.amigaos.net/wiki/AmigaGuide_101)
- [AmigaOS Documentation](http://wiki.amigaos.net/)
- [AmigaGuide Format Reference](http://amigadev.elowar.com/read/ADCD_2.1/Libraries_Manual_guide/node0385.html)

### Creating AmigaGuide Files

- Use any text editor
- Save with `.guide` extension
- Test in Door Manager
- Validate links and navigation

### Tools

- **Text Editor:** Any editor (nano, vim, VS Code)
- **Validator:** Built-in parser (shows errors)
- **Tester:** Door Manager documentation viewer

---

## Summary

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

