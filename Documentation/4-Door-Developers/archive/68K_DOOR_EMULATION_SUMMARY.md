# 68K Door Emulation Summary

**Goal:** consolidate the must-follow guidance for finishing AmiExpress 68K door support.

## Primary References
- `Docs/AMIGA_DOOR_IMPLEMENTATION_GUIDE.md` – canonical exec/dos behavior (message ports, signals, memory, process rules) pulled directly from ADCD 2.1.
- `Documentation/4-Door-Developers/AMIGA_EMULATION.md` – mandates using the ADCD set and vAmiga sources plus Puppeteer-driven testing.
- `Documentation/4-Door-Developers/AMIEXPRESS_DOOR_SOURCES_ANALYSIS.md` – usage matrix for 17 door source files that pinpoints missing DOS calls and recommended validation targets.
- `Documentation/4-Door-Developers/PORTED_E_DOORS.md` – status of TypeScript ports (ensures we focus emulation on true 68K binaries).
- `dev/docs/uade-door-study.md` – UADE reverse-engineering notes derived from the UADE sources; highlights how classic Amiga music player doors interact with exec/dos and provides extra reference points for emulator edge cases.

Always cross-check the ADCD path referenced in the implementation guide before changing emulator code.

## Exec/DOS Semantics We Must Honor
1. **Message Ports (exec)**  
   - CreateMsgPort auto-allocates a signal bit; DeleteMsgPort frees it.  
   - AddPort/RemPort wrap public registration and FindPort MUST be wrapped by Forbid()/Permit().  
   - PutMsg enqueues without copying; receivers must WaitPort ➝ GetMsg loop until NULL, replying each message to release ownership.
2. **Signals (exec)**  
   - Signals are single-bit flags per task, not counters—multiple Signal() calls coalesce.  
   - Wait() clears and returns all satisfied bits; missing waits will deadlock door tasks.
3. **Memory Allocation (exec)**  
   - AllocMem/FreeMem require exact sizes; AllocVec/FreeVec (V36+) track size internally.  
   - CopyMem is used by md5.e; ensure our implementation matches exec semantics.
4. **Process/Task Rules**  
   - Doors expect separate tasks with proper signal masks; never reuse structures after Permit() releases protection.

## Critical DOS Functions Still Blocking 68K Doors
Identified in the source analysis and required for WHO/QuickNew/etc.:
1. **ReadArgs(-804) & FreeArgs(-810)** – CLI template parsing and cleanup; QuickNew.asm, DiscordAnnounce.e, and mtop.e depend on them.
2. **DateToStr(-744)** – Formats DateStamp structures (FORMAT_DOS/INT/USA/CDN).  
3. **DateStamp(-192)** – needs real time conversion (days since 1978-01-01, minutes, ticks).  
4. **AddPart(-300)** – safe path concatenation respecting separators and buffer limits.

Implement these exactly as described in ADCD autodocs (paths cited in the guide) and wire them through the DOS vector table. QuickNew.asm is the best validation door because it exercises all four APIs without any Amiga E runtime helpers.

## Testing & Debug Workflow
- **Use Puppeteer scripts (`test-ga-command.js` copies)** for login/command execution; socket.io-client is forbidden because it bypasses terminal timing.  
- **Watch PC flow and register states** when running 68K binaries; some doors (e.g., Bulls) need early reply-port injection before they jump into ROM loops.  
- **Verification targets:**  
  1. QuickNew.asm (exercise ReadArgs/DateToStr/AddPart).  
  2. WHO/Bulls style XIM doors (confirm AEDoor messaging).  
  3. DiscordAnnounce.e (ReadArgs/FreeArgs).  
- **Logging expectations:** trace AEDoor.library calls, Write() handles, and loop PCs every ~100 iterations to spot stuck ROM jumps.

## Prioritized Action Items
1. Implement DOS Phase 4 functions (ReadArgs/FreeArgs/DateToStr/DateStamp/AddPart) with unit-style tests where feasible.  
2. Re-test Bulls/WHO using the enhanced logging pipeline to ensure ports, startup messages, and reply injections follow exec rules.  
3. Continue referencing `PORTED_E_DOORS.md` to avoid duplicating work already ported to TS; focus emulation on unported binaries only.  
4. Capture any new quirks in MCP resources instead of ad-hoc markdown, keeping this summary as the high-level checklist.
