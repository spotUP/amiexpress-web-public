import { MoiraEmulator } from "../cpu/MoiraEmulator";

/**
 * Populate DoorInfo and NodeStatus blocks similarly to AEDoor.library for XIM doors.
 * Offsets based on Documentation/4-Door-Developers/AEDoor_LIBRARY_NOTES.md
 */
export function populateDoorInfoStructs(
  emulator: MoiraEmulator,
  doorInfoAddr: number,
  nodeStatusAddr: number,
  opts: {
    aePort?: number;
    replyPort?: number;
    nodeId?: number;
    userName?: string;
    location?: string;
    cliName?: string;
  }
): void {
  if (!doorInfoAddr || doorInfoAddr < 0x100) return;
  const aePort = opts.aePort ?? 0;
  const replyPort = opts.replyPort ?? 0;
  const nodeId = opts.nodeId ?? 1;
  const user = opts.userName ?? "SYSOP";
  const loc = opts.location ?? "AMIGA";
  const cli = opts.cliName ?? "XIM";

  try {
    // Core pointers
    if (aePort) {
      emulator.writeMemory32(doorInfoAddr + 0x0, aePort); // dif_AEPort
    }
    if (replyPort) {
      emulator.writeMemory32(doorInfoAddr + 0x4, replyPort); // dif_ReplyPort
    }
    // Event hook/BBS info block
    const bbsInfoPtr = doorInfoAddr + 0x46;
    emulator.writeMemory32(doorInfoAddr + 0x8, bbsInfoPtr); // dif_EventHook
    // Name buffer
    writeCString(emulator, doorInfoAddr + 0x0c, cli);
    // Node status pointer
    emulator.writeMemory32(doorInfoAddr + 0xdc, nodeStatusAddr);
    emulator.writeMemory16(doorInfoAddr + 0xe4, nodeId);
    // Put user/location strings in-line and point to them
    const userPtr = doorInfoAddr + 0x120;
    const locPtr = doorInfoAddr + 0x160;
    writeCString(emulator, userPtr, user);
    writeCString(emulator, locPtr, loc);
    emulator.writeMemory32(doorInfoAddr + 0x1c, userPtr);
    emulator.writeMemory32(doorInfoAddr + 0x20, locPtr);

    // CLI name (mirrors AEDoor copying cli_CommandName)
    const cliPtr = doorInfoAddr + 0x1a0;
    writeCString(emulator, cliPtr, cli);
    emulator.writeMemory32(doorInfoAddr + 0x24, cliPtr);
  } catch {
    /* ignore */
  }

  if (!nodeStatusAddr || nodeStatusAddr < 0x100) return;
  try {
    const userPtr = doorInfoAddr + 0x120;
    const locPtr = doorInfoAddr + 0x160;
    // Mirror pointers and values into node status block
    emulator.writeMemory32(nodeStatusAddr + 0x10, userPtr); // username ptr
    emulator.writeMemory32(nodeStatusAddr + 0x14, locPtr); // location ptr
    emulator.writeMemory32(nodeStatusAddr + 0x18, 0); // summary ptr (none)
    emulator.writeMemory32(nodeStatusAddr + 0x1c, userPtr);
    emulator.writeMemory32(nodeStatusAddr + 0x20, locPtr);
    emulator.writeMemory16(nodeStatusAddr + 0xe4, nodeId);
    emulator.writeMemory32(nodeStatusAddr + 0xdc, replyPort);
    // Copy strings into node status block as well
    writeCString(emulator, nodeStatusAddr + 0x20, user);
    writeCString(emulator, nodeStatusAddr + 0x60, loc);
  } catch {
    /* ignore */
  }
}

function writeCString(emu: MoiraEmulator, addr: number, text: string): void {
  for (let i = 0; i < text.length; i++) {
    emu.writeMemory(addr + i, text.charCodeAt(i));
  }
  emu.writeMemory(addr + text.length, 0);
}
