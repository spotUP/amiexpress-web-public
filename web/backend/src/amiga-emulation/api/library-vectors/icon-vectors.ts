/**
 * icon.library function vectors
 * Reference: NDK3.2R4/Include_I/lvo/icon_lib.i
 * LVO = Library Vector Offset (in bytes from library base)
 */

import { LibraryVector } from "./types";
import { IconLibrary } from "../IconLibrary";

export const ICON_VECTORS: LibraryVector[] = [
  {
    offset: -30, // LVO -30: GetDiskObject
    name: "GetDiskObject",
    handler: (emu, lib: IconLibrary) => {
      lib.GetDiskObject();
      return emu.getRegister(0); // D0 = DiskObject pointer or NULL
    },
  },
  {
    offset: -36, // LVO -36: PutDiskObject
    name: "PutDiskObject",
    handler: (emu, lib: IconLibrary) => {
      lib.PutDiskObject();
      return emu.getRegister(0); // D0 = success (non-zero) or failure (0)
    },
  },
  {
    offset: -42, // LVO -42: FreeDiskObject
    name: "FreeDiskObject",
    handler: (emu, lib: IconLibrary) => {
      lib.FreeDiskObject();
      return 0;
    },
  },
  {
    offset: -48, // LVO -48: FindToolType
    name: "FindToolType",
    handler: (emu, lib: IconLibrary) => {
      lib.FindToolType();
      return emu.getRegister(0); // D0 = pointer to tooltype value or NULL
    },
  },
  {
    offset: -54, // LVO -54: MatchToolValue
    name: "MatchToolValue",
    handler: (emu, lib: IconLibrary) => {
      lib.MatchToolValue();
      return emu.getRegister(0); // D0 = TRUE/FALSE
    },
  },
];
