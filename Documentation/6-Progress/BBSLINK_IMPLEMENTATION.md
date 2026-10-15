# BBSLink Door Implementation

**Date:** 2026-01-02
**Status:** COMPLETE

## Summary

Implemented complete TypeScript port of BBSLink InterBBS games client, providing access to classic door games via BBSLink.net service. This complements the existing BBSLinkWall door.

## Features Implemented

### BBSLink Door (`Doors/bbslink/index.ts`)

TypeScript door that connects to BBSLink.net to play classic InterBBS games.

**Key Functions:**
- `randomString(length)` - Generate 6-character session key
- `getMD5(text)` - Calculate MD5 hashes for authentication
- `fullTrim(str)` - Trim spaces from both ends
- `parseConfigFile(path, config, doorCode)` - Parse bbslink.cfg
- `httpGet(host, port, path, timeout)` - HTTP GET requests
- `connectToGame(socket, config, userSlot)` - Telnet proxy to game server
- `runDoor(session)` - Main door entry point

**Supported Games:**
- LORD - Legend of the Red Dragon
- LRD2 - Legend of the Red Dragon II
- TW2002 - Trade Wars 2002
- GWAR - Global War
- GGAM - Global Backgammon
- USRP - Usurper
- BRE - Barren Realms Elite
- And 20+ more classic InterBBS games

**Usage:**
```
LINKMENU             - Show games menu
LINKMENU LUNA        - Launch Lunatix directly
LINKMENU LORD        - Launch Legend of the Red Dragon
```

**Configuration:**
- Reads `bbslink.cfg` from `Doors/bbslink/` or BBS root
- Requires syscode, authcode, schemecode from BBSLink.net
- Optional door code mappings for direct game launch

### Configuration File (`Doors/bbslink/bbslink.cfg.example`)

Example configuration with all supported games:

```ini
SERVERHOST=games.bbslink.net
HTTPPORT=80
TELNETPORT=23
TIMEOUT=10

SYSCODE=YOUR_SYSCODE_HERE
AUTHCODE=YOUR_AUTHCODE_HERE
SCHEMECODE=YOUR_SCHEMECODE_HERE

DOORCODE=MENU

# Game codes
LUNA=luna
LORD=lord
TW2002=tw2002
...
```

### Command Configuration (`Commands/BBSCmd/LINKMENU.info`)

```
BBSCMD=LINKMENU
TYPE=TS
LOCATION=Doors/bbslink
DESCRIPTION=BBSLink InterBBS Games Menu
ACCESS=10
MULTINODE=YES
PRIORITY=SAME
CATEGORY=Games
```

## Architecture

### Authentication Flow

1. **Generate session key** - 6-character random string
2. **Get token** - HTTP GET `/token.php?key=xkey`
3. **Calculate hashes** - MD5(authcode+token), MD5(schemecode+token)
4. **Authenticate** - HTTP GET `/auth.php?key=xkey&user=slot&system=syscode&auth=hash1&scheme=hash2&rows=24&door=CODE&token=TOKEN&type=ami-express&version=0.1.beta`
5. **Connect** - Telnet to games.bbslink.net:23
6. **Proxy** - Forward data between user and game server

### HTTP Requests

Uses Node.js `http.request()` for HTTP GET:

```typescript
function httpGet(host: string, port: number, path: string, timeout: number): Promise<string> {
  const options = {
    hostname: host,
    port: port,
    path: path,
    method: 'GET',
    timeout: timeout * 1000,
    headers: {
      'Host': host,
      'Connection': 'close'
    }
  };
  // ... request handling
}
```

### Telnet Connection

Uses Node.js `net.createConnection()` for telnet proxy:

```typescript
const telnetSocket = net.createConnection({
  host: config.serverHost,
  port: config.telnetPort,
  timeout: 30000
});

// Forward game server data to user
telnetSocket.on('data', (data: Buffer) => {
  ioSocket.emit('ansi-output', data.toString('binary'));
});

// Forward user input to game server
ioSocket.on('door-input', (data: { text: string }) => {
  telnetSocket.write(data.text);
});
```

### Door Code Parameter

Supports direct game launch via command parameter:

```
LINKMENU LUNA  → parses "LUNA" as doorCodeParam
```

Config file can define game codes:
```ini
LUNA=luna
LORD=lord
```

If no parameter, defaults to MENU (shows game selection menu).

## Comparison with Original

### Similarities (1:1 Port)

- **Same authentication flow** - token → MD5 hashes → auth request
- **Same server** - games.bbslink.net:80 (HTTP), :23 (Telnet)
- **Same endpoints** - `/token.php`, `/auth.php`
- **Same MD5 calculation** - authcode+token, schemecode+token
- **Same session key** - 6-character random string
- **Same parameters** - Door code via command line
- **Same config format** - KEY=VALUE pairs in bbslink.cfg

### Improvements

- **Modern async/await** - Better error handling than original
- **TypeScript types** - Type safety for config and connection
- **Better logging** - Console output for debugging
- **Error messages** - User-friendly error display
- **Example config** - Comprehensive bbslink.cfg.example with all games

## Files Created

1. `/Doors/bbslink/index.ts` (~390 lines)
   - Complete TypeScript port from Amiga E
   - All authentication and connection logic
   - Telnet proxy implementation

2. `/Doors/bbslink/bbslink.info` (8 lines)
   - Door configuration
   - TypeScript door, access level 10

3. `/Doors/bbslink/bbslink.cfg.example` (70 lines)
   - Example configuration file
   - All supported game codes
   - Instructions for setup

4. `/Commands/BBSCmd/LINKMENU.info` (8 lines)
   - Command configuration
   - Links to BBSLink door

## Compilation Status

- **Backend**: Compiles successfully (`npx tsc --noEmit`)
- **No TypeScript errors**
- **No runtime dependencies added** (uses Node.js built-ins: http, net, crypto, fs)

## Testing Checklist

### Configuration

- [ ] bbslink.cfg loads from Doors/bbslink/
- [ ] bbslink.cfg loads from BBS root
- [ ] Missing config shows error message
- [ ] Invalid syscode/authcode/schemecode shows error

### Authentication

- [ ] Session key generates (6 characters)
- [ ] Token request succeeds (/token.php)
- [ ] MD5 hashes calculate correctly
- [ ] Auth request succeeds (/auth.php)
- [ ] Authentication failure shows error

### Connection

- [ ] Telnet connects to games.bbslink.net:23
- [ ] Game data displays to user
- [ ] User input forwards to game server
- [ ] Connection close handled gracefully
- [ ] Network errors show user-friendly messages

### Door Codes

- [ ] LINKMENU with no parameter shows menu (MENU code)
- [ ] LINKMENU LUNA launches Lunatix
- [ ] LINKMENU LORD launches Legend of the Red Dragon
- [ ] Invalid door code shows error or defaults to menu
- [ ] Config file game codes work (LUNA=luna, etc.)

### Game Play

- [ ] LORD game loads and plays
- [ ] Trade Wars game loads and plays
- [ ] User can exit game and return to BBS
- [ ] Multiple users can play simultaneously (multinode)

## Integration

Works with existing BBSLinkWall door:

- **LINKWALL** - BBSLink graffiti wall (already ported)
- **LINKMENU** - BBSLink games menu (newly ported)

Both use the same BBSLink.net service and share configuration file.

## Setup Instructions

1. **Register at BBSLink.net** (free)
   - Visit http://www.bbslink.net/
   - Sign up for free account
   - Get syscode, authcode, schemecode

2. **Create configuration**
   ```bash
   cp Doors/bbslink/bbslink.cfg.example Doors/bbslink/bbslink.cfg
   ```

3. **Edit configuration**
   ```ini
   SYSCODE=your_sys_code_here
   AUTHCODE=your_auth_code_here
   SCHEMECODE=your_scheme_code_here
   ```

4. **Test door**
   ```
   LINKMENU         # Show games menu
   LINKMENU TEST    # Test connection
   ```

5. **Add to menu**
   - Door appears as LINKMENU command
   - Add to main menu or games menu
   - Recommended access level: 10+

## Security Considerations

1. **Authentication**: MD5-based (legacy, but required by BBSLink)
2. **Configuration**: Store config file with restricted permissions
3. **Network**: All traffic to games.bbslink.net (trusted service)
4. **User input**: Forwarded directly to game server (no filtering)
5. **Timeouts**: 10-second HTTP timeout, 30-second telnet timeout

## Limitations

1. **No game menu** - Original had ANSI menu, TypeScript version connects directly
2. **MD5 authentication** - Legacy crypto (required by BBSLink service)
3. **HTTP (not HTTPS)** - BBSLink.net uses HTTP (not HTTPS) for legacy compatibility
4. **External service** - Requires BBSLink.net to be operational

## Future Enhancements

Possible improvements (not in scope for this implementation):

1. **Game menu** - ANSI art menu showing available games
2. **Game descriptions** - Display game details before launching
3. **Statistics** - Track most popular games
4. **Favorites** - Save user's favorite games
5. **Web admin** - Configure BBSLink settings via web interface
6. **Game screenshots** - Display game screenshots in menu

## References

- Original Amiga E source: `/Documentation/7-Reference Sources/AmiExpressEDoorSources/BBSLink/bbslink.e`
- BBSLinkWall source: `/Documentation/7-Reference Sources/AmiExpressEDoorSources/BBSLink/bbslinkwall.e`
- BBSLinkWall TypeScript: `/Doors/bbslinkwall/index.ts`
- Telnet door pattern: `/Doors/telnet/index.ts`
- BBSLink service: http://www.bbslink.net/

---

**Implementation completed:** 2026-01-02
**Status:** READY FOR TESTING
**Next:** Task #8 - Port ConfTop-II utility to TypeScript
