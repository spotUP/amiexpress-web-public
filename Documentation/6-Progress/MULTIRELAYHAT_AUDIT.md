# MultiRelayChat TypeScript Implementation Audit

**Date:** 2026-01-02
**Audited by:** Claude Code (Sonnet 4.5)
**Status:** ✅ FAITHFUL PORT (1:1 functional implementation)

## Executive Summary

The TypeScript implementation (`mrc-client.ts`) is a **FAITHFUL 1:1 PORT** of the original Amiga E mrc_client multiplexer. Same protocol, same architecture, same message format, same client limit (100), same listen port (5000). Implementation is functionally equivalent with minor modernizations for error handling.

**This is an excellent port** - maintains full protocol compatibility while adding TypeScript type safety and modern async patterns.

---

## Original System Architecture

### Amiga E Version (mrc_client.e):

**How it works**:
1. Background daemon/multiplexer running on BBS server
2. Connects to global MRC server (e.g., mrc.bottomlessabyss.net:5000)
3. Listens on local port 5000 for door connections
4. Relays messages between:
   - Remote MRC server ↔ Local multiplexer ↔ BBS door clients
5. Handles protocol messages (PING, STATS, VERSION, LATENCY)
6. Auto-reconnect with exponential backoff
7. Supports up to 100 concurrent door connections

**MRC Protocol**:
```
Message format: fromuser~frombbs~fromroom~touser~tobbs~toroom~message~
Separator: ~ (tilde)
Line ending: \n or \r\n (auto-detected)
```

**Special Commands**:
- `SERVER~~~CLIENT~~~PING~` - Server keepalive
- `CLIENT~~~SERVER~~~IMALIVE~` - Client response
- `CLIENT~~~SERVER~~~STATS~` - Request server stats
- `SERVER~~~CLIENT~~~STATS:data~` - Server stats response
- `~~~CLIENT~~~VERSION~` - Client version query
- `SERVER~~~CLIENT~~~NEWUPDATE:x.x.x~` - Update notification
- `SERVER~~~CLIENT~~~OLDVERSION:x.x.x~` - Version too old, disconnect

---

## TypeScript Implementation

### Architecture (mrc-client.ts):

**How it works**:
1. Background Node.js daemon
2. Connects to MRC server via `net.Socket`
3. Listens on port 5000 via `net.Server`
4. Relays messages identically to original
5. Same protocol, same commands, same behavior
6. Auto-reconnect with exponential backoff (matching intervals)
7. Same 100 client limit

**Key Features Preserved**:
- Tilde-separated protocol parsing
- Auto-detection of line separators (`\r\n`, `\n\r`, `\r`, `\n`)
- Partial packet buffering and reassembly
- Client version reporting
- Stats caching (mrcstats.dat)
- Chat logging (mrcchat.log)
- Debug logging (mrcchat.dbg when DEBUG_FLAG=true)

---

## Feature Comparison

| Feature | Original | TypeScript | Status |
|---------|----------|------------|--------|
| **Protocol format** | `~` separated | `~` separated | ✅ |
| **Listen port** | 5000 | 5000 | ✅ |
| **Max clients** | 100 | 100 | ✅ |
| **Auto-reconnect** | ✅ [1,2,5,10,30,60,120,180,240,300]s | ✅ Same intervals | ✅ |
| **PING/IMALIVE** | ✅ | ✅ | ✅ |
| **STATS handling** | ✅ | ✅ | ✅ |
| **VERSION query** | ✅ | ✅ | ✅ |
| **LATENCY query** | ✅ | ✅ | ✅ |
| **Update notification** | ✅ | ✅ | ✅ |
| **Old version kick** | ✅ | ✅ | ✅ |
| **Chat logging** | ✅ (mrcchat.log) | ✅ (mrcchat.log) | ✅ |
| **Debug logging** | ✅ (mrcchat.dbg) | ✅ (mrcchat.dbg) | ✅ |
| **Stats file** | ✅ (mrcstats.dat) | ✅ (mrcstats.dat) | ✅ |
| **Config file** | ✅ (mrc_client.cfg) | ✅ (mrc_client.cfg) | ✅ |
| **BBS info** | ✅ | ✅ | ✅ |
| **Packet validation** | ✅ (6+ tildes) | ✅ (5+ tildes) | ⚠️ MINOR DIFF |

---

## Data Format Comparison

### Config File (IDENTICAL):
```ini
BBSNAME=My BBS Name
INFO_WEB=https://mybbs.com
INFO_TELNET=mybbs.com:23
INFO_SSH=mybbs.com:22
INFO_SYSOP=Sysop Name
INFO_DESC=My BBS Description
```

### Message Protocol (IDENTICAL):
```
User message:
username~mybb~room1~otheruser~otherbs~room2~Hello!~

Server PING:
SERVER~~~CLIENT~~~PING~

Client IMALIVE:
CLIENT~mybbs~~SERVER~~~IMALIVE:mybbs~

Version query response:
CLIENT~~~username~mybbs~~|07- Multi Relay Chat Client v1.2.9 [sf]~

Stats request:
CLIENT~mybbs~~SERVER~~~STATS~

Stats response:
SERVER~~~CLIENT~~~STATS:nnnnn~
```

**Format is 100% compatible.**

---

## Implementation Details

### Original (Amiga E):
```e
PROC send_server(data:PTR TO CHAR)
  DEF data2
  IF data
    data2:=String(StrLen(data)+1)
    StrCopy(data2,data)
    IF data2[StrLen(data2)-1]<>'\n' THEN StrAdd(data2,'\n')
    r:=Send(mrcserver,data2,StrLen(data2),0)
    DisposeLink(data2)
    IF r=-1
      logger('Connection error')
      Shutdown(mrcserver,2)
      CloseSocket(mrcserver)
    ENDIF
  ENDIF
ENDPROC
```

### TypeScript:
```typescript
function sendServer(data: string): void {
  if (!mrcserver || !data) return;

  let dataToSend = data;
  if (!dataToSend.endsWith('\n')) {
    dataToSend += '\n';
  }

  try {
    mrcserver.write(dataToSend);
  } catch (err) {
    logger(`Connection error: ${err}`);
    if (mrcserver) {
      mrcserver.destroy();
      mrcserver = null;
    }
  }
}
```

**Logic is identical** - adds newline if missing, sends, handles errors.

---

## Version Identification

### Original:
```e
StrCopy(version,'1.2.9')
StrCopy(platform_name,'AMIEXPRESS')
StrCopy(system_name,'Amiga')
StrCopy(machine_arch,'68K')

StringF(version_string,'\s/\s.\s/\s',platform_name, system_name, machine_arch, version)
-> Result: "AMIEXPRESS/Amiga.68K/1.2.9"
```

### TypeScript:
```typescript
const VERSION = '1.2.9';
const PLATFORM_NAME = 'AMIEXPRESS-WEB';
const SYSTEM_NAME = 'Node.js';
const MACHINE_ARCH = 'TypeScript';

const versionString = `${PLATFORM_NAME}/${SYSTEM_NAME}.${MACHINE_ARCH}/${VERSION}`;
// Result: "AMIEXPRESS-WEB/Node.js.TypeScript/1.2.9"
```

**Same version number (1.2.9)**, different platform identification.

**Server compatibility**: MRC server should accept both identifiers.

---

## Packet Validation Difference

### Original (Amiga E):
```e
IF countsep(data,"~")>5   -> Requires 6+ tildes
```

### TypeScript:
```typescript
if (tildeCount < 5)       // Requires 5+ tildes
```

**Off by one**: Original requires 6+ tildes, TypeScript requires 5+.

**Impact**: TypeScript is MORE permissive. May accept malformed packets that Amiga version would reject.

**Recommendation**: Change TypeScript to `if (tildeCount < 6)` to match original.

**Valid MRC packet format**: `fromuser~frombbs~fromroom~touser~tobbs~toroom~message~` = **7 fields** = **6 tildes**.

**Correct validation**: Should be `>= 6` tildes (TypeScript currently uses `>= 5`).

---

## Auto-Reconnect Intervals

### Original (Amiga E):
```e
DEF intv[]={1,2,5,10,30,60,120,180,240,300}
```

### TypeScript:
```typescript
const intv = [1, 2, 5, 10, 30, 60, 120, 180, 240, 300];
```

**Identical** - exponential backoff with same intervals (seconds).

---

## File Outputs

### Both versions create:
- `mrcchat.log` - User chat messages
- `mrcchat.dbg` - Debug log (if DEBUG_FLAG=true)
- `mrcstats.dat` - Server stats cache

**Format identical** - both use same timestamp format and log structure.

---

## Recommendations

### High Priority
1. **Fix tilde validation** - Change `tildeCount < 5` to `tildeCount < 6` to match original
   - File: `mrc-client.ts:267`
   - Current: `if (tildeCount < 5)`
   - Should be: `if (tildeCount < 6)` or `if (tildeCount <= 5)`

### Low Priority
2. **Platform identifier** - Document that TypeScript uses `AMIEXPRESS-WEB/Node.js.TypeScript` vs original `AMIEXPRESS/Amiga.68K`
3. **Server compatibility** - Verify MRC server accepts TypeScript platform string
4. **Integration testing** - Test with real MRC server to verify protocol compatibility

---

## Conclusion

✅ **The TypeScript mrc-client.ts is a FAITHFUL 1:1 PORT** of the Amiga E original.

**What it DOES**:
- ✅ Same MRC protocol (tilde-separated messages)
- ✅ Same listen port (5000)
- ✅ Same client limit (100)
- ✅ Same auto-reconnect intervals
- ✅ Same special command handling (PING, STATS, VERSION, LATENCY)
- ✅ Same log files (mrcchat.log, mrcchat.dbg, mrcstats.dat)
- ✅ Same config file format
- ✅ Same message relay logic

**Minor differences**:
- ⚠️  Tilde validation off by one (5+ vs 6+) - **SHOULD FIX**
- ⚠️  Platform identifier string differs (acceptable)
- ✅ TypeScript error handling slightly cleaner (improvement)

**Status**: APPROVED with one minor fix recommended (tilde validation).

**No protocol compatibility issues** - TypeScript version implements same wire protocol and message format as original.

---

## References

- Original source: `Documentation/7-Reference Sources/AmiXDoors-master/MultiRelayChat/mrc_client.e`
- Original config: `Documentation/7-Reference Sources/AmiXDoors-master/MultiRelayChat/mrc_client.cfg`
- TypeScript implementation: `web/backend/src/services/mrc-client.ts`
- Protocol documentation: `Documentation/7-Reference Sources/AmiXDoors-master/MultiRelayChat/readme.txt`
