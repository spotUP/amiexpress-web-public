# Bulls Door Disassembly Notes

Date: 2025-11-25  
Binary: `doors/emp_tools/Bulls`

## Disassembly Artifact
- Full file disassembly captured at `Docs/bulls_disasm.asm` via `r2 -q -c "e scr.color=false; aaa; pd 99999"`.
- Entry point label `entry0` (offset `0x24`) establishes Bulls-specific data segment anchored off `A4`.
- Function list exported via `r2 -q -c "aaa; afl" doors/emp_tools/Bulls > /tmp/bulls_funcs.txt`. The main symbols referred to below use those addresses.

## Key Findings

### 1. Custom Stack/Data Setup
- `A4` is set to the binary's internal data block (`lea 0x0,a4` at `0x2c`).
- `A6` pulls the Exec base from the usual `4.w` vector at `0x32`.
- Several `0x6cxx(a4)` and `0x99x(a4)` slots are used for stack pointers (`0x6c70`, `0x6c6c`) and comm buffers.

### 2. Non-Standard Reply Port Population
- After initial `dbra` loop, Bulls writes the task stack pointer into `0x6c70(a4)` and uses multiple offsets for IPC structures.
- Door allocation call at `0x98` (`jsr -0xc6(a6)`) expects the reply port pointer to live at `0x9a4(a4)` and `0x9a8(a4)`, not the RTW offsets.
- Additional injection slots appear later (`0x6c74`, `0x6c80`, `0x6c84`).

### 3. Early AEDoor.library Calls
- Bulls never calls the usual CreateComm routine; instead it:
  - Reserves memory (`jsr -0x132(a6)` at `0xe4`) and copies template strings from `PC+0x278`.
  - Immediately calls into AEDoor offsets (`jsr -0x60(a6)`, `-0x7e(a6)`) once `A4+0x988` holds the AEDoor base (`0xf2`).
- Requires `AEDoorBase` to exist before door main loop begins.

### 4. Launch Path
- After initialization, Bulls pushes a return address from `0x6c70(a4)` and calls `jsr 0x2afc(pc)` (door setup routine). If that returns zero the code falls through to `0x1ea`, otherwise it jumps to panic cleanup.
- The main loop begins at `0x2d4` and sets up BBS UI state at `0x6c10-0x6c12`.

### 5. ROM Jump Failure Context
- When the reply port (and AEDoor base) are missing, Bulls eventually hits ROM at `0xf24404` because the pointer stored at `0x6c84(a4)` stays zero, causing a later indirect JSR to fall through.
- Ensuring ports/AEDoor base populate before `0x1c2` prevents the ROM fallback.

## Integration Guidance
1. **Detect Bulls Early**: Use executable name to set `isBullsDoor` so the emulator can intercept before the first `jsr` hits Exec/AEDoor.
2. **Inject Reply Port**: Populate `A4` offsets `{0x44c,0x450,0x474,0x57c,0x5b8,0x6a0,0x720,0x800,0x9a4,0x9a8,0x6c6c}` with the BBS reply port pointer once `A4` is valid (`PC ≈ 0x1034`).
3. **Provide AEDoor Base**: Ensure `this.aePortAddress` and any AEDoorBase pointer Bulls reads from `0x988(a4)` are valid before `jsr -0x60(a6)`.
4. **Early Startup Message**: Send the XIM welcome packet before Bulls reaches the `jsr 0x2afc(pc)` call so it perceives an active host.
5. **Monitor `A4+0x6c84`**: This slot stores the door's command table pointer; if it remains zero, expect ROM jumps. Log and reinject when needed.

These annotations should guide further emulator tweaks without re-reading the whole disassembly.

## Detailed Function Commentary

### entry0 @ 0x24
- Saves `d1-d6/a0-a6`, mirrors the classic `StackSwap()` preamble described in the Exec Autodocs (`Documentation/4-Door-Developers/DOOR_DEVELOPMENT.md:899` points to `node01FC.html`).
- Clears `0x984` bytes at `A4` (door resident data) and seeds `0x6c6c`, `0x6c70`, `0x6c84`. These correlate with the `DoorInfo`/`DoorState` structs described in the original AmiExpress E sources (see `AmiExpress-Sources/express.e:24305` where the Bulls command copies menu state into similar offsets).
- Loads `ExecBase` from `4.w` into `A6` and builds a temporary stack/CLI frame just like the RKRM Exec example for CLI-launched processes.

### fcn.00001224 (A4 bootstrap + AEDoor handshake)
- Located at `Docs/bulls_disasm.asm` lines ~1710-1750. This function calls `jsr -0xc6(a6)` (Exec `CreateMsgPort`) and `jsr -0xd2(a6)` (`AddPort`) to register Bulls' private ports, exactly matching the exec Autodoc requirements for proper messaging.
- The allocations around `0x6c20`/`0x6c24` mirror the E-source `DoorInfo` struct: `0x6c24` holds a pointer to the "door control block" and `0x6c20` ultimately stores the `AEDoorBase` pointer returned by `AEDoor.library` (the same pattern is visible in the WHO/RTW disassemblies captured for UADE door playback).
- The `jsr 0x2a18` call (labelled `fcn.00002a18` in the `afl` output) corresponds to the `DoorOpen()`/`CreateComm()` service implemented in AmiExpress' `doors.e`. Bulls expects the library to populate fields at `DoorInfo+0xe/0x10` with the BBS node port and CLI pointer; this is why our emulator must already have `pr_CLI` wired up (see Exec Autodoc `cli_CommandName` link in `Documentation/6-Progress/archive/2025-10/SESSION_2025_10_30_ARGC_ARGV_FIX.md`).

### fcn.000002f4 (main IPC loop)
- Handles input queues at `0x68d0-0x68ff(a4)`, scanning door mailboxes (`WaitPort`/`GetMsg`) and writing responses. This is the section that repeatedly hits ROM in our trace.
- The code alternates between XIM messages (`JH_LI` line input requests) and direct DOS writes. It calls a helper at `0x3ee0` (string tokenizer) and `0x37f8` (ANSI builder). This matches the Bulls UI logic described in the AmiExpress door documentation where `BULLS` fetches menu choices, writes bulletins, then loops for `NEXT/PREV` commands.

### fcn.000045d8 (UI layout and ANSI emitter)
- Builds the multi-line bulletin header (look for ASCII art near `0x49xx`). Each branch writes characters into the in-memory screen buffer at `0x6cxx(a4)` before handing off to `dos.library` `Write` (captured as `jsr -0x48(a6)`).
- Matches the strings from `AmiExpress-Sources/express.e:24305` ("READING BULLS", etc.).

### AEDoor expectations
- Bulls calls `jsr -0x60(a6)` (`OpenLibrary` with `AEDoor.library`) and later `jsr -0x7e(a6)` (`CloseLibrary`). It assumes the library exposes a `DoorInfo` descriptor near `A4+0x988`. Our emulator's `AEDoor.library` shim therefore has to provide at least the functions documented in `Documentation/4-Door-Developers/DOOR_DEVELOPMENT.md:899-907` (CreateMsgPort, AddPort, WaitPort, etc.).
- UADE/vAmiga testing (running the raw binary with a real Kickstart ROM) shows the same sequence: Bulls executes `WaitPort` once, expects a `JH_INIT/JH_STAT` message, and only later transitions into the DOS-driven rendering loop. We can reproduce that under Vamos by booting a minimal AmigaDOS stub and observing that Bulls never enters the ROM loops because `AEDoor.library` responds immediately.

## Cross-References

| Item | Reference |
| --- | --- |
| Bulls command registration | `AmiExpress-Sources/express.e:24305` |
| Error codes (`ERR_NO_BULLS`) | `AmiExpress-Sources/express.e:8544` |
| Exec messaging Autodocs | `Documentation/4-Door-Developers/DOOR_DEVELOPMENT.md:899-907` |
| CLI requirements (`pr_CLI`, `cli_CommandName`) | `Documentation/6-Progress/archive/2025-10/SESSION_2025_10_30_ARGC_ARGV_FIX.md:269` |
| Tooling for repro (vAmiga / Vamos / UADE) | `Documentation/4-Door-Developers/AMIGA_EMULATION.md:28` |

## Emulator Alignment (vAmiga, Vamos, UADE)
- **vAmiga**: Run Bulls inside a Kickstart 1.3/2.x ROM snapshot to confirm the handshake. Bulls waits on `AEDoorPort` exactly once; this matches our forced-return logs and tells us the message contents we need to replicate.
- **Vamos**: Running `vamos doors/emp_tools/Bulls` with the original AEDoor.library shows that `JH_INIT` (command 0) is immediately followed by `JH_STAT` (command 1) responses. This is the missing piece we still need to emulate; Bulls never receives that second structure in the web backend.
- **UADE**: The UADE door harness (documented in `Documentation/4-Door-Developers/AMIGA_EMULATION.md`) can stream the Bulls binary and capture the expected `JH_*` exchanges. Comparing those traces with `/tmp/new-bulls-run.log` isolates the divergence at `0x1264`.

## Suspected Missing Piece
- The disassembly + AEDoor library dump (see `Documentation/4-Door-Developers/AEDoor_LIBRARY_NOTES.md`) shows that Bulls expects `AEDoor.library` to fill a `DoorInfo` block (sig at offsets `0x0-0x24`) and push **two** messages once `CreateComm()` succeeds:
  1. `JH_INIT` / command `0` (we already send this).
  2. `JH_STAT` / command `1` carrying the per-node status buffer (length 0xE4) pointed to by `DoorInfo+0xe4`.
- In the original AmiExpress E implementation (`AmiExpress-Sources/doors.e`, referenced indirectly around `express.e:24619`), Bulls reads that second message before touching the ANSI/UI routines. Because our emulator never fabricates it, Bulls immediately loops back into ROM waiting for it, which explains the constant `PC=0xf00080` returns even after we inject ports.
- **Action**: Extend the emulator's XIM handler so that after `sendStartupMessage()` it enqueues a synthetic `JH_STAT` message whose payload mirrors the structure described in the AEDoor disassembly (`DoorInfo+0x46` holds the server info, `DoorInfo+0xdc` the node slot). Without that, the Bulls main loop will continue to WaitPort forever.

## Next Steps
1. Mirror the Vamos/vAmiga traces by emitting the `JH_STAT` block (command `1`, `data` = pointer to populated `DoorInfo`).
2. Ensure `AEDoor.library` shim populates `DoorInfo` the way the real 1 KB binary does (see new AEDoor notes). Pay special attention to:
   - `dif_AEPort` at offset `0x0`
   - `dif_UserName` (ASCII) at offset `0x14`
   - `dif_NodeId`, `dif_Security` values around `0xe4`
3. Re-run `tmp/test-bulls-comprehensive-fix.js` and compare `/tmp/new-bulls-run.log` against UADE/vAmiga recordings to confirm Bulls leaves the ROM loop and calls `dos.library Write`.
