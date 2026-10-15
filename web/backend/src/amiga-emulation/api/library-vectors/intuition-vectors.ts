/**
 * intuition.library function vectors
 * Reference: NDK3.2R4/Include_I/lvo/intuition_lib.i
 */

import { LibraryVector } from "./types";
import { IntuitionLibrary } from "../IntuitionLibrary";

export const INTUITION_VECTORS: LibraryVector[] = [
  {
    offset: -72, // LVO -72 CloseWindow (function #8)
    name: "CloseWindow",
    handler: (emu, lib: IntuitionLibrary) => {
      lib.CloseWindow();
      return emu.getRegister(0); // Return D0
    },
  },
  {
    offset: -66, // LVO -66 CloseScreen (function #7)
    name: "CloseScreen",
    handler: (emu, lib: IntuitionLibrary) => {
      lib.CloseScreen();
      return emu.getRegister(0); // Return D0
    },
  },
  {
    offset: -198, // LVO -198 OpenScreen
    name: "OpenScreen",
    handler: (emu, lib: IntuitionLibrary) => {
      lib.OpenScreen();
      return emu.getRegister(0); // Return D0 (screen handle)
    },
  },
  {
    offset: -204, // LVO -204 OpenWindow
    name: "OpenWindow",
    handler: (emu, lib: IntuitionLibrary) => {
      lib.OpenWindow();
      return emu.getRegister(0); // Return D0 (window handle)
    },
  },
  {
    offset: -276, // LVO -276 SetWindowTitles
    name: "SetWindowTitles",
    handler: (emu, lib: IntuitionLibrary) => {
      lib.SetWindowTitles();
      return emu.getRegister(0); // Return D0
    },
  },
  {
    offset: -222, // LVO -222 RefreshGadgets (function #33)
    name: "RefreshGadgets",
    handler: (emu, lib: IntuitionLibrary) => {
      lib.RefreshGadgets();
      return emu.getRegister(0); // Return D0
    },
  },
  {
    offset: -348, // LVO -348 AutoRequest
    name: "AutoRequest",
    handler: (emu, lib: IntuitionLibrary) => {
      lib.AutoRequest();
      return emu.getRegister(0); // Return D0 (TRUE/FALSE)
    },
  },
  {
    offset: -210, // LVO -210 OpenWorkBench (function #31)
    name: "OpenWorkBench",
    handler: (emu, lib: IntuitionLibrary) => {
      lib.OpenWorkBench();
      return emu.getRegister(0); // Return D0 (screen handle)
    },
  },
];
