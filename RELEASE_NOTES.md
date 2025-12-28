# AmiExpress-Web Release Notes

## v1.0.0 - Core Completion Milestone (2025-12-28)

This release marks the completion of core AmiExpress /X feature parity. The TypeScript port now implements all major features from the original express.e source code.

### What's Included

**Command System (44 internal commands)**
- All commands from express.e fully implemented
- 4 intentionally excluded (Amiga-specific shell/filesystem commands)
- Full command priority: SYSCMD -> BBSCMD -> Internal

**Door Support (8 door types - 100%)**
- XIM (eXternal Interface Module) - full jhMessage protocol
- AIM (Alternate Interface Module)
- SIM (Simple Interface Module) - DoorControl port protocol
- TIM (Text Interface Module) - 18 PG_* commands
- IIM (Internal Interface Module)
- MCI (Message Control Interface)
- AEM (AmiExpress Module)
- SUP (Supervisor Module)

**68K Emulation**
- MOIRA CPU emulator (WebAssembly)
- Native library loading (AEDoor.library, dos.library, exec.library)
- Environment variables (SetVar/GetVar/DeleteVar/FindVar)
- Signal handling (Wait/Signal/AllocSignal/FreeSignal)
- ReadArgs template parsing (all modifiers: /A/K/S/N/M/F/T)
- DOS error codes (40+ codes)
- Memory management with bounds checking

**User Files (100% compatible)**
- user.data (232 bytes) - proper 68K alignment
- user.keys (56 bytes) - big-endian byte order
- user.misc (248 bytes) - full structure support

**AREXX Support (40+ functions)**
- Complete AmiExpress API implementation
- BBSGETLASTCALLER reads from CallersLog
- All user/message/file functions

**MCI Codes (100%)**
- All codes from express.e:5258-5766
- Fixed: ~CF/~CN swap, ~CT, ~ND, ~n1-~n9
- ~SMO/~SMC slow motion implemented with web extension for negative speeds

**Test Suite (195 tests)**
- environment-vars.test.ts (51 tests)
- signals.test.ts (20 tests)
- dos-errors.test.ts (34 tests)
- readargs.test.ts (30 tests)
- file-ops.test.ts (42 tests)
- xim-commands.test.ts (30 tests)
- door-types.test.ts (integration tests)

### What's Intentionally Excluded

These features are NOT bugs - they're intentionally not implemented:

**Amiga-Specific Features**
- Command 0 (Remote Shell) - security concern for web
- Command 3 (Edit Directory Files) - filesystem editing
- Command 4 (Edit Any File) - filesystem editing
- Command 5 (Navigate Filesystem) - Amiga-only

**Never Implemented in Express.e**
- FULLEDIT - express.e line 3956 says "not yet implemented"
- FREE_RESUMING - express.e says "not implemented in /X3 or 4"
- RIPSCRIPT - express.e says "unknown (cant see any code that uses this)"

### Known Limitations

**68K Door Compatibility**
- Core emulation complete, but individual doors may need debugging
- Some doors may use undocumented features or unusual library calls
- Continue testing with real doors and fix issues as discovered

**Web-Specific Considerations**
- Timing-sensitive features (slow motion) not suitable for web latency
- Some ANSI effects may render differently in browser terminals

### Protocols Supported

- HTTP/WebSocket (port 3001)
- Telnet (port 2323)
- SSH (port 2222)

### Running the Tests

```bash
cd web/backend
npm test -- tests/amiga-emulation/
```

### Documentation

- `Documentation/6-Progress/CURRENT_STATUS.md` - Current implementation status
- `Documentation/6-Progress/100_PERCENT_COMPLETION_PLAN.md` - Completion details
- `Documentation/4-Door-Developers/DOOR_DEVELOPMENT.md` - Door development guide

---

**Note:** While core features are complete, 68K door emulation is complex and individual doors may require debugging. This release establishes the foundation - continued testing with real-world doors will identify any remaining edge cases.

*Release Date: 2025-12-28*
