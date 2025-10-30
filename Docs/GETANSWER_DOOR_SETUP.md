# GetAnswer Door Setup (2025-10-30)

## What Was Done

Added the **GetAnswer door** (8KB XIM door) to the BBS for testing as a simpler alternative to the Bulls door.

## Command

Type `GA` at the BBS prompt to launch GetAnswer.

## Door Details

**File:** `doors/GetAnswer/GetAnswer`
**Size:** 8,192 bytes (8KB)
**Type:** XIM door (AmiExpress Extended Internal Module)
**Purpose:** Displays new user registration answers

**Why This Door:**
- **Smallest Amiga door available** (62% smaller than Bulls at 21KB)
- Simple data display functionality
- No complex graphics/sound/game logic
- Same XIM door type as Bulls (uses AEDoor.library interface)
- Fewer dependencies = more likely to work without ROM emulation

## Implementation

Added GA command handler in `web/backend/src/handlers/command.handler.ts`:

```typescript
case 'GA': { // GetAnswer - Test simple Amiga door (8KB XIM door)
  try {
    console.log('[GA] Starting GetAnswer door...');
    const { AmigaDoorSession } = await import('../amiga-emulation/AmigaDoorSession');
    const doorPath = path.join(process.cwd(), 'doors/GetAnswer/GetAnswer');

    if (!fs.existsSync(doorPath)) {
      socket.emit('ansi-output', '\r\n\x1b[31mGetAnswer door not found!\x1b[0m\r\n');
      session.subState = LoggedOnSubState.DISPLAY_MENU;
      session.menuPause = false;
      return;
    }

    socket.emit('ansi-output', '\r\n\x1b[36m🚀 Starting GetAnswer (8KB XIM door)...\x1b[0m\r\n\r\n');

    const amigaSession = new AmigaDoorSession(socket, {
      executablePath: doorPath,
      timeout: 600,
      memorySize: 1024 * 1024
    });

    await amigaSession.start();

    socket.emit('ansi-output', '\r\n\x1b[32mGetAnswer door session completed.\x1b[0m\r\n');
  } catch (error) {
    console.error('[GA] Fatal error:', error);
    socket.emit('ansi-output', '\r\n\x1b[31mError starting GetAnswer door:\x1b[0m\r\n');
    socket.emit('ansi-output', `${(error as Error).message}\r\n`);
  }
  return;
}
```

## Testing Procedure

1. Connect to BBS: `https://bbs.uprough.net`
2. Login as sysop
3. Type `GA` at the prompt
4. Monitor backend logs: `tail -f /tmp/backend.log`

## Expected Behaviors

### If GetAnswer Works (Success!)
- Door loads successfully
- Prompts for username (or wildcard pattern)
- Reads user registration data from BBS files
- Displays user answers
- Exits cleanly
- **This proves:** Door infrastructure, library traps, dos.library, AEDoor.library, file I/O, text output all work!

### If GetAnswer Fails Like Bulls (Needs More Work)
- Door loads successfully
- May output some text via aePuts()
- Reads from ROM space (0xFF0000+)
- Crashes at PC=0x0 (NULL pointer)
- **This means:** Even simple doors need basic ROM emulation

## Comparison: GetAnswer vs Bulls

| Feature | GetAnswer | Bulls (AquaBulls) |
|---------|-----------|-------------------|
| **Size** | 8,192 bytes | 21,828 bytes |
| **Type** | XIM door | XIM door |
| **Purpose** | Display user data | Game door |
| **Complexity** | Simple file I/O | Graphics, sound, game logic |
| **ROM Reads** | Unknown (testing) | YES (crashes) |
| **Library Deps** | dos.library, AEDoorPort | dos.library, AEDoorPort, + more |

## Why GetAnswer Should Work

1. **62% smaller** = fewer dependencies
2. **Simple purpose** = just reads user files and displays text
3. **No graphics/sound** = less likely to need hardware emulation
4. **Same infrastructure** = uses same AEDoor.library as Bulls

## Logs to Monitor

Watch for these log patterns:

```
[GA] Starting GetAnswer door...
[GA] Door path: ~/Code/amiexpress-web/doors/GetAnswer/GetAnswer
[AmigaDoorSession] Loading door executable...
[AmigaDoorSession] Door loaded: 2 segments, X bytes
[AmigaDoorSession] Relocating segments...
[AmigaDoorSession] Starting door execution at PC=0x...
[AEDoor] aePuts() called: <text output>
```

## Success Criteria

- ✅ Door loads (hunk format parsing)
- ✅ Door executes (68k CPU emulation)
- ✅ Text output (aePuts works)
- ✅ Library calls (trap mechanism works)
- ✅ File I/O (reads user data)
- ✅ Clean exit (no crashes)

## If It Works

This validates the entire Amiga door execution infrastructure! We can then test more complex doors with confidence.

## If It Doesn't Work

- Analyze crash logs
- Check for ROM reads
- Compare behavior to Bulls door
- May need to implement minimal ROM stub
- Try even simpler doors (aeclidoor 14KB, hello-door TypeScript)

## Next Steps After Testing

1. Document GetAnswer behavior (success or failure)
2. If successful: Test more complex doors
3. If fails: Implement basic ROM reads or try simpler doors
4. Eventually achieve full door compatibility

---

**Status:** Ready for testing
**Date:** 2025-10-30
**Backend:** Restarted with GA command support
**Door File:** Verified present at `doors/GetAnswer/GetAnswer`
