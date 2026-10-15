# Known Issues (Summary)
**Last updated:** 2025-12-28 (Comprehensive audit completed)

## Active Issues
None - all known issues resolved.

## Recently Resolved (2025-12-28)
- **Door-specific pagination**: Added PAGINATION tooltype support. Doors can now specify:
  - `PAGINATION=0` or omit: Door handles its own pagination (default)
  - `PAGINATION=N` (N>0): Auto-pause after N lines
  - `PAGINATION=-1`: Use user's screen height setting

## Implementation Notes (Not Bugs)

### Features Intentionally Not Implemented
These are by design for the web environment:
- **Command 0 (Remote Shell)**: Amiga-specific feature, security concern for web
- **Command 3/4 (Edit Files)**: Filesystem editing, security concern for web
- **Command 5 (Navigate Filesystem)**: Amiga-specific feature

### Features Never in Original Express.e
- **FULLEDIT**: express.e lines 11, 3955-3956 say "not yet implemented"
- **FREE_RESUMING**: express.e line 14 says "not implemented in /X3 or 4"
- **RIPSCRIPT**: express.e says "unknown (cant see any code that uses this)"

### MCI Codes Status (~95% complete)
All major MCI codes are implemented per express.e:5258-5766:
- ~Dx (dynamic terminator) - COMPLETE
- ~SMO/~SMC (slow mode) - COMPLETE
- ~SR_ (random file display) - COMPLETE
- ~CC_ (execute command) - COMPLETE
- ~SM_ (set menu name) - COMPLETE
- ~CL/~CD/~ML/~MD (lists/descriptions) - COMPLETE
- All color/attribute codes - COMPLETE

## Resolved Issues (2025-12-28)

### FR Output Fix
- **Tab handling in wrapLine()**: Fixed tab characters being counted as 1 visible character instead of expanding to next 8-column tab stop. Now calculates proper tab width: `tabWidth = 8 - (visibleCount % 8)`. Prevents premature line wrapping in ASCII art with tabs.

### Phase 4 Fixes (Final Parity)
- **TIM door protocol**: Full implementation of DoorControl{n} port with all 18 PG_* commands (express.e:4371-4525). Includes PG_SHUTDOWN, PG_SO/CC/CH/CO/SM for output, PG_PM/SC/HK for input, PG_SG/SF for file display, PG_UD/US for user data, PG_RD/TM/FF/BB_TASKPRI for misc.
- **User field updates**: DT_NAME, DT_LOCATION, DT_PHONENUMBER now support set operations (data=0) in addition to get operations (data=1).
- **checkForPause()**: Proper "(Pause)...More(y/n/ns)?" prompt with input waiting, NS for non-stop mode, timeout handling (express.e:5181-5201).
- **CONF_ACCESS**: Properly checks user's conferenceAccess string character by character. 'X' = access, anything else = no access (express.e:8499-8512).

### Phase 3 Fixes
- **Memory management**: Added bounds checking to AllocMem (16MB limit, 8MB max single alloc), heap coalescing in FreeMem, and best-fit allocation strategy.
- **Drop file accuracy**: Previous caller from CallersLog, download KB today tracking, available memory (64MB reported).
- **Case sensitivity audit**: All DosLibrary ops now use amigafs for case-insensitive file access. Fixed 3 instances using raw `fs.unlinkSync`/`fs.renameSync`.

### Phase 1-2 Fixes
- **Environment variables**: COMPLETE - EnvironmentManager with SetVar/GetVar/DeleteVar/FindVar, standard vars pre-populated.
- **Signal handling**: COMPLETE - Wait()/Signal() added to LVO dispatch (-318, -324), carrier drop sends SIGBREAKF_CTRL_C.
- **DOS error codes**: COMPLETE - 40+ ERROR_* codes, IoErr/SetIoErr, error mapping in FileManager.
- **ReadArgs**: COMPLETE - All modifiers (/A, /K, /M, /N, /S, /F, /T), /M+/A interaction, /M/N.
- **DOS LVOs**: Fixed SetComment (-180), SetProtection (-186) dispatch offsets.
- **Exec LVOs**: Added FreeSignal (-336), StackSwap (-732), fixed MessagePort type.
- **User file format**: User struct sizes match Amiga (232/56/248 bytes) with 2-byte alignment and big-endian byte order.
- **mtop batch utilities**: All 5 bulletin generation commands work from batch files.

## Environment Notes
- **Network access**: `npm` and `npx` commands may fail in sandboxed environments; use local caches when needed.
- **Reference data**: Legacy docs moved to `archive/` directories; canonical summary files are in each numbered folder.
