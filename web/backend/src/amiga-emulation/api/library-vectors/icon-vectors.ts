/**
 * icon.library function vectors
 * Reference: NDK3.2R4/Include_I/lvo/icon_lib.i
 * LVO = Library Vector Offset (in bytes from library base)
 */

import { LibraryVector } from "./types";
import { IconLibrary } from "../IconLibrary";

/**
 * CORRECT LVOs from NDK3.2R4/Include_I/lvo/icon_lib.i:
 * _LVOFreeFreeList equ -54
 * _LVOAddFreeList equ -72
 * _LVOGetDiskObject equ -78
 * _LVOPutDiskObject equ -84
 * _LVOFreeDiskObject equ -90
 * _LVOFindToolType equ -96
 * _LVOMatchToolValue equ -102
 * _LVOBumpRevision equ -108
 * _LVOGetDefDiskObject equ -120
 * _LVOPutDefDiskObject equ -126
 * _LVOGetDiskObjectNew equ -132
 * _LVODeleteDiskObject equ -138
 * _LVODupDiskObjectA equ -150
 * _LVOIconControlA equ -156
 * _LVODrawIconStateA equ -162
 * _LVOGetIconRectangleA equ -168
 * _LVONewDiskObject equ -174
 * _LVOGetIconTagList equ -180
 * _LVOPutIconTagList equ -186
 * _LVOLayoutIconA equ -192
 */
export const ICON_VECTORS: LibraryVector[] = [
  {
    offset: -54, // LVO -54: FreeFreeList
    name: "FreeFreeList",
    handler: (emu, lib: IconLibrary) => {
      // FreeFreeList(freelist)(A0)
      // Frees memory allocated by AddFreeList
      const freeList = emu.getRegister(8); // A0
      console.log(`[icon.library] FreeFreeList(A0=0x${freeList.toString(16)}) - stub, ignoring`);
      return 0;
    },
  },
  {
    offset: -72, // LVO -72: AddFreeList
    name: "AddFreeList",
    handler: (emu, lib: IconLibrary) => {
      // AddFreeList(freelist, mem, size)(A0/A1/A2)
      const freeList = emu.getRegister(8); // A0
      const mem = emu.getRegister(9); // A1
      const size = emu.getRegister(10); // A2
      console.log(`[icon.library] AddFreeList(freelist=0x${freeList.toString(16)}, mem=0x${mem.toString(16)}, size=0x${size.toString(16)}) - stub`);
      return 1; // Success
    },
  },
  {
    offset: -78, // LVO -78: GetDiskObject
    name: "GetDiskObject",
    handler: (emu, lib: IconLibrary) => {
      lib.GetDiskObject();
      return emu.getRegister(0); // D0 = DiskObject pointer or NULL
    },
  },
  {
    offset: -84, // LVO -84: PutDiskObject
    name: "PutDiskObject",
    handler: (emu, lib: IconLibrary) => {
      lib.PutDiskObject();
      return emu.getRegister(0); // D0 = success (non-zero) or failure (0)
    },
  },
  {
    offset: -90, // LVO -90: FreeDiskObject
    name: "FreeDiskObject",
    handler: (emu, lib: IconLibrary) => {
      lib.FreeDiskObject();
      return 0;
    },
  },
  {
    offset: -96, // LVO -96: FindToolType
    name: "FindToolType",
    handler: (emu, lib: IconLibrary) => {
      lib.FindToolType();
      return emu.getRegister(0); // D0 = pointer to tooltype value or NULL
    },
  },
  {
    offset: -102, // LVO -102: MatchToolValue
    name: "MatchToolValue",
    handler: (emu, lib: IconLibrary) => {
      lib.MatchToolValue();
      return emu.getRegister(0); // D0 = TRUE/FALSE
    },
  },
  {
    offset: -108, // LVO -108: BumpRevision
    name: "BumpRevision",
    handler: (emu, lib: IconLibrary) => {
      // BumpRevision(newname, oldname)(A0/A1)
      // Increments the revision number in a filename (e.g., "copy_of_file" -> "copy_2_of_file")
      const newName = emu.getRegister(8); // A0 - destination buffer
      const oldName = emu.getRegister(9); // A1 - source name
      console.log(`[icon.library] BumpRevision(A0=0x${newName.toString(16)}, A1=0x${oldName.toString(16)}) - stub`);
      // Just copy the old name to new name for now
      if (oldName && newName) {
        let i = 0;
        while (true) {
          const c = emu.readMemory(oldName + i);
          emu.writeMemory(newName + i, c);
          if (c === 0) break;
          i++;
          if (i > 255) break; // Safety limit
        }
      }
      return newName;
    },
  },
  {
    offset: -120, // LVO -120: GetDefDiskObject
    name: "GetDefDiskObject",
    handler: (emu, lib: IconLibrary) => {
      // GetDefDiskObject(type)(D0)
      const type = emu.getRegister(0); // D0
      console.log(`[icon.library] GetDefDiskObject(type=${type}) - returning NULL`);
      emu.setRegister(0, 0); // Return NULL - no default icon
      return 0;
    },
  },
  {
    offset: -126, // LVO -126: PutDefDiskObject
    name: "PutDefDiskObject",
    handler: (emu, lib: IconLibrary) => {
      // PutDefDiskObject(diskobj)(A0)
      const diskObj = emu.getRegister(8); // A0
      console.log(`[icon.library] PutDefDiskObject(A0=0x${diskObj.toString(16)}) - stub`);
      return 1; // Success
    },
  },
  {
    offset: -132, // LVO -132: GetDiskObjectNew
    name: "GetDiskObjectNew",
    handler: (emu, lib: IconLibrary) => {
      // GetDiskObjectNew(name)(A0)
      // Like GetDiskObject but creates default icon if none exists
      lib.GetDiskObject(); // Use same implementation
      return emu.getRegister(0);
    },
  },
  {
    offset: -138, // LVO -138: DeleteDiskObject
    name: "DeleteDiskObject",
    handler: (emu, lib: IconLibrary) => {
      // DeleteDiskObject(name)(A0)
      const namePtr = emu.getRegister(8); // A0
      let name = "";
      let addr = namePtr;
      while (addr) {
        const c = emu.readMemory(addr);
        if (c === 0) break;
        name += String.fromCharCode(c);
        addr++;
        if (name.length > 255) break;
      }
      console.log(`[icon.library] DeleteDiskObject("${name}") - stub, returning success`);
      return 1; // Success
    },
  },
];
