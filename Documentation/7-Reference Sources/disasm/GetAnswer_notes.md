# GetAnswer (XIM door) – quick reverse notes

Path: `Doors/GetAnswer/GetAnswer` (68k, tiny XIM door)

## Structures / buffers
- Control block at `0x0ca4`.
- Message buffer at `0x0c82` (looks like the jhMessage the door sends).
- Uses standard jhMessage fields:
  - `msg->data` @ `+0xdc`
  - `msg->command` @ `+0xe0`
  - `msg->node` @ `+0xe4`
  - `msg->line/signal/task` likely follow the standard AEDoor offsets.

## Key routines (relative to A6, Exec base)
- `jsr -0x186(a6)` → PutMsg
- `jsr -0x180(a6)` → WaitPort
- `jsr -0x174(a6)` → GetMsg
- `jsr -0x13e(a6)` and neighbors are door-local helpers (not XIM calls).

## Handshake outline (from disassembly)
1) **Initial message setup (around 0x0066)**  
   - A3 = `0x0ca4` control block; A1 = `0x0c82` message.  
   - `msg->node` = `0xffffffff` (unknown/any node).  
   - `msg->data` = `2`.  
   - `msg->command` = `1`.  
   - Clears `0xe8` (line/signal) and sets some header bytes.  
   - Calls a local prep routine (`bsr 0xc82` with A2 = A3+0x14) then **PutMsg**.
   - Loops until PutMsg returns nonzero (tst.l d0 / beq back to jsr).
   - Stores returned message pointer (?) at `0xc7e`.

2) **Second message (around 0x006ea)**  
   - Sets `msg->command` = `2` (at `0xe0(a0)`, A0 = `0x0ca4`).  
   - Calls local helper `bsr 0x752`, then **jsr -0x13e(a6)**, **GetMsg**, and another helper `jsr -0x168(a6)`.  
   - Likely reading the reply to command 2.

3) **Later sends (around 0x00b9c)**  
   - Copies d0 → `msg->command`, d1 → `msg->data` in a2 = `0x0ca4`.  
   - Calls prep (`bsr 0xc82`), local helper (`bsr 0x752`), then **WaitPort**, **GetMsg**.  
   - If GetMsg returns a pointer, it reads `dc/e0` from that message.

## Takeaways for XIM emulation
- Register message: command = 1, data = 2, node = -1, clear line/signal.  
  Echo those fields back exactly; ensure msg length and string pointers are valid.
- The door expects PutMsg to succeed (returns nonzero) before continuing.
- Follow-up command uses command = 2; replies should be consumed via WaitPort/GetMsg.
- No evidence of PC/register forcing is needed; proper echo of cmd/data/node should be sufficient.

Use this as a clean XIM specimen to align the web XIM handler and remove ad-hoc Bulls hacks.
