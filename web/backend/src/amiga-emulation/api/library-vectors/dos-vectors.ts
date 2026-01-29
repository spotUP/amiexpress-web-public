/**
 * DOS.library function vectors
 * Reference: AROS dos.library & AmigaOS LVO tables
 * LVO = Library Vector Offset (in bytes from library base)
 */

import { LibraryVector } from "./types";
import { DosLibrary } from "../DosLibrary";

export const DOS_VECTORS: LibraryVector[] = [
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
    offset: -216,
    name: "SelectInput",
    handler: (emu, lib: DosLibrary) => {
      return lib.SelectInput();
    },
  },
  {
    offset: -222,
    name: "SelectOutput",
    handler: (emu, lib: DosLibrary) => {
      return lib.SelectOutput();
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
    offset: -492,
    name: "Cli",
    handler: (emu, lib: DosLibrary) => {
      lib.Cli();
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
  // Pattern matching functions - V36/V37
  {
    offset: -840,
    name: "ParsePattern",
    handler: (emu, lib: DosLibrary) => {
      lib.ParsePattern();
      return emu.getRegister(0);
    },
  },
  {
    offset: -846,
    name: "MatchPattern",
    handler: (emu, lib: DosLibrary) => {
      lib.MatchPattern();
      return emu.getRegister(0);
    },
  },
  {
    offset: -966,
    name: "ParsePatternNoCase",
    handler: (emu, lib: DosLibrary) => {
      lib.ParsePatternNoCase();
      return emu.getRegister(0);
    },
  },
  {
    offset: -972,
    name: "MatchPatternNoCase",
    handler: (emu, lib: DosLibrary) => {
      lib.MatchPatternNoCase();
      return emu.getRegister(0);
    },
  },
];
