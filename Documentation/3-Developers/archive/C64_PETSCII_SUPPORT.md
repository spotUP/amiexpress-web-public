# Commodore 64 PETSCII Support

**Date**: 2025-11-14
**Status**: Production-Ready

---

## Overview

AmiExpress-Web supports **native Commodore 64 PETSCII terminals** connecting via telnet. The BBS automatically detects real C64 clients and sends raw PETSCII byte codes instead of Unicode, providing authentic 40x25 C64 BBS experience.

---

## How It Works

### Terminal Type Detection

The BBS uses **three methods** to detect C64 clients (in priority order):

#### 1. TERMINAL-TYPE Negotiation (RFC 1091) - BEST
```
Server: IAC DO TERMINAL-TYPE
Client: IAC WILL TERMINAL-TYPE
Server: IAC SB TERMINAL-TYPE SEND IAC SE
Client: IAC SB TERMINAL-TYPE IS "C64" IAC SE
```

Detects if terminal type string contains:
- `"C64"` - SyncTERM in C64 mode
- `"COMMODORE"` - Real C64 terminals
- `"PETSCII"` - PETSCII-aware terminals

#### 2. NAWS Window Size Detection (RFC 1073) - FALLBACK
```
Client: IAC SB NAWS width(40) height(25) IAC SE
```

If NAWS reports **40x25**, assumes C64 client.

#### 3. Manual Configuration - OVERRIDE
Users can force terminal type via session preferences.

### Dual Output Path

Once detected, all output is routed based on terminal type:

```typescript
// Real C64
terminalType === 'c64'
→ Raw PETSCII bytes (0x00-0xFF)
→ 40 columns
→ 25 rows
→ PETSCII control codes (0x93 = clear, 0x05 = white)

// Modern Terminal
terminalType === 'modern'
→ Unicode PUA (U+E000-E0FF) + ANSI colors
→ 80 columns
→ 24 rows
→ PetMe64 font in browser
```

---

## Screen File Variants

### File Naming Convention

For real C64 clients, create **_C64.seq** variants optimized for 40 columns:

```
Screens/
├── MENU.seq        → Modern terminals (80x24 with PetMe64 font)
├── MENU_C64.seq    → Real C64 (40x25 raw PETSCII)
├── LOGIN.seq       → Modern terminals
├── LOGIN_C64.seq   → Real C64
└── GOODBYE.seq     → Shared (if 40 columns work for both)
```

### File Priority (C64 Clients)

When `terminalType === 'c64'`, loadScreenFile tries in order:

1. `MENU_C64.seq` - C64-specific variant (40x25 layout)
2. `MENU.seq` - Standard PETSCII file
3. `MENU.TXT` - ANSI fallback

### File Priority (Modern Terminals)

When `terminalType === 'modern'`:

1. `MENU.seq` - PETSCII file (converted to Unicode PUA)
2. `MENU.TXT` - Standard ANSI file

### Creating C64 Screen Files

**Requirements for _C64.seq files:**

- **40 columns maximum** (hard limit for C64)
- **25 rows maximum** (C64 screen height)
- **Raw PETSCII bytes** (0x00-0xFF)
- **PETSCII control codes:**
  - `0x93` - Clear screen
  - `0x13` - Home cursor
  - `0x11` - Cursor down
  - `0x9D` - Cursor left
  - `0x1D` - Cursor right
  - `0x05` - White color
  - `0x1C` - Red color
  - `0x1E` - Green color
  - `0x9A` - Light blue color
- **NO ANSI codes** (C64 doesn't understand `\x1b[` sequences)
- **Line endings**: `\r\n` or just `\r`

**Tools for creating .seq files:**

- **Moebius** (Modern PETSCII editor)
- **PetscIIMate** (C64 native)
- **ASCII/PETSCII converter** (included in utils)

**Example conversion:**

```bash
# Create PETSCII file from text (40 column wrap)
fold -w 40 MENU.TXT | npx ts-node -P dev/scripts/tsconfig.json dev/scripts/convert-to-petscii.ts > Screens/MENU_C64.seq
```

---

## Output Encoding

### For Real C64 (Raw PETSCII)

```typescript
// Backend sends Unicode PUA internally
socket.emit('petscii-output', '\uE093\uE041\uE042\uE043');

// Telnet/SSH emitter converts to raw PETSCII for C64
convertUnicodePuaToPetscii() →
Buffer([0x93, 0x41, 0x42, 0x43])
→ C64 displays: [CLR]ABC
```

### For Modern Terminals (Unicode PUA)

```typescript
// Backend sends Unicode PUA
socket.emit('petscii-output', '\uE093\uE041\uE042\uE043');

// Browser applies PetMe64 font
→ Renders authentic PETSCII graphics
```

---

## Session Tracking

### BBSSession Fields

```typescript
interface BBSSession {
  terminalType?: 'c64' | 'modern' | 'unknown';
  screenWidth?: number;   // 40 for C64, 80 for modern
  screenHeight?: number;  // 25 for C64, 24 for modern
  petsciiMode?: boolean;  // true for all PETSCII content
}
```

### Terminal Type Events

**Telnet Connection:**

```typescript
// TTYPE detection
connection.on('terminal-type', (info) => {
  session.terminalType = info.isC64 ? 'c64' : 'modern';
  session.screenWidth = info.width;   // 40 or 80
  session.screenHeight = info.height; // 25 or 24
});

// NAWS fallback
connection.on('window-size', (width, height) => {
  if (width === 40 && height === 25) {
    session.terminalType = 'c64';
  }
});
```

---

## Testing

### Test with SyncTERM (Free)

1. **Download SyncTERM**: https://syncterm.bbsdev.net/
2. **Configure connection:**
   - Host: `localhost`
   - Port: `2323`
   - ConnectionType: `Telnet`
   - ScreenMode: `C64`
   - Font: `Commodore 64` (built-in)
3. **Connect** - BBS should detect as C64 and send raw PETSCII

### Test with VICE Emulator + CCGMS

1. **Install VICE**: https://vice-emu.sourceforge.io/
2. **Load CCGMS terminal**: http://csdb.dk/release/?id=156523
3. **Configure modem**: Use `tcpser` to bridge to telnet
4. **Dial**: `ATDT localhost:2323`

### Test with Real C64 + WiFi Modem

1. **WiFi Modem**: WiModem, WiFi232, or Ultimate II+
2. **Terminal Software**: CCGMS, KipperTerm, or UltimateTerm
3. **Connect**: `ATDT bbs-hostname:2323`

---

## Implementation Details

### Telnet Server (telnet-server.ts)

**TTYPE Negotiation:**

```typescript
// Request terminal type
initializeTelnet() {
  this.sendCommand([IAC, DO, TELOPT_TTYPE]);
}

// Client accepts, send SEND request
handleNegotiation(WILL, TELOPT_TTYPE) {
  this.sendCommand([IAC, SB, TELOPT_TTYPE, TTYPE_SEND, IAC, SE]);
}

// Parse response
handleTerminalType() {
  const terminalTypeString = extractTTYPE(this.ttypeData);
  const isC64 = terminalTypeString.includes('C64') ||
                terminalTypeString.includes('COMMODORE') ||
                terminalTypeString.includes('PETSCII');

  this.emit('terminal-type', {
    terminalType: terminalTypeString,
    isC64: isC64,
    width: isC64 ? 40 : 80,
    height: isC64 ? 25 : 24
  });
}
```

### Output Router (index.ts)

```typescript
const emitter = {
  emit: (event: string, data: any) => {
    if (event === 'petscii-output') {
      if (connection.session?.terminalType === 'c64') {
        // Real C64 - convert Unicode PUA → raw PETSCII
        const petsciiBytes = convertUnicodePuaToPetscii(data);
        connection.write(petsciiBytes);
      } else {
        // Modern terminal - send Unicode PUA as-is
        connection.write(data);
      }
    }
  }
};
```

### PETSCII Converter (petscii.util.ts)

```typescript
export function convertUnicodePuaToPetscii(data: string): Buffer {
  // Convert U+E000-E0FF → 0x00-0xFF
  // Convert ANSI colors → PETSCII color codes
  // Strip unsupported escape sequences
  return Buffer.from(petsciiBytes);
}
```

---

## Color Mapping

### PETSCII → ANSI (Modern Terminals)

| PETSCII | Color       | ANSI Code   |
|---------|-------------|-------------|
| 0x05    | White       | `\x1b[0;37m` |
| 0x1C    | Red         | `\x1b[0;31m` |
| 0x1E    | Green       | `\x1b[0;32m` |
| 0x1F    | Blue        | `\x1b[0;34m` |
| 0x81    | Orange      | `\x1b[0;33m` |
| 0x90    | Black       | `\x1b[0;30m` |
| 0x99    | Light Green | `\x1b[0;92m` |
| 0x9A    | Light Blue  | `\x1b[0;94m` |
| 0x9C    | Purple      | `\x1b[0;35m` |
| 0x9E    | Yellow      | `\x1b[0;93m` |
| 0x9F    | Cyan        | `\x1b[0;36m` |

### ANSI → PETSCII (Real C64)

| ANSI Code    | PETSCII | Color       |
|--------------|---------|-------------|
| `\x1b[0;37m` | 0x05    | White       |
| `\x1b[0;31m` | 0x1C    | Red         |
| `\x1b[0;32m` | 0x1E    | Green       |
| `\x1b[0;34m` | 0x1F    | Blue        |
| `\x1b[0;33m` | 0x81    | Orange      |
| `\x1b[0;30m` | 0x90    | Black       |

---

## Troubleshooting

### C64 Not Detected

**Check logs:**

```
[Telnet] Terminal detected: C64 (C64) - 40x25
```

**If not detected:**

1. Verify TTYPE support in client
2. Check NAWS is sending 40x25
3. Enable debug logging: `DEBUG=telnet npm run dev`

### Garbled Output on C64

**Causes:**

- Sending Unicode PUA instead of raw PETSCII
- ANSI codes not converted to PETSCII
- Line width exceeds 40 columns

**Solution:**

- Verify `terminalType === 'c64'`
- Check `convertUnicodePuaToPetscii()` is called
- Create _C64.seq variant with 40-column layout

### Modern Terminal Shows Raw PETSCII

**Causes:**

- Terminal type incorrectly detected as C64
- Missing PetMe64 font

**Solution:**

- Verify terminal type detection
- Check browser console for font loading errors
- Ensure `petscii-output` event uses PetMe64 font

---

## References

### RFCs

- **RFC 854**: Telnet Protocol
- **RFC 1073**: Telnet Window Size (NAWS)
- **RFC 1091**: Telnet Terminal Type

### PETSCII Resources

- **PETSCII Codes**: https://sta.c64.org/cbm64pet.html
- **C64 BBS Guide**: https://csdb.dk/
- **PetMe64 Font**: https://github.com/..." (font repo)

### Code Locations

- `web/backend/src/server/telnet-server.ts` - TTYPE negotiation
- `web/backend/src/index.ts` - Output routing
- `web/backend/src/utils/petscii.util.ts` - PETSCII conversion
- `web/backend/src/handlers/screen.handler.ts` - Screen file selection

---

## Summary

✅ **Auto-detects C64 clients** via TTYPE and NAWS
✅ **Dual output path** - raw PETSCII for C64, Unicode PUA for modern
✅ **Screen file variants** - _C64.seq for 40-column layouts
✅ **Color mapping** - bidirectional PETSCII ↔ ANSI
✅ **Session tracking** - terminalType, screenWidth, screenHeight
✅ **Testing tools** - SyncTERM, VICE, real C64

Real Commodore 64 users can now connect via telnet and experience authentic 40x25 PETSCII BBS environment!
