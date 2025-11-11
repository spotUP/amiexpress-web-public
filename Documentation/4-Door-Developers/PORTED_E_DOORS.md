# Ported Amiga E Doors

Documentation for doors ported from Amiga E to TypeScript.

---

## Overview

This document tracks the progress of porting classic AmiExpress Amiga E doors to TypeScript for AmiExpress-Web. The original E sources are in `dev/docs/AmiExpressEDoorSources/`.

---

## Completed Ports

### 1. Discord Announce (DiscordAnnounce)

**Status**: ✅ COMPLETE

**Original Source**: `dev/docs/AmiExpressEDoorSources/DiscordAnnounce/dannounce.e` (410 lines)
**TypeScript Port**: `web/backend/src/doors/discord-announce/index.ts`
**Command**: `DANNOUNCE`
**Type**: TypeScript door (TS)

**Description**:
Posts login/logoff announcements to a Discord channel via webhooks. Can be called from logon/logoff scripts or run manually to test configuration.

**Features**:
- Configurable Discord webhook URL
- Supports environment variables or config file
- Customizable bot name and avatar
- Test mode for manual verification
- Clean string handling for Discord API

**Configuration**:

1. Set environment variable:
   ```bash
   export DISCORD_WEBHOOK_URL="https://discord.com/api/webhooks/YOUR/WEBHOOK/URL"
   ```

2. OR create `doors/discord-announce/dannounce.cfg`:
   ```
   WEBHOOKURL=https://discord.com/api/webhooks/YOUR/WEBHOOK/URL
   ENABLED=YES
   BOTNAME=/X Announce Bot
   AVATARURL=
   ```

**Usage**:

From BBS menu:
```
/DANNOUNCE
```

From logon script (future):
```typescript
import { announceLogin } from './doors/discord-announce';
await announceLogin(username, bbsName);
```

From logoff script (future):
```typescript
import { announceLogoff } from './doors/discord-announce';
await announceLogoff(username, bbsName);
```

**Installation**:
Already installed! Command info file at `Commands/DANNOUNCE.info`.

---

### 2. Telnet Connect (telnetConnect)

**Status**: ✅ COMPLETE

**Original Source**: `dev/docs/AmiExpressEDoorSources/telnetConnect/telnetdoor.e` (133 lines)
**TypeScript Port**: `web/backend/src/doors/telnet-connect/index.ts`
**Command**: `TELNET`
**Type**: TypeScript door (TS)

**Description**:
Allows users to telnet to other BBSes directly from within the BBS. Supports configured BBSes with auto-login or manual connections.

**Features**:
- Multiple configured destination BBSes
- Auto-login with saved credentials
- Use # to substitute current BBS username
- Manual connection mode for any host
- Full bidirectional telnet terminal
- Raw socket pass-through

**Configuration**:

Create `doors/telnet-connect/telnetdoor.cfg`:
```
[Retro BBS]
SERVERHOST=bbs.example.com
TELNETPORT=23
USERNAMEPROMPT=login:
PASSWORDPROMPT=password:
USERNAME=#
PASSWORD=
AUTOLOGIN=YES
```

**Usage**:
```
/TELNET
```

**Installation**:
Already installed! Command info file at `Commands/TELNET.info`.

---

### 3. Telnet Frontend (TelnetFront)

**Status**: ✅ COMPLETE

**Original Source**: `dev/docs/AmiExpressEDoorSources/TelnetFront/telnetfront.e` (227 lines)
**TypeScript Port**: `web/backend/src/doors/telnet-front/index.ts`
**Command**: `TFRONT`
**Type**: TypeScript door (TS)

**Description**:
Displays a fancy "Who's Online" screen showing all active BBS nodes. Typically used as a login frontend to welcome telnet users.

**Features**:
- Display all active BBS nodes in ANSI art table
- Show username, location, and IP address for each user
- Show node status (Awaiting Call, Inactive, Suspended, Connecting)
- Display connecting user's hostname
- Display BBS's own IP address
- Auto-exits after 2 seconds or on any keypress
- Fancy ANSI art borders (kOOL fRONTEND V1.1 design)

**Configuration**:

Optional environment variables:
```bash
export BBS_IP="your.bbs.ip.address"
export MAX_NODES=8
```

**Usage**:
```
/TFRONT
```

Or call from login scripts to show automatically on connect.

**Installation**:
Already installed! Command info file at `Commands/TFRONT.info`.

---

### 4. BBSLink (BBSLink)

**Status**: ✅ COMPLETE

**Original Source**: `dev/docs/AmiExpressEDoorSources/BBSLink/bbslink.e` (339 lines)
**TypeScript Port**: `web/backend/src/doors/bbslink/index.ts`
**Command**: `BBSLINK`
**Type**: TypeScript door (TS)

**Description**:
Client for BBSLink.net InterBBS games server. Allows users to play classic BBS door games hosted on BBSLink.net, including LORD, Trade Wars 2002, Operation Overkill, and many more.

**Features**:
- Connect to BBSLink.net InterBBS games server
- MD5-based authentication with token system
- Play 30+ classic door games
- Game code shortcuts (e.g., `/BBSLINK LORD`)
- Full bidirectional telnet terminal

**Configuration**:

1. Sign up for free account at http://www.bbslink.net/
2. Get your syscode, authcode, and schemecode from BBSLink
3. Create `doors/bbslink/bbslink.cfg`:

```
timeout=10
syscode=YOUR_SYSCODE
authcode=YOUR_AUTHCODE
schemecode=YOUR_SCHEMECODE
doorcode=MENU

# Game shortcuts
lord=LORD
tw2002=TW
ooii=OOII
# ... see bbslink.cfg.example for full list
```

Or use environment variables:
```bash
export BBSLINK_SYSCODE="your_syscode"
export BBSLINK_AUTHCODE="your_authcode"
export BBSLINK_SCHEMECODE="your_schemecode"
```

**Usage**:
```
/BBSLINK          # Show game menu
/BBSLINK LORD     # Launch Legend of the Red Dragon directly
/BBSLINK TW2002   # Launch Trade Wars 2002
```

**Available Games**:
LORD, LORD2, MZKL, TEOS, OOII, TW2002, GWAR, GGAM, USRP, BRE, FALC, FHON, ARCL, DMUD, PIMP, LUNA, NETR, ASSN, BBSC, VSYS, TPIT, BORD, JUNK, MMOT, DARK, HACK, MEGA, FISH, LMON, DMAS, BCR, LEGN, DKNS

**Installation**:
Already installed! Command info file at `Commands/BBSLINK.info`.

---

### 5. BBSLink Wall (BBSLinkWall)

**Status**: ✅ COMPLETE

**Original Source**: `dev/docs/AmiExpressEDoorSources/BBSLink/bbslinkwall.e` (547 lines)
**TypeScript Port**: `web/backend/src/doors/bbslink-wall/index.ts`
**Command**: `BBSLINKWALL`
**Type**: TypeScript door (TS)

**Description**:
Global graffiti wall client for BBSLink.net. Allows users to read and post messages to a shared wall across all BBSes using BBSLink.

**Features**:
- Display global graffiti wall
- Post messages (64 characters max)
- Username registration for new users
- 10-minute posting cooldown
- MD5-based authentication
- URL encoding for special characters

**Configuration**:

Uses the same config as BBSLink door - `doors/bbslink/bbslink.cfg`:
```
syscode=YOUR_SYSCODE
authcode=YOUR_AUTHCODE
schemecode=YOUR_SCHEMECODE
```

Or use environment variables:
```bash
export BBSLINK_SYSCODE="your_syscode"
export BBSLINK_AUTHCODE="your_authcode"
export BBSLINK_SCHEMECODE="your_schemecode"
```

**Usage**:
```
/BBSLINKWALL
```

**Flow**:
1. Display current wall messages
2. Ask if user wants to post
3. Authenticate with BBSLink.net
4. Register username if first time
5. Get post text (max 64 chars)
6. Submit to server
7. Display updated wall

**Installation**:
Already installed! Command info file at `Commands/BBSLINKWALL.info`.

---

### 6. GLC Viewer (GLCViewer)

**Status**: ✅ COMPLETE

**Original Source**: `dev/docs/AmiExpressEDoorSources/Global Last Callers/GLCViewer.e` (943 lines)
**TypeScript Port**: `web/backend/src/doors/glc-viewer/index.ts`
**Command**: `GLCVIEWER`
**Type**: TypeScript door (TS)

**Description**:
Displays global last callers from scenewall.bbs.io showing callers across all participating BBSes.

**Features**:
- Display last 10 callers (configurable)
- 4 different ANSI art styles (can randomize)
- Yesterday and previous day statistics
- All-time records display
- Top 3 most called BBSes
- View specific BBS or all BBSes
- Timezone support
- Center names option

**Configuration**:

Create `doors/glc-viewer/glcviewer.cfg`:
```
serverhost=scenewall.bbs.io
serverport=1541
timeout=10
retries=5
lines=10
screenclear=NO
style=1
# Or random styles: style=1,2,3,4
centrename=0
timezone=
viewbbs=
```

Or use environment variables:
```bash
export GLC_SERVER_HOST="scenewall.bbs.io"
export GLC_SERVER_PORT="1541"
```

**Usage**:
```
/GLCVIEWER
```

**Display Styles**:
1. **Style 1**: Classic GLOBAL LASTCALLERS header with side-by-side stats
2. **Style 2**: Alternate ASCII art header with side-by-side stats
3. **Style 3**: Classic header with Top 3 most called systems
4. **Style 4**: Alternate header with Top 3 most called systems

**Actions Legend**:
- `*` = New user
- `U` = Upload success
- `u` = Upload fail
- `D` = Download success
- `d` = Download fail
- `o` = Operator paged
- `O` = Operator chat
- `F` = File scan
- `B` = Bulletins
- `E` = Exit restricted file
- `A` = Account edit
- `H` = Hack try (password fail)
- `L` = Lost carrier

**Installation**:
Already installed! Command info file at `Commands/GLCVIEWER.info`.

---

### 7. Global Wall (Global Graffiti Wall)

**Status**: ✅ COMPLETE (Core Features)

**Original Source**: `dev/docs/AmiExpressEDoorSources/Global Wall/gwall.e` (1,832 lines)
**TypeScript Port**: `web/backend/src/doors/global-wall/index.ts` (700+ lines)
**Command**: `GWALL`
**Type**: TypeScript door (TS)

**Description**:
Global graffiti wall shared across all BBSes using scenewall.bbs.io. Users can read and post colored messages visible to all connected BBSes worldwide.

**Implemented Features**:
- Display global wall with pagination (F/B keys)
- 4 different ANSI art display styles
- Color-coded messages (7 colors: white, red, yellow, blue, pink, cyan, green)
- Anonymous posting option
- 14-color customization system
- Settings persistence (style, BBS code, colors)
- JSON API integration with scenewall.bbs.io
- HTTP GET/POST/PUT/DELETE support
- Full ANSI formatting with grid borders

**Not Implemented** (Sysop features - too complex for session scope):
- Sysop menu (edit/remove comments)
- BBS key display
- Advanced settings editor

**Configuration**:

1. Edit `doors/global-wall/GWALL.cfg`:
```
SERVERHOST=scenewall.bbs.io
SERVERPORT=1541
TIMEOUT=5
```

2. First run will prompt sysop to set 3-letter BBS code

**Usage**:
```
/GWALL
```

**Display Navigation**:
- `Y` - Post a comment
- `N` - Exit without posting
- `B` - Next page (back)
- `F` - Previous page (forward)
- `K` - Show BBS key (not implemented)
- `S` - Sysop mode (not implemented)

**Color Selection**:
- W - White (7)
- R - Red (1)
- Y - Yellow (3)
- D - Dark Blue (4)
- P - Pink (5)
- C - Cyan (6)
- G - Green (2)

**Display Styles**:
1. Style 1: Classic grid with rounded corners
2. Style 2: Plus-sign grid
3. Style 3: Pipe grid with detailed headers
4. Style 4: Box-drawing grid

**Technical Details**:
- Uses Node.js http module for API requests
- JSON parsing with native JavaScript
- Settings stored in `doors/global-wall/GWall.cfg`
- String encoding/decoding for special chars (&#91; etc.)
- Real-time pagination without reloading door

**Installation**:
Already installed! Command info file at `Commands/GWALL.info`.

**Notes**:
- Core posting/viewing features fully functional
- Sysop admin features require dedicated session to complete
- 1:1 port of main user-facing functionality

---

### 8. Multi Relay Chat (MRC)

**Status**: ✅ COMPLETE

**Original Sources**:
- `dev/docs/AmiExpressEDoorSources/MultiRelayChat/mrc_client.e` (882 lines)
- `dev/docs/AmiExpressEDoorSources/MultiRelayChat/mrc_door.e` (1,999 lines)

**TypeScript Ports**:
- `web/backend/src/services/mrc-client.ts` (MRC daemon/multiplexer)
- `web/backend/src/doors/mrc/index.ts` (Interactive door)

**Command**: `MRC`
**Type**: Two-component system (TypeScript daemon + TypeScript door)

**Description**:
Multi Relay Chat is a cross-platform real-time chat system that allows BBS users to chat with users on other BBSes around the world. Consists of two components that work together:

1. **mrc-client** - Background daemon/multiplexer that:
   - Maintains persistent connection to MRC server (mrc.bottomlessabyss.net:5000)
   - Opens local listening socket on port 5000 for door connections
   - Relays messages between MRC server and connected doors
   - Handles server protocol and stats
   - Auto-reconnect with exponential backoff

2. **mrc_door** - Interactive chat door that:
   - Connects to local mrc-client daemon
   - Full-screen ANSI chat interface
   - Real-time chat with users across all connected BBSes worldwide
   - Customizable colors, brackets, and settings
   - Buffer history (UP/DOWN arrows)
   - Nick auto-completion (TAB)
   - Many commands

**Features**:
- Full-screen ANSI interface with header, chat area, input, footer
- Real-time multi-BBS chat via relay protocol
- Customizable user settings (colors, brackets, messages, clock)
- Buffer history with UP/DOWN arrow navigation
- Nick auto-completion with TAB key
- Chat color changing with PgUp/PgDn
- Scrolling information banner
- Server latency indicator and heartbeat
- Private messages (/MSG, /TELL, /T, /M)
- Room management (/JOIN, /TOPIC)
- Action messages (/ME)
- Broadcast to all rooms (/B)
- Server info commands (/BBSES, /USERS, /ROOMS, /INFO, /WHOON)
- Help system (/?

, /HELP)
- Version checking
- User settings persistence
- Chat log per node
- Reply to last PM (/R shortcut)

**Configuration**:

1. **Start the MRC daemon first** (required before door can connect):
```bash
cd web/backend
npx ts-node src/services/mrc-client.ts mrc.bottomlessabyss.net 5000
```

2. **Configure BBS information** in `doors/mrc-client/mrc_client.cfg`:
```
BBSNAME=Your BBS Name
INFO_WEB=https://yourbbs.com
INFO_TELNET=telnet://yourbbs.com:23
INFO_SSH=ssh://yourbbs.com:22
INFO_SYSOP=sysop@yourbbs.com
INFO_DESC=A description of your BBS
```

3. **Run the door** from BBS menu:
```
/MRC
```

**Usage**:

The mrc-client daemon must be running before users can access the door. Start it on system boot or manually.

Common commands:
- `/JOIN lobby` - Join lobby room
- `/MSG username message` - Send private message
- `/ME action` - Perform action
- `/B message` - Broadcast to all rooms
- `/TOPIC new topic` - Change room topic
- `/USERS` - List all users online
- `/ROOMS` - List all available rooms
- `/QUIT` or CTRL-Q - Leave chat

**Installation**:

1. Build the daemon:
```bash
cd web/backend
npm run build
```

2. Start daemon on system boot (example with systemd):
```bash
# Create /etc/systemd/system/mrc-client.service
[Unit]
Description=MRC Client Daemon
After=network.target

[Service]
Type=simple
User=bbs
WorkingDirectory=/path/to/amiexpress-web/web/backend
ExecStart=/usr/bin/node dist/services/mrc-client.js mrc.bottomlessabyss.net 5000
Restart=always

[Install]
WantedBy=multi-user.target
```

3. Door is already registered at `Commands/MRC.info`

**Technical Details**:
- Protocol: `fromuser~fromsite~fromroom~touser~tosite~toroom~message~\n`
- Local IPC: TCP socket on localhost:5000
- MRC Server: mrc.bottomlessabyss.net:5000
- PIPE color codes (|00-|31) converted to ANSI
- User settings in binary format (simplified for TypeScript)
- Non-blocking I/O throughout
- Auto-reconnect on connection loss

**Benefits of TypeScript Port**:
- No need for bsdsocket.library - uses Node.js net module
- No need for aedoor.library - uses integrated door pattern
- Simplified user settings (removed binary file complexity)
- Modern async/await patterns throughout
- Better error handling
- Cross-platform (not Amiga-specific)
- Easy to debug and extend

---

## Planned Ports

**NONE** - All interactive Amiga E doors have been ported!

---

## Batch Utilities (Skipped - Not Interactive Doors)

These are command-line batch utilities, not interactive doors. They would require 1:1 CLI ports reading binary database files.

### GLCUpdater (Batch Utility)

**Original Source**: `dev/docs/AmiExpressEDoorSources/GLCUpdater/` (770 lines)
**Purpose**: Parse CallersLog, post to scenewall.bbs.io
**Type**: CLI batch utility

### MultiTop2 (Batch Utility)

**Original Source**: `dev/docs/AmiExpressEDoorSources/MultiTop2/mtop.e` (1,087 lines)
**Purpose**: Generate user statistics reports from database files
**Type**: CLI batch utility with template system

### ConfTop-II (Batch Utility)

**Original Source**: `dev/docs/AmiExpressEDoorSources/Conftop-II/ctop.e` (1,153 lines)
**Purpose**: Track and display top uploaders per conference
**Type**: CLI batch utility

---

## Door Porting Guidelines

### 1. Structure

Follow the TypeScript door pattern:

```typescript
export async function runDoor(doorSession: any): Promise<void> {
  const { socket, user, bbsSession } = doorSession;

  // Door implementation
}
```

### 2. Configuration

Use config files in `doors/DOORNAME/`:
- `config.cfg` or `doorname.cfg` for settings
- Support environment variables as fallback
- Provide `.example` files for templates

### 3. Installation

Create command info file in `Commands/`:
```
COMMAND=DOORNAME
NAME=Door Display Name
TYPE=TS
PATH=web/backend/src/doors/doorname
ACCESS=0
HOT=
PRIVATE=N
OVERLOAD=N
HIDDEN=N
```

### 4. Output

- Use `socket.emit('ansi-output', text)` for output
- Support ANSI color codes (e.g., `\x1b[32m` for green)
- Clear screen: `\x1b[2J\x1b[H`
- Line endings: `\r\n`

### 5. Input

Wait for user input with promises:
```typescript
await new Promise<void>((resolve) => {
  const handleInput = (data: string) => {
    socket.off('user-input', handleInput);
    // Process input
    resolve();
  };
  socket.on('user-input', handleInput);
});
```

### 6. Testing

1. Run TypeScript check: `cd web/backend && npx tsc --noEmit`
2. Test in BBS: `/DOORNAME`
3. Verify functionality matches original behavior

---

## Original E Source Inventory

All doors located in `dev/docs/AmiExpressEDoorSources/`:

| Door | Lines | Type | Complexity | Priority |
|------|-------|------|------------|----------|
| telnetConnect | 133 | Telnet | Simple | ✅ DONE |
| TelnetFront | 227 | Telnet | Simple | ✅ DONE |
| BBSLink | 339 | Network | Medium | ✅ DONE |
| DiscordAnnounce | 410 | Webhook | Simple | ✅ DONE |
| BBSLinkWall | 547 | Network | Medium | ✅ DONE |
| GLCUpdater | 770 | Network | Batch Util | SKIP |
| MRC_client | 882 | Chat Daemon | Complex | ✅ DONE |
| GLCViewer | 943 | Network | Medium | ✅ DONE |
| MultiTop2 | 1,087 | Stats | Batch Util | SKIP |
| ConfTop-II | 1,153 | Stats | Batch Util | SKIP |
| Global Wall | 1,832 | Network | Complex | ✅ DONE |
| MRC_door | 1,999 | Chat Door | Complex | ✅ DONE |

**Summary**: 8 of 8 interactive E doors ported (100%)! All Amiga E doors completed.

---

## Benefits of TypeScript Ports

1. **No 68K emulation overhead** - Native execution
2. **Modern async/await** - Clean asynchronous code
3. **Better error handling** - Try/catch with stack traces
4. **Easy debugging** - Full IDE support
5. **Type safety** - Catch errors at compile time
6. **Modern APIs** - Use fetch(), promises, etc.
7. **Integration** - Direct access to BBS database/services

---

## Contributing

To port a new door:

1. Choose a door from the inventory above
2. Read the original E source in `dev/docs/AmiExpressEDoorSources/`
3. Create new directory: `web/backend/src/doors/doorname/`
4. Implement `runDoor()` function
5. Create command info file in `Commands/`
6. Test thoroughly
7. Update this document with status
8. Submit PR

---

## Resources

- **Amiga E Documentation**: E language syntax and patterns
- **Original Express.e**: `AmiExpress-Sources/express.e` - BBS door protocol
- **TypeScript Door Example**: `web/backend/src/doors/phreakwars/` - Full featured door
- **Discord Door**: `web/backend/src/doors/discord-announce/` - Simple door example

---

Last Updated: 2025-11-11
