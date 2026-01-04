/**
 * utility.library function vectors
 * Reference: NDK3.2R4/Include_I/lvo/utility_lib.i
 * LVO = Library Vector Offset (in bytes from library base)
 */

import { LibraryVector } from "./types";
import { UtilityLibrary } from "../UtilityLibrary";
import { MoiraEmulator } from "../../cpu/MoiraEmulator";
import { findTagItemImpl, readTagItem, nextTagItemImpl, TAG_DONE, TAG_IGNORE, TAG_MORE, TAG_SKIP } from "./tag-helpers";
import { namedObjectRegistry, namedObjectState } from "../LibraryTraps";

export const UTILITY_VECTORS: LibraryVector[] = [
  // Tag-related functions (offsets -30 to -96)
  {
    offset: -30, // LVO -30: FindTagItem
    name: "FindTagItem",
    handler: (emu, lib: UtilityLibrary) => {
      // Input: D0 = tagValue to search for, A0 = tagList
      // Output: D0 = pointer to TagItem or NULL
      const tagValue = emu.getRegister(0);  // D0
      const tagList = emu.getRegister(8);   // A0

      const result = findTagItemImpl(emu, tagValue, tagList);
console.log(`[UtilityLibrary] FindTagItem(tag=0x${tagValue.toString(16)}, tagList=0x${tagList.toString(16)}) = 0x${result.toString(16)}`);
      return result;
    },
  },
  {
    offset: -36, // LVO -36: GetTagData
    name: "GetTagData",
    handler: (emu, lib: UtilityLibrary) => {
      // Input: D0 = tagValue, D1 = defaultVal, A0 = tagList
      // Output: D0 = ti_Data for matching tag, or defaultVal if not found
      const tagValue = emu.getRegister(0);    // D0
      const defaultVal = emu.getRegister(1);  // D1
      const tagList = emu.getRegister(8);     // A0

      const tagItemAddr = findTagItemImpl(emu, tagValue, tagList);
      if (tagItemAddr !== 0) {
        const tag = readTagItem(emu, tagItemAddr);
        if (tag) {
console.log(`[UtilityLibrary] GetTagData(tag=0x${tagValue.toString(16)}, tagList=0x${tagList.toString(16)}) = 0x${tag.ti_Data.toString(16)} (found)`);
          return tag.ti_Data;
        }
      }

console.log(`[UtilityLibrary] GetTagData(tag=0x${tagValue.toString(16)}, tagList=0x${tagList.toString(16)}) = 0x${defaultVal.toString(16)} (default)`);
      return defaultVal;
    },
  },
  {
    offset: -42, // LVO -42: PackBoolTags
    name: "PackBoolTags",
    handler: (emu) => {
      // Input: D0 = initialFlags, A0 = tagList, A1 = boolMap (TagItem array)
      // Output: D0 = flags with bits set/cleared according to boolMap and tagList
      // For each tag in boolMap, if that tag exists in tagList with non-zero ti_Data,
      // set the corresponding bit (boolMap's ti_Data) in the flags word.
      const initialFlags = emu.getRegister(0);  // D0
      const tagList = emu.getRegister(8);       // A0
      const boolMap = emu.getRegister(9);       // A1

      let flags = initialFlags;

      if (boolMap !== 0) {
        // Use temporary pointer storage
        const tempPtrAddr = 0x1FE008;
        emu.writeMemory32(tempPtrAddr, boolMap);

        let maxIterations = 100;
        while (maxIterations-- > 0) {
          const mapItemAddr = nextTagItemImpl(emu, tempPtrAddr);
          if (mapItemAddr === 0) break;

          const mapItem = readTagItem(emu, mapItemAddr);
          if (!mapItem) break;

          // Look for this tag in the tagList
          const foundAddr = findTagItemImpl(emu, mapItem.ti_Tag, tagList);
          if (foundAddr !== 0) {
            const foundTag = readTagItem(emu, foundAddr);
            if (foundTag && foundTag.ti_Data !== 0) {
              // Set the bit specified by mapItem.ti_Data
              flags |= mapItem.ti_Data;
            } else {
              // Clear the bit (tag exists but ti_Data is 0)
              flags &= ~mapItem.ti_Data;
            }
          }
        }
      }

console.log(`[UtilityLibrary] PackBoolTags(init=0x${initialFlags.toString(16)}) = 0x${flags.toString(16)}`);
      return flags;
    },
  },
  {
    offset: -48, // LVO -48: NextTagItem
    name: "NextTagItem",
    handler: (emu) => {
      // Input: A0 = pointer to pointer to TagItem (tagItemPtr)
      // Output: D0 = pointer to next TagItem, or NULL if end of list
      // The pointer at A0 is updated to point to the entry AFTER the returned one
      const tagItemPtrAddr = emu.getRegister(8); // A0

      const result = nextTagItemImpl(emu, tagItemPtrAddr);
      // Note: tagItemPtrAddr memory has been updated by nextTagItemImpl

      if (result !== 0) {
        const tag = readTagItem(emu, result);
console.log(`[UtilityLibrary] NextTagItem(ptr=0x${tagItemPtrAddr.toString(16)}) = 0x${result.toString(16)} (tag=0x${tag?.ti_Tag.toString(16)})`);
      } else {
console.log(`[UtilityLibrary] NextTagItem(ptr=0x${tagItemPtrAddr.toString(16)}) = NULL (end of list)`);
      }
      return result;
    },
  },
  {
    offset: -54, // LVO -54: FilterTagChanges
    name: "FilterTagChanges",
    handler: (emu) => {
      // Input: A0 = new tagList, A1 = original tagList, D0 = flags
      // Output: void
      // Compares new tags vs original and eliminates tags that specify no change
      const newList = emu.getRegister(8);   // A0
      const origList = emu.getRegister(9);  // A1
      const apply = emu.getRegister(0);     // D0 (TRUE = apply changes, FALSE = filter only)

      if (newList === 0) {
console.log("[UtilityLibrary] FilterTagChanges - NULL newList");
        return 0;
      }

      // Use temporary pointer for iteration
      const tempPtrAddr = 0x1FE010;
      emu.writeMemory32(tempPtrAddr, newList);

      let filtered = 0;
      let maxIterations = 1000;
      while (maxIterations-- > 0) {
        const tagAddr = nextTagItemImpl(emu, tempPtrAddr);
        if (tagAddr === 0) break;

        const tag = readTagItem(emu, tagAddr);
        if (!tag) break;

        // Find same tag in original list
        const origAddr = findTagItemImpl(emu, tag.ti_Tag, origList);
        if (origAddr !== 0) {
          const origTag = readTagItem(emu, origAddr);
          if (origTag && origTag.ti_Data === tag.ti_Data) {
            // Same value - mark as TAG_IGNORE to filter out
            emu.writeMemory32(tagAddr, TAG_IGNORE);
            filtered++;
          } else if (apply && origTag) {
            // Apply change to original
            emu.writeMemory32(origAddr + 4, tag.ti_Data);
          }
        }
      }

console.log(`[UtilityLibrary] FilterTagChanges(new=0x${newList.toString(16)}, orig=0x${origList.toString(16)}) filtered ${filtered}`);
      return 0;
    },
  },
  {
    offset: -58, // Non-standard offset - some doors call this
    name: "Utility_-58_Stub",
    handler: (emu) => {
console.log("[UtilityLibrary] WARNING: Called non-standard offset -58 - stub");
      return 0;
    },
  },
  {
    offset: -60, // LVO -60: MapTags
    name: "MapTags",
    handler: (emu) => {
      // Input: A0 = tagList, A1 = mapList, D0 = includeMask
      // Output: void
      // Converts tag values in tagList using mappings from mapList
      const tagList = emu.getRegister(8);   // A0
      const mapList = emu.getRegister(9);   // A1
      const includeMask = emu.getRegister(0); // D0

      if (tagList === 0 || mapList === 0) {
console.log("[UtilityLibrary] MapTags - NULL list");
        return 0;
      }

      // Iterate through tagList
      const tempPtrAddr = 0x1FE018;
      emu.writeMemory32(tempPtrAddr, tagList);

      let mapped = 0;
      let maxIterations = 1000;
      while (maxIterations-- > 0) {
        const tagAddr = nextTagItemImpl(emu, tempPtrAddr);
        if (tagAddr === 0) break;

        const tag = readTagItem(emu, tagAddr);
        if (!tag) break;

        // Look for this tag in the mapList
        const mapAddr = findTagItemImpl(emu, tag.ti_Tag, mapList);
        if (mapAddr !== 0) {
          const mapTag = readTagItem(emu, mapAddr);
          if (mapTag) {
            // Replace ti_Tag with the mapped value
            emu.writeMemory32(tagAddr, mapTag.ti_Data);
            mapped++;
          }
        }
      }

console.log(`[UtilityLibrary] MapTags(tags=0x${tagList.toString(16)}, map=0x${mapList.toString(16)}) mapped ${mapped}`);
      return 0;
    },
  },
  {
    offset: -66, // LVO -66: AllocateTagItems
    name: "AllocateTagItems",
    handler: (emu, lib: UtilityLibrary) => {
      // Input: D0 = numItems
      // Output: D0 = pointer to allocated TagItem array or NULL
      const numItems = emu.getRegister(0);

      if (numItems === 0) {
console.log("[UtilityLibrary] AllocateTagItems(0) = NULL");
        return 0;
      }

      // Allocate memory for TagItem array (8 bytes each + TAG_DONE terminator)
      const size = (numItems + 1) * 8;
      // Use a simple bump allocator from high memory
      const allocAddr = 0x1F0000 + (Math.random() * 0x8000) | 0;

      // Initialize with TAG_DONE
      for (let i = 0; i <= numItems; i++) {
        emu.writeMemory32(allocAddr + i * 8, TAG_DONE);
        emu.writeMemory32(allocAddr + i * 8 + 4, 0);
      }

console.log(`[UtilityLibrary] AllocateTagItems(${numItems}) = 0x${allocAddr.toString(16)}`);
      return allocAddr;
    },
  },
  {
    offset: -72, // LVO -72: CloneTagItems
    name: "CloneTagItems",
    handler: (emu) => {
      // Input: A0 = original tagList
      // Output: D0 = pointer to cloned tagList or NULL
      const original = emu.getRegister(8); // A0

      if (original === 0) {
        // Return empty tag list (just TAG_DONE)
        const emptyAddr = 0x1F8000 + (Math.random() * 0x1000) | 0;
        emu.writeMemory32(emptyAddr, TAG_DONE);
        emu.writeMemory32(emptyAddr + 4, 0);
console.log(`[UtilityLibrary] CloneTagItems(NULL) = empty list at 0x${emptyAddr.toString(16)}`);
        return emptyAddr;
      }

      // Count tags in original
      const tempPtrAddr = 0x1FE020;
      emu.writeMemory32(tempPtrAddr, original);
      let count = 0;
      let maxIterations = 1000;
      while (maxIterations-- > 0) {
        const addr = nextTagItemImpl(emu, tempPtrAddr);
        if (addr === 0) break;
        count++;
      }

      // Allocate and copy
      const cloneAddr = 0x1F8000 + (Math.random() * 0x1000) | 0;
      emu.writeMemory32(tempPtrAddr, original);
      let idx = 0;
      maxIterations = 1000;
      while (maxIterations-- > 0) {
        const addr = nextTagItemImpl(emu, tempPtrAddr);
        if (addr === 0) break;
        const tag = readTagItem(emu, addr);
        if (tag) {
          emu.writeMemory32(cloneAddr + idx * 8, tag.ti_Tag);
          emu.writeMemory32(cloneAddr + idx * 8 + 4, tag.ti_Data);
          idx++;
        }
      }
      // Add TAG_DONE terminator
      emu.writeMemory32(cloneAddr + idx * 8, TAG_DONE);
      emu.writeMemory32(cloneAddr + idx * 8 + 4, 0);

console.log(`[UtilityLibrary] CloneTagItems(0x${original.toString(16)}) = 0x${cloneAddr.toString(16)} (${count} tags)`);
      return cloneAddr;
    },
  },
  {
    offset: -78, // LVO -78: FreeTagItems
    name: "FreeTagItems",
    handler: (emu) => {
      // Input: A0 = tagList
      // Output: void
      const tagList = emu.getRegister(8); // A0
      // For our simple allocator, we just log and don't actually free
console.log(`[UtilityLibrary] FreeTagItems(0x${tagList.toString(16)})`);
      return 0;
    },
  },
  {
    offset: -84, // LVO -84: RefreshTagItemClones
    name: "RefreshTagItemClones",
    handler: (emu) => {
      // Input: A0 = clone, A1 = original
      // Output: void
      // Rejuvenates a clone from the original (copies data values back)
      const clone = emu.getRegister(8);    // A0
      const original = emu.getRegister(9); // A1

      if (clone === 0 || original === 0) {
console.log("[UtilityLibrary] RefreshTagItemClones - NULL pointer");
        return 0;
      }

      // Iterate through clone and update from original
      const tempPtrAddr = 0x1FE028;
      emu.writeMemory32(tempPtrAddr, clone);

      let refreshed = 0;
      let maxIterations = 1000;
      while (maxIterations-- > 0) {
        const cloneAddr = nextTagItemImpl(emu, tempPtrAddr);
        if (cloneAddr === 0) break;

        const cloneTag = readTagItem(emu, cloneAddr);
        if (!cloneTag) break;

        // Find in original
        const origAddr = findTagItemImpl(emu, cloneTag.ti_Tag, original);
        if (origAddr !== 0) {
          const origTag = readTagItem(emu, origAddr);
          if (origTag) {
            emu.writeMemory32(cloneAddr + 4, origTag.ti_Data);
            refreshed++;
          }
        }
      }

console.log(`[UtilityLibrary] RefreshTagItemClones(clone=0x${clone.toString(16)}, orig=0x${original.toString(16)}) refreshed ${refreshed}`);
      return 0;
    },
  },
  {
    offset: -90, // LVO -90: TagInArray
    name: "TagInArray",
    handler: (emu) => {
      // Input: D0 = tagValue, A0 = tagArray (array of Tag values, NOT TagItems, terminated with TAG_DONE)
      // Output: D0 = TRUE if found, FALSE otherwise
      const tagValue = emu.getRegister(0); // D0
      const tagArray = emu.getRegister(8); // A0

      if (tagArray === 0) {
console.log(`[UtilityLibrary] TagInArray(0x${tagValue.toString(16)}, NULL) = FALSE`);
        return 0;
      }

      // Search array - this is an array of ULONGs (not TagItems), terminated by TAG_DONE
      let addr = tagArray;
      let maxIterations = 1000;
      while (maxIterations-- > 0) {
        const tag = emu.readMemory32(addr);
        if (tag === TAG_DONE) break;
        if (tag === tagValue) {
console.log(`[UtilityLibrary] TagInArray(0x${tagValue.toString(16)}, 0x${tagArray.toString(16)}) = TRUE`);
          return 1; // TRUE
        }
        addr += 4; // Next ULONG
      }

console.log(`[UtilityLibrary] TagInArray(0x${tagValue.toString(16)}, 0x${tagArray.toString(16)}) = FALSE`);
      return 0; // FALSE
    },
  },
  {
    offset: -96, // LVO -96: FilterTagItems
    name: "FilterTagItems",
    handler: (emu) => {
      // Input: A0 = tagList, A1 = filterArray (array of Tag values), D0 = logic (TAGFILTER_AND or TAGFILTER_NOT)
      // Output: D0 = number of valid items remaining
      // TAGFILTER_AND (0) = exclude everything but filter hits
      // TAGFILTER_NOT (1) = exclude only filter hits
      const tagList = emu.getRegister(8);     // A0
      const filterArray = emu.getRegister(9); // A1
      const logic = emu.getRegister(0);       // D0

      if (tagList === 0) {
console.log("[UtilityLibrary] FilterTagItems(NULL) = 0");
        return 0;
      }

      const tempPtrAddr = 0x1FE030;
      emu.writeMemory32(tempPtrAddr, tagList);

      let remaining = 0;
      let filtered = 0;
      let maxIterations = 1000;

      while (maxIterations-- > 0) {
        const tagAddr = nextTagItemImpl(emu, tempPtrAddr);
        if (tagAddr === 0) break;

        const tag = readTagItem(emu, tagAddr);
        if (!tag) break;

        // Check if tag is in filter array
        let inArray = false;
        if (filterArray !== 0) {
          let checkAddr = filterArray;
          let checkMax = 1000;
          while (checkMax-- > 0) {
            const filterTag = emu.readMemory32(checkAddr);
            if (filterTag === TAG_DONE) break;
            if (filterTag === tag.ti_Tag) {
              inArray = true;
              break;
            }
            checkAddr += 4;
          }
        }

        // Apply filter logic
        const shouldKeep = logic === 0 ? inArray : !inArray; // AND vs NOT
        if (shouldKeep) {
          remaining++;
        } else {
          // Mark as TAG_IGNORE
          emu.writeMemory32(tagAddr, TAG_IGNORE);
          filtered++;
        }
      }

console.log(`[UtilityLibrary] FilterTagItems(tags=0x${tagList.toString(16)}, logic=${logic}) kept ${remaining}, filtered ${filtered}`);
      return remaining;
    },
  },
  // Additional utility functions (-102 to -132)
  {
    offset: -102, // LVO -102: CallHookPkt
    name: "CallHookPkt",
    handler: (emu) => {
      // CallHookPkt(hook, object, paramPacket)
      // A0 = hook, A2 = object, A1 = paramPacket
      const hookAddr = emu.getRegister(8);  // A0
      const objectAddr = emu.getRegister(10); // A2
      const packetAddr = emu.getRegister(9);  // A1

      if (!hookAddr) {
console.log("[UtilityLibrary] CallHookPkt: NULL hook, returning 0");
        return 0;
      }

      // Hook structure: h_Entry (4 bytes function ptr), h_SubEntry (4), h_Data (4)
      const h_Entry = emu.readMemory32(hookAddr);
      const h_SubEntry = emu.readMemory32(hookAddr + 4);
      const h_Data = emu.readMemory32(hookAddr + 8);

console.log(
        `[UtilityLibrary] CallHookPkt(hook=0x${hookAddr.toString(16)}, ` +
        `object=0x${objectAddr.toString(16)}, packet=0x${packetAddr.toString(16)}) ` +
        `entry=0x${h_Entry.toString(16)}`
      );

      if (!h_Entry) {
console.log("[UtilityLibrary] CallHookPkt: NULL entry point, returning 0");
        return 0;
      }

      // Save current registers
      const savedD0 = emu.getRegister(0);
      const savedA0 = emu.getRegister(8);
      const savedA1 = emu.getRegister(9);
      const savedA2 = emu.getRegister(10);

      // Set up hook call: A0=hook, A1=object, A2=packet
      emu.setRegister(8, hookAddr);    // A0 = hook
      emu.setRegister(9, objectAddr);  // A1 = object
      emu.setRegister(10, packetAddr); // A2 = packet

      // Call the hook function via JSR
      try {
        // Push return address onto stack
        const sp = emu.getRegister(15); // A7/SP
        const returnAddr = 0xFFFFFF; // Special return address
        emu.writeMemory32(sp - 4, returnAddr);
        emu.setRegister(15, sp - 4);

        // Jump to hook entry point
        emu.setRegister(16, h_Entry); // PC

        // Execute until return
        let cycles = 0;
        const maxCycles = 10000;
        while (cycles < maxCycles) {
          emu.execute(1);
          cycles++;
          const pc = emu.getRegister(16);
          if (pc === returnAddr || pc === 0xFFFFFF) {
            break;
          }
        }

        // Get return value from D0
        const result = emu.getRegister(0);

console.log(`[UtilityLibrary] CallHookPkt: Hook returned ${result}`);
        return result;
      } catch (error) {
console.error(`[UtilityLibrary] CallHookPkt: Hook execution failed:`, error);
        return 0;
      }
    },
  },
  {
    offset: -120, // LVO -120: Amiga2Date
    name: "Amiga2Date",
    handler: (emu) => {
      // Input: D0 = seconds since 01-Jan-1978, A0 = pointer to ClockData structure
      // Output: void (fills ClockData structure)
      // ClockData: sec(UWORD), min(UWORD), hour(UWORD), mday(UWORD), month(UWORD), year(UWORD), wday(UWORD)
      const amigaSeconds = emu.getRegister(0) >>> 0; // D0
      const clockDataAddr = emu.getRegister(8);      // A0

      if (clockDataAddr === 0) {
console.log("[UtilityLibrary] Amiga2Date - NULL ClockData pointer");
        return 0;
      }

      // Amiga epoch: 1978-01-01 00:00:00
      // JavaScript epoch: 1970-01-01 00:00:00
      // Difference: 8 years = 252,288,000 seconds (accounting for leap years 1972, 1976)
      const AMIGA_EPOCH_OFFSET = 252288000; // Seconds from 1970 to 1978
      const unixSeconds = amigaSeconds + AMIGA_EPOCH_OFFSET;
      const date = new Date(unixSeconds * 1000);

      const sec = date.getUTCSeconds();
      const min = date.getUTCMinutes();
      const hour = date.getUTCHours();
      const mday = date.getUTCDate();
      const month = date.getUTCMonth() + 1; // JavaScript months are 0-based
      const year = date.getUTCFullYear();
      const wday = date.getUTCDay(); // 0=Sunday

      // Write to ClockData structure
      emu.writeMemory16(clockDataAddr + 0, sec);
      emu.writeMemory16(clockDataAddr + 2, min);
      emu.writeMemory16(clockDataAddr + 4, hour);
      emu.writeMemory16(clockDataAddr + 6, mday);
      emu.writeMemory16(clockDataAddr + 8, month);
      emu.writeMemory16(clockDataAddr + 10, year);
      emu.writeMemory16(clockDataAddr + 12, wday);

console.log(`[UtilityLibrary] Amiga2Date(${amigaSeconds}) = ${year}-${month.toString().padStart(2,'0')}-${mday.toString().padStart(2,'0')} ${hour.toString().padStart(2,'0')}:${min.toString().padStart(2,'0')}:${sec.toString().padStart(2,'0')}`);
      return 0;
    },
  },
  {
    offset: -126, // LVO -126: Date2Amiga
    name: "Date2Amiga",
    handler: (emu) => {
      // Input: A0 = pointer to ClockData structure
      // Output: D0 = seconds since 01-Jan-1978
      const clockDataAddr = emu.getRegister(8); // A0

      if (clockDataAddr === 0) {
console.log("[UtilityLibrary] Date2Amiga - NULL ClockData pointer");
        return 0;
      }

      // Read ClockData structure
      const sec = emu.readMemory16(clockDataAddr + 0);
      const min = emu.readMemory16(clockDataAddr + 2);
      const hour = emu.readMemory16(clockDataAddr + 4);
      const mday = emu.readMemory16(clockDataAddr + 6);
      const month = emu.readMemory16(clockDataAddr + 8);
      const year = emu.readMemory16(clockDataAddr + 10);

      // Convert to JavaScript Date (UTC)
      const date = Date.UTC(year, month - 1, mday, hour, min, sec);
      const unixSeconds = Math.floor(date / 1000);

      // Convert to Amiga seconds (subtract epoch offset)
      const AMIGA_EPOCH_OFFSET = 252288000;
      const amigaSeconds = unixSeconds - AMIGA_EPOCH_OFFSET;

console.log(`[UtilityLibrary] Date2Amiga(${year}-${month.toString().padStart(2,'0')}-${mday.toString().padStart(2,'0')} ${hour.toString().padStart(2,'0')}:${min.toString().padStart(2,'0')}:${sec.toString().padStart(2,'0')}) = ${amigaSeconds}`);
      return amigaSeconds >>> 0; // Return as unsigned
    },
  },
  {
    offset: -132, // LVO -132: CheckDate
    name: "CheckDate",
    handler: (emu) => {
      // Input: A0 = pointer to ClockData structure
      // Output: D0 = day of week (0-6, 0=Sunday) if valid, or -1 if invalid
      const clockDataAddr = emu.getRegister(8); // A0

      if (clockDataAddr === 0) {
console.log("[UtilityLibrary] CheckDate - NULL ClockData pointer");
        return -1;
      }

      // Read ClockData structure
      const sec = emu.readMemory16(clockDataAddr + 0);
      const min = emu.readMemory16(clockDataAddr + 2);
      const hour = emu.readMemory16(clockDataAddr + 4);
      const mday = emu.readMemory16(clockDataAddr + 6);
      const month = emu.readMemory16(clockDataAddr + 8);
      const year = emu.readMemory16(clockDataAddr + 10);

      // Validate ranges
      if (sec > 59 || min > 59 || hour > 23) {
console.log(`[UtilityLibrary] CheckDate - invalid time: ${hour}:${min}:${sec}`);
        return -1;
      }
      if (month < 1 || month > 12 || mday < 1 || mday > 31) {
console.log(`[UtilityLibrary] CheckDate - invalid date: ${year}-${month}-${mday}`);
        return -1;
      }
      if (year < 1978 || year > 2099) {
console.log(`[UtilityLibrary] CheckDate - invalid year: ${year}`);
        return -1;
      }

      // Check days in month
      const daysInMonth = [0, 31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
      const isLeap = (year % 4 === 0 && year % 100 !== 0) || (year % 400 === 0);
      if (month === 2 && isLeap) {
        daysInMonth[2] = 29;
      }
      if (mday > daysInMonth[month]) {
console.log(`[UtilityLibrary] CheckDate - invalid day: ${year}-${month}-${mday} (max ${daysInMonth[month]})`);
        return -1;
      }

      // Calculate day of week
      const date = new Date(Date.UTC(year, month - 1, mday));
      const wday = date.getUTCDay();

      // Also update wday in the structure
      emu.writeMemory16(clockDataAddr + 12, wday);

console.log(`[UtilityLibrary] CheckDate(${year}-${month.toString().padStart(2,'0')}-${mday.toString().padStart(2,'0')}) = ${wday} (valid)`);
      return wday;
    },
  },
  // Math functions
  {
    offset: -138, // LVO -138: SMult32
    name: "SMult32",
    handler: (emu, lib: UtilityLibrary) => lib.sMult32(),
  },
  {
    offset: -144, // LVO -144: UMult32
    name: "UMult32",
    handler: (emu, lib: UtilityLibrary) => lib.uMult32(),
  },
  {
    offset: -150, // LVO -150: SDivMod32
    name: "SDivMod32",
    handler: (emu) => {
      const dividend = emu.getRegister(0); // D0
      const divisor = emu.getRegister(1);  // D1
      if (divisor === 0) {
console.log("[UtilityLibrary] SDivMod32() - division by zero!");
        return 0;
      }
      const quotient = Math.trunc(dividend / divisor);
      const remainder = dividend % divisor;
      emu.setRegister(1, remainder); // D1 = remainder
console.log(`[UtilityLibrary] SDivMod32(${dividend}/${divisor}) = ${quotient} rem ${remainder}`);
      return quotient; // D0 = quotient
    },
  },
  {
    offset: -156, // LVO -156: UDivMod32
    name: "UDivMod32",
    handler: (emu) => {
      const dividend = emu.getRegister(0) >>> 0; // D0 unsigned
      const divisor = emu.getRegister(1) >>> 0;  // D1 unsigned
      if (divisor === 0) {
console.log("[UtilityLibrary] UDivMod32() - division by zero!");
        return 0;
      }
      const quotient = Math.trunc(dividend / divisor);
      const remainder = dividend % divisor;
      emu.setRegister(1, remainder); // D1 = remainder
console.log(`[UtilityLibrary] UDivMod32(${dividend}/${divisor}) = ${quotient} rem ${remainder}`);
      return quotient; // D0 = quotient
    },
  },
  // String functions
  {
    offset: -162, // LVO -162: Stricmp
    name: "Stricmp",
    handler: (emu, lib: UtilityLibrary) => lib.stricmp(),
  },
  {
    offset: -168, // LVO -168: Strnicmp
    name: "Strnicmp",
    handler: (emu, lib: UtilityLibrary) => lib.strnicmp(),
  },
  {
    offset: -174, // LVO -174: ToUpper
    name: "ToUpper",
    handler: (emu, lib: UtilityLibrary) => lib.toUpper(),
  },
  {
    offset: -180, // LVO -180: ToLower
    name: "ToLower",
    handler: (emu, lib: UtilityLibrary) => lib.toLower(),
  },
  // V39 functions (AmigaOS 3.0+)
  {
    offset: -186, // LVO -186: ApplyTagChanges
    name: "ApplyTagChanges",
    handler: (emu) => {
console.log("[UtilityLibrary] ApplyTagChanges() - stub");
      return 0;
    },
  },
  {
    offset: -198, // LVO -198: SMult64
    name: "SMult64",
    handler: (emu) => {
      // 64-bit signed multiply: D0:D1 = D0 * D1
      const a = emu.getRegister(0); // D0
      const b = emu.getRegister(1); // D1
      const result = BigInt(a | 0) * BigInt(b | 0);
      const lo = Number(result & BigInt(0xFFFFFFFF));
      const hi = Number((result >> BigInt(32)) & BigInt(0xFFFFFFFF));
      emu.setRegister(0, lo); // D0 = low 32 bits
      emu.setRegister(1, hi); // D1 = high 32 bits
console.log(`[UtilityLibrary] SMult64(${a} * ${b}) = ${hi}:${lo}`);
      return lo;
    },
  },
  {
    offset: -204, // LVO -204: UMult64
    name: "UMult64",
    handler: (emu) => {
      // 64-bit unsigned multiply: D0:D1 = D0 * D1
      const a = emu.getRegister(0) >>> 0; // D0 unsigned
      const b = emu.getRegister(1) >>> 0; // D1 unsigned
      const result = BigInt(a) * BigInt(b);
      const lo = Number(result & BigInt(0xFFFFFFFF));
      const hi = Number((result >> BigInt(32)) & BigInt(0xFFFFFFFF));
      emu.setRegister(0, lo); // D0 = low 32 bits
      emu.setRegister(1, hi); // D1 = high 32 bits
console.log(`[UtilityLibrary] UMult64(${a} * ${b}) = ${hi}:${lo}`);
      return lo;
    },
  },
  {
    offset: -210, // LVO -210: PackStructureTags
    name: "PackStructureTags",
    handler: (emu) => {
      // PackStructureTags(pack, packTable, tagList)
      // A0 = pack (destination), A1 = packTable, A2 = tagList
      const packAddr = emu.getRegister(8);   // A0
      const tableAddr = emu.getRegister(9);  // A1
      const tagAddr = emu.getRegister(10);   // A2

console.log(
        `[UtilityLibrary] PackStructureTags(pack=0x${packAddr.toString(16)}, ` +
        `table=0x${tableAddr.toString(16)}, tags=0x${tagAddr.toString(16)})`
      );

      // PackTable: array of { packType, offset } pairs terminated by 0
      // This packs tag list values into a structure - complex feature unused by console doors
      // Return success (number of items packed)
      return 0;
    },
  },
  {
    offset: -216, // LVO -216: UnpackStructureTags
    name: "UnpackStructureTags",
    handler: (emu) => {
      // UnpackStructureTags(pack, packTable, tagList)
      // A0 = pack (source), A1 = packTable, A2 = tagList
      const packAddr = emu.getRegister(8);   // A0
      const tableAddr = emu.getRegister(9);  // A1
      const tagAddr = emu.getRegister(10);   // A2

console.log(
        `[UtilityLibrary] UnpackStructureTags(pack=0x${packAddr.toString(16)}, ` +
        `table=0x${tableAddr.toString(16)}, tags=0x${tagAddr.toString(16)})`
      );

      // Unpacks structure into tag list - complex feature unused by console doors
      // Return success (number of items unpacked)
      return 0;
    },
  },
  // Named Object functions (V39)
  {
    offset: -222, // LVO -222: AddNamedObject
    name: "AddNamedObject",
    handler: (emu) => {
      // AddNamedObject(nameSpace, object)
      // A0 = nameSpace, A1 = object (NamedObject structure)
      const nameSpaceAddr = emu.getRegister(8);  // A0
      const objectAddr = emu.getRegister(9);     // A1

      if (!objectAddr) {
console.log("[UtilityLibrary] AddNamedObject: NULL object");
        return 0; // FALSE
      }

      // NamedObject structure: ln_Succ(4), ln_Pred(4), ln_Type(1), ln_Pri(1), ln_Name(4), ...
      // Read name pointer at offset +12
      const namePtr = emu.readMemory32(objectAddr + 12);
      let name = "";
      if (namePtr) {
        for (let i = 0; i < 64; i++) {
          const ch = emu.readMemory(namePtr + i);
          if (ch === 0) break;
          name += String.fromCharCode(ch);
        }
      }

console.log(
        `[UtilityLibrary] AddNamedObject(nameSpace=0x${nameSpaceAddr.toString(16)}, ` +
        `object=0x${objectAddr.toString(16)}, name="${name}")`
      );

      // Add to registry
      namedObjectRegistry.set(name, objectAddr);
      return -1; // TRUE
    },
  },
  {
    offset: -228, // LVO -228: AllocNamedObjectA
    name: "AllocNamedObjectA",
    handler: (emu) => {
      // AllocNamedObjectA(name, tagList) - A0 = name, A1 = tagList
      const namePtr = emu.getRegister(8);  // A0
      const tagList = emu.getRegister(9);  // A1

      let name = "";
      if (namePtr) {
        for (let i = 0; i < 64; i++) {
          const ch = emu.readMemory(namePtr + i);
          if (ch === 0) break;
          name += String.fromCharCode(ch);
        }
      }

      // Allocate NamedObject structure: 32 bytes
      const objAddr = namedObjectState.nextAddr;
      namedObjectState.nextAddr += 32;

      // Initialize structure (simplified)
      for (let i = 0; i < 32; i++) {
        emu.writeMemory(objAddr + i, 0);
      }
      // Write name pointer at offset +12
      emu.writeMemory32(objAddr + 12, namePtr);

console.log(
        `[UtilityLibrary] AllocNamedObjectA(name="${name}") -> 0x${objAddr.toString(16)}`
      );

      return objAddr;
    },
  },
  {
    offset: -234, // LVO -234: AttemptRemNamedObject
    name: "AttemptRemNamedObject",
    handler: (emu) => {
      // AttemptRemNamedObject(object) - A0 = object
      const objectAddr = emu.getRegister(8);  // A0

console.log(
        `[UtilityLibrary] AttemptRemNamedObject(object=0x${objectAddr.toString(16)})`
      );

      // Find and remove from registry
      for (const [name, addr] of namedObjectRegistry.entries()) {
        if (addr === objectAddr) {
          namedObjectRegistry.delete(name);
console.log(`[UtilityLibrary] Removed named object "${name}"`);
          return -1; // SUCCESS
        }
      }

      return 0; // FAILURE (object not found or locked)
    },
  },
  {
    offset: -240, // LVO -240: FindNamedObject
    name: "FindNamedObject",
    handler: (emu) => {
      // FindNamedObject(nameSpace, name, lastObject) - A0 = nameSpace, A1 = name, A2 = lastObject
      const nameSpaceAddr = emu.getRegister(8);  // A0
      const namePtr = emu.getRegister(9);        // A1
      const lastObject = emu.getRegister(10);    // A2

      let name = "";
      if (namePtr) {
        for (let i = 0; i < 64; i++) {
          const ch = emu.readMemory(namePtr + i);
          if (ch === 0) break;
          name += String.fromCharCode(ch);
        }
      }

      const objectAddr = namedObjectRegistry.get(name) || 0;
console.log(
        `[UtilityLibrary] FindNamedObject(name="${name}") -> 0x${objectAddr.toString(16)}`
      );

      return objectAddr;
    },
  },
  {
    offset: -246, // LVO -246: FreeNamedObject
    name: "FreeNamedObject",
    handler: (emu) => {
      // FreeNamedObject(object) - A0 = object
      const objectAddr = emu.getRegister(8);  // A0

console.log(
        `[UtilityLibrary] FreeNamedObject(object=0x${objectAddr.toString(16)})`
      );

      // Remove from registry and free
      for (const [name, addr] of namedObjectRegistry.entries()) {
        if (addr === objectAddr) {
          namedObjectRegistry.delete(name);
          break;
        }
      }

      return 0;
    },
  },
  {
    offset: -252, // LVO -252: NamedObjectName
    name: "NamedObjectName",
    handler: (emu) => {
      // NamedObjectName(object) - A0 = object
      const objectAddr = emu.getRegister(8);  // A0

      // Read name pointer at offset +12
      const namePtr = emu.readMemory32(objectAddr + 12);
console.log(
        `[UtilityLibrary] NamedObjectName(object=0x${objectAddr.toString(16)}) -> 0x${namePtr.toString(16)}`
      );

      return namePtr;
    },
  },
  {
    offset: -258, // LVO -258: ReleaseNamedObject
    name: "ReleaseNamedObject",
    handler: (emu) => {
      // ReleaseNamedObject(object) - A0 = object
      const objectAddr = emu.getRegister(8);  // A0

console.log(
        `[UtilityLibrary] ReleaseNamedObject(object=0x${objectAddr.toString(16)})`
      );

      // Release lock (no-op in our implementation)
      return 0;
    },
  },
  {
    offset: -264, // LVO -264: RemNamedObject
    name: "RemNamedObject",
    handler: (emu) => {
      // RemNamedObject(object, message) - A0 = object, A1 = message
      const objectAddr = emu.getRegister(8);  // A0
      const messageAddr = emu.getRegister(9); // A1

console.log(
        `[UtilityLibrary] RemNamedObject(object=0x${objectAddr.toString(16)})`
      );

      // Remove from registry
      for (const [name, addr] of namedObjectRegistry.entries()) {
        if (addr === objectAddr) {
          namedObjectRegistry.delete(name);
console.log(`[UtilityLibrary] Removed named object "${name}"`);
          break;
        }
      }

      return 0;
    },
  },
  {
    offset: -270, // LVO -270: GetUniqueID
    name: "GetUniqueID",
    handler: (emu, lib: UtilityLibrary) => lib.getUniqueID(),
  },
];
