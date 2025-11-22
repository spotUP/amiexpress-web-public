# BBS Screen Files Index for ASCII Artists
*reference-board BBS - AmiExpress System*

## Overview
This document provides a comprehensive index of all ASCII screen files used in reference-board BBS, an AmiExpress-based bulletin board system running on Amiga emulation. ASCII artists can use this guide to understand the purpose, style, and content requirements for each screen type.

## Screen File Categories

### 1. SYSTEM LOGON/OFF SCREENS

#### Logon Screens
**Files**: `Logon.txt`, `Logon20.txt`, `Logon100.txt`, `guestlogon.txt`
- **Purpose**: First screen users see when connecting
- **Content Requirements**: 
  - BBS welcome message and system information
  - Space for BBS logo/ASCII art (typically 40-60 characters wide)
  - System status indicators
  - Connection quality display
- **Style**: Clean, welcoming design with room for branding
- **Example Content**: "Welcome to AmiExpress" with connection info

#### Logoff Screens  
**Files**: `Logoff.txt`, `logoff/001.logoff.txt`, `logoff/002.logoff.txt`, `logoff/003.logoff.txt`
- **Purpose**: Displayed when users disconnect
- **Content Requirements**:
  - Large ASCII art logo (80+ characters wide)
  - Farewell message
  - System contact information
  - Statistics summary
- **Style**: Elaborate ASCII art, often group-related (Fairlight themed)
- **Example**: Complex geometric patterns with Fairlight branding

### 2. USER INTERFACE SCREENS

#### Last Callers Displays
**Files**: `Callers.txt`, `callers!.txt`
- **Purpose**: Show currently online users and connection stats
- **Content Requirements**:
  - Compact ASCII table layout
  - Columns: Connection, User#, Name, Location, On-Time, Activity, Stats
  - Summary statistics footer
- **Style**: Functional, information-dense layout
- **Technical**: Uses ANSI color codes for status indicators

#### Await Screens
**Files**: `awaitscreen.txt`
- **Purpose**: Displayed during system transitions/loading
- **Content Requirements**:
  - Simple loading message
  - System status information
- **Style**: Minimal, functional

### 3. GROUP/DOOR INTRODUCTION SCREENS

#### Fairlight (FLT) Screens
**Files**: `flt.txt`, `flt/001.flt.txt` through `flt/005.flt.txt`, `flt/bull15_.txt`
- **Purpose**: Fairlight scene group introduction and announcements
- **Content Requirements**:
  - Fairlight ASCII logo (large, elaborate)
  - Group hierarchy information
  - Member list or access requirements
  - Scene-related artwork
- **Style**: Cracker-style ASCII art with complex borders and shadows
- **Themes**: Elite scene culture, warez aesthetics

#### reference-board BBS Screens  
**Files**: `reference-board.txt`, `reference-board/001.reference-board.txt` through `reference-board/007.reference-board.txt`
- **Purpose**: Main BBS welcome and introduction screens
- **Content Requirements**:
  - reference-board BBS ASCII logo
  - System information and capabilities
  - Contact numbers and access instructions
  - "Nostalgic version" messaging
- **Style**: Professional BBS branding with clean ASCII art
- **Themes**: Retro computing, Amiga nostalgia

### 4. CONFERENCE/BOARD SCREENS

#### Conference Menu Screens
**Files**: `Conf01/Screens/Menu.txt`, `Conf1/Menu.txt`, `Conf6/Menu.txt`, `Conf9/Menu.txt`
- **Purpose**: Main menu for each conference/board section
- **Content Requirements**:
  - Conference-specific ASCII logo
  - Menu options with descriptions
  - File download/upload areas
  - Message base access
- **Style**: Functional menu layout with conference branding

#### Bulletin Screens
**Files**: `Conf01/Screens/Bulletins/bull*.txt`, `BULL.TXT`, `BULL20!.TXT`, `bull20.txt`, `bull20.old`, `bull20.txt`
- **Purpose**: Announcement and bulletin display screens
- **Content Requirements**:
  - Bulletin title and date
  - ASCII borders and headers
  - Readable text layout
- **Style**: Simple announcement format

### 5. FILE OPERATION SCREENS

#### Upload/Download Messages
**Files**: `uploadmsg.txt`, `downloadmsg.txt`, `no_upload.txt`, `quicknew.txt`, `quicknew2.txt`
- **Purpose**: File transfer status and instructions
- **Content Requirements**:
  - Upload/download statistics
  - File format requirements
  - Access restrictions
  - Progress indicators
- **Style**: Clean, informative messaging

#### File Transfer Prompts
**Files**: `uprough.txt`, `_uprough.txt`, `bbb.txt`
- **Purpose**: File upload rejection or warning messages
- **Content Requirements**:
  - Warning or error messages
  - ASCII art for visual impact
  - Clear explanation of issues
- **Style**: Attention-grabbing with warnings

### 6. INTERACTION SCREENS

#### Chat/Join Screens
**Files**: `join.txt`, `joined.txt`
- **Purpose**: Multi-user chat room entry and status
- **Content Requirements**:
  - Chat room identification
  - User count and status
  - Simple messaging prompts
- **Style**: Minimal, functional

## ASCII Art Guidelines

### Technical Specifications
- **Width**: Most screens support 80-column terminal width
- **Character Set**: Standard ASCII (32-126) + ANSI color codes
- **Color Codes**: Uses ANSI sequences like `[34m` (blue), `[36m` (cyan), etc.
- **Special Sequences**: `~f` (reset), `~SP` (space), `~SS_BBS:` (system reference)

### Style Recommendations

#### For System Screens (Logon/Logoff)
- **Logon**: Clean, welcoming ASCII art with room for system info
- **Logoff**: Elaborate, artistic ASCII with group branding
- **Character Style**: Use single-character ASCII art (|, -, /, \, etc.)
- **Complexity**: Medium to high detail level

#### For Group Screens (FLT, reference-board)
- **Fairlight**: Complex cracker-style art with:
  - Heavy use of block characters (#, @, $)
  - Multiple border layers
  - Shadow effects and 3D appearance
  - Elite scene terminology
- **reference-board**: Professional BBS style with:
  - Clean, readable ASCII
  - Amiga/retro computing themes
  - Contact information prominently displayed

#### For User Interface Screens
- **Callers Display**: Functional ASCII tables
- **Menu Screens**: Clean layout with clear options
- **Bulletins**: Simple but attractive borders

### Common ASCII Elements to Include

1. **Borders**: Use +, -, | for simple borders or ┌, ┐, └, ┘ for fancy ones
2. **Headers**: ASCII art titles 40-60 characters wide
3. **Footers**: Simple ASCII bars for separation
4. **Emphasis**: Use * or # for highlighting
5. **Logo Space**: Reserve 20-40 character width for logos on menu screens

### Content Themes
- **Retro Computing**: Amiga, BBS nostalgia
- **Elite Scene**: Cracker culture, warez aesthetics  
- **Scandinavian**: Swedish BBS culture references
- **Technical**: Modem speeds, connection types
- **Democracy**: Group hierarchy and member access

## File Organization

Screen files are organized by:
- **System-wide**: `/Screens/` and `/Node0/Screens/`
- **Node-specific**: `/Node0/Node0/Screens/`, `/Node0/Node2/Screens/`
- **Conference-specific**: `/Conf01/Screens/`, `/Conf1/Screens/`
- **Documentation**: `/Source/Documentation/reference-boardBBS/` (backup/reference)

## Special Considerations
- Some files may be binary format and not displayable as text
- Color codes vary between screen types
- Files with `.gr` extension may be graphics overlays
- Multiple versions exist for different BBS features (Logon100 vs Logon20)
- Conference-specific screens should match the theme of their board section

This index provides ASCII artists with everything needed to create authentic screen art for the reference-board BBS system while maintaining the nostalgic Amiga BBS atmosphere.