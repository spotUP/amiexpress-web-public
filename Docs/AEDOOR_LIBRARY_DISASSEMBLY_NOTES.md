# AEDoor.library Disassembly Notes

**Date:** 2025-11-15  
**Binary:** `Libs/AEDoor.library` (1,128 bytes)  
**Tool:** `r2 -q -c "e scr.color=0; e asm.arch=m68k; e asm.bits=32; pd 400" Libs/AEDoor.library`

## Jump Table

The resident jump table lives at offsets `0x80-0xB0` and matches the documented LVO sequence:

| LVO | Address | Notes                |
|-----|---------|----------------------|
| -30 | 0x0170  | CreateComm           |
| -36 | 0x0278  | DeleteComm           |
| -42 | 0x02F2  | SendCmd dispatcher   |
| -48 | 0x02B2  | SendStrCmd helper    |
| -54 | 0x02C2  | SendDataCmd helper   |
| -60 | 0x02D2  | SendStrDataCmd helper|
| -66 | 0x0332  | GetData              |
| -72 | 0x032C  | GetString            |
| -78 | 0x0350  | Prompt               |
| -84 | 0x0388  | WriteStr             |
| -90 | 0x038E  | ShowGFile            |
| -96 | 0x0394  | ShowFile             |
| -102| 0x039A  | SetDT                |
| -108| 0x03A0  | GetDT                |
| -114| 0x03A6  | GetStr               |
| -120| 0x03AC  | CopyStr              |
| -126| 0x03B0  | HotKey               |

## DIFace Layout

From the CreateComm body (`0x0170-0x0276`):

- Allocate `0x146` bytes via `AllocMem(#0x146,#0x10001)`
- `0x00`: pointer to `AEDoorPortX`
- `0x04`: pointer to reply port (MsgPort)
- `0x08`: pointer to embedded `jhMessage` (`a4 + 0x46`)
- `0x0C`: 16 byte reply name buffer
- `0x1C`: pointer to `jhMessage.data` (`msg + 0xDC`)
- `0x20`: pointer to `jhMessage.string` (`msg + 0x14`)
- `0x24`: inline `MsgPort` struct
- `0x46`: inline `jhMessage`

The code copies `"AEDoorPort"` and `"DoorReplyPort"` into the buffer, calls `FindPort` for the BBS port, and then creates the door reply port. `jhMessage.mn_Length` is initialised to `0x100` and the node number is stored at offset `0xE4`.

## SendCmd Helpers

Functions at `0x02B2`, `0x02C2`, and `0x02D2` simply write string/data fields into the embedded message and branch to the dispatcher at `0x02F2`. That dispatcher:

- Copies `jhMessage` pointer into registers
- Calls Exec `PutMsg` to `dif_AEPort`
- Calls `WaitPort/GetMsg` on the reply port before returning the updated `data` field

## Prompt/GetStr

`Prompt` (`0x0350`) copies the prompt text into the message buffer and issues a `JH_PM` command. It then waits for the reply port to receive input before returning the pointer stored at `dif_String`.

`GetStr` (`0x03A6`) pre-fills the buffer with the default string and follows the same input waiting loop.

## Implementation Mapping

The TypeScript implementation mirrors these details:

1. `CreateComm` allocates the same 0x146-byte DIFace, writes identical pointer offsets, and creates a reply port via `ExecLibrary.createPort`.
2. All `Send*` helpers call a common dispatch routine that writes to the embedded `jhMessage` (string/data/command) and uses `ExecLibrary.putMsg`/`getMsg` to round-trip through the BBS.
3. `GetString`/`GetData` expose the exact pointers stored at offsets `0x1C` and `0x20`, matching the E module definition.
4. `WriteStr`, `ShowFile`, `ShowGFile`, `SetDT`, and `GetDT` all reuse that dispatcher so the XIM protocol handlers receive authentic jhMessages.
5. Prompt/GetStr maintain an emulator pause/resume cycle to emulate the blocking behaviour of the real library.

These notes tie the new TypeScript code to the confirmed addresses in the binary, ensuring the modern implementation matches the historic AEDoor.library behaviour.
