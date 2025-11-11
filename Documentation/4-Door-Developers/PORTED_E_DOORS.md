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

## Planned Ports

### 5. ConfTop-II (Conference Top Uploaders)

**Status**: 📋 PLANNED

**Original Source**: `dev/docs/AmiExpressEDoorSources/Conftop-II/ctop.e` (1,153 lines)
**Purpose**: Track and display top uploaders per conference
**Complexity**: Medium - local data storage, conference integration

### 4. Global Wall

**Status**: 📋 PLANNED

**Original Source**: `dev/docs/AmiExpressEDoorSources/Global Wall/gwall.e` (1,832 lines)
**Purpose**: Global graffiti wall shared across BBSes
**Complexity**: Complex - requires backend server communication

### 5. MultiTop2

**Status**: 📋 PLANNED

**Original Source**: `dev/docs/AmiExpressEDoorSources/MultiTop2/mtop.e` (1,087 lines)
**Purpose**: Multi-category top users statistics
**Complexity**: Medium - local stats tracking

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
| BBSLinkWall | 547 | Network | Medium | Low |
| GLCUpdater | 770 | Network | Medium | Low |
| MRC_client | 882 | Chat | Complex | Low |
| GLCViewer | 943 | Network | Medium | Medium |
| MultiTop2 | 1,087 | Stats | Medium | Medium |
| ConfTop-II | 1,153 | Stats | Medium | High |
| Global Wall | 1,832 | Network | Complex | Medium |
| MRC_door | 1,999 | Chat | Complex | Low |

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
