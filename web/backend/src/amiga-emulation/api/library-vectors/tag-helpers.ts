/**
 * TagItem utility functions
 * Shared helpers for utility.library tag handling
 * Reference: <utility/tagitem.h>
 */

import { MoiraEmulator } from "../../cpu/MoiraEmulator";

/**
 * Tag constants from <utility/tagitem.h>
 */
export const TAG_DONE = 0;     // Terminates array, ti_Data unused
export const TAG_IGNORE = 1;   // Ignore this item, not end of array
export const TAG_MORE = 2;     // ti_Data is pointer to another array (terminates current)
export const TAG_SKIP = 3;     // Skip this and the next ti_Data items
export const TAG_USER = 0x80000000; // User tags start here

/**
 * Helper: Read a TagItem from memory
 * Returns { ti_Tag, ti_Data } or null if address is 0
 */
export function readTagItem(emu: MoiraEmulator, addr: number): { ti_Tag: number; ti_Data: number } | null {
  if (addr === 0) return null;
  const ti_Tag = emu.readMemory32(addr);
  const ti_Data = emu.readMemory32(addr + 4);
  return { ti_Tag, ti_Data };
}

/**
 * Helper: Implement NextTagItem logic
 * Takes a pointer to pointer (address of tagItemPtr variable) and returns next valid TagItem
 * Handles TAG_DONE, TAG_IGNORE, TAG_MORE, TAG_SKIP
 */
export function nextTagItemImpl(emu: MoiraEmulator, tagItemPtrAddr: number): number {
  if (tagItemPtrAddr === 0) return 0;

  // Read the current TagItem pointer
  let currentPtr = emu.readMemory32(tagItemPtrAddr);
  if (currentPtr === 0) return 0;

  while (true) {
    const tag = readTagItem(emu, currentPtr);
    if (!tag) return 0;

    switch (tag.ti_Tag) {
      case TAG_DONE:
        // End of list - update pointer and return NULL
        emu.writeMemory32(tagItemPtrAddr, 0);
        return 0;

      case TAG_IGNORE:
        // Skip this entry, continue to next
        currentPtr += 8; // sizeof(TagItem)
        continue;

      case TAG_MORE:
        // ti_Data points to another tag array, chain to it
        currentPtr = tag.ti_Data;
        if (currentPtr === 0) {
          emu.writeMemory32(tagItemPtrAddr, 0);
          return 0;
        }
        continue;

      case TAG_SKIP:
        // Skip this entry and ti_Data more entries
        currentPtr += 8 * (1 + tag.ti_Data);
        continue;

      default:
        // Valid tag - update pointer to point to NEXT entry and return THIS entry
        emu.writeMemory32(tagItemPtrAddr, currentPtr + 8);
        return currentPtr;
    }
  }
}

/**
 * Helper: Find a tag in a tag list
 * Returns pointer to TagItem or 0 if not found
 */
export function findTagItemImpl(emu: MoiraEmulator, tagValue: number, tagList: number): number {
  if (tagList === 0) return 0;

  // We need a temporary storage for the pointer
  // Use a high memory address that won't conflict
  const tempPtrAddr = 0x1FE000; // Temporary storage for pointer
  emu.writeMemory32(tempPtrAddr, tagList);

  let maxIterations = 1000; // Safety limit
  while (maxIterations-- > 0) {
    const tagItemAddr = nextTagItemImpl(emu, tempPtrAddr);
    if (tagItemAddr === 0) break;

    const tag = readTagItem(emu, tagItemAddr);
    if (tag && tag.ti_Tag === tagValue) {
      return tagItemAddr;
    }
  }

  return 0; // Not found
}
