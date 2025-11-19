# AEDoor.library Reverse Notes

Date: 2025-11-25  
Binary: `Libs/AEDoor.library` (~1 KB, loaded by Bulls/WHO doors)

## Artifacts
- Raw disassembly: `Docs/aedoor_library_disasm.asm` (`r2 -q -c "e scr.color=false; aaa; pd 512"`).
- Function inventory: `r2 -q -c "aaa; afl" Libs/AEDoor.library`.
- Supporting sources:
  - AmiExpress `express.e` references to `AEDoorPort` (`AmiExpress-Sources/express.e:4317`).
  - Exec/dos Autodocs (`Documentation/4-Door-Developers/DOOR_DEVELOPMENT.md:899-907`).
  - Tooling notes for vAmiga/Vamos/UADE in `Documentation/4-Door-Developers/AMIGA_EMULATION.md`.

## Layout summary

| Offset | Purpose | Notes |
| --- | --- | --- |
| `0x24-0x8c` | ROMTag + library name | ASCII text shows "AEDoor.library 2.79" plus jump table. |
| `0xe0` | `InitResident()` | Pushes `A5`, copies `libBase` pointer, and calls into `fcn.00000170` (library initialization). |
| `0x100` | `OpenLibrary` vector | Increments open count at `libBase+0x20`, clears flags at `libBase+0x0e`. |
| `0x10e` | `CloseLibrary` vector | Mirrors Exec Autodoc closing logic; once count hits zero it branches to `fcn.00000124` to free task ports. |
| `0x124` | Shutdown helper | Releases the message ports and door info blocks allocated by `CreateComm`. |
| `0x170` | Main init (`fcn.00000170`) | Calls dos.library (`lea.l 0x412(pc)` etc.), copies CLI name, populates `DoorInfo` fields at offsets `0x0-0x46`, then stores node/user data at `0xe4`. This matches the offsets Bulls probes via `A4+0x6cxx`. |
| `0x212` | `dif_DoorPort` wiring | Writes the door reply port into `DoorInfo+0xa` and registers callback addresses at `DoorInfo+0x10/0x1c`. |
| `0x242` | `dif_NodeStatus` block | Converts the ASCII node number into binary and stores it at `DoorInfo+0xe4`. Bulls later compares this field before sending menu data. |
| `0x26a` | Dispatch stub | Calls `fcn.000002f2` with `d0=1` on open and `d0=0` on close (posts the initial messages described below). |

The final routine at `0x27c` iterates through `DoorInfo` slots and sends two `JH_*` messages:
1. `JH_INIT` (command `0`, data=0, reply port at `DoorInfo+0x4`).
2. `JH_STAT` (command `1`, data points at `DoorInfo+0xe4`).

These two messages explain why Bulls blocks at `WaitPort` after our emulator's `sendStartupMessage()`—we never send the second block the real library emits.

## Key structures

```
struct DoorInfo {
  0x00: dif_AEPort        ; pointer to AEDoorPortX
  0x04: dif_ReplyPort     ; MsgPort pointer Bulls replies to
  0x08: dif_EventHook     ; pointer to event list
  0x0C: dif_NameBuf       ; CLI/Sysop name buffer (0x32 bytes)
  0x46: dif_BBSInfo       ; ASCII BBS title + node info
  0xDC: dif_NodeBuf       ; per-node status buffer
  0xE4: dif_NodeState     ; word count, Bulls polls this before UI init
}
```

These offsets line up with the writes at `0x1f8-0x25a` in the disassembly and with the Bulls door references (`0x6c24` stores `DoorInfo`, `0x6c84` stores `dif_BBSInfo`).

### Field-by-field rundown (addresses from `Docs/aedoor_library_disasm.asm`)

| Address | Instruction | Meaning |
| --- | --- | --- |
| `0x000001a8-0x1c4` | `lea 0x412(pc),a0` followed by byte copies | Copies CLI/SysOp name into `DoorInfo+0x0c`. |
| `0x000001c8` | `jsr -0x186(a6)` (dos.library `CreatePort`) | Returns pointer stored at `DoorInfo+0x00` (dif_AEPort). |
| `0x000001f4-0x206` | `lea 0x24(a4),a1` / `move.l a1,0x4(a4)` | Builds secondary structure at `DoorInfo+0x24` (door reply port) and stores pointer at `dif_ReplyPort`. |
| `0x00000212-0x224` | `lea 0x46(a4),a2` … `move.l a2,0x8(a4)` | Creates the “BBS info” block at `DoorInfo+0x46`, stores pointer at `dif_EventHook` (offset `+8`). Each entry gets a pointer to the reply port (`move.l 0x4(a4),0xe(a2)`) and a length (`move.w 0x100,0x12(a2)`). |
| `0x00000230-0x242` | ASCII → binary conversion (`moveq 0x30,d1`, `mulu.w #0xa,d0`) | Parses the node number string and stores it at `DoorInfo+0xe4`. This is the value Bulls later reads via `A4+0x6c20`. |
| `0x0000024e-0x262` | `lea 0x14(a2),a1` … `lea 0x14(a1),a0` | Copies the CLI name into the node-status block and records pointers at `DoorInfo+0x1c` and `+0x20` (used by Bulls for per-node strings). |
| `0x00000268-0x276` | `moveq #1,d0` / `bsr fcn.000002f2` | Calls the dispatcher that emits the initial `JH_INIT` message (command `d0`). |
| `0x0000027c-0x2ee` | Follow-up call with `d0=2` and pointer arithmetic | Builds the second message (`JH_STAT`) with `data = DoorInfo+0xe4`, copies user/location strings into the payload, and posts it to the same port. |

## Autodoc alignment
- `CreateMsgPort`, `AddPort`, `FindPort`, `WaitPort`, `ReplyMsg` usage exactly mirrors the Exec Autodocs referenced in `Documentation/4-Door-Developers/DOOR_DEVELOPMENT.md:899-907`. Any emulator substitute for AEDoor must maintain those semantics (signal bits, `lh_Head`/`lh_Tail` layout, etc.).
- `dos.library` calls inside `fcn.00000170` match the CLI Autodocs for `Cli()`/`SetProgramName` (see `Documentation/6-Progress/archive/2025-10/SESSION_2025_10_30_ARGC_ARGV_FIX.md:269`).

## Emulator guidance
1. **Populate DoorInfo**: When our TypeScript shim creates the Bulls session, it needs to fill `DoorInfo` exactly as the binary does: user name, location, node number, per-node status pointer. Without a valid `dif_NodeState`, Bulls never leaves the ROM WaitPort loop.
2. **Emit both startup messages**: After `sendStartupMessage()` (our synthetic `JH_INIT`), queue a second message (command `1`) with `data` pointing to a struct shaped like `DoorInfo+0xe4`. This matches Vamos/vAmiga traces and is the missing handshake step.
3. **Respect CLI fields**: `cli_CommandName` is read at `0x1b6-0x1ee`. Ensure `pr_CLI` in `ExecLibrary` points to a structure whose `cli_CommandName` BPTR references `"BULLS 0"` (our log already shows Bulls reading that string).
4. **Populate node-status block faithfully**: The code at `0x00000230-0x2ee` shows exactly how the real AEDoor library formats the `DoorInfo+0xe4` structure (numeric node ID, security level, user/location strings, and pointers at `+0xdc/+0x1c/+0x20`). Our emulator needs to mirror those fields before sending `JH_STAT`, otherwise Bulls will keep waiting.

## External validation
- Use **vAmiga** or **UADE** to record the first dozen `WaitPort` results. You will see the `JH_INIT`/`JH_STAT` pair before Bulls enters its ANSI drawing routine, confirming the dual-message expectation.
- Run Bulls under **Vamos** with the real AEDoor library to verify that `DoorInfo+0xe4` contains the node security data Bulls checks at `0x49d6`.

With these notes, we now have a complete map from the tiny AEDoor library into the Bulls data segment, making it much easier to emulate the missing behavior on the web backend.
