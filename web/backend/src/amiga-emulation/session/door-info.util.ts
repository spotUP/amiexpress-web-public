import { MoiraEmulator } from "../cpu/MoiraEmulator";
import { getSystemTime } from '../../utils/date-time.util';

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
    bbsName?: string;      // From bbsConfig.info (disk-based)
    sysopName?: string;    // From bbsConfig.info (disk-based)
    // Numeric fields for doors like ZooStats that read user status
    secLevel?: number;     // Security level (0-255)
    userSlot?: number;     // User slot number
    conference?: number;   // Current conference number
    timeRemaining?: number; // Time remaining in minutes
    uploads?: number;      // Upload count
    downloads?: number;    // Download count
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

    // CLI name (mirrors AEDoor copying cli_CommandName)
    const cliPtr = doorInfoAddr + 0x1a0;
    writeCString(emulator, cliPtr, cli);
    emulator.writeMemory32(doorInfoAddr + 0x24, cliPtr);

    // CRITICAL FIX: Populate BBSInfo structure at CORRECT offsets
    // Based on AEDoor.library disassembly (aedoor_library_disasm.asm)
    // Library expects strings at specific offsets within BBSInfo block
    const bbsInfoAddr = doorInfoAddr + 0x46;  // BBSInfo structure offset within DIFace
    // Use disk-based config (bbsConfig.info) passed via opts, with fallbacks
    const bbsName = opts.bbsName || "AmiExpress-Web";
    const sysopName = opts.sysopName || "Sysop";

    // Format current date and time
    const now = getSystemTime();
    const dateStr = `${(now.getMonth() + 1).toString().padStart(2, '0')}/${now.getDate().toString().padStart(2, '0')}/${now.getFullYear()}`;
    const timeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;

console.log(`[door-info.util] ===== BBSInfo Population Debug =====`);
console.log(`[door-info.util] doorInfoAddr=0x${doorInfoAddr.toString(16)} bbsInfoAddr=0x${bbsInfoAddr.toString(16)}`);
console.log(`[door-info.util] Writing: user="${user}" loc="${loc}" bbsName="${bbsName}"`);

    // Write to BBSInfo structure at CORRECT offsets from library disassembly
    // Library copies CLI name to BBSInfo + 0x14 (line 246-250 in disasm)
    // Library sets DoorInfo + 0x20 → BBSInfo + 0x14 (line 262)
    // Library sets DoorInfo + 0x1c → BBSInfo + 0xdc (line 256-260)
    writeCString(emulator, bbsInfoAddr + 0x14, user.slice(0, 198));       // User name at +0x14 (max 198 bytes from disasm)
    writeCString(emulator, bbsInfoAddr + 0xdc, loc.slice(0, 60));         // Location at +0xdc
    writeCString(emulator, bbsInfoAddr + 0x120, bbsName.slice(0, 40));    // BBS name
    writeCString(emulator, bbsInfoAddr + 0x150, dateStr.slice(0, 19));    // Date
    writeCString(emulator, bbsInfoAddr + 0x170, timeStr.slice(0, 19));    // Time
    writeCString(emulator, bbsInfoAddr + 0x190, sysopName.slice(0, 30));  // Sysop name

    // CRITICAL FIX 2026-01-30: Do NOT overwrite DoorInfo+0x1c and DoorInfo+0x20!
    // These are dif_DataPtr and dif_StringPtr which MUST point to jhMessage.data
    // and jhMessage.string respectively (set correctly by AEDoorLibrary.createComm).
    //
    // Previously this code was setting them to BBSInfo offsets (username/location),
    // which broke JH_HK character input - the native AEDoor.library's HotKey()
    // function reads from dif_String (DoorInfo+0x20), and if it points to the
    // username instead of jhMessage.string, it reads "sysop" instead of the
    // character the user typed!
    //
    // The BBSInfo structure is separate at DoorInfo+0x46. Doors can access user
    // info via GetName()/GetLocation() library calls which use BBSInfo, not via
    // dif_DataPtr/dif_StringPtr.
    //
    // REMOVED:
    // emulator.writeMemory32(doorInfoAddr + 0x1c, bbsInfoAddr + 0xdc);  // WRONG - overwrote dif_DataPtr
    // emulator.writeMemory32(doorInfoAddr + 0x20, bbsInfoAddr + 0x14);  // WRONG - overwrote dif_StringPtr

    // Write numeric fields for doors like ZooStats that read user status
    // These match the node user file structure layout (after strings)
    const secLevel = opts.secLevel ?? 10;
    const userSlot = opts.userSlot ?? opts.nodeId ?? 1;
    const conference = opts.conference ?? 1;
    const timeRemaining = opts.timeRemaining ?? 60;
    const uploads = opts.uploads ?? 0;
    const downloads = opts.downloads ?? 0;

    // Write to BBSInfo at offsets matching node user file structure:
    // Offset 0x00-0x02: userSlot (INT, 2 bytes, big-endian for 68K)
    // Offset 0x02-0x04: secLevel (INT, 2 bytes)
    // Offset 0x04-0x06: conference (INT, 2 bytes)
    // Offset 0x06-0x08: timeRemaining (INT, 2 bytes)
    emulator.writeMemory16(bbsInfoAddr + 0x00, userSlot);
    emulator.writeMemory16(bbsInfoAddr + 0x02, secLevel);
    emulator.writeMemory16(bbsInfoAddr + 0x04, conference);
    emulator.writeMemory16(bbsInfoAddr + 0x06, timeRemaining);
    emulator.writeMemory16(bbsInfoAddr + 0x08, uploads);
    emulator.writeMemory16(bbsInfoAddr + 0x0a, downloads);

    // Also write to nodeStatusAddr for doors that read from there
    if (nodeStatusAddr && nodeStatusAddr >= 0x100) {
      emulator.writeMemory16(nodeStatusAddr + 0x00, userSlot);
      emulator.writeMemory16(nodeStatusAddr + 0x02, secLevel);
      emulator.writeMemory16(nodeStatusAddr + 0x04, conference);
      emulator.writeMemory16(nodeStatusAddr + 0x06, timeRemaining);
    }

console.log(`[door-info.util] Numeric fields: slot=${userSlot} secLevel=${secLevel} conf=${conference} time=${timeRemaining}`);
console.log(`[door-info.util] Written to BBSInfo+0x00: slot, +0x02: secLevel, +0x04: conf, +0x06: time`);

    // VERIFY what was written
console.log(`[door-info.util] ===== Verification (Reading Back) =====`);
    const readBackUser = readCString(emulator, bbsInfoAddr + 0x14, 198);
    const readBackLoc = readCString(emulator, bbsInfoAddr + 0xdc, 60);
    const readBackBBS = readCString(emulator, bbsInfoAddr + 0x120, 40);
    const readBackDate = readCString(emulator, bbsInfoAddr + 0x150, 19);
    const readBackTime = readCString(emulator, bbsInfoAddr + 0x170, 19);
    const ptr1c = emulator.readMemory32(doorInfoAddr + 0x1c);
    const ptr20 = emulator.readMemory32(doorInfoAddr + 0x20);

console.log(`[door-info.util] Read back from BBSInfo+0x14: "${readBackUser}" (length=${readBackUser.length})`);
console.log(`[door-info.util] Read back from BBSInfo+0xdc: "${readBackLoc}" (length=${readBackLoc.length})`);
console.log(`[door-info.util] Read back from BBSInfo+0x120: "${readBackBBS}"`);
console.log(`[door-info.util] Read back from BBSInfo+0x150: "${readBackDate}"`);
console.log(`[door-info.util] Read back from BBSInfo+0x170: "${readBackTime}"`);
// NOTE: DoorInfo+0x1c (dif_DataPtr) and DoorInfo+0x20 (dif_StringPtr) are set by
    // AEDoorLibrary.createComm() to point to jhMessage.data and jhMessage.string
    // respectively. We no longer overwrite them here.
console.log(`[door-info.util] DoorInfo+0x1c pointer: 0x${ptr1c.toString(16)} (dif_DataPtr - should point to jhMessage.data)`);
console.log(`[door-info.util] DoorInfo+0x20 pointer: 0x${ptr20.toString(16)} (dif_StringPtr - should point to jhMessage.string)`);

    // Verify BBSInfo strings are accessible
    if (ptr20 !== 0 && ptr20 !== bbsInfoAddr + 0x14) {
      // Good - not pointing to BBSInfo.username anymore (which was the bug)
console.log(`[door-info.util] [OK] dif_StringPtr correctly points to jhMessage.string, not BBSInfo.username`);
    } else if (ptr20 === bbsInfoAddr + 0x14) {
console.log(`[door-info.util] [WARNING] dif_StringPtr points to BBSInfo.username - this will break JH_HK input!`);
    }

console.log(`[door-info.util] ===== End Verification =====`);
  } catch (error) {
console.error("[door-info.util] ⚠️ Failed to populate DoorInfo/BBSInfo:", error);
  }

  if (!nodeStatusAddr || nodeStatusAddr < 0x100) return;
  try {
    const bbsInfoAddr = doorInfoAddr + 0x46;
    const userPtr = bbsInfoAddr + 0x14;  // User name pointer (matches library)
    const locPtr = bbsInfoAddr + 0xdc;   // Location pointer (matches library)

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

function readCString(emu: MoiraEmulator, addr: number, maxLen: number): string {
  const bytes: number[] = [];
  for (let i = 0; i < maxLen; i++) {
    const byte = emu.readMemory(addr + i);
    if (byte === 0) break;
    bytes.push(byte);
  }
  return String.fromCharCode(...bytes);
}
