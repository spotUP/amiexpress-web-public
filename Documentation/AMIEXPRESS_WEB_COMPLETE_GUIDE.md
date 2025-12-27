# AmiExpress-Web: Complete User and Developer Guide

**Version**: 1.0
**Last Updated**: December 2025
**Status**: Active Development (60-70% complete)

---

## Table of Contents

1. [Introduction](#introduction)
2. [What is AmiExpress-Web?](#what-is-amiexpress-web)
3. [System Overview](#system-overview)
4. [User Guide](#user-guide)
5. [System Administrator Guide](#system-administrator-guide)
6. [Command Reference](#command-reference)
7. [MCI Code Reference](#mci-code-reference)
8. [Door Development](#door-development)
9. [Architecture & Technical Details](#architecture--technical-details)
10. [Troubleshooting](#troubleshooting)

---

## Introduction

**AmiExpress-Web** is a modern TypeScript port of the classic **AmiExpress/!X** BBS software, originally developed for Amiga computers in the late 1980s. This project preserves and modernizes the legendary BBS experience with contemporary web technologies while maintaining compatibility with thousands of classic Amiga door programs.

### Historical Context

AmiExpress was developed by:
- **Mike Thomas** (Synthetic Technologies, 1989-1991) - Original creator
- **LightSpeed Technologies Inc.** (1993-1994) - Commercial development
- **Darren Coles** (2018-2024) - Modern maintenance and documentation

AmiExpress-Web represents the first successful port of AmiExpress to modern platforms, combining:
- **Authentic 68K binary emulation** (MOIRA CPU in WebAssembly)
- **Modern web infrastructure** (Node.js, React, TypeScript)
- **Multi-protocol access** (HTTP/WebSocket, Telnet, SSH)
- **Contemporary game engines** (graphics, physics, audio, tactical combat)

### Project Philosophy

This project is **educational software preservation**, not destructive technology:
- Preserves 1980s-90s BBS culture and history
- Enables retro computing enthusiasts to experience classic BBS systems
- Provides foundation for door developers to create new BBS experiences
- Demonstrates how to bridge legacy systems with modern web platforms

---

## What is AmiExpress-Web?

### For Users: A Classic BBS Experience, Modernized

AmiExpress-Web provides the authentic BBS experience:

- **Terminal-based interface** via modern browsers or Telnet/SSH
- **Message boards** for reading and posting discussions
- **File sharing** with upload/download capabilities
- **Multi-node chat** for real-time communication
- **Classic games and utilities** (doors) from the 1980s-90s era
- **Modern games** using the built-in SDK framework

Access the BBS from:
- **Web Browser**: `http://localhost:3001/` (modern, responsive)
- **Telnet**: `telnet localhost 2323` (classic terminal)
- **SSH**: `ssh localhost -p 2222` (secure terminal)

### For System Administrators: Full Control

Complete BBS administration:

- **User management**: Create, edit, delete users with customizable permissions
- **Conference management**: Multiple message bases with independent settings
- **File area management**: Organize files with upload/download quotas
- **System configuration**: Customize BBS name, sysop info, display settings
- **Door installation**: Manage both classic 68K doors and modern TypeScript doors
- **Access control**: Granular permissions per user, conference, or file area
- **Monitoring**: Real-time user tracking, call logs, statistics

### For Door Developers: Create Custom Experiences

Two powerful door frameworks:

1. **68K Doors** (Legacy Amiga binaries)
   - Run thousands of existing Amiga doors unchanged
   - Full compatibility with AEDoor.library, dos.library, etc.
   - Authentic Amiga 68K CPU emulation

2. **TypeScript Doors** (Modern SDK)
   - Create doors in TypeScript with hot-reload development
   - 12 game engines for graphics, physics, audio, AI, network, tactical combat
   - Neo-Blessed UI framework for desktop-style interfaces
   - Package and distribute independently

---

## System Overview

### Architecture

AmiExpress-Web is built on a modern 3-tier architecture:

```
┌─────────────────────────────────────────────────────┐
│           Web Frontends (Browsers/Terminals)         │
│  WebSocket (port 3001) | Telnet (2323) | SSH (2222) │
└─────────────────────────┬───────────────────────────┘
                          │
┌─────────────────────────┴───────────────────────────┐
│          Backend Server (Node.js/TypeScript)        │
│  Port 3001 (HTTP/WebSocket), 8080 (SDK Preview)     │
│                                                     │
│  - Session management                              │
│  - User authentication                             │
│  - Command routing                                 │
│  - Door execution (68K via MOIRA)                  │
│  - Message system                                  │
│  - File operations                                 │
│  - MCI code processing                             │
│  - AREXX interpreter                               │
└─────────────────────────┬───────────────────────────┘
                          │
┌─────────────────────────┴───────────────────────────┐
│          SQLite Database + File System              │
│  - Users (SQLite)                                   │
│  - Messages (SQLite)                                │
│  - Conferences (disk .info files)                   │
│  - File areas (disk organization)                   │
│  - Door executables (68K binaries + TS packages)    │
└─────────────────────────────────────────────────────┘
```

### Key Components

#### 1. Multi-Protocol Server
- **HTTP/WebSocket** (port 3001): Modern web browsers, real-time terminal emulation
- **Telnet** (port 2323): Classic terminal clients
- **SSH** (port 2222): Secure terminal access with host key generation
- Single backend server handles all protocols seamlessly

#### 2. 68K Emulation (MOIRA)
- Full Motorola 68000 CPU emulation in WebAssembly
- Executes unmodified Amiga 68K door binaries
- Kickstart 3.1 ROM integration for authentic library calls
- XIM protocol for door-to-BBS communication

#### 3. Session Management
- Per-node session tracking (100 concurrent nodes supported)
- User login/logout with access control
- Conference and file area tracking
- Real-time presence tracking for chat

#### 4. Command Processing
- **189 substates** across 32 handler modules
- **3-tier command resolution**:
  1. SYSCMD (system commands from SysCmd directory)
  2. BBSCMD (user commands from BBSCmd directory)
  3. Internal commands (built-in BBS functionality)
- Support for typed-in or menu-driven commands

#### 5. Message System
- **Multiple message bases** per conference
- **Message threading** with pointer system
- **Search and filtering** by user, date, or content
- **QWK/REP mail** for offline message packet generation
- **Moderation** capabilities (edit, delete, flag)

#### 6. File System
- **Multiple file areas** with independent settings
- **Archive support**: ZIP, LZX, LHA, TAR, DMS extraction
- **FILE_ID.DIZ** extraction for file descriptions
- **Upload/download** with Zmodem protocol support
- **Amiga ASCII art** display with proper formatting

#### 7. Door System
- **68K Binary Doors**: Authentic Amiga executables (78+ installed)
- **TypeScript Doors**: Modern SDK doors with hot-reload
- **Door Types Supported**:
  - SIM (Standard I/O Modem)
  - TIM (Telnet I/O Modem)
  - XIM (Extended I/O Modem) - 18 commands
  - AIM (AREXX I/O Modem)
  - IIM (Icon I/O Modem)
  - Custom types via SDK

#### 8. AREXX Interpreter
- Full AREXX language support (1905 lines)
- **40+ BBS API functions** for door integration
- **Functions**: BBSWRITE, BBSGETUSER, BBSPOSTMSG, BBSDOWNLOAD, etc.
- Drop file generation (DOOR.SYS, DORINFO1.DEF)
- Perfect for running classic AREXX automation doors

---

## User Guide

### Accessing the BBS

#### Web Browser (Recommended for Most Users)
```
1. Open http://localhost:3001 in your web browser
2. Enter username at login prompt
3. Enter password
4. Press Enter to proceed
```

Features:
- Mouse support for interactive doors
- Full-screen terminal emulation
- Responsive design
- Real-time chat
- File downloads via browser

#### Telnet (Classic Terminal)
```
telnet localhost 2323
```

Features:
- Pure ANSI/ASCII experience
- Works with vintage terminal programs
- Supports all BBS commands
- Compatible with classic Amiga modem programs

#### SSH (Secure Connection)
```
ssh localhost -p 2222
```

Features:
- Encrypted connection
- Terminal multiplexing support
- Host key authentication
- Modern terminal clients

### Login Process

1. **Enter Username**: Type your username (new users can register)
2. **Enter Password**: Type your password
3. **First Time**:
   - System asks for real name
   - Asks for location
   - Asks for terminal type preference
   - Sets initial access level (user-configurable by sysop)

### Main Menu Commands

#### Essential Commands

| Command | Description |
|---------|-------------|
| J | Join a different conference |
| S | Scan messages (read new messages) |
| E | Enter a message (post) |
| G | Grab files (list and mark for download) |
| U | Upload files |
| L | List files in area |
| T | Transfer (download marked files) |
| W | Who's online (view current users) |
| A | Aliases (manage your alternate names) |
| P | Page sysop (send message to system operator) |
| Q | Quit/Logoff |

#### Message Commands (When Reading Mail)

| Key | Description |
|-----|-------------|
| S | Skip message |
| Q | Quit message reading |
| F | Flag message |
| E | Edit/reply to message |
| N | Next message |

#### File Commands

| Command | Description |
|---------|-------------|
| L | List files in current area |
| G | Grab/flag file for download |
| U | Upload new file |
| T | Transfer (download) marked files |
| D | Download single file |
| ? | File help |

### MCI Codes

MCI (Modem Control Interface) codes are special sequences that customize display output. They're formatted as `~XX` where XX is a two-letter code.

**Common MCI Codes:**

| Code | Output | Example |
|------|--------|---------|
| ~N | Your username | ~N |
| ~UL | Your location | ~UL |
| ~LC | Last call date/time | ~LC |
| ~TC | Times called | ~TC |
| ~M | Messages posted | ~M |
| ~A | Access level | ~A |
| ~DB | Download bytes | ~DB |
| ~UB | Upload bytes | ~UB |
| ~DT | Current date/time | ~DT |
| ~CN | Conference name | ~CN |
| ~MN | Message base name | ~MN |
| ~CF | Current conference number | ~CF |

See [MCI Code Reference](#mci-code-reference) for complete list (90+ codes).

### User Profile Settings

Access via `A` (Aliases) or `U` (User settings):

- **Real Name**: Your full name (optional)
- **Location**: City/state or geographic location
- **Phone**: Optional phone number
- **Terminal Type**: ANSI, VT100, or PETSCII
- **Screen Length**: Lines per screen (default: 22)
- **Messages**: Email vs public message preference
- **Download Ratio**: Ratio enforcement for uploads/downloads

---

## System Administrator Guide

### Starting the BBS

```bash
cd /path/to/amiexpress-web
./dev/scripts/start-servers.sh
```

Access admin interface:
- **Admin Panel**: `http://localhost:3001/admin/`
- **SDK Preview**: `http://localhost:3001/sdk/` (door development)

### Configuration Files

AmiExpress-Web uses **disk-based configuration** (not database):

#### Core Configuration

**bbsConfig.info** - Main BBS settings
```
BBSNAME=My Awesome BBS
SYSOP=John Smith
LOCATION=New York
LOGON_TIMEOUT=300
MAX_NODES=100
MULTINODE_CHAT=TRUE
```

**ConfConfig.info** - Conference definitions
```
NCONFS=5
NAME.1=General Discussion
LOCATION.1=Conf01/
NAME.2=Technical Talk
LOCATION.2=Conf02/
...
```

**Conf{N}.info** - Per-conference settings
```
NDIRS=3
DLPATH.1=files/
ULPATH.1=upload/
NAME.1=General Files
...
```

#### Access Control

**ACS (Access Control System)** - Fine-grained permissions

```
ACS_LOGON=TRUE          # Can log on
ACS_LOGON_NEW=TRUE      # New users allowed
ACS_UPLOAD=FALSE        # Can't upload
ACS_DOWNLOAD=TRUE       # Can download
ACS_MAIL=TRUE           # Can read mail
ACS_POST=ACS_POST       # Can post
ACS_CHANGE_PASS=TRUE    # Can change password
ACS_CHAT=TRUE           # Multi-node chat
```

### User Management

#### Add New User

```
Admin Panel → Users → Add User
```

Fields:
- Username (unique)
- Initial password
- Real name
- Security level (0-255, higher = more access)
- Download/upload limits
- Ratio enforcement
- Conference access list

#### User Security Levels

| Level | Description |
|-------|-------------|
| 0-9 | New users |
| 10-99 | Regular users |
| 100-199 | Premium users |
| 200-254 | Moderators/Helpers |
| 255 | Sysop (full access) |

#### Manage User Access

Assign per-user:
- Conference access
- Download limits (MB per day)
- Upload limits (MB per day)
- Download/upload ratio (e.g., 3:1 means upload 1MB to download 3MB)
- Time limit per call (minutes)
- File area access

### Conference Management

#### Create New Conference

```
Admin Panel → Conferences → Add Conference
```

Configuration:
- Conference name (appears in menu)
- File path (where messages stored)
- File areas within conference
- Message bases (multiple message databases)
- Custom command prefix (optional)
- Read/post access settings

#### Message Base Settings

Per-message-base configuration:
```
READALL=FALSE          # Users can read all messages
POSTALL=FALSE          # Users can post anywhere
MODERATORS=sysop,user # Message moderators
MAXMESSAGES=10000      # Max messages before purge
PURGE_DAYS=30          # Auto-delete messages older than N days
```

#### File Area Settings

Per-file-area configuration:
```
NUPLOADS=5             # Files per user allowed
MAXUPLOADSIZE=50MB     # Max single file size
MAXUPLOADTOTAL=500MB   # Max per-user storage
AUTODESCRIBE=TRUE      # Extract FILE_ID.DIZ automatically
ARCHIVE_EXTRACT=TRUE   # Extract archives for viewing
```

### Door Management

#### Install 68K Binary Door

```bash
# Copy door to Doors/ directory
cp /path/to/door.exe Doors/DOORNAME/

# Create .info file with metadata
# DOORNAME.info contains TYPE, LOCATION, NAME, etc.
```

#### Install TypeScript Door

```bash
# Use SDK CLI
cd sdk
npm run create-door

# OR copy pre-built door
cp -r /path/to/door sdk/doors/
npm run build
```

#### Door Metadata (.info file)

```
NAME=My Door Name
LOCATION=Doors/DOORNAME/door.exe
TYPE=XIM                          # SIM, TIM, XIM, etc.
ACCESS=0                          # Min security level
PASSWORD=optional                 # Optional door password
BANNER=screens/banner.txt         # Optional intro screen
PRIORITY=same                     # Process priority
STACK=20000                       # Stack size in bytes
RESIDENT=FALSE                    # Keep loaded in memory
LOG_INPUTS=FALSE                  # Log user input for debugging
```

### Screen Files & Customization

#### Display Files

Screen files are ANSI art with MCI codes:

```ansi
[33m====================================
[32m~CN - Main Menu[0m
[33m====================================

[32m~SCA - Anonymous File Area[0m
[32m~SCG - Games[0m
[32m~SCM - Message Forums[0m

Enter Choice [1-\d]:
```

#### Menu Creation

1. Create ANSI art file with your favorite editor
2. Insert MCI codes for dynamic content
3. Save to `Screens/` directory
4. Reference in MENU.TXT or display via `~SS_filename.txt`

### Statistics & Monitoring

Real-time dashboard shows:
- Current users online
- Call count today
- Total user registrations
- Message count per conference
- File area statistics
- Recent user activity

View via Admin Panel → Dashboard

### Maintenance Tasks

#### Daily
- Monitor disk space
- Check error logs
- Verify backups

#### Weekly
- Review user access logs
- Check for spam/abuse
- Update software

#### Monthly
- Archive old messages
- Analyze statistics
- User management cleanup
- Door compatibility testing

---

## Command Reference

### Internal Commands (A-Z)

AmiExpress-Web implements 26+ built-in commands replicating the original AmiExpress behavior:

#### A - Aliases
Manage your alternate names/handles for posting anonymously.

#### B - Bulletin Board
Display bulletins for current conference.

#### C - Conference List
Show all accessible conferences with brief descriptions.

#### D - Download Files
Browse and download files from current file area.

#### E - Enter Message
Post a new message to current message base.

#### F - Flagged Files
List files marked for download.

#### G - Grab (Flag) File
Mark file for download in batch mode.

#### H - Help
Display BBS help and command reference.

#### J - Join Conference
Switch to different conference.

#### L - List Messages
List recent messages in current message base with filtering.

#### M - Message Search
Find messages by author, subject, date, or content.

#### N - New Messages
Display count of unread messages.

#### O - Online Users
Show who's logged in (same as ~W~).

#### P - Page Sysop
Send urgent message to system operator.

#### Q - Quit
Log off and disconnect.

#### R - Read Message
Display single message with navigation.

#### S - Scan Messages
Read all new messages in current conference.

#### T - Transfer (Download)
Download files marked with G command.

#### U - Upload File
Upload new file to current area.

#### V - View File
Display file content (text, ANSI, or Amiga ASCII art).

#### W - Who's Online
List current users and their activities.

#### X - Xfer Protocol
Change file transfer protocol (Zmodem, etc.).

#### Y - Your Info
View and edit your user profile.

#### Z - Zap (Delete) Message
Delete message you posted (if permitted).

### Command Priority

Commands are resolved in this order:

1. **SYSCMD** (System Commands)
   - Located in `Commands/SysCmd/`
   - Most privileged, sysop-only
   - Examples: System maintenance, user management

2. **BBSCMD** (BBS Commands)
   - Located in `Commands/BBSCmd/`
   - User-level commands
   - Examples: WHO, DOORS, FILE_TRANSFER

3. **INTCMD** (Internal Commands)
   - Built-in to BBS engine
   - Executed if no external command found
   - Guaranteed to always exist

### External Commands (.info files)

Create custom commands by adding .info files:

```
Commands/BBSCmd/MYCOMMAND.info
```

Format:
```
NAME=My Custom Command
LOCATION=Commands/BBSCmd/mycommand.exe
TYPE=SIM                    # Door type
ACCESS=10                   # Min security level
PASS_PARAMETERS=1           # Pass command params
INTERNAL=internalCommand*   # Route to internal
```

---

## MCI Code Reference

### User Information Codes

**Personal Data**
| Code | Description | Example |
|------|-------------|---------|
| ~N | Username | Guest123 |
| ~RN | Real name | John Smith |
| ~IN | Internet name | john@example.com |
| ~UL | Location | New York, NY |
| ~# | Phone number | 555-1234 |

**Activity Statistics**
| Code | Description | Example |
|------|-------------|---------|
| ~TC | Times called today | 2 |
| ~TT | Times called total | 48 |
| ~LC | Last call (date/time) | 12/25/2025 10:30 |
| ~M | Messages posted | 156 |
| ~A | Access level | 100 |
| ~S | User slot/ID | 5 |

**Transfer Statistics**
| Code | Description | Example |
|------|-------------|---------|
| ~UB | Upload bytes (total) | 52,428,800 |
| ~DB | Download bytes (total) | 314,572,800 |
| ~SU | Upload size (formatted) | 50 MB |
| ~SD | Download size (formatted) | 300 MB |
| ~FU | Upload count | 12 |
| ~FD | Download count | 45 |
| ~BD | Today's download limit | 1,073,741,824 |

**Access & Security**
| Code | Description | Example |
|------|-------------|---------|
| ~CA | Conference access list | 1,2,3,4,5 |

### System Information Codes

**Time & Date**
| Code | Description | Example |
|------|-------------|---------|
| ~DT | Current date | 12/25/2025 |
| ~OD | Login date | 12/25/2025 |
| ~OT | Login time | 10:30 AM |
| ~CT | Current time | 10:45 AM |

**BBS Information**
| Code | Description | Example |
|------|-------------|---------|
| ~VE | BBS version | 1.0.0 |
| ~VD | Version date | 12/25/2025 |
| ~BR | Baud rate | 115200 |
| ~TL | Time limit | 60 (minutes) |
| ~TR | Time remaining | 45 (minutes) |
| ~LG / ~ON | Node number | 1 |
| ~ND | Node number | 1 |
| ~SC | Caller count | 247 |
| ~HW | Terminal type | ANSI |

### Conference Information Codes

| Code | Description | Example |
|------|-------------|---------|
| ~CF | Conference number (relative) | 2 |
| ~CN | Conference name | General Discussion |
| ~MB | Message base number | 1 |
| ~MN | Message base name | Main |

### File Transfer Codes

| Code | Description |
|------|-------------|
| ~FF | List flagged files |
| ~FC | Count of flagged files |
| ~FL | List file details |

### Display Control Codes

**Color Codes**
| Code | Color | Code | Color |
|------|-------|------|-------|
| ~c0 | Black | ~c4 | Blue |
| ~c1 | Red | ~c5 | Magenta |
| ~c2 | Green | ~c6 | Cyan |
| ~c3 | Yellow | ~c7 | White |

**Background Colors**
| Code | Color | Code | Color |
|------|-------|------|-------|
| ~b0 | Black BG | ~z4 | Blue BG |
| ~b1 | Red BG | ~z5 | Magenta BG |
| ~b2 | Green BG | ~z6 | Cyan BG |
| ~b3 | Yellow BG | ~z7 | White BG |

**Formatting**
| Code | Effect |
|------|--------|
| ~q | Reset colors to default |
| ~f | Clear screen |
| ~h | Backspace |
| ~CL | List all conferences |
| ~CD | Compress conf list (2 columns) |
| ~ML | List message bases |
| ~MD | Compress msgbase list (2 columns) |

**Delays & Input**
| Code | Effect |
|------|--------|
| ~w\d | Wait N tenths of second (0-9) |
| ~SP | Pause, wait for spacebar |
| ~CR | Wait for any key press |

**File Display**
| Code | Effect |
|------|--------|
| ~SS_\filename | Display file at given path |
| ~SX_\filename | Sequential display (numbered files) |
| ~SR_\filename | Random file from set |

**Special**
| Code | Effect |
|------|--------|
| ~AK | Display available keyboard commands |
| ~D\x | Set MCI terminator to character \x |

### Line Breaks

| Code | Effect |
|------|--------|
| ~n1-9 | Insert 1-9 blank lines |

### Advanced Codes

**Async Execution**
| Code | Effect |
|------|--------|
| ~XC_\command | Execute command asynchronously |
| ~XI | Get command input |

**Conditional**
| Code | Effect |
|------|--------|
| ~CR_\prompt | Show prompt, wait for keypress |

**Menu Tracking**
| Code | Effect |
|------|--------|
| ~SM_\name | Set current menu name (internal) |

---

## Door Development

### For 68K Binary Door Creators

68K doors are unmodified Amiga C/Assembly programs that run on the MOIRA CPU emulator.

#### Development Tools

**Recommended Setup**
```bash
# AmigaOS SDK (NDK 3.2R4)
brew install m68k-amiga-elf-gcc
brew install vbcc vasm

# Building
make door NAME=mydoor       # Compile
```

#### Door Structure (68K C)

```c
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <exec/types.h>
#include <dos/dos.h>

// XIM communication
#define JH_INIT 1
#define JH_STAT 2
#define JH_READ 3
#define JH_WRITE 4

struct BBSInfo {
    char userName[40];
    char location[40];
    int timeOnBoard;
    int numCalls;
};

int main(int argc, char *argv[]) {
    // Read BBSInfo from JH_STAT
    struct BBSInfo info;

    // Door logic here
    printf("Welcome to My Door!\n");
    printf("User: %s\n", info.userName);

    return 0;
}
```

#### Example Makefile

```makefile
door:
	m68k-amiga-elf-gcc -o mydoor mydoor.c -lc
	elf2hunk mydoor mydoor.exe
	rm mydoor
```

#### Libraries Available

**AEDoor.library** - XIM protocol
- SendStrCmd() - Send string command
- GetDoorMsg() - Receive message
- PutMsg() - Send message

**dos.library** - File I/O
- Open(), Close(), Read(), Write()
- Lock(), UnLock()
- Execute()

**exec.library** - Memory & Tasks
- AllocMem(), FreeMem()
- CreatePort(), DeletePort()
- CreateTask()

#### Compiling 68K Doors

```bash
# Build all 68K doors
./sdk/68k/build-all-test-doors.sh

# Test door on vamos (reference emulator)
vamos doors/mydoor/mydoor

# View detailed output
vamos --log-file=/tmp/vamos.log doors/mydoor/mydoor
```

### For TypeScript Door Creators

Modern TypeScript doors use the AmiExpress-Web SDK for powerful, high-level functionality.

#### Quick Start

```bash
cd sdk
npm run create-door         # Interactive wizard
# OR
npm run build               # Build all example doors
npm run preview             # Live preview at http://localhost:8080
```

#### Door Structure (TypeScript)

```typescript
import { CoreDoor, DoorContext } from '@amiexpress/sdk';
import { createBox, createList } from '@amiexpress/sdk/utils/blessed-helpers';

export class MyDoor extends CoreDoor {
  async onStart(context: DoorContext) {
    context.emit('display', 'Welcome to My Door!\n');

    // Create UI
    const screen = context.screen;
    const box = createBox({
      parent: screen,
      top: 5,
      left: 10,
      width: 60,
      height: 10,
      content: `{red-fg}Hello ${context.user.name}{/red-fg}`,
      border: 'line'
    });

    screen.render();
  }

  async onInput(context: DoorContext, input: string) {
    if (input.toLowerCase() === 'q') {
      await this.onClose(context);
    }
  }

  async onClose(context: DoorContext) {
    context.emit('display', 'Thanks for playing!\n');
  }
}
```

#### SDK Engines Available

**Graphics Engine**
- Sprites, parallax scrolling
- Collision detection
- Screen rendering

**Physics Engine**
- Gravity, velocity
- Collision response
- Particles

**Audio Engine**
- Procedural sound synthesis (Tone.js)
- MIDI note generation
- SFX playback

**AI Engine**
- Pathfinding (A*)
- Behavior trees
- Game AI helpers

**Network Engine**
- Real-time multiplayer (Socket.IO)
- State synchronization
- Rollback/prediction

**Tactical Engine**
- Turn-based combat
- Grid-based movement
- Damage calculation

**Input System**
- Keyboard events
- Mouse support (web only)
- Hotkey binding

#### Building & Testing

```bash
cd sdk/doors/mydoor
npm install
npm run build          # Build once
npm run build:watch    # Watch mode (auto-rebuild)

# Test in preview
npm run preview
# Open http://localhost:8080
```

#### Publishing Doors

```bash
npm run pack           # Create distribution package
npm run validate       # Validate package structure
```

Package contents:
```
mydoor-1.0.0.zip
├── package.json       # Door metadata
├── index.js           # Built door code
├── manifest.json      # Door specification
└── README.md          # Door documentation
```

---

## Architecture & Technical Details

### Data Storage

AmiExpress-Web uses **two storage systems**:

#### SQLite Database (Modern Data)
- Users and authentication
- Messages and threads
- Call logs and statistics
- User preferences
- Download/upload history

Location: `./data/amiexpress.db`

Schema highlights (50+ tables):
```sql
CREATE TABLE users (
    id INTEGER PRIMARY KEY,
    username TEXT UNIQUE,
    password_hash TEXT,
    real_name TEXT,
    location TEXT,
    access_level INTEGER,
    created_at TIMESTAMP
);

CREATE TABLE messages (
    id INTEGER PRIMARY KEY,
    conference_id INTEGER,
    author_id INTEGER,
    subject TEXT,
    content TEXT,
    posted_at TIMESTAMP,
    parent_id INTEGER  -- For threading
);

CREATE TABLE files (
    id INTEGER PRIMARY KEY,
    conference_id INTEGER,
    file_area INTEGER,
    filename TEXT,
    size INTEGER,
    upload_date TIMESTAMP,
    uploader_id INTEGER,
    downloads INTEGER
);
```

#### Disk-Based Configuration (Historical)
- Conference definitions (ConfConfig.info)
- Command metadata (.info files)
- Door programs (68K binaries)
- Screen files (ANSI/ASCII art)
- Bulletins

This "dual system" allows:
- Authentic disk-based config like classic AmiExpress
- Modern database for performance
- Hot-reloading of configuration changes
- Easy sysop editing of .info files

### 68K Emulation

#### MOIRA CPU Emulator

**Capabilities:**
- Full 68000 instruction set (16-bit 68K subset)
- 16MB address space
- Exception handling
- Interrupt support
- Custom I/O traps for BBS communication

**Architecture:**
```
68K Program (door.exe)
    │
    ├── Native Library Calls
    │   ├── dos.library (file I/O, processes)
    │   ├── exec.library (memory, tasks, ports)
    │   └── Other Amiga libraries
    │
    └── XIM Protocol
        ├── Door ↔ BBS communication
        └── 18 commands (INIT, STAT, READ, WRITE, etc.)
```

#### XIM (Extended I/O Modem) Protocol

18 commands for door-to-BBS communication:

| Cmd | Purpose |
|-----|---------|
| JH_INIT | Initialize door communication |
| JH_STAT | Get current BBS state |
| JH_READ | Read user input |
| JH_WRITE | Write to user screen |
| JH_CONFIG | Door configuration |
| JH_TIME | Get current time |
| JH_USER | Get user information |
| JH_FILE | File operations |
| ... | 10 more commands |

Example flow:
```
1. Door sends JH_INIT to BBS
2. BBS responds with door ID
3. Door sends JH_STAT to get user info
4. BBS returns BBSInfo structure
5. Door displays welcome screen via JH_WRITE
6. Loop: JH_READ user input, process, JH_WRITE output
7. Door sends JH_CLOSE when done
```

### Message Threading

AmiExpress-Web implements full message threading:

```
Message 100: "Topic Name"
├── Message 105: "RE: Topic Name" (Reply to 100)
│   ├── Message 108: "RE: RE: Topic Name" (Reply to 105)
│   └── Message 112: "RE: RE: Topic Name" (Reply to 105)
└── Message 110: "RE: Topic Name" (Reply to 100)
```

Message pointers (per-user-per-conference):
```
lastMsgRead = 100         # Last message user read
lastNewRead = 105         # Last new message marker
newSinceDate = 12/25      # Date for "new since..."
```

### Multi-Node Synchronization

Real-time synchronization across all nodes:

```
Node 1 (WebSocket)
    │
    ├─── WebSocket Server (Socket.IO)
    │     ├── Message broadcast
    │     ├── User presence
    │     └── Chat updates
    │
Node 2 (Telnet)
    │
Node 3 (SSH)
    │
Database (SQLite)
    └── Persistent state
```

Updates shared:
- Who's online
- New messages
- File uploads
- Chat messages
- User actions

### AREXX Integration

Complete AREXX language support for door automation:

```arexx
/* AREXX door script */
SIGNAL ON ERROR

/* Get user info */
'BBSGETUSER' pUserId
PARSE PULL userName secLevel
SAY 'Welcome ' userName '!'
SAY 'Your level is ' secLevel

/* Post message */
'BBSPOSTMSG' 1 'Automation Test' 'This is auto-posted!'

/* Download file check */
'BBSDOWNLOAD' 'myfile.zip'

EXIT 0

ERROR:
SAY 'Error: ' rc
EXIT rc
```

**40+ API Functions:**
- BBSWRITE, BBSREAD - I/O
- BBSGETUSER, BBSGETUSER2 - User data
- BBSPOSTMSG, BBSPOSTMSG2 - Message posting
- BBSDOWNLOAD, BBSUPLOAD - File transfers
- BBSGETMESSAGE, BBSPUTMESSAGE - Message access
- ... many more

### Configuration Hierarchy

```
┌─ bbsConfig.info (global)
│  ├─ ConfConfig.info (per-conference)
│  │  └─ Conf{N}.info (per-conference details)
│  │
│  └─ Commands/ (command definitions)
│     ├─ BBSCmd/ (user commands)
│     └─ SysCmd/ (system commands)
│
└─ User Preferences (SQLite)
   ├─ Real name, location
   ├─ Screen settings
   └─ Access levels
```

This allows:
- Global defaults in bbsConfig
- Per-conference overrides
- Per-command configuration
- Per-user preferences

---

## Troubleshooting

### Common Issues

#### "Connection refused" when starting BBS

**Cause**: Port already in use

**Solution**:
```bash
# Find process using port 3001
lsof -i :3001

# Kill the process
kill -9 <PID>

# Restart servers
./dev/scripts/start-servers.sh
```

#### Door crashes with "Illegal instruction"

**Cause**: 68K instruction not supported by MOIRA emulator

**Steps**:
1. Check logs: `tail -200 logs/door-68k-*.log`
2. Search for "Illegal instruction"
3. Get PC (program counter) value
4. Disassemble: `r2 -q -c "s 0xPC; pd 20" door.exe`
5. Report with exact instruction and context

#### Message posting fails with "Database error"

**Cause**: SQLite database locked

**Solution**:
```bash
# Kill all connections
pkill -f "node.*backend"

# Clear locks
rm -f ./data/amiexpress.db-*

# Restart
./dev/scripts/start-servers.sh
```

#### File upload hangs

**Cause**: Zmodem protocol timeout

**Solution**:
1. Check file size (< 100MB recommended)
2. Try different transfer protocol
3. Check disk space: `df -h`
4. Review logs for network errors

#### Screen display corrupted with literal tags

**Cause**: Neo-Blessed tags not enabled

**Solution**:
- Ensure using `createBox()` helper, not `blessed.box()` directly
- Verify `tags: true` in options
- See `sdk/utils/blessed-helpers.ts` for correct usage

#### Telnet/SSH connection drops immediately

**Cause**: Missing host key or configuration

**Solution for SSH**:
```bash
# Generate host key
ssh-keygen -t rsa -b 4096 -f ssh_host_rsa_key -N ""

# Add to .env.local
SSH_HOST_KEY_PATH=./ssh_host_rsa_key
```

**Solution for Telnet**:
```bash
# Check Telnet server listening
netstat -tlnp | grep 2323

# Verify in logs
tail -50 logs/backend.log | grep -i "telnet"
```

#### TypeScript door not loading

**Cause**: Stale build or missing build

**Solution**:
```bash
cd sdk/doors/mydoor
npm run build           # Must rebuild after source changes
npm run build:watch    # Or use watch mode

# Verify dist/index.js exists
ls -la dist/
```

#### 68K door can't find files

**Cause**: Path case mismatch or missing file

**Solution**:
1. Check logs: `grep "Open.*ami=" logs/door-68k-*.log`
2. Verify file exists: `ls -la Doors/DOORNAME/`
3. Note: AmigaOS is case-insensitive, but check exact path
4. Use `amigafs` module which handles case-insensitivity

### Debug Mode

Enable detailed logging:

```bash
# Start with debug output
./dev/scripts/start-servers.sh --debug

# XIM protocol debugging
XIM_DEBUG=1 ./dev/scripts/start-servers.sh

# 68K instruction tracing
DOOR_TRACE_FIRST_PC_COUNT=500 \
DOOR_TRACE_REGS=1 \
./dev/scripts/start-servers.sh
```

### Log Files

Key log locations:

| File | Contents |
|------|----------|
| logs/backend.log | Server activity, errors |
| logs/xim-debug.log | Door communication (if XIM_DEBUG=1) |
| logs/door-68k-{NAME}-{DATE}.log | Per-door execution |
| logs/frontend.log | Browser client errors |

Example analysis:
```bash
# Find door errors
grep -i "error\|fail\|crash" logs/door-68k-*.log | tail -20

# Trace specific door
tail -500 logs/door-68k-RTW-20251225*.log | grep "FindPort\|XIM"

# Monitor real-time
tail -f logs/backend.log
```

---

## Advanced Topics

### Custom Door Development Workflow

1. **Setup**:
   ```bash
   cd sdk
   npm run create-door
   # Answer questions about door type, name, description
   ```

2. **Development**:
   ```bash
   cd sdk/doors/mydoor
   npm run build:watch   # Auto-rebuild on save
   ```

3. **Testing**:
   ```bash
   npm run preview       # http://localhost:8080
   # Test in live BBS
   ```

4. **Distribution**:
   ```bash
   npm run pack         # Create .zip for sharing
   npm run validate     # Verify integrity
   ```

### System Resource Limits

Default configuration:

| Resource | Limit |
|----------|-------|
| Concurrent users | 100 nodes |
| Message base size | 10,000 messages |
| File area size | 10,000 files |
| User data | 256MB per user |
| Download rate | Per-user configurable |
| Upload rate | Per-user configurable |

Modify in config files:

```
MAX_NODES=200
MAXMESSAGES=50000
MAX_FILES=50000
```

### Performance Tuning

**Database Optimization**:
```sql
-- Enable WAL mode (faster)
PRAGMA journal_mode=WAL;

-- Index message queries
CREATE INDEX idx_messages_conference ON messages(conference_id);
CREATE INDEX idx_messages_author ON messages(author_id);
```

**Memory Settings**:
```javascript
// Backend - increase heap
NODE_OPTIONS="--max-old-space-size=4096" npm run dev

// Frontend - optimize rendering
// See web/frontend/src/App.tsx
```

**Network Optimization**:
- Enable gzip compression
- Use WebSocket for real-time updates
- Cache door binaries in memory
- Batch database queries

### Security Hardening

1. **User Authentication**:
   - Strong password hashing (bcrypt)
   - 2FA support (future enhancement)
   - Account lockout after failed attempts

2. **Access Control**:
   - Fine-grained ACS system
   - Per-conference permissions
   - IP-based rate limiting

3. **Network Security**:
   - SSH for encrypted Telnet
   - JWT tokens for WebSocket
   - HTTPS recommended for production

4. **File Security**:
   - Virus scanning on upload (optional)
   - Archive extraction with limits
   - File type restrictions

---

## Version History

### v1.0.0 (Current)
- Initial web port of classic AmiExpress
- Full 68K emulation with MOIRA CPU
- Multi-protocol access (HTTP, Telnet, SSH)
- TypeScript SDK with 12 game engines
- 90+ MCI codes implemented
- 40+ AREXX functions
- 78+ classic doors installed
- SQLite database with 50+ tables

### Planned (v1.1.0)
- Mobile-responsive UI improvements
- Network multiplayer engine completion
- Additional SDK example games
- CLI tools for door management
- Python door development support

### Future (v2.0.0)
- Real-time bulletin board updates
- Advanced moderation tools
- User profile customization
- Door store/marketplace
- Event system for automated tasks

---

## References

### Original AmiExpress Documentation
- [AmiExpress GitHub Repository](https://github.com/dmcoles/AmiExpress)
- [AmiExpress Wiki](https://github.com/dmcoles/AmiExpress/wiki)

### Technical References
- NDK 3.2R4 (AmigaOS SDK)
- MOIRA 68K Emulator
- Amiga BBS Door Standards
- XIM Protocol Specification

### Related Projects
- [Vamos - Amiga emulator (reference)](https://github.com/cnvogelg/amitools)
- [Neo-Blessed - TUI framework](https://github.com/Equim-chan/neo-blessed)
- [xterm.js - Terminal emulation](https://xtermjs.org/)
- [Socket.IO - Real-time communication](https://socket.io/)

---

## Contact & Support

- **Project Repository**: [AmiExpress-Web on GitHub](https://github.com/spot/amiexpress-web)
- **Issues & Bug Reports**: GitHub Issues
- **Documentation**: See `/Documentation/` directory
- **Development Help**: Check existing session logs in `/Documentation/6-Progress/`

---

## License & Attribution

**AmiExpress-Web** preserves and modernizes the original AmiExpress/!X software.

- Original AmiExpress: Copyright Synthetic Technologies (1989) and LightSpeed Technologies Inc. (1993-1994)
- AmiExpress-Web: Modern port and preservation project
- See PROJECT_SAFETY.md for complete safety and licensing information

---

**Last Updated**: December 2025
**Status**: Active Development (60-70% Complete)
**Maintained By**: AmiExpress-Web Community

