/**
 * Scan an address range for Exec RomTag (struct Resident) records.
 *
 * ONE scanner, two readers: ExecLibrary walks the emulator's mapped ROM,
 * amiga-rom.ts walks a ROM image in a Buffer before it is ever loaded. Both
 * need the same rule (matchword 0x4AFC, rt_MatchTag pointing at itself, skip
 * to rt_EndSkip), so the rule lives here.
 *
 * struct Resident: +0 matchword, +2 matchtag, +6 endskip, +10 flags,
 * +11 version, +12 type, +13 pri, +14 name, +18 idstring.
 */

export const RTC_MATCHWORD = 0x4afc;

export interface MemoryReader {
  read16(addr: number): number;
  read32(addr: number): number;
  /** Reads a NUL-terminated string at an absolute address. */
  readString(addr: number, max: number): string;
}

export interface RomTagInfo {
  addr: number;
  name: string;
  /** rt_Version, the library version byte. */
  version: number;
  /** rt_IdString, empty when absent. */
  idString: string;
}

export function scanRomTags(
  mem: MemoryReader,
  start: number,
  end: number,
  onFound?: (tag: RomTagInfo) => void
): RomTagInfo[] {
  const found: RomTagInfo[] = [];
  for (let addr = start; addr + 24 <= end; addr += 2) {
    try {
      if (mem.read16(addr) !== RTC_MATCHWORD) continue;
      if (mem.read32(addr + 2) !== addr) continue;
      const namePtr = mem.read32(addr + 14);
      if (namePtr) {
        const name = mem.readString(namePtr, 128);
        if (name) {
          const idPtr = mem.read32(addr + 18);
          const tag: RomTagInfo = {
            addr,
            name,
            version: (mem.read16(addr + 10) & 0xff),
            idString: idPtr ? mem.readString(idPtr, 128) : '',
          };
          found.push(tag);
          onFound?.(tag);
        }
      }
      const endSkip = mem.read32(addr + 6);
      if (endSkip > addr && endSkip <= end) {
        addr = (endSkip & ~1) - 2;
      }
    } catch {
      // unreadable address: skip it
      continue;
    }
  }
  return found;
}
