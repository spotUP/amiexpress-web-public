/**
 * Library Call Trapping for Amiga Door Execution
 *
 * Amiga libraries use JSR to negative offsets from the library base.
 * Example: JSR -30(A6) calls OpenLibrary
 *
 * We intercept these calls by placing ILLEGAL instructions at the
 * vector addresses, which trigger exceptions that we can handle.
 *
 * This allows doors to call library functions without needing the
 * actual library code in memory.
 */

import { MoiraEmulator } from "../cpu/MoiraEmulator";
import { ExecLibrary } from "./ExecLibrary";
import { AEDoorLibrary } from "./AEDoorLibrary";
import { DosLibrary } from "./DosLibrary";
import { IconLibrary } from "./IconLibrary";
import { UtilityLibrary } from "./UtilityLibrary";
import {
  MathFFPLibrary,
  MathTransLibrary,
  MathIEEEDoubBasLibrary,
  MathIEEEDoubTransLibrary,
  MathIEEESingBasLibrary,
  MathIEEESingTransLibrary,
} from "./MathLibrary";
import { IntuitionLibrary } from "./IntuitionLibrary";
import { EXEC_LVO_MAP, DOS_LVO_MAP } from "../constants/lvo-map";
import * as fs from "fs";
import * as amigafs from "../../utils/amigafs";
import * as path from "path";

// Global named object registry for utility.library
const namedObjectRegistry = new Map<string, number>();
let nextNamedObjectAddr = 0x00200000; // Start allocating at 2MB

/**
 * Library function vector entry
 */
interface LibraryVector {
  offset: number; // Negative offset from library base
  name: string; // Function name (for logging)
  handler: (
    emulator: MoiraEmulator,
    library: any,
    returnAddr?: number
  ) => number; // Returns D0, optional returnAddr
}

/**
 * AEDoor.library function vectors - DISABLED
 *
 * ARCHITECTURAL FIX (2025-12-15):
 * These trap-based TypeScript reimplementations are DISABLED.
 * We now use the REAL AEDoor.library binary (./Libs/AEDoor.library - 1128 bytes)
 * loaded via LibraryLoader with proper HUNK parsing and relocations.
 *
 * WHY: The real library contains actual 68K code that:
 * - Creates message ports and structures
 * - Sends XIM messages via PutMsg/GetMsg
 * - Manages door interface properly
 *
 * We intercept ONLY the Exec message port I/O (PutMsg/GetMsg) to bridge
 * between the emulated environment and the Node.js BBS backend.
 *
 * See: AEDOOR_ARCHITECTURE_FIX.md for complete details
 *
 * The native approach did not work - messages sent to wrong ports.
 * Re-enabling traps for output functions.
 */
const AEDOOR_VECTORS: LibraryVector[] = [
  {
    offset: -30, // LVO -30 (0xFFE2)
    name: "CreateComm",
    handler: (emu, lib: AEDoorLibrary) => {
      console.log("[AEDoorLibrary][Trap] CreateComm intercepted");
      return lib.createComm();
    },
  },
  {
    offset: -36, // LVO -36 (0xFFDC)
    name: "DeleteComm",
    handler: (emu, lib: AEDoorLibrary) => {
      lib.deleteComm();
      return 0;
    },
  },
  {
    offset: -42, // LVO -42 (0xFFD6)
    name: "SendCmd",
    handler: (emu, lib: AEDoorLibrary) => {
      return lib.sendCmd();
    },
  },
  {
    offset: -48, // LVO -48 (0xFFD0)
    name: "SendStrCmd",
    handler: (emu, lib: AEDoorLibrary) => {
      return lib.sendStrCmd();
    },
  },
  {
    offset: -54, // LVO -54 (0xFFCA)
    name: "SendDataCmd",
    handler: (emu, lib: AEDoorLibrary) => {
      return lib.sendDataCmd();
    },
  },
  {
    offset: -60, // LVO -60 (0xFFC4)
    name: "SendStrDataCmd",
    handler: (emu, lib: AEDoorLibrary) => {
      return lib.sendStrDataCmd();
    },
  },
  {
    offset: -66, // LVO -66 (0xFFBE)
    name: "GetData",
    handler: (emu, lib: AEDoorLibrary) => {
      return lib.getData();
    },
  },
  {
    offset: -72, // LVO -72 (0xFFB8)
    name: "GetString",
    handler: (emu, lib: AEDoorLibrary) => {
      return lib.getString();
    },
  },
  {
    offset: -78, // LVO -78 (0xFFB2)
    name: "Prompt",
    handler: (emu, lib: AEDoorLibrary) => {
      return lib.prompt();
    },
  },
  {
    offset: -84, // LVO -84 (0xFFAC)
    name: "WriteStr",
    handler: (emu, lib: AEDoorLibrary) => {
      return lib.writeStr();
    },
  },
  {
    offset: -90, // LVO -90 (0xFFA6)
    name: "ShowGFile",
    handler: (emu, lib: AEDoorLibrary) => {
      return lib.showGFile();
    },
  },
  {
    offset: -96, // LVO -96 (0xFFA0)
    name: "ShowFile",
    handler: (emu, lib: AEDoorLibrary) => {
      return lib.showFile();
    },
  },
  {
    offset: -102, // LVO -102 (0xFF9A)
    name: "SetDT",
    handler: (emu, lib: AEDoorLibrary) => {
      return lib.setDT();
    },
  },
  {
    offset: -108, // LVO -108 (0xFF94)
    name: "GetDT",
    handler: (emu, lib: AEDoorLibrary) => {
      return lib.getDT();
    },
  },
  {
    offset: -114, // LVO -114 (0xFF8E)
    name: "GetStr",
    handler: (emu, lib: AEDoorLibrary) => {
      return lib.getStr();
    },
  },
  {
    offset: -120, // LVO -120 (0xFF88)
    name: "CopyStr",
    handler: (emu, lib: AEDoorLibrary) => {
      return lib.copyStr();
    },
  },
  {
    offset: -126, // LVO -126 (0xFF82)
    name: "HotKey",
    handler: (emu, lib: AEDoorLibrary) => {
      return lib.hotKey();
    },
  },
  {
    offset: -132, // LVO -132 (0xFF7C)
    name: "PreCreateComm",
    handler: (emu, lib: AEDoorLibrary) => {
      console.log("[AEDoorLibrary][Trap] PreCreateComm intercepted");
      return lib.preCreateComm();
    },
  },
  {
    offset: -138, // LVO -138 (0xFF76)
    name: "PostDeleteComm",
    handler: (emu, lib: AEDoorLibrary) => {
      return lib.postDeleteComm();
    },
  },
  {
    offset: -24, // Some doors call this slot; provide a safe stub
    name: "Stub_-24",
    handler: () => {
      console.log("[AEDoorLibrary][Trap] Stub -24 invoked");
      return 0;
    },
  },
];

/**
 * DOS.library function vectors
 * Reference: AROS dos.library & AmigaOS LVO tables
 * LVO = Library Vector Offset (in bytes from library base)
 */
const DOS_VECTORS: LibraryVector[] = [
  {
    offset: -30,
    name: "Open",
    handler: (emu, lib: DosLibrary) => {
      return lib.Open();
    },
  },
  {
    offset: -36,
    name: "Close",
    handler: (emu, lib: DosLibrary) => {
      return lib.Close();
    },
  },
  {
    offset: -42,
    name: "Read",
    handler: (emu, lib: DosLibrary) => {
      return lib.Read();
    },
  },
  {
    offset: -48,
    name: "Write",
    handler: (emu, lib: DosLibrary) => {
      return lib.Write();
    },
  },
  {
    offset: -54,
    name: "Input",
    handler: (emu, lib: DosLibrary) => {
      return lib.Input();
    },
  },
  {
    offset: -60,
    name: "Output",
    handler: (emu, lib: DosLibrary) => {
      return lib.Output();
    },
  },
  {
    offset: -66,
    name: "Seek",
    handler: (emu, lib: DosLibrary) => {
      return lib.Seek();
    },
  },
  {
    offset: -306,
    name: "FGetC",
    handler: (emu, lib: DosLibrary) => {
      return lib.FGetC();
    },
  },
  {
    offset: -312,
    name: "FPutC",
    handler: (emu, lib: DosLibrary) => {
      return lib.FPutC();
    },
  },
  {
    offset: -318,
    name: "UnGetC",
    handler: (emu, lib: DosLibrary) => {
      return lib.UnGetC();
    },
  },
  {
    offset: -324,
    name: "FRead",
    handler: (emu, lib: DosLibrary) => {
      return lib.FRead();
    },
  },
  {
    offset: -330,
    name: "FWrite",
    handler: (emu, lib: DosLibrary) => {
      return lib.FWrite();
    },
  },
  {
    offset: -336,
    name: "FGets",
    handler: (emu, lib: DosLibrary) => {
      return lib.FGets();
    },
  },
  {
    offset: -342,
    name: "FPuts",
    handler: (emu, lib: DosLibrary) => {
      return lib.FPuts();
    },
  },
  {
    offset: -360,
    name: "Flush",
    handler: (emu, lib: DosLibrary) => {
      return lib.Flush();
    },
  },
  {
    offset: -84,
    name: "Lock",
    handler: (emu, lib: DosLibrary) => {
      lib.Lock();
      return emu.getRegister(0);
    },
  },
  {
    offset: -90,
    name: "UnLock",
    handler: (emu, lib: DosLibrary) => {
      lib.UnLock();
      return emu.getRegister(0);
    },
  },
  {
    offset: -96,
    name: "DupLock",
    handler: (emu, lib: DosLibrary) => {
      lib.DupLock();
      return emu.getRegister(0);
    },
  },
  {
    offset: -102,
    name: "Examine",
    handler: (emu, lib: DosLibrary) => {
      lib.Examine();
      return emu.getRegister(0);
    },
  },
  {
    offset: -108,
    name: "ExNext",
    handler: (emu, lib: DosLibrary) => {
      lib.ExNext();
      return emu.getRegister(0);
    },
  },
  {
    offset: -120,
    name: "CreateDir",
    handler: (emu, lib: DosLibrary) => {
      lib.CreateDir();
      return emu.getRegister(0);
    },
  },
  {
    offset: -126,
    name: "CurrentDir",
    handler: (emu, lib: DosLibrary) => {
      lib.CurrentDir();
      return emu.getRegister(0);
    },
  },
  {
    offset: -132,
    name: "IoErr",
    handler: (emu, lib: DosLibrary) => {
      return lib.IoErr();
    },
  },
  {
    offset: -192,
    name: "DateStamp",
    handler: (emu, lib: DosLibrary) => {
      return lib.DateStamp();
    },
  },
  {
    offset: -198,
    name: "Delay",
    handler: (emu, lib: DosLibrary) => {
      lib.Delay();
      return 0;
    },
  },
  {
    offset: -204,
    name: "WaitForChar",
    handler: (emu, lib: DosLibrary) => {
      return lib.WaitForChar();
    },
  },
  {
    offset: -144,
    name: "Exit",
    handler: (emu, lib: DosLibrary) => {
      lib.Exit();
      return 0; // Exit doesn't return in the normal sense
    },
  },
  {
    offset: -402,
    name: "NameFromLock",
    handler: (emu, lib: DosLibrary) => {
      lib.NameFromLock();
      return emu.getRegister(0);
    },
  },
  {
    offset: -798,
    name: "ReadArgs",
    handler: (emu, lib: DosLibrary) => {
      lib.ReadArgs();
      return emu.getRegister(0);
    },
  },
  {
    offset: -858,
    name: "FreeArgs",
    handler: (emu, lib: DosLibrary) => {
      lib.FreeArgs();
      return emu.getRegister(0);
    },
  },
  {
    offset: -298,
    name: "DosStub_-298",
    handler: (emu, lib: DosLibrary) => {
      return 0;
    },
  },
  {
    offset: -744,
    name: "DateToStr",
    handler: (emu, lib: DosLibrary) => {
      lib.DateToStr();
      return emu.getRegister(0);
    },
  },
  {
    offset: -750,
    name: "StrToDate",
    handler: (emu, lib: DosLibrary) => {
      lib.StrToDate();
      return emu.getRegister(0);
    },
  },
  {
    offset: -228,
    name: "AllocDosObject",
    handler: (emu, lib: DosLibrary) => {
      lib.AllocDosObject();
      return emu.getRegister(0);
    },
  },
  {
    offset: -234,
    name: "FreeDosObject",
    handler: (emu, lib: DosLibrary) => {
      lib.FreeDosObject();
      return emu.getRegister(0);
    },
  },
  {
    offset: -378,
    name: "OpenFromLock",
    handler: (emu, lib: DosLibrary) => {
      lib.OpenFromLock();
      return emu.getRegister(0);
    },
  },
  {
    offset: -72,
    name: "DeleteFile",
    handler: (emu, lib: DosLibrary) => {
      lib.DeleteFile();
      return emu.getRegister(0);
    },
  },
  {
    offset: -78,
    name: "Rename",
    handler: (emu, lib: DosLibrary) => {
      lib.Rename();
      return emu.getRegister(0);
    },
  },
  {
    offset: -114,
    name: "Info",
    handler: (emu, lib: DosLibrary) => {
      lib.Info();
      return emu.getRegister(0);
    },
  },
  {
    offset: -168,
    name: "SetComment",
    handler: (emu, lib: DosLibrary) => {
      lib.SetComment();
      return emu.getRegister(0);
    },
  },
  {
    offset: -174,
    name: "SetProtection",
    handler: (emu, lib: DosLibrary) => {
      lib.SetProtection();
      return emu.getRegister(0);
    },
  },
  {
    offset: -300,
    name: "AddPart",
    handler: (emu, lib: DosLibrary) => {
      lib.AddPart();
      return emu.getRegister(0);
    },
  },
  {
    offset: -288,
    name: "FilePart",
    handler: (emu, lib: DosLibrary) => {
      lib.FilePart();
      return emu.getRegister(0);
    },
  },
  {
    offset: -294,
    name: "PathPart",
    handler: (emu, lib: DosLibrary) => {
      lib.PathPart();
      return emu.getRegister(0);
    },
  },
  // All remaining dos.library functions from DosLibrary.handleCall()
  {
    offset: -138,
    name: "CreateProc",
    handler: (emu, lib: DosLibrary) => {
      lib.CreateProc();
      return emu.getRegister(0);
    },
  },
  {
    offset: -150,
    name: "LoadSeg",
    handler: (emu, lib: DosLibrary) => {
      lib.LoadSeg();
      return emu.getRegister(0);
    },
  },
  {
    offset: -156,
    name: "UnLoadSeg",
    handler: (emu, lib: DosLibrary) => {
      lib.UnLoadSeg();
      return emu.getRegister(0);
    },
  },
  {
    offset: -162,
    name: "DeviceProc",
    handler: (emu, lib: DosLibrary) => {
      lib.DeviceProc();
      return emu.getRegister(0);
    },
  },
  {
    offset: -180,
    name: "WaitForChar_180",
    handler: (emu, lib: DosLibrary) => {
      lib.WaitForChar();
      return emu.getRegister(0);
    },
  },
  {
    offset: -264,
    name: "VPrintf",
    handler: (emu, lib: DosLibrary) => {
      lib.VPrintf();
      return emu.getRegister(0);
    },
  },
  {
    offset: -390,
    name: "Fault",
    handler: (emu, lib: DosLibrary) => {
      lib.Fault();
      return emu.getRegister(0);
    },
  },
  {
    offset: -396,
    name: "PrintFault",
    handler: (emu, lib: DosLibrary) => {
      lib.PrintFault();
      return emu.getRegister(0);
    },
  },
  {
    offset: -516,
    name: "FGetC_516",
    handler: (emu, lib: DosLibrary) => {
      lib.FGetC();
      return emu.getRegister(0);
    },
  },
  {
    offset: -522,
    name: "FPutC_522",
    handler: (emu, lib: DosLibrary) => {
      lib.FPutC();
      return emu.getRegister(0);
    },
  },
  {
    offset: -534,
    name: "FRead_534",
    handler: (emu, lib: DosLibrary) => {
      lib.FRead();
      return emu.getRegister(0);
    },
  },
  {
    offset: -540,
    name: "FWrite_540",
    handler: (emu, lib: DosLibrary) => {
      lib.FWrite();
      return emu.getRegister(0);
    },
  },
  {
    offset: -546,
    name: "FGets_546",
    handler: (emu, lib: DosLibrary) => {
      lib.FGets();
      return emu.getRegister(0);
    },
  },
  {
    offset: -552,
    name: "FPuts_552",
    handler: (emu, lib: DosLibrary) => {
      lib.FPuts();
      return emu.getRegister(0);
    },
  },
  {
    offset: -564,
    name: "VFPrintf",
    handler: (emu, lib: DosLibrary) => {
      lib.VFPrintf();
      return emu.getRegister(0);
    },
  },
  {
    offset: -804,
    name: "ReadArgs_804",
    handler: (emu, lib: DosLibrary) => {
      lib.ReadArgs();
      return emu.getRegister(0);
    },
  },
  {
    offset: -810,
    name: "FreeArgs_810",
    handler: (emu, lib: DosLibrary) => {
      lib.FreeArgs();
      return emu.getRegister(0);
    },
  },
];

/**
 * Tag constants from <utility/tagitem.h>
 */
const TAG_DONE = 0;     // Terminates array, ti_Data unused
const TAG_IGNORE = 1;   // Ignore this item, not end of array
const TAG_MORE = 2;     // ti_Data is pointer to another array (terminates current)
const TAG_SKIP = 3;     // Skip this and the next ti_Data items
const TAG_USER = 0x80000000; // User tags start here

/**
 * Helper: Read a TagItem from memory
 * Returns { ti_Tag, ti_Data } or null if address is 0
 */
function readTagItem(emu: MoiraEmulator, addr: number): { ti_Tag: number; ti_Data: number } | null {
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
function nextTagItemImpl(emu: MoiraEmulator, tagItemPtrAddr: number): number {
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
function findTagItemImpl(emu: MoiraEmulator, tagValue: number, tagList: number): number {
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

/**
 * icon.library function vectors
 * Reference: NDK3.2R4/Include_I/lvo/icon_lib.i
 * LVO = Library Vector Offset (in bytes from library base)
 */
const ICON_VECTORS: LibraryVector[] = [
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

/**
 * utility.library function vectors
 * Reference: NDK3.2R4/Include_I/lvo/utility_lib.i
 * LVO = Library Vector Offset (in bytes from library base)
 */
const UTILITY_VECTORS: LibraryVector[] = [
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
      const objAddr = nextNamedObjectAddr;
      nextNamedObjectAddr += 32;

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

/**
 * mathffp.library function vectors (Fast Floating Point basic math)
 * LVO offsets from lvo/mathffp_lib.i
 */
const MATHFFP_VECTORS: LibraryVector[] = [
  { offset: -30, name: "SPFix", handler: (emu, lib: MathFFPLibrary) => lib.spFix() },
  { offset: -36, name: "SPFlt", handler: (emu, lib: MathFFPLibrary) => lib.spFlt() },
  { offset: -42, name: "SPCmp", handler: (emu, lib: MathFFPLibrary) => lib.spCmp() },
  { offset: -48, name: "SPTst", handler: (emu, lib: MathFFPLibrary) => lib.spTst() },
  { offset: -54, name: "SPAbs", handler: (emu, lib: MathFFPLibrary) => lib.spAbs() },
  { offset: -60, name: "SPNeg", handler: (emu, lib: MathFFPLibrary) => lib.spNeg() },
  { offset: -66, name: "SPAdd", handler: (emu, lib: MathFFPLibrary) => lib.spAdd() },
  { offset: -72, name: "SPSub", handler: (emu, lib: MathFFPLibrary) => lib.spSub() },
  { offset: -78, name: "SPMul", handler: (emu, lib: MathFFPLibrary) => lib.spMul() },
  { offset: -84, name: "SPDiv", handler: (emu, lib: MathFFPLibrary) => lib.spDiv() },
  { offset: -90, name: "SPFloor", handler: (emu, lib: MathFFPLibrary) => lib.spFloor() },
  { offset: -96, name: "SPCeil", handler: (emu, lib: MathFFPLibrary) => lib.spCeil() },
];

/**
 * mathtrans.library function vectors (transcendental math)
 * LVO offsets from lvo/mathtrans_lib.i
 */
const MATHTRANS_VECTORS: LibraryVector[] = [
  { offset: -30, name: "SPAtan", handler: (emu, lib: MathTransLibrary) => lib.spAtan() },
  { offset: -36, name: "SPSin", handler: (emu, lib: MathTransLibrary) => lib.spSin() },
  { offset: -42, name: "SPCos", handler: (emu, lib: MathTransLibrary) => lib.spCos() },
  { offset: -48, name: "SPTan", handler: (emu, lib: MathTransLibrary) => lib.spTan() },
  { offset: -54, name: "SPSincos", handler: (emu, lib: MathTransLibrary) => lib.spSincos() },
  { offset: -60, name: "SPSinh", handler: (emu, lib: MathTransLibrary) => lib.spSinh() },
  { offset: -66, name: "SPCosh", handler: (emu, lib: MathTransLibrary) => lib.spCosh() },
  { offset: -72, name: "SPTanh", handler: (emu, lib: MathTransLibrary) => lib.spTanh() },
  { offset: -78, name: "SPExp", handler: (emu, lib: MathTransLibrary) => lib.spExp() },
  { offset: -84, name: "SPLog", handler: (emu, lib: MathTransLibrary) => lib.spLog() },
  { offset: -90, name: "SPPow", handler: (emu, lib: MathTransLibrary) => lib.spPow() },
  { offset: -96, name: "SPSqrt", handler: (emu, lib: MathTransLibrary) => lib.spSqrt() },
  { offset: -102, name: "SPTieee", handler: (emu, lib: MathTransLibrary) => lib.spTieee() },
  { offset: -108, name: "SPFieee", handler: (emu, lib: MathTransLibrary) => lib.spFieee() },
  { offset: -114, name: "SPAsin", handler: (emu, lib: MathTransLibrary) => lib.spAsin() },
  { offset: -120, name: "SPAcos", handler: (emu, lib: MathTransLibrary) => lib.spAcos() },
  { offset: -126, name: "SPLog10", handler: (emu, lib: MathTransLibrary) => lib.spLog10() },
];

/**
 * mathieeedoubbas.library function vectors (IEEE double basic)
 * LVO offsets from lvo/mathieeedoubbas_lib.i
 */
const MATHIEEEDOUBBAS_VECTORS: LibraryVector[] = [
  { offset: -30, name: "IEEEDPFix", handler: (emu, lib: MathIEEEDoubBasLibrary) => lib.ieeeDpFix() },
  { offset: -36, name: "IEEEDPFlt", handler: (emu, lib: MathIEEEDoubBasLibrary) => lib.ieeeDpFlt() },
  { offset: -42, name: "IEEEDPCmp", handler: (emu, lib: MathIEEEDoubBasLibrary) => lib.ieeeDpCmp() },
  { offset: -48, name: "IEEEDPTst", handler: (emu, lib: MathIEEEDoubBasLibrary) => lib.ieeeDpTst() },
  { offset: -54, name: "IEEEDPAbs", handler: (emu, lib: MathIEEEDoubBasLibrary) => lib.ieeeDpAbs() },
  { offset: -60, name: "IEEEDPNeg", handler: (emu, lib: MathIEEEDoubBasLibrary) => lib.ieeeDpNeg() },
  { offset: -66, name: "IEEEDPAdd", handler: (emu, lib: MathIEEEDoubBasLibrary) => lib.ieeeDpAdd() },
  { offset: -72, name: "IEEEDPSub", handler: (emu, lib: MathIEEEDoubBasLibrary) => lib.ieeeDpSub() },
  { offset: -78, name: "IEEEDPMul", handler: (emu, lib: MathIEEEDoubBasLibrary) => lib.ieeeDpMul() },
  { offset: -84, name: "IEEEDPDiv", handler: (emu, lib: MathIEEEDoubBasLibrary) => lib.ieeeDpDiv() },
  { offset: -90, name: "IEEEDPFloor", handler: (emu, lib: MathIEEEDoubBasLibrary) => lib.ieeeDpFloor() },
  { offset: -96, name: "IEEEDPCeil", handler: (emu, lib: MathIEEEDoubBasLibrary) => lib.ieeeDpCeil() },
];

/**
 * mathieeedoubtrans.library function vectors (IEEE double transcendental)
 * LVO offsets from lvo/mathieeedoubtrans_lib.i
 */
const MATHIEEEDOUBTRANS_VECTORS: LibraryVector[] = [
  { offset: -30, name: "IEEEDPAtan", handler: (emu, lib: MathIEEEDoubTransLibrary) => lib.ieeeDpAtan() },
  { offset: -36, name: "IEEEDPSin", handler: (emu, lib: MathIEEEDoubTransLibrary) => lib.ieeeDpSin() },
  { offset: -42, name: "IEEEDPCos", handler: (emu, lib: MathIEEEDoubTransLibrary) => lib.ieeeDpCos() },
  { offset: -48, name: "IEEEDPTan", handler: (emu, lib: MathIEEEDoubTransLibrary) => lib.ieeeDpTan() },
  { offset: -54, name: "IEEEDPSincos", handler: (emu, lib: MathIEEEDoubTransLibrary) => lib.ieeeDpSincos() },
  { offset: -60, name: "IEEEDPSinh", handler: (emu, lib: MathIEEEDoubTransLibrary) => lib.ieeeDpSinh() },
  { offset: -66, name: "IEEEDPCosh", handler: (emu, lib: MathIEEEDoubTransLibrary) => lib.ieeeDpCosh() },
  { offset: -72, name: "IEEEDPTanh", handler: (emu, lib: MathIEEEDoubTransLibrary) => lib.ieeeDpTanh() },
  { offset: -78, name: "IEEEDPExp", handler: (emu, lib: MathIEEEDoubTransLibrary) => lib.ieeeDpExp() },
  { offset: -84, name: "IEEEDPLog", handler: (emu, lib: MathIEEEDoubTransLibrary) => lib.ieeeDpLog() },
  { offset: -90, name: "IEEEDPPow", handler: (emu, lib: MathIEEEDoubTransLibrary) => lib.ieeeDpPow() },
  { offset: -96, name: "IEEEDPSqrt", handler: (emu, lib: MathIEEEDoubTransLibrary) => lib.ieeeDpSqrt() },
  { offset: -102, name: "IEEEDPTieee", handler: (emu, lib: MathIEEEDoubTransLibrary) => lib.ieeeDpTieee() },
  { offset: -108, name: "IEEEDPFieee", handler: (emu, lib: MathIEEEDoubTransLibrary) => lib.ieeeDpFieee() },
  { offset: -114, name: "IEEEDPAsin", handler: (emu, lib: MathIEEEDoubTransLibrary) => lib.ieeeDpAsin() },
  { offset: -120, name: "IEEEDPAcos", handler: (emu, lib: MathIEEEDoubTransLibrary) => lib.ieeeDpAcos() },
  { offset: -126, name: "IEEEDPLog10", handler: (emu, lib: MathIEEEDoubTransLibrary) => lib.ieeeDpLog10() },
];

/**
 * mathieeesingbas.library function vectors (IEEE single basic)
 * LVO offsets from lvo/mathieeesingbas_lib.i
 */
const MATHIEEESINGBAS_VECTORS: LibraryVector[] = [
  { offset: -30, name: "IEEESPFix", handler: (emu, lib: MathIEEESingBasLibrary) => lib.ieeeSPFix() },
  { offset: -36, name: "IEEESPFlt", handler: (emu, lib: MathIEEESingBasLibrary) => lib.ieeeSPFlt() },
  { offset: -42, name: "IEEESPCmp", handler: (emu, lib: MathIEEESingBasLibrary) => lib.ieeeSPCmp() },
  { offset: -48, name: "IEEESPTst", handler: (emu, lib: MathIEEESingBasLibrary) => lib.ieeeSPTst() },
  { offset: -54, name: "IEEESPAbs", handler: (emu, lib: MathIEEESingBasLibrary) => lib.ieeeSPAbs() },
  { offset: -60, name: "IEEESPNeg", handler: (emu, lib: MathIEEESingBasLibrary) => lib.ieeeSPNeg() },
  { offset: -66, name: "IEEESPAdd", handler: (emu, lib: MathIEEESingBasLibrary) => lib.ieeeSPAdd() },
  { offset: -72, name: "IEEESPSub", handler: (emu, lib: MathIEEESingBasLibrary) => lib.ieeeSPSub() },
  { offset: -78, name: "IEEESPMul", handler: (emu, lib: MathIEEESingBasLibrary) => lib.ieeeSPMul() },
  { offset: -84, name: "IEEESPDiv", handler: (emu, lib: MathIEEESingBasLibrary) => lib.ieeeSPDiv() },
  { offset: -90, name: "IEEESPFloor", handler: (emu, lib: MathIEEESingBasLibrary) => lib.ieeeSPFloor() },
  { offset: -96, name: "IEEESPCeil", handler: (emu, lib: MathIEEESingBasLibrary) => lib.ieeeSPCeil() },
];

/**
 * mathieeesingtrans.library function vectors (IEEE single transcendental)
 * LVO offsets from lvo/mathieeesingtrans_lib.i
 */
const MATHIEEESINGTRANS_VECTORS: LibraryVector[] = [
  { offset: -30, name: "IEEESPAtan", handler: (emu, lib: MathIEEESingTransLibrary) => lib.ieeeSPAtan() },
  { offset: -36, name: "IEEESPSin", handler: (emu, lib: MathIEEESingTransLibrary) => lib.ieeeSPSin() },
  { offset: -42, name: "IEEESPCos", handler: (emu, lib: MathIEEESingTransLibrary) => lib.ieeeSPCos() },
  { offset: -48, name: "IEEESPTan", handler: (emu, lib: MathIEEESingTransLibrary) => lib.ieeeSPTan() },
  { offset: -54, name: "IEEESPSincos", handler: (emu, lib: MathIEEESingTransLibrary) => lib.ieeeSPSincos() },
  { offset: -60, name: "IEEESPSinh", handler: (emu, lib: MathIEEESingTransLibrary) => lib.ieeeSPSinh() },
  { offset: -66, name: "IEEESPCosh", handler: (emu, lib: MathIEEESingTransLibrary) => lib.ieeeSPCosh() },
  { offset: -72, name: "IEEESPTanh", handler: (emu, lib: MathIEEESingTransLibrary) => lib.ieeeSPTanh() },
  { offset: -78, name: "IEEESPExp", handler: (emu, lib: MathIEEESingTransLibrary) => lib.ieeeSPExp() },
  { offset: -84, name: "IEEESPLog", handler: (emu, lib: MathIEEESingTransLibrary) => lib.ieeeSPLog() },
  { offset: -90, name: "IEEESPPow", handler: (emu, lib: MathIEEESingTransLibrary) => lib.ieeeSPPow() },
  { offset: -96, name: "IEEESPSqrt", handler: (emu, lib: MathIEEESingTransLibrary) => lib.ieeeSPSqrt() },
  { offset: -102, name: "IEEESPTieee", handler: (emu, lib: MathIEEESingTransLibrary) => lib.ieeeSPTieee() },
  { offset: -108, name: "IEEESPFieee", handler: (emu, lib: MathIEEESingTransLibrary) => lib.ieeeSPFieee() },
  { offset: -114, name: "IEEESPAsin", handler: (emu, lib: MathIEEESingTransLibrary) => lib.ieeeSPAsin() },
  { offset: -120, name: "IEEESPAcos", handler: (emu, lib: MathIEEESingTransLibrary) => lib.ieeeSPAcos() },
  { offset: -126, name: "IEEESPLog10", handler: (emu, lib: MathIEEESingTransLibrary) => lib.ieeeSPLog10() },
];

/**
 * Intuition.library function vectors
 * Reference: Amiga ROM Kernel Reference Manual & intuition.library FD file
 * LVO = Library Vector Offset (in bytes from library base)
 *
 * These are stub implementations since we don't have a real Amiga GUI,
 * but doors may still call these functions.
 */
const INTUITION_VECTORS: LibraryVector[] = [
  {
    offset: -72, // LVO -72 CloseWindow
    name: "CloseWindow",
    handler: (emu, lib: IntuitionLibrary) => {
      lib.CloseWindow();
      return emu.getRegister(0); // Return D0
    },
  },
  {
    offset: -78, // LVO -78 CloseScreen
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
    offset: -282, // LVO -282 RefreshGadgets
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
    offset: -438, // LVO -438 OpenWorkBench
    name: "OpenWorkBench",
    handler: (emu, lib: IntuitionLibrary) => {
      lib.OpenWorkBench();
      return emu.getRegister(0); // Return D0 (screen handle)
    },
  },
];

/**
 * Exec.library function vectors
 * Reference: Amiga ROM Kernel Reference Manual & exec.library FD file
 * LVO = Library Vector Offset (in bytes from library base)
 */
const EXEC_VECTORS: LibraryVector[] = [
  {
    offset: -552, // LVO -552 (0xFDD8)
    name: "OpenLibrary",
    handler: (emu, lib: ExecLibrary) => {
      const nameAddr = emu.getRegister(9); // A1
      const version = emu.getRegister(0); // D0
      return lib.openLibrary(nameAddr, version);
    },
  },
  {
    offset: -414, // LVO -414 (0xFE62)
    name: "CloseLibrary",
    handler: (emu, lib: ExecLibrary) => {
      const libAddr = emu.getRegister(9); // A1
      lib.closeLibrary(libAddr);
      return 0; // No return value
    },
  },
  {
    offset: -522, // RawDoFmt
    name: "RawDoFmt",
    handler: (emu, lib: ExecLibrary) => {
      return lib.rawDoFmt();
    },
  },
  {
    offset: -132, // LVO -132 (0xFF7C)
    name: "Forbid",
    handler: (emu, lib: ExecLibrary) => {
      console.log("[ExecLibrary] Forbid() - stub (no-op)");
      // Preserve D0/condition flags; Forbid has no return value
      return emu.getRegister(0);
    },
  },
  {
    offset: -138, // LVO -138 (0xFF76)
    name: "Permit",
    handler: (emu, lib: ExecLibrary) => {
      console.log("[ExecLibrary] Permit() - stub (no-op)");
      return emu.getRegister(0);
    },
  },
  {
    offset: -198, // LVO -198 (0xFF3A)
    name: "AllocMem",
    handler: (emu, lib: ExecLibrary) => {
      const size = emu.getRegister(0); // D0
      const flags = emu.getRegister(1); // D1
      return lib.allocMem(size, flags);
    },
  },
  {
    offset: -210, // LVO -210 (0xFF2E)
    name: "FreeMem",
    handler: (emu, lib: ExecLibrary, returnAddr?: number) => {
      const memAddr = emu.getRegister(9); // A1
      const size = emu.getRegister(0); // D0
      lib.freeMem(memAddr, size);
      // When the door tears down its heap and returns to the CLI stub (PC around 0x119a),
      // make sure the stack top holds the original seglist return so the final RTS
      // does not jump into random data.
      if (returnAddr === 0x119a) {
        const spAfterPop = emu.getRegister(15);
        const exitTrapAddr = 0x1ff000;
        emu.writeMemory32(spAfterPop, exitTrapAddr);
        console.log(
          `[ExecLibrary] FreeMem exit fix: seeded exit trap 0x${exitTrapAddr.toString(
            16
          )} at SP=0x${spAfterPop.toString(16)}`
        );
      }
      return 0;
    },
  },
  {
    offset: -294, // LVO -294 (0xFED6)
    name: "FindTask",
    handler: (emu, lib: ExecLibrary) => {
      const nameAddr = emu.getRegister(9); // A1
      return lib.findTask(nameAddr);
    },
  },
  {
    offset: -300, // LVO -300 (SetTaskPri - CORRECTED offset)
    name: "SetTaskPri",
    handler: (emu, lib: ExecLibrary) => {
      const taskAddr = emu.getRegister(9); // A1
      const newPri = emu.getRegister(0); // D0
      return lib.setTaskPri(taskAddr, newPri);
    },
  },
  {
    offset: -306, // LVO -306 (SetSignal)
    name: "SetSignal",
    handler: (emu, lib: ExecLibrary) => {
      const newSignals = emu.getRegister(0); // D0
      const signalMask = emu.getRegister(1); // D1
      return lib.setSignal(newSignals, signalMask);
    },
  },
  {
    offset: -390, // LVO -390 (0xFFFFFE7A)
    name: "FindPort",
    handler: (emu, lib: ExecLibrary) => {
      const nameAddr = emu.getRegister(9); // A1
      return lib.findPort(nameAddr);
    },
  },
  {
    offset: -366, // LVO -366 (0xFFFFFE72)
    name: "PutMsg",
    handler: (emu, lib: ExecLibrary) => {
      const portAddr = emu.getRegister(8); // A0
      const msgAddr = emu.getRegister(9); // A1
      lib.putMsg(portAddr, msgAddr);
      return 0;
    },
  },
  {
    offset: -372, // LVO -372 (0xFFFFFE6C)
    name: "GetMsg",
    handler: (emu, lib: ExecLibrary) => {
      const portAddr = emu.getRegister(8); // A0
      const portName = portAddr ? lib.getPortName(portAddr) : "";
      console.log(
        `[ExecLibrary][Trap][GetMsg] port=0x${portAddr.toString(
          16
        )} name=${portName}`
      );
      return lib.getMsg(portAddr);
    },
  },
  {
    offset: -318, // LVO -318 (0xFFFFFEC2)
    name: "Wait",
    handler: (emu, lib: ExecLibrary) => {
      const signalMask = emu.getRegister(0); // D0
      return lib.wait(signalMask);
    },
  },
  {
    offset: -324, // LVO -324 (0xFFFFFEBC)
    name: "Signal",
    handler: (emu, lib: ExecLibrary) => {
      const taskAddr = emu.getRegister(9); // A1
      const signals = emu.getRegister(0); // D0
      lib.signal(taskAddr, signals);
      return 0;
    },
  },
  {
    offset: -30, // LVO -30 (0xFFFFFFE2)
    name: "Supervisor",
    handler: (emu: any, lib: any, returnAddr: any) => {
      // Supervisor() - Execute a function in supervisor mode
      // Input: A5 = function pointer to execute
      // The function is called with return address on stack
      // Returns: D0 = result from supervisor function

      const a5 = emu.getRegister(13); // A5 - supervisor function pointer
      console.log(
        `[LibraryTraps] Supervisor: calling function at 0x${a5.toString(
          16
        )}, returnAddr=0x${returnAddr.toString(16)}`
      );

      // Set PC to the supervisor function address
      // The function will execute and eventually RTS back to returnAddr
      emu.setRegister(16, a5); // PC = supervisor function
      emu.refillPrefetch(); // CRITICAL: Refill prefetch after changing PC

      // CRITICAL: Do NOT push return address - it's already on stack from JSR to Supervisor
      // The supervisor function will RTS to returnAddr (which handleTrap already popped)
      // So we need to push returnAddr back for the supervisor function to RTS to
      const sp = emu.getRegister(15);
      emu.writeMemory32(sp - 4, returnAddr);
      emu.setRegister(15, sp - 4);

      console.log(
        `[LibraryTraps] Supervisor: PC set to 0x${a5.toString(
          16
        )}, return will go to 0x${returnAddr.toString(16)}`
      );

      // Return 0 - actual return value will come from supervisor function via D0
      return 0;
    },
  },
  {
    offset: -330, // LVO -330 (0xFFFFFEB6)
    name: "AllocSignal",
    handler: (emu, lib: ExecLibrary) => {
      const signalNum = emu.getRegister(0); // D0 (signed byte, -1 = any free signal)
      const result = lib.AllocSignal(signalNum);
      return result; // Return signal number or -1 in D0
    },
  },
  {
    offset: -354, // LVO -354 (0xFFFFFE9E)
    name: "AddPort",
    handler: (emu, lib: ExecLibrary) => {
      const portAddr = emu.getRegister(9); // A1 - port pointer
      lib.addPort(portAddr);
      return 0; // AddPort has no return value
    },
  },
  {
    offset: -378, // LVO -378 (0xFFFFFE86)
    name: "ReplyMsg",
    handler: (emu, lib: ExecLibrary) => {
      const msgAddr = emu.getRegister(9); // A1
      lib.replyMsg(msgAddr);
      return 0;
    },
  },
  {
    offset: -384, // LVO -384 (0xFFFFFE80)
    name: "WaitPort",
    handler: (emu, lib: ExecLibrary) => {
      const portAddr = emu.getRegister(8); // A0
      const portName = portAddr ? lib.getPortName(portAddr) : "";
      console.log(
        `[ExecLibrary][Trap][WaitPort] port=0x${portAddr.toString(
          16
        )} name=${portName}`
      );
      return lib.waitPort(portAddr);
    },
  },
  {
    offset: -666, // LVO -666 (0xFFFFFD66)
    name: "CreateMsgPort",
    handler: (emu, lib: ExecLibrary) => {
      return lib.createMsgPort();
    },
  },
  {
    offset: -672, // LVO -672 (0xFFFFFD60)
    name: "DeleteMsgPort",
    handler: (emu, lib: ExecLibrary) => {
      const portAddr = emu.getRegister(8); // A0
      lib.deleteMsgPort(portAddr);
      return 0;
    },
  },
  {
    offset: -684, // LVO -684 (0xFFFFFD4C)
    name: "AllocVec",
    handler: (emu, lib: ExecLibrary) => {
      const byteSize = emu.getRegister(0); // D0
      const requirements = emu.getRegister(1); // D1
      console.log(
        `[ExecLibrary] AllocVec(${byteSize}, ${requirements}) - using AllocMem`
      );
      return lib.allocMem(byteSize, requirements);
    },
  },
  {
    offset: -690, // LVO -690 (0xFFFFFD46)
    name: "FreeVec",
    handler: (emu, lib: ExecLibrary) => {
      const memPtr = emu.getRegister(9); // A1
      const size = emu.getRegister(0); // D0
      console.log(`[ExecLibrary] FreeVec(0x${memPtr.toString(16)}, ${size})`);
      lib.freeMem(memPtr, size);
      return 0;
    },
  },
  {
    offset: -696, // LVO -696 (0xFFFFFD40)
    name: "CreatePool",
    handler: (emu, lib: ExecLibrary) => {
      const requirements = emu.getRegister(0); // D0
      const puddleSize = emu.getRegister(1); // D1
      const threshSize = emu.getRegister(2); // D2
      console.log(
        `[ExecLibrary] CreatePool(${requirements}, ${puddleSize}, ${threshSize}) - REAL IMPLEMENTATION`
      );

      // Allocate PoolHeader structure (minimum 32 bytes)
      const poolSize = Math.max(puddleSize, 32);
      const poolAddr = lib.allocMem(poolSize, requirements);

      if (poolAddr !== 0) {
        // Initialize PoolHeader structure
        // This is a simplified AmigaOS PoolHeader structure
        console.log(
          `[ExecLibrary] Created pool at 0x${poolAddr.toString(
            16
          )}, size ${puddleSize}`
        );

        // Store pool parameters for later use by AllocPooled/FreePooled
        // We'll use the emulator's memory to track pool info
        const poolInfoAddr = poolAddr + 0x20; // Use space after header for our data
        emu.writeMemory32(poolInfoAddr + 0, puddleSize); // puddleSize
        emu.writeMemory32(poolInfoAddr + 4, threshSize); // threshSize
        emu.writeMemory32(poolInfoAddr + 8, requirements); // requirements
        emu.writeMemory32(poolInfoAddr + 12, poolAddr + 32); // available memory start
        emu.writeMemory32(poolInfoAddr + 16, poolAddr + poolSize); // available memory end
      } else {
        console.log(`[ExecLibrary] CreatePool FAILED - returned NULL`);
      }

      return poolAddr;
    },
  },
  {
    offset: -702, // LVO -702 (0xFFFFFD3A)
    name: "DeletePool",
    handler: (emu, lib: ExecLibrary) => {
      const pool = emu.getRegister(9); // A1
      console.log(`[ExecLibrary] DeletePool(0x${pool.toString(16)})`);
      if (pool !== 0) {
        // For now, just log - actual implementation would free all pool allocations
        console.log(
          `[ExecLibrary] Pool 0x${pool.toString(16)} marked for deletion`
        );
      }
      return 0;
    },
  },
  {
    offset: -708, // LVO -708 (0xFFFFFD34)
    name: "AllocPooled",
    handler: (emu, lib: ExecLibrary) => {
      const pool = emu.getRegister(9); // A1
      const size = emu.getRegister(0); // D0
      console.log(
        `[ExecLibrary] AllocPooled(0x${pool.toString(
          16
        )}, ${size}) - REAL IMPLEMENTATION`
      );

      if (pool === 0) {
        console.log(`[ExecLibrary] AllocPooled FAILED - NULL pool pointer`);
        return 0;
      }

      // Check if allocation size is reasonable
      if (size > 0x1000) {
        console.log(
          `[ExecLibrary] AllocPooled - Large allocation ${size}, may fail`
        );
      }

      // Allocate memory using our pool management
      const allocation = lib.allocMem(size, 0x10001); // MEMF_PUBLIC | MEMF_CLEAR
      console.log(
        `[ExecLibrary] AllocPooled allocated 0x${allocation.toString(
          16
        )} from pool 0x${pool.toString(16)}`
      );

      return allocation; // Return valid memory address, NOT NULL!
    },
  },
  {
    offset: -714, // LVO -714 (0xFFFFFD2E)
    name: "FreePooled",
    handler: (emu, lib: ExecLibrary) => {
      const pool = emu.getRegister(9); // A1
      const mem = emu.getRegister(0); // D0
      const size = emu.getRegister(1); // D1
      console.log(
        `[ExecLibrary] FreePooled(0x${pool.toString(16)}, 0x${mem.toString(
          16
        )}, ${size})`
      );

      if (mem !== 0) {
        lib.freeMem(mem, size);
        console.log(
          `[ExecLibrary] Freed memory at 0x${mem.toString(
            16
          )} back to pool 0x${pool.toString(16)}`
        );
      }
      return 0;
    },
  },
  {
    offset: -732, // LVO -732 (0xFFFFFD28)
    name: "StackSwap",
    handler: (emu, lib: ExecLibrary) => {
      const structAddr = emu.getRegister(8); // A0
      try {
        const oldSP = emu.getRegister(15);
        const ln = emu.readMemory32(structAddr); // ln_Succ
        const stNew = emu.readMemory32(structAddr + 4); // stk_Lower
        const stUpper = emu.readMemory32(structAddr + 8); // stk_Upper
        const stSP = emu.readMemory32(structAddr + 12); // stk_Pointer
        console.log(
          `[StackSwap] struct=0x${structAddr.toString(
            16
          )} ln=0x${ln.toString(16)} lower=0x${stNew.toString(
            16
          )} upper=0x${stUpper.toString(16)} newSP=0x${stSP.toString(
            16
          )} oldSP=0x${oldSP.toString(16)}`
        );
      } catch (err) {
        console.log(`[StackSwap] failed to read struct at 0x${structAddr.toString(16)}`);
      }
      lib.stackSwap(structAddr);
      return 0;
    },
  },
];

/**
 * Library trap handler
 *
 * Manages interception of library calls via ILLEGAL instructions
 * placed at library vector addresses.
 */
export class LibraryTraps {
  private emulator: MoiraEmulator;
  private execLibrary: ExecLibrary;
  private aedoorLibrary: AEDoorLibrary | null = null;
  private dosLibrary: DosLibrary | null = null;
  private iconLibrary: IconLibrary | null = null;
  private utilityLibrary: UtilityLibrary | null = null;
  private mathFFPLibrary: MathFFPLibrary | null = null;
  private mathTransLibrary: MathTransLibrary | null = null;
  private mathIEEEDoubBasLibrary: MathIEEEDoubBasLibrary | null = null;
  private mathIEEEDoubTransLibrary: MathIEEEDoubTransLibrary | null = null;
  private mathIEEESingBasLibrary: MathIEEESingBasLibrary | null = null;
  private mathIEEESingTransLibrary: MathIEEESingTransLibrary | null = null;
  private intuitionLibrary: IntuitionLibrary | null = null;

  // Map of trap address -> vector entry
  private trapMap: Map<number, LibraryVector> = new Map();

  // Map of trap address -> library instance
  private libraryMap: Map<number, any> = new Map();

  // NEW: Map of offset -> array of vector entries (for offset-based trap detection)
  // Multiple libraries can use the same offset (e.g., -30 for Supervisor in Exec, Open in DOS)
  private offsetMap: Map<number, LibraryVector[]> = new Map();

  // NEW: Map of offset -> array of library instances (parallel to offsetMap)
  private offsetLibraryMap: Map<number, any[]> = new Map();

  // Optional callback for monitoring library calls
  private onLibraryCall?: (functionName: string, pc: number) => void;

  // Parsed offsets from dev/docs/LVOs.i (libName -> offsets)
  private lvoOffsetsByLibrary: Map<string, number[]> = new Map();

  /**
   * Helper to identify which library a trap belongs to for logging
   */
  private getLibraryName(library: any): string {
    if (!library) {
      return "unknown";
    }
    if (library === this.execLibrary) {
      return "exec.library";
    }
    if (library === this.dosLibrary) {
      return "dos.library";
    }
    if (library === this.aedoorLibrary) {
      return "AEDoor.library";
    }
    if (library === this.iconLibrary) {
      return "icon.library";
    }
    if (library === this.utilityLibrary) {
      return "utility.library";
    }
    if (library === this.mathFFPLibrary) {
      return "mathffp.library";
    }
    if (library === this.mathTransLibrary) {
      return "mathtrans.library";
    }
    if (library === this.mathIEEEDoubBasLibrary) {
      return "mathieeedoubbas.library";
    }
    if (library === this.mathIEEEDoubTransLibrary) {
      return "mathieeedoubtrans.library";
    }
    if (library === this.mathIEEESingBasLibrary) {
      return "mathieeesingbas.library";
    }
    if (library === this.mathIEEESingTransLibrary) {
      return "mathieeesingtrans.library";
    }
    if (library === this.intuitionLibrary) {
      return "intuition.library";
    }
    if ((library as any).libraryName) {
      return (library as any).libraryName;
    }
    return "unknown";
  }

  constructor(emulator: MoiraEmulator, execLibrary: ExecLibrary) {
    this.emulator = emulator;
    this.execLibrary = execLibrary;
    this.loadLvoOffsetsFromFile();
  }

  /**
   * Set callback for monitoring library calls
   */
  setLibraryCallMonitor(
    callback: (functionName: string, pc: number) => void
  ): void {
    this.onLibraryCall = callback;
  }

  /**
   * Set the AEDoor.library instance
   */
  setAEDoorLibrary(lib: AEDoorLibrary): void {
    this.aedoorLibrary = lib;
  }

  /**
   * Set the DOS.library instance
   */
  setDOSLibrary(lib: DosLibrary): void {
    this.dosLibrary = lib;
  }

  /**
   * Set the icon.library instance
   */
  setIconLibrary(lib: IconLibrary): void {
    this.iconLibrary = lib;
  }

  /**
   * Set the utility.library instance
   */
  setUtilityLibrary(lib: UtilityLibrary): void {
    this.utilityLibrary = lib;
  }

  /**
   * Set the mathffp.library instance
   */
  setMathFFPLibrary(lib: MathFFPLibrary): void {
    this.mathFFPLibrary = lib;
  }

  /**
   * Set the mathtrans.library instance
   */
  setMathTransLibrary(lib: MathTransLibrary): void {
    this.mathTransLibrary = lib;
  }

  /**
   * Set the mathieeedoubbas.library instance
   */
  setMathIEEEDoubBasLibrary(lib: MathIEEEDoubBasLibrary): void {
    this.mathIEEEDoubBasLibrary = lib;
  }

  /**
   * Set the mathieeedoubtrans.library instance
   */
  setMathIEEEDoubTransLibrary(lib: MathIEEEDoubTransLibrary): void {
    this.mathIEEEDoubTransLibrary = lib;
  }

  /**
   * Set the mathieeesingbas.library instance
   */
  setMathIEEESingBasLibrary(lib: MathIEEESingBasLibrary): void {
    this.mathIEEESingBasLibrary = lib;
  }

  /**
   * Set the mathieeesingtrans.library instance
   */
  setMathIEEESingTransLibrary(lib: MathIEEESingTransLibrary): void {
    this.mathIEEESingTransLibrary = lib;
  }

  /**
   * Set the intuition.library instance
   */
  setIntuitionLibrary(lib: IntuitionLibrary): void {
    this.intuitionLibrary = lib;
  }

  /**
   * Register a custom trap handler at a specific address
   *
   * Used for non-library traps like BBS API dispatcher at 0x790
   *
   * @param address - Memory address where trap will be triggered
   * @param name - Descriptive name for the trap
   * @param handler - Function to call when trap is triggered
   * @param library - Optional library instance for context
   */
  registerCustomTrap(
    address: number,
    name: string,
    handler: (emu: MoiraEmulator) => number,
    library?: any
  ): void {
    const vector: LibraryVector = {
      offset: 0, // Not used for custom traps
      name: name,
      handler: handler,
    };

    this.trapMap.set(address, vector);
    if (library) {
      this.libraryMap.set(address, library);
    }

    console.log(
      `[LibraryTraps] Registered custom trap '${name}' at 0x${address.toString(16)}`
    );
  }

  /**
   * Verify all installed ILLEGAL instructions are still in place.
   * Returns the number of verified traps and any that failed.
   */
  verifyIllegalInstructions(): { verified: number; failed: number; failedAddrs: number[] } {
    let verified = 0;
    let failed = 0;
    const failedAddrs: number[] = [];

    for (const [addr] of this.trapMap) {
      try {
        const opcode = this.emulator.readMemory16(addr);
        if (opcode === 0x4AFC) {
          verified++;
        } else {
          failed++;
          failedAddrs.push(addr);
          console.error(
            `[LibraryTraps] VERIFICATION FAILED at 0x${addr.toString(16)}: expected 0x4AFC, got 0x${opcode.toString(16)}`
          );
        }
      } catch (e) {
        failed++;
        failedAddrs.push(addr);
        console.error(
          `[LibraryTraps] VERIFICATION ERROR at 0x${addr.toString(16)}: ${e}`
        );
      }
    }

    if (failed > 0) {
      console.error(
        `[LibraryTraps] VERIFICATION: ${verified} OK, ${failed} FAILED!`
      );
    } else {
      console.log(
        `[LibraryTraps] VERIFICATION: All ${verified} ILLEGAL instructions verified OK`
      );
    }

    return { verified, failed, failedAddrs };
  }

  /**
   * Install trap vectors for a library
   *
   * Writes ILLEGAL instruction (0x4AFC) at each vector address.
   * When door calls JSR -offset(A6), it hits ILLEGAL and we intercept.
   */
  installExecVectors(): void {
    const execBase = this.execLibrary.getExecBaseAddress();
    console.log(
      `[LibraryTraps] Installing Exec.library vectors at base 0x${execBase.toString(
        16
      )}`
    );

    for (const vector of EXEC_VECTORS) {
      const trapAddr = execBase + vector.offset;

      // CRITICAL FIX: Write ILLEGAL instruction at vector address!
      // This is how we intercept library calls - when door does JSR -offset(A6),
      // it jumps to trapAddr which contains ILLEGAL, triggering our handler.
      this.emulator.writeMemory16(trapAddr, 0x4AFC);

      // Verify the write succeeded
      const verify = this.emulator.readMemory16(trapAddr);
      if (verify !== 0x4AFC) {
        console.error(`[LibraryTraps] FAILED to write ILLEGAL at 0x${trapAddr.toString(16)}: got 0x${verify.toString(16)}`);
      }

      // Store mapping of address to handler
      this.trapMap.set(trapAddr, vector);
      this.libraryMap.set(trapAddr, this.execLibrary);

      // NEW: Also store mapping by offset (array-based to handle collisions)
      if (!this.offsetMap.has(vector.offset)) {
        this.offsetMap.set(vector.offset, []);
        this.offsetLibraryMap.set(vector.offset, []);
      }
      this.offsetMap.get(vector.offset)!.push(vector);
      this.offsetLibraryMap.get(vector.offset)!.push(this.execLibrary);

      const name =
        vector.name ||
        EXEC_LVO_MAP[vector.offset] ||
        `exec@${vector.offset.toString(16)}`;
      console.log(
        `  [${name}] Vector at 0x${trapAddr.toString(16)} (offset ${
          vector.offset
        })`
      );
    }

    console.log(
      `[LibraryTraps] Installed ${EXEC_VECTORS.length} Exec.library vectors`
    );

    // Stub any remaining Exec LVOs from LVOs.i so unknown calls fail gracefully
    this.installStubVectorsForLibrary(
      "exec.library",
      execBase,
      this.execLibrary
    );
  }

  /**
   * Install DOS.library vectors
   */
  installDOSVectors(): void {
    if (!this.dosLibrary) {
      console.error(
        "[LibraryTraps] Cannot install DOS vectors: library not set"
      );
      return;
    }

    const dosBase = this.execLibrary.getLibraryBase("dos.library");
    if (dosBase === 0) {
      console.error(
        "[LibraryTraps] Cannot install DOS vectors: library not opened"
      );
      return;
    }

    console.log(
      `[LibraryTraps] Installing dos.library vectors at base 0x${dosBase.toString(
        16
      )}`
    );

    for (const vector of DOS_VECTORS) {
      const trapAddr = dosBase + vector.offset;

      // CRITICAL FIX: Write ILLEGAL instruction at vector address!
      this.emulator.writeMemory16(trapAddr, 0x4AFC);

      // Store mapping of address to handler
      this.trapMap.set(trapAddr, vector);
      this.libraryMap.set(trapAddr, this.dosLibrary);

      // NEW: Also store mapping by offset (array-based to handle collisions)
      if (!this.offsetMap.has(vector.offset)) {
        this.offsetMap.set(vector.offset, []);
        this.offsetLibraryMap.set(vector.offset, []);
      }
      this.offsetMap.get(vector.offset)!.push(vector);
      this.offsetLibraryMap.get(vector.offset)!.push(this.dosLibrary);

      const name =
        vector.name ||
        DOS_LVO_MAP[vector.offset] ||
        `dos@${vector.offset.toString(16)}`;
      console.log(
        `  [${name}] Vector at 0x${trapAddr.toString(16)} (offset ${
          vector.offset
        })`
      );
    }

    console.log(
      `[LibraryTraps] Installed ${DOS_VECTORS.length} dos.library vectors`
    );

    this.installStubVectorsForLibrary("dos.library", dosBase, this.dosLibrary);
  }

  /**
   * Install AEDoor.library vectors - DISABLED (2025-12-16)
   *
   * ARCHITECTURAL FIX:
   * Use the REAL native AEDoor.library binary for ALL functions.
   * Do NOT trap any AEDoor functions - let the native binary execute.
   *
   * The native binary correctly creates DIFace structures and handles
   * all door communication via XIM protocol (PutMsg/GetMsg to AEDoorPort).
   *
   * The native library's jump table is set up by ExecLibrary.loadRealAEDoorLibrary()
   * which creates JMP instructions at negative offsets pointing to the actual
   * function code in the loaded library binary.
   *
   * See: Documentation/7-Reference Sources/disasm/aedoor_library_disasm.asm
   */
  installAEDoorVectors(): void {
    const aedoorBase = this.execLibrary.getLibraryBase("AEDoor.library");

    console.log(
      `[LibraryTraps] ============================================`
    );
    console.log(
      `[LibraryTraps] AEDoor.library vectors: NATIVE MODE (no traps)`
    );
    console.log(
      `[LibraryTraps] Base address: 0x${aedoorBase.toString(16)}`
    );
    console.log(
      `[LibraryTraps] JMP table created by ExecLibrary.loadRealAEDoorLibrary()`
    );
    console.log(
      `[LibraryTraps] Native 68K code will execute for all AEDoor calls`
    );
    console.log(
      `[LibraryTraps] ============================================`
    );

    // DO NOT install traps - let native library code execute!
    // The JMP table is set up by ExecLibrary.loadRealAEDoorLibrary()
    // which points to the actual function code in the loaded binary.
    //
    // Native library uses XIM protocol:
    // - CreateComm: FindPort("AEDoorPort"), creates reply port, sends INIT
    // - WriteStr: Copies text to buffer, sends JH_SM (cmd=4) via PutMsg
    // - Backend polls AEDoorPort with GetMsg, routes messages to XIMProtocol
  }

  /**
   * Install icon.library vectors
   */
  installIconVectors(): void {
    if (!this.iconLibrary) {
      console.error(
        "[LibraryTraps] Cannot install icon vectors: library not set"
      );
      return;
    }

    const iconBase = this.execLibrary.getLibraryBase("icon.library");
    if (iconBase === 0) {
      console.error(
        "[LibraryTraps] Cannot install icon vectors: library not opened"
      );
      return;
    }

    console.log(
      `[LibraryTraps] Installing icon.library vectors at base 0x${iconBase.toString(
        16
      )}`
    );

    for (const vector of ICON_VECTORS) {
      const trapAddr = iconBase + vector.offset;

      // Write ILLEGAL instruction at vector address to trigger trap
      this.emulator.writeMemory16(trapAddr, 0x4AFC);

      // Store mapping of address to handler
      this.trapMap.set(trapAddr, vector);
      this.libraryMap.set(trapAddr, this.iconLibrary);

      // Store mapping by offset (array-based to handle collisions)
      if (!this.offsetMap.has(vector.offset)) {
        this.offsetMap.set(vector.offset, []);
        this.offsetLibraryMap.set(vector.offset, []);
      }
      this.offsetMap.get(vector.offset)!.push(vector);
      this.offsetLibraryMap.get(vector.offset)!.push(this.iconLibrary);

      console.log(
        `  [${vector.name}] Vector at 0x${trapAddr.toString(16)} (offset ${
          vector.offset
        })`
      );
    }

    console.log(`[LibraryTraps] *** icon.library FULLY OPERATIONAL - ALL traps installed and ready ***`);

    console.log(
      `[LibraryTraps] Installed ${ICON_VECTORS.length} icon.library vectors`
    );
  }

  /**
   * Install intuition.library vectors
   */
  installIntuitionVectors(): void {
    if (!this.intuitionLibrary) {
      console.error(
        "[LibraryTraps] Cannot install intuition vectors: library not set"
      );
      return;
    }

    const intuitionBase = this.execLibrary.getLibraryBase("intuition.library");
    if (intuitionBase === 0) {
      console.error(
        "[LibraryTraps] Cannot install intuition vectors: library not opened"
      );
      return;
    }

    console.log(
      `[LibraryTraps] Installing intuition.library vectors at base 0x${intuitionBase.toString(
        16
      )}`
    );

    for (const vector of INTUITION_VECTORS) {
      const trapAddr = intuitionBase + vector.offset;

      // Write ILLEGAL instruction at vector address to trigger trap
      this.emulator.writeMemory16(trapAddr, 0x4AFC);

      // Store mapping of address to handler
      this.trapMap.set(trapAddr, vector);
      this.libraryMap.set(trapAddr, this.intuitionLibrary);

      // Store mapping by offset (array-based to handle collisions)
      if (!this.offsetMap.has(vector.offset)) {
        this.offsetMap.set(vector.offset, []);
        this.offsetLibraryMap.set(vector.offset, []);
      }
      this.offsetMap.get(vector.offset)!.push(vector);
      this.offsetLibraryMap.get(vector.offset)!.push(this.intuitionLibrary);

      console.log(
        `  [${vector.name}] Vector at 0x${trapAddr.toString(16)} (offset ${
          vector.offset
        })`
      );
    }

    console.log(
      `[LibraryTraps] Installed ${INTUITION_VECTORS.length} intuition.library vectors`
    );
  }

  /**
   * Install utility.library vectors
   */
  installUtilityVectors(): void {
    if (!this.utilityLibrary) {
      console.error(
        "[LibraryTraps] Cannot install utility vectors: library not set"
      );
      return;
    }

    const utilityBase = this.execLibrary.getLibraryBase("utility.library");
    if (utilityBase === 0) {
      console.error(
        "[LibraryTraps] Cannot install utility vectors: library not opened"
      );
      return;
    }

    console.log(
      `[LibraryTraps] Installing utility.library vectors at base 0x${utilityBase.toString(
        16
      )}`
    );

    for (const vector of UTILITY_VECTORS) {
      const trapAddr = utilityBase + vector.offset;

      // Write ILLEGAL instruction at vector address
      this.emulator.writeMemory16(trapAddr, 0x4AFC);

      // Store mapping of address to handler
      this.trapMap.set(trapAddr, vector);
      this.libraryMap.set(trapAddr, this.utilityLibrary);

      if (!this.offsetMap.has(vector.offset)) {
        this.offsetMap.set(vector.offset, []);
        this.offsetLibraryMap.set(vector.offset, []);
      }
      this.offsetMap.get(vector.offset)!.push(vector);
      this.offsetLibraryMap.get(vector.offset)!.push(this.utilityLibrary);

      console.log(
        `  [${vector.name}] Vector at 0x${trapAddr.toString(16)} (offset ${
          vector.offset
        })`
      );
    }

    console.log(
      `[LibraryTraps] Installed ${UTILITY_VECTORS.length} utility.library vectors`
    );

    // Add stub vectors for other utility functions
    this.installStubVectorsForLibrary(
      "utility.library",
      utilityBase,
      this.utilityLibrary
    );
  }

  /**
   * Install mathffp.library vectors
   */
  installMathFFPVectors(): void {
    if (!this.mathFFPLibrary) {
      console.error("[LibraryTraps] Cannot install mathffp vectors: library not set");
      return;
    }

    const mathBase = this.execLibrary.getLibraryBase("mathffp.library");
    if (mathBase === 0) {
      console.error("[LibraryTraps] Cannot install mathffp vectors: library not opened");
      return;
    }

    console.log(`[LibraryTraps] Installing mathffp.library vectors at base 0x${mathBase.toString(16)}`);

    for (const vector of MATHFFP_VECTORS) {
      const trapAddr = mathBase + vector.offset;
      this.emulator.writeMemory16(trapAddr, 0x4AFC);
      this.trapMap.set(trapAddr, vector);
      this.libraryMap.set(trapAddr, this.mathFFPLibrary);

      if (!this.offsetMap.has(vector.offset)) {
        this.offsetMap.set(vector.offset, []);
        this.offsetLibraryMap.set(vector.offset, []);
      }
      this.offsetMap.get(vector.offset)!.push(vector);
      this.offsetLibraryMap.get(vector.offset)!.push(this.mathFFPLibrary);
    }

    console.log(`[LibraryTraps] Installed ${MATHFFP_VECTORS.length} mathffp.library vectors`);
  }

  /**
   * Install mathtrans.library vectors
   */
  installMathTransVectors(): void {
    if (!this.mathTransLibrary) {
      console.error("[LibraryTraps] Cannot install mathtrans vectors: library not set");
      return;
    }

    const mathBase = this.execLibrary.getLibraryBase("mathtrans.library");
    if (mathBase === 0) {
      console.error("[LibraryTraps] Cannot install mathtrans vectors: library not opened");
      return;
    }

    console.log(`[LibraryTraps] Installing mathtrans.library vectors at base 0x${mathBase.toString(16)}`);

    for (const vector of MATHTRANS_VECTORS) {
      const trapAddr = mathBase + vector.offset;
      this.emulator.writeMemory16(trapAddr, 0x4AFC);
      this.trapMap.set(trapAddr, vector);
      this.libraryMap.set(trapAddr, this.mathTransLibrary);

      if (!this.offsetMap.has(vector.offset)) {
        this.offsetMap.set(vector.offset, []);
        this.offsetLibraryMap.set(vector.offset, []);
      }
      this.offsetMap.get(vector.offset)!.push(vector);
      this.offsetLibraryMap.get(vector.offset)!.push(this.mathTransLibrary);
    }

    console.log(`[LibraryTraps] Installed ${MATHTRANS_VECTORS.length} mathtrans.library vectors`);
  }

  /**
   * Install mathieeedoubbas.library vectors
   */
  installMathIEEEDoubBasVectors(): void {
    if (!this.mathIEEEDoubBasLibrary) {
      console.error("[LibraryTraps] Cannot install mathieeedoubbas vectors: library not set");
      return;
    }

    const mathBase = this.execLibrary.getLibraryBase("mathieeedoubbas.library");
    if (mathBase === 0) {
      console.error("[LibraryTraps] Cannot install mathieeedoubbas vectors: library not opened");
      return;
    }

    console.log(`[LibraryTraps] Installing mathieeedoubbas.library vectors at base 0x${mathBase.toString(16)}`);

    for (const vector of MATHIEEEDOUBBAS_VECTORS) {
      const trapAddr = mathBase + vector.offset;
      this.emulator.writeMemory16(trapAddr, 0x4AFC);
      this.trapMap.set(trapAddr, vector);
      this.libraryMap.set(trapAddr, this.mathIEEEDoubBasLibrary);

      if (!this.offsetMap.has(vector.offset)) {
        this.offsetMap.set(vector.offset, []);
        this.offsetLibraryMap.set(vector.offset, []);
      }
      this.offsetMap.get(vector.offset)!.push(vector);
      this.offsetLibraryMap.get(vector.offset)!.push(this.mathIEEEDoubBasLibrary);
    }

    console.log(`[LibraryTraps] Installed ${MATHIEEEDOUBBAS_VECTORS.length} mathieeedoubbas.library vectors`);
  }

  /**
   * Install mathieeedoubtrans.library vectors
   */
  installMathIEEEDoubTransVectors(): void {
    if (!this.mathIEEEDoubTransLibrary) {
      console.error("[LibraryTraps] Cannot install mathieeedoubtrans vectors: library not set");
      return;
    }

    const mathBase = this.execLibrary.getLibraryBase("mathieeedoubtrans.library");
    if (mathBase === 0) {
      console.error("[LibraryTraps] Cannot install mathieeedoubtrans vectors: library not opened");
      return;
    }

    console.log(`[LibraryTraps] Installing mathieeedoubtrans.library vectors at base 0x${mathBase.toString(16)}`);

    for (const vector of MATHIEEEDOUBTRANS_VECTORS) {
      const trapAddr = mathBase + vector.offset;
      this.emulator.writeMemory16(trapAddr, 0x4AFC);
      this.trapMap.set(trapAddr, vector);
      this.libraryMap.set(trapAddr, this.mathIEEEDoubTransLibrary);

      if (!this.offsetMap.has(vector.offset)) {
        this.offsetMap.set(vector.offset, []);
        this.offsetLibraryMap.set(vector.offset, []);
      }
      this.offsetMap.get(vector.offset)!.push(vector);
      this.offsetLibraryMap.get(vector.offset)!.push(this.mathIEEEDoubTransLibrary);
    }

    console.log(`[LibraryTraps] Installed ${MATHIEEEDOUBTRANS_VECTORS.length} mathieeedoubtrans.library vectors`);
  }

  /**
   * Install mathieeesingbas.library vectors
   */
  installMathIEEESingBasVectors(): void {
    if (!this.mathIEEESingBasLibrary) {
      console.error("[LibraryTraps] Cannot install mathieeesingbas vectors: library not set");
      return;
    }

    const mathBase = this.execLibrary.getLibraryBase("mathieeesingbas.library");
    if (mathBase === 0) {
      console.error("[LibraryTraps] Cannot install mathieeesingbas vectors: library not opened");
      return;
    }

    console.log(`[LibraryTraps] Installing mathieeesingbas.library vectors at base 0x${mathBase.toString(16)}`);

    for (const vector of MATHIEEESINGBAS_VECTORS) {
      const trapAddr = mathBase + vector.offset;
      this.emulator.writeMemory16(trapAddr, 0x4AFC);
      this.trapMap.set(trapAddr, vector);
      this.libraryMap.set(trapAddr, this.mathIEEESingBasLibrary);

      if (!this.offsetMap.has(vector.offset)) {
        this.offsetMap.set(vector.offset, []);
        this.offsetLibraryMap.set(vector.offset, []);
      }
      this.offsetMap.get(vector.offset)!.push(vector);
      this.offsetLibraryMap.get(vector.offset)!.push(this.mathIEEESingBasLibrary);
    }

    console.log(`[LibraryTraps] Installed ${MATHIEEESINGBAS_VECTORS.length} mathieeesingbas.library vectors`);
  }

  /**
   * Install mathieeesingtrans.library vectors
   */
  installMathIEEESingTransVectors(): void {
    if (!this.mathIEEESingTransLibrary) {
      console.error("[LibraryTraps] Cannot install mathieeesingtrans vectors: library not set");
      return;
    }

    const mathBase = this.execLibrary.getLibraryBase("mathieeesingtrans.library");
    if (mathBase === 0) {
      console.error("[LibraryTraps] Cannot install mathieeesingtrans vectors: library not opened");
      return;
    }

    console.log(`[LibraryTraps] Installing mathieeesingtrans.library vectors at base 0x${mathBase.toString(16)}`);

    for (const vector of MATHIEEESINGTRANS_VECTORS) {
      const trapAddr = mathBase + vector.offset;
      this.emulator.writeMemory16(trapAddr, 0x4AFC);
      this.trapMap.set(trapAddr, vector);
      this.libraryMap.set(trapAddr, this.mathIEEESingTransLibrary);

      if (!this.offsetMap.has(vector.offset)) {
        this.offsetMap.set(vector.offset, []);
        this.offsetLibraryMap.set(vector.offset, []);
      }
      this.offsetMap.get(vector.offset)!.push(vector);
      this.offsetLibraryMap.get(vector.offset)!.push(this.mathIEEESingTransLibrary);
    }

    console.log(`[LibraryTraps] Installed ${MATHIEEESINGTRANS_VECTORS.length} mathieeesingtrans.library vectors`);
  }

  /**
   * Install stub handlers for any remaining LVOs we know about for a library.
   * Uses offsets parsed from dev/docs/LVOs.i and only installs if not already trapped.
   */
  installStubVectorsForLibrary(
    libName: string,
    baseAddr: number,
    libraryInstance: any = null
  ): void {
    const normalized = libName.toLowerCase();
    const offsets = this.lvoOffsetsByLibrary.get(normalized);
    if (!offsets || offsets.length === 0 || baseAddr === 0) {
      return;
    }

    let added = 0;
    for (const offset of offsets) {
      const trapAddr = baseAddr + offset;
      if (this.trapMap.has(trapAddr)) {
        continue;
      }
      // CRITICAL FIX: Write ILLEGAL instruction at vector address!
      this.emulator.writeMemory16(trapAddr, 0x4AFC);

      const vector: LibraryVector = {
        offset,
        name: `${normalized}-stub`,
        handler: (emu: MoiraEmulator) => {
          console.log(
            `[LibraryTraps] Stubbed ${normalized} offset ${offset} at PC=0x${trapAddr.toString(
              16
            )}`
          );
          return emu.getRegister(0);
        },
      };
      this.trapMap.set(trapAddr, vector);
      this.libraryMap.set(trapAddr, libraryInstance);

      if (!this.offsetMap.has(offset)) {
        this.offsetMap.set(offset, []);
        this.offsetLibraryMap.set(offset, []);
      }
      this.offsetMap.get(offset)!.push(vector);
      this.offsetLibraryMap.get(offset)!.push(libraryInstance);
      added++;
    }

    if (added > 0) {
      console.log(
        `[LibraryTraps] Stubbed ${added} LVOs for ${normalized} from LVOs.i`
      );
    }
  }

  /**
   * Handle a trapped library call
   *
   * Called when PC is at a library vector address BEFORE execution.
   * We execute our handler instead of the (nonexistent) library code.
   *
   * @param pc - Current program counter
   * @returns true if this is a library call and was handled
   */
  handleTrap(pc: number): boolean {
    const vector = this.trapMap.get(pc);

    if (!vector) {
      // BUG FIX: Don't do broad range checking - it's catching ROM execution!
      // Only do specific library checks for addresses we actually know about
      const execBase = this.emulator.readMemory32(0x4);
      const dosBase = this.execLibrary.getLibraryBase("dos.library");

      // Check if PC is very close to known library bases (more restrictive)
      const execOffset = pc - execBase;
      const dosOffset = dosBase ? pc - dosBase : 0;

      // Only trigger if PC is in the ACTUAL library vector range, not ROM space
      // Exec.library vectors are roughly from -700 to -30 from ExecBase
      if (pc >= execBase - 700 && pc < execBase && execOffset <= -30) {
        console.error(`[LibraryTraps] *** UNIMPLEMENTED EXEC FUNCTION ***`);
        console.error(`[LibraryTraps]   PC: 0x${pc.toString(16)}`);
        console.error(`[LibraryTraps]   ExecBase: 0x${execBase.toString(16)}`);
        console.error(`[LibraryTraps]   LVO offset: ${execOffset}`);
        console.error(
          `[LibraryTraps]   This is likely a missing Exec.library function!`
        );

        // DETAILED TRACING: Show door execution context
        console.error(`[LibraryTraps] *** DOOR EXECUTION CONTEXT ***`);

        // Get door execution context
        const d0 = this.emulator.getRegister(0);
        const d1 = this.emulator.getRegister(1);
        const a0 = this.emulator.getRegister(8);
        const a1 = this.emulator.getRegister(9);
        const a4 = this.emulator.getRegister(12); // A4 = data segment (FIXED: was 4, should be 12!)
        const a5 = this.emulator.getRegister(13); // FIXED: was 5, should be 13
        const a6 = this.emulator.getRegister(14); // FIXED: was 6, should be 14
        const a7 = this.emulator.getRegister(15); // SP (FIXED: was 7, should be 15)
        const sp = this.emulator.getRegister(15);

        console.error(`[LibraryTraps]   Registers:`);
        console.error(
          `[LibraryTraps]     D0: 0x${d0.toString(16)}, D1: 0x${d1.toString(
            16
          )}`
        );
        console.error(
          `[LibraryTraps]     A0: 0x${a0.toString(16)}, A1: 0x${a1.toString(
            16
          )}`
        );
        console.error(
          `[LibraryTraps]     A4: 0x${a4.toString(16)} (data segment)`
        );
        console.error(
          `[LibraryTraps]     A5: 0x${a5.toString(16)}, A6: 0x${a6.toString(
            16
          )}`
        );
        console.error(`[LibraryTraps]     A7(SP): 0x${a7.toString(16)}`);

        if (pc >= execBase && pc <= execBase + 0x1000) {
          const libOffset = pc - execBase;
          console.error(
            `[LibraryTraps]   ROM/Exec space: PC=0x${pc.toString(
              16
            )} (offset +0x${libOffset.toString(16)})`
          );
        } else {
          console.error(
            `[LibraryTraps]   OTHER space: PC=0x${pc.toString(16)}`
          );
        }

        // Continue execution anyway (simulate RTS with D0=0)
        this.emulator.setRegister(0, 0); // D0 = 0 (failure)
        const returnAddr = this.emulator.readMemory32(sp);
        this.emulator.setRegister(15, sp + 4);
        this.emulator.setRegister(16, returnAddr);
        this.emulator.refillPrefetch(); // CRITICAL: Refill prefetch after changing PC
        console.error(
          `[LibraryTraps]   Simulated RTS with D0=0, returning to 0x${returnAddr.toString(
            16
          )}`
        );
        return true;
      }

      // DOS.library check - more restrictive range
      if (dosBase && pc >= dosBase - 300 && pc < dosBase && dosOffset <= -30) {
        const offset = pc - dosBase;
        console.error(`[LibraryTraps] *** UNIMPLEMENTED DOS FUNCTION ***`);
        console.error(
          `[LibraryTraps]   PC: 0x${pc.toString(16)}, LVO: ${offset}`
        );
        // Simulate RTS with D0=0
        this.emulator.setRegister(0, 0);
        const sp = this.emulator.getRegister(15);
        const returnAddr = this.emulator.readMemory32(sp);
        this.emulator.setRegister(15, sp + 4);
        this.emulator.setRegister(16, returnAddr);
        this.emulator.refillPrefetch(); // CRITICAL: Refill prefetch after changing PC
        return true;
      }

      // If we get here, PC is NOT a library trap - return false to let execution continue
      return false;
    }

    const library = this.libraryMap.get(pc);
    const libraryName = this.getLibraryName(library);

    console.log(
      `[LibraryTraps] *** INTERCEPTED: ${libraryName}.${vector.name}() at PC=0x${pc.toString(
        16
      )} ***`
    );

    // DETAILED TRACING: Show door context on library calls for debugging
    if (
      vector.name === "OpenLibrary" ||
      vector.name === "AllocMem" ||
      vector.name === "SetSignal" ||
      vector.name === "CreatePool" ||
      vector.name === "AllocPooled"
    ) {
      const d0 = this.emulator.getRegister(0);
      const d1 = this.emulator.getRegister(1);
      const a0 = this.emulator.getRegister(8);
      const a1 = this.emulator.getRegister(9);
      const a4 = this.emulator.getRegister(12); // A4 = data segment
      const a5 = this.emulator.getRegister(13);
      const a6 = this.emulator.getRegister(14);

      console.log(`[LibraryTraps]   Door state during ${vector.name}():`);
      console.log(`[LibraryTraps]     A4: 0x${a4.toString(16)}`);
      console.log(
        `[LibraryTraps]     D0: 0x${d0.toString(16)}, D1: 0x${d1.toString(16)}`
      );
      console.log(
        `[LibraryTraps]     A0: 0x${a0.toString(16)}, A1: 0x${a1.toString(16)}`
      );
    }

    // Highlight output-related AEDoor functions
    if (
      vector.name === "WriteStr" ||
      vector.name === "Prompt" ||
      vector.name === "SendCmd"
    ) {
      console.log(
        `[LibraryTraps] OUTPUT FUNCTION: ${vector.name}() - this should produce terminal output`
      );
    }

    // Additional AEDoor-specific tracing
    if (libraryName === "AEDoor.library") {
      const d0 = this.emulator.getRegister(0);
      const d1 = this.emulator.getRegister(1);
      const a0 = this.emulator.getRegister(8);
      const a1 = this.emulator.getRegister(9);
      const a4 = this.emulator.getRegister(4);
      console.log(
        `[LibraryTraps][AEDoor] offset=${vector.offset} d0=0x${d0.toString(
          16
        )} d1=0x${d1.toString(16)} a0=0x${a0.toString(
          16
        )} a1=0x${a1.toString(16)} a4=0x${a4.toString(16)}`
      );
    }

    // Notify monitor if callback is set
    if (this.onLibraryCall) {
      this.onLibraryCall(vector.name, pc);
    }

    // CRITICAL: Save return address AND pop stack BEFORE calling handler!
    // Some handlers (like StackSwap) modify the stack pointer. We must read
    // and pop the return address from the ORIGINAL stack before the handler runs.
    const sp = this.emulator.getRegister(15); // A7 (stack pointer)
    const a6 = this.emulator.getRegister(14); // A6 (library base)
    const a6Before = a6; // CRITICAL: Save A6 before trap handler
    console.log(
      `[LibraryTraps]   SP before pop: 0x${sp.toString(
        16
      )}, A6: 0x${a6.toString(16)}`
    );
    const returnAddr = this.emulator.readMemory32(sp);
    console.log(
      `[LibraryTraps]   Return address at SP: 0x${returnAddr.toString(16)}`
    );
    this.emulator.setRegister(15, sp + 4); // Pop return address from ORIGINAL stack
    const spAfter = this.emulator.getRegister(15);
    console.log(`[LibraryTraps]   SP after pop: 0x${spAfter.toString(16)}`);

    // DEBUG: Dump stack contents where A6 should be saved
    // MOVEM.L (SP)+,D0-D7/A0-A6 reads A6 from SP+56
    // (D0-D7 = 8 regs = 32 bytes, A0-A5 = 6 regs = 24 bytes, total offset = 56)
    const a6OnStack = this.emulator.readMemory32(spAfter + 56);
    console.log(
      `[LibraryTraps]   A6 value saved on stack at SP+56 (0x${(
        spAfter + 56
      ).toString(16)}): 0x${a6OnStack.toString(16)}`
    );

    // Also dump the surrounding stack to see the pattern
    console.log(`[LibraryTraps]   Stack dump (after return address pop):`);
    for (let i = 0; i < 15; i++) {
      const regValue = this.emulator.readMemory32(spAfter + i * 4);
      const regName = i < 8 ? `D${i}` : `A${i - 8}`;
      console.log(
        `[LibraryTraps]     SP+${i * 4} (${regName}): 0x${regValue.toString(
          16
        )}`
      );
    }

    // Call the handler with the correct library instance
    // Note: Handler may now modify SP (e.g., StackSwap), but we've already popped the return address
    // Pass returnAddr to handler for functions like Supervisor() that need it
    const prevD0 = this.emulator.getRegister(0);
    const prevSr = this.emulator.getRegister(17);
    const spBeforeHandler = this.emulator.getRegister(15);
    const result = (vector.handler as any)(this.emulator, library, returnAddr);
    const preserveRegs = vector.name === "Forbid" || vector.name === "Permit";

    // CRITICAL: Check for SP corruption immediately after handler
    const spAfterHandler = this.emulator.getRegister(15);
    if (spAfterHandler === 0xfffffffa || spAfterHandler < 0x1000) {
      console.error(`\n*** SP CORRUPTION DETECTED ***`);
      console.error(`  Function: ${vector.name}()`);
      console.error(`  SP before handler: 0x${spBeforeHandler.toString(16)}`);
      console.error(`  SP after handler:  0x${spAfterHandler.toString(16)} *** CORRUPTED ***`);
      console.error(`  Return address: 0x${returnAddr.toString(16)}`);
      console.error(`  D0 result: 0x${result.toString(16)}`);
      console.error(`  THIS IS THE BUG! ${vector.name}() corrupted SP!`);
    }

    // Set return value in D0 unless the call should preserve the caller state
    if (!preserveRegs) {
      this.emulator.setRegister(0, result);
    } else {
      this.emulator.setRegister(0, prevD0);
    }

    // CRITICAL FIX: Restore A6 register after trap handler
    // M68K calling convention requires A6 to be preserved across function calls
    // For library calls, A6 MUST contain the library base address
    // Determine which library this offset belongs to and restore A6 to that library's base
    // This fixes crash at iteration 35,444 where A6=0x0 caused jump to 0xffffd6
    let properA6 = a6Before; // Default: restore to original value

    // Determine library base from the library instance
    // Fallback addresses must match ExecLibrary.ts memory layout (0x080000+)
    if (library === this.execLibrary) {
      properA6 = this.execLibrary.getLibraryBase("exec.library") || 0x080000;
    } else if (library === this.dosLibrary) {
      properA6 = this.execLibrary.getLibraryBase("dos.library") || 0x0B0000;
    } else if (library === this.aedoorLibrary) {
      properA6 = this.execLibrary.getLibraryBase("AEDoor.library") || 0x0C0000;
    }

    this.emulator.setRegister(14, properA6);
    const a6AfterRestore = this.emulator.getRegister(14);
    console.log(
      `[LibraryTraps]   A6 restored: 0x${a6Before.toString(
        16
      )} -> 0x${properA6.toString(16)} (${vector.name} library base)`
    );
    if (a6AfterRestore !== properA6) {
      console.log(
        `[LibraryTraps]   *** WARNING: A6 restoration failed! Expected: 0x${properA6.toString(
          16
        )}, Got: 0x${a6AfterRestore.toString(16)}`
      );
    }

    // CRITICAL FIX: Update Status Register condition codes after setting D0
    // Library functions return values in D0, and the calling code expects
    // the Z and N flags to be set based on the return value (like TST.L D0 would do)
    //
    // M68K SR format: Bits 15-8 = system byte, Bits 4-0 = CCR (X N Z V C)
    if (preserveRegs) {
      this.emulator.setRegister(17, prevSr); // Preserve SR for void calls
      console.log(
        `[LibraryTraps] ${vector.name}() preserved SR: 0x${prevSr
          .toString(16)
          .padStart(4, "0")}`
      );
    } else {
      const sr = this.emulator.getRegister(17); // Get current SR
      let newSr = sr & 0xfff0; // Clear N, Z, V, C flags (bits 0-3), preserve X flag (bit 4)

      // Set Z flag if result is zero
      if (result === 0) {
        newSr |= 0x04; // Set Z flag (bit 2)
      }

      // Set N flag if result is negative (bit 31 set for 32-bit value)
      if (result & 0x80000000) {
        newSr |= 0x08; // Set N flag (bit 3)
      }

      // V (overflow) and C (carry) are cleared for library returns

      this.emulator.setRegister(17, newSr); // Update SR

      // Verify SR was actually set
      const verifySr = this.emulator.getRegister(17);
      console.log(
        `[LibraryTraps] ${vector.name}() returned 0x${result.toString(16)}`
      );
      console.log(
        `[LibraryTraps]   Set SR to: 0x${newSr
          .toString(16)
          .padStart(4, "0")} (Z=${newSr & 0x04 ? 1 : 0} N=${
          newSr & 0x08 ? 1 : 0
        })`
      );
      console.log(
        `[LibraryTraps]   Verified SR: 0x${verifySr
          .toString(16)
          .padStart(4, "0")} (Z=${verifySr & 0x04 ? 1 : 0})`
      );
    }

    // Set PC to return address
    // EXCEPTIONS: Supervisor() and Exit() set PC themselves, so check if it was changed
    const currentPC = this.emulator.getRegister(16);
    if (vector.name === "Supervisor") {
      // Supervisor already set PC to the supervisor function, don't overwrite it
      console.log(
        `[LibraryTraps] Supervisor: PC already set to 0x${currentPC.toString(
          16
        )}, not setting return address`
      );
    } else if (vector.name === "Exit") {
      // Exit() already set PC to exit trap address (0xFFFF00), don't overwrite it
      console.log(
        `[LibraryTraps] Exit: PC already set to 0x${currentPC.toString(
          16
        )} (exit trap), not setting return address`
      );
    } else {
      console.log(
        `[LibraryTraps] Setting PC to return address 0x${returnAddr.toString(
          16
        )}`
      );
      this.emulator.setRegister(16, returnAddr);
      // CRITICAL: Refill prefetch queue after changing PC!
      // Without this, MOIRA executes stale instructions from the old PC location
      this.emulator.refillPrefetch();
      const verifyPC = this.emulator.getRegister(16);
      console.log(
        `[LibraryTraps] Verified PC is now: 0x${verifyPC.toString(16)}`
      );

      // Also check what instruction is at return address
      const op0 = this.emulator.readMemory(returnAddr);
      const op1 = this.emulator.readMemory(returnAddr + 1);
      const opcode = (op0 << 8) | op1;
      console.log(
        `[LibraryTraps] Instruction at return address: 0x${opcode
          .toString(16)
          .padStart(4, "0")}`
      );
    }

    // CRITICAL FIX: Refill instruction prefetch queue!
    // After setting PC, we MUST refill the prefetch queue to synchronize
    // queue.ird and queue.irc with the new PC location.
    // The fixed refillPrefetch() now properly sets IRD and IRC without executing.
    this.emulator.refillPrefetch();

    // Verify final register state
    const finalSp = this.emulator.getRegister(15);
    const finalA6 = this.emulator.getRegister(14);

    console.log(`[LibraryTraps] Returning to 0x${returnAddr.toString(16)}`);
    console.log(
      `[LibraryTraps]   Final SP: 0x${finalSp.toString(
        16
      )}, Final A6: 0x${finalA6.toString(16)}`
    );

    return true; // Trap handled
  }

  /**
   * Check if an address is a library trap
   */
  isTrapAddress(addr: number): boolean {
    return this.trapMap.has(addr);
  }

  /**
   * NEW: Check if an offset matches a known library vector
   */
  isTrapOffset(offset: number): boolean {
    return this.offsetMap.has(offset);
  }

  /**
   * NEW: Handle a trap by offset (when A6 is corrupted)
   * @param offset - Library vector offset (e.g., -30 for Supervisor)
   * @param baseAddr - The A6 value (library base address, may be corrupted)
   */
  handleTrapByOffset(offset: number, baseAddr: number): boolean {
    const vectors = this.offsetMap.get(offset);
    const libraries = this.offsetLibraryMap.get(offset);

    if (!vectors || vectors.length === 0) {
      console.error(`[LibraryTraps] *** NO HANDLER for offset ${offset} ***`);
      return false;
    }

    // Multiple vectors can share the same offset (collision)
    // For now, use the first one (Exec.library functions installed first)
    // TODO: More sophisticated collision resolution if needed
    const vector = vectors[0];
    const library = libraries![0];
    const libraryName = this.getLibraryName(library);

    console.log(
      `[LibraryTraps] Intercepted: ${libraryName}.${vector.name}() at offset ${offset} (A6=0x${baseAddr.toString(
        16
      )})`
    );

    // Notify monitor if callback is set
    if (this.onLibraryCall) {
      this.onLibraryCall(vector.name, baseAddr + offset);
    }

    // Pop return address from stack (same as handleTrap)
    const sp = this.emulator.getRegister(15); // A7 (stack pointer)
    const a6 = this.emulator.getRegister(14); // A6 (library base)
    const a6Before = a6; // CRITICAL: Save A6 before trap handler
    console.log(
      `[LibraryTraps]   SP before pop: 0x${sp.toString(
        16
      )}, A6: 0x${a6.toString(16)}`
    );
    const returnAddr = this.emulator.readMemory32(sp);
    console.log(
      `[LibraryTraps]   Return address at SP: 0x${returnAddr.toString(16)}`
    );
    this.emulator.setRegister(15, sp + 4); // Pop return address
    const spAfter = this.emulator.getRegister(15);
    console.log(`[LibraryTraps]   SP after pop: 0x${spAfter.toString(16)}`);

    // Call the handler
    const result = (vector.handler as any)(this.emulator, library, returnAddr);

    // Set return value in D0
    this.emulator.setRegister(0, result);

    // CRITICAL FIX: Restore A6 register after trap handler
    // M68K calling convention requires A6 to be preserved across function calls
    // For library calls, A6 MUST contain the library base address
    // Determine which library this offset belongs to and restore A6 to that library's base
    // This fixes crash at iteration 35,444 where A6=0x0 caused jump to 0xffffd6
    let properA6 = a6Before; // Default: restore to original value

    // Determine library base from the library instance
    // Fallback addresses must match ExecLibrary.ts memory layout (0x080000+)
    if (library === this.execLibrary) {
      properA6 = this.execLibrary.getLibraryBase("exec.library") || 0x080000;
    } else if (library === this.dosLibrary) {
      properA6 = this.execLibrary.getLibraryBase("dos.library") || 0x0B0000;
    } else if (library === this.aedoorLibrary) {
      properA6 = this.execLibrary.getLibraryBase("AEDoor.library") || 0x0C0000;
    }

    this.emulator.setRegister(14, properA6);
    const a6After = this.emulator.getRegister(14);
    console.log(
      `[LibraryTraps]   A6 restored: 0x${a6Before.toString(
        16
      )} -> 0x${properA6.toString(16)} (${vector.name} library base)`
    );
    if (a6After !== properA6) {
      console.log(
        `[LibraryTraps]   *** WARNING: A6 restoration failed! Expected: 0x${properA6.toString(
          16
        )}, Got: 0x${a6After.toString(16)}`
      );
    }

    // Update Status Register condition codes
    const sr = this.emulator.getRegister(17);
    let newSr = sr & 0xfff0; // Clear N, Z, V, C flags

    // Set Z flag if result is zero
    if (result === 0) {
      newSr |= 0x04; // Set Z flag (bit 2)
    }

    // Set N flag if result is negative (bit 31 set)
    if (result & 0x80000000) {
      newSr |= 0x08; // Set N flag (bit 3)
    }

    this.emulator.setRegister(17, newSr);

    console.log(
      `[LibraryTraps] ${vector.name}() returned 0x${result.toString(16)}`
    );
    console.log(
      `[LibraryTraps]   Set SR to: 0x${newSr
        .toString(16)
        .padStart(4, "0")} (Z=${newSr & 0x04 ? 1 : 0} N=${
        newSr & 0x08 ? 1 : 0
      })`
    );

    // Set PC to return address
    // EXCEPTIONS: Supervisor() and Exit() set PC themselves
    const currentPC = this.emulator.getRegister(16);
    if (vector.name === "Supervisor") {
      console.log(
        `[LibraryTraps] Supervisor: PC already set to 0x${currentPC.toString(
          16
        )}, not setting return address`
      );
    } else if (vector.name === "Exit") {
      console.log(
        `[LibraryTraps] Exit: PC already set to 0x${currentPC.toString(
          16
        )} (exit trap), not setting return address`
      );
    } else {
      this.emulator.setRegister(16, returnAddr);
      this.emulator.refillPrefetch(); // CRITICAL: Refill prefetch after changing PC
    }

    return true;
  }

  /**
   * Load the LVO definitions from dev/docs/LVOs.i so we can stub missing vectors.
   */
  private loadLvoOffsetsFromFile(): void {
    const candidates = [
      path.resolve(process.cwd(), "dev/docs/LVOs.i"),
      path.resolve(process.cwd(), "../dev/docs/LVOs.i"),
      path.resolve(process.cwd(), "../../dev/docs/LVOs.i"),
      path.resolve(__dirname, "../../../../dev/docs/LVOs.i"),
      path.resolve(__dirname, "../../../../../dev/docs/LVOs.i"),
    ];

    let data: string | null = null;
    for (const candidate of candidates) {
      try {
        if (amigafs.existsSync(candidate)) {
          data = amigafs.readFileSync(candidate, "utf8") as string;
          console.log(`[LibraryTraps] Loaded LVOs from ${candidate}`);
          break;
        }
      } catch {
        // ignore and try next
      }
    }

    if (!data) {
      console.warn("[LibraryTraps] LVOs.i not found; stub vectors disabled");
      return;
    }

    let currentLib = "";
    const libRegex = /\*+ LVOs for ([^*]+?) \*/i;
    const lvoRegex = /equ\s+(-?\d+)/i;

    for (const rawLine of data.split(/\r?\n/)) {
      const line = rawLine.trim();
      const libMatch = line.match(libRegex);
      if (libMatch) {
        currentLib = libMatch[1].trim().toLowerCase();
        if (!this.lvoOffsetsByLibrary.has(currentLib)) {
          this.lvoOffsetsByLibrary.set(currentLib, []);
        }
        continue;
      }

      if (!currentLib || line.length === 0 || line.startsWith(";")) {
        continue;
      }

      const lvoMatch = line.match(lvoRegex);
      if (lvoMatch) {
        const offset = parseInt(lvoMatch[1], 10);
        const list = this.lvoOffsetsByLibrary.get(currentLib)!;
        if (!list.includes(offset)) {
          list.push(offset);
        }
      }
    }
  }
}
