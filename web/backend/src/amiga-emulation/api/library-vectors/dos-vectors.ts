/**
 * DOS.library function vectors
 * Reference: NDK 3.2R4 dos_lib.fd (authoritative source)
 * LVO = Library Vector Offset (in bytes from library base)
 *
 * FD file format:
 * - ##bias N sets starting offset for next function
 * - Each function increments by 6 bytes
 * - ##private functions still consume offsets
 */

import { LibraryVector } from "./types";
import { DosLibrary } from "../DosLibrary";

export const DOS_VECTORS: LibraryVector[] = [
  // ============================================
  // V33 functions (##bias 30)
  // ============================================
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
    offset: -114,
    name: "Info",
    handler: (emu, lib: DosLibrary) => {
      lib.Info();
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
    offset: -138,
    name: "CreateProc",
    handler: (emu, lib: DosLibrary) => {
      lib.CreateProc();
      return emu.getRegister(0);
    },
  },
  {
    offset: -144,
    name: "Exit",
    handler: (emu, lib: DosLibrary) => {
      lib.Exit();
      return 0;
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
  // -162: dosPrivate1 (private)
  // -168: dosPrivate2 (private)
  {
    offset: -174,
    name: "DeviceProc",
    handler: (emu, lib: DosLibrary) => {
      lib.DeviceProc();
      return emu.getRegister(0);
    },
  },
  {
    offset: -180,
    name: "SetComment",
    handler: (emu, lib: DosLibrary) => {
      lib.SetComment();
      return emu.getRegister(0);
    },
  },
  {
    offset: -186,
    name: "SetProtection",
    handler: (emu, lib: DosLibrary) => {
      lib.SetProtection();
      return emu.getRegister(0);
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
    offset: -210,
    name: "ParentDir",
    handler: (emu, lib: DosLibrary) => {
      lib.ParentDir();
      return emu.getRegister(0);
    },
  },
  {
    offset: -216,
    name: "IsInteractive",
    handler: (emu, lib: DosLibrary) => {
      lib.IsInteractive();
      return emu.getRegister(0);
    },
  },
  {
    offset: -222,
    name: "Execute",
    handler: (emu, lib: DosLibrary) => {
      console.log(`[dos-vectors] Execute TRAP at -222 triggered`);
      lib.Execute();
      return emu.getRegister(0);
    },
  },

  // ============================================
  // V36 functions (Release 2.0) - continues from -228
  // ============================================
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
  // -240: DoPkt
  // -246: SendPkt
  // -252: WaitPkt
  // -258: ReplyPkt
  // -264: AbortPkt
  // -270: LockRecord
  // -276: LockRecords
  // -282: UnLockRecord
  // -288: UnLockRecords

  // Buffered File I/O
  {
    offset: -294,
    name: "SelectInput",
    handler: (emu, lib: DosLibrary) => {
      return lib.SelectInput();
    },
  },
  {
    offset: -300,
    name: "SelectOutput",
    handler: (emu, lib: DosLibrary) => {
      return lib.SelectOutput();
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
  // -348: VFWritef
  {
    offset: -354,
    name: "VFPrintf",
    handler: (emu, lib: DosLibrary) => {
      lib.VFPrintf();
      return emu.getRegister(0);
    },
  },
  {
    offset: -360,
    name: "Flush",
    handler: (emu, lib: DosLibrary) => {
      return lib.Flush();
    },
  },
  // -366: SetVBuf
  {
    offset: -372,
    name: "DupLockFromFH",
    handler: (emu, lib: DosLibrary) => {
      lib.DupLockFromFH();
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
    offset: -384,
    name: "ParentOfFH",
    handler: (emu, lib: DosLibrary) => {
      lib.ParentOfFH();
      return emu.getRegister(0);
    },
  },
  {
    offset: -390,
    name: "ExamineFH",
    handler: (emu, lib: DosLibrary) => {
      lib.ExamineFH();
      return emu.getRegister(0);
    },
  },
  // -396: SetFileDate
  {
    offset: -402,
    name: "NameFromLock",
    handler: (emu, lib: DosLibrary) => {
      lib.NameFromLock();
      return emu.getRegister(0);
    },
  },
  // -408: NameFromFH
  {
    offset: -414,
    name: "SplitName",
    handler: (emu, lib: DosLibrary) => {
      lib.SplitName();
      return emu.getRegister(0);
    },
  },
  // -420: SameLock
  // -426: SetMode
  // -432: ExAll
  // -438: ReadLink
  // -444: MakeLink
  // -450: ChangeMode
  // -456: SetFileSize
  // -462: SetIoErr
  {
    offset: -468,
    name: "Fault",
    handler: (emu, lib: DosLibrary) => {
      lib.Fault();
      return emu.getRegister(0);
    },
  },
  {
    offset: -474,
    name: "PrintFault",
    handler: (emu, lib: DosLibrary) => {
      lib.PrintFault();
      return emu.getRegister(0);
    },
  },
  // -480: ErrorReport
  // -486: (reserved)

  // ============================================
  // Process Management (##bias 492)
  // ============================================
  {
    offset: -492,
    name: "Cli",
    handler: (emu, lib: DosLibrary) => {
      lib.Cli();
      return emu.getRegister(0);
    },
  },
  // -498: CreateNewProc
  // -504: RunCommand
  // -510: GetConsoleTask
  // -516: SetConsoleTask
  {
    offset: -522,
    name: "GetFileSysTask",
    handler: (emu, lib: DosLibrary) => {
      lib.GetFileSysTask();
      return emu.getRegister(0);
    },
  },
  {
    offset: -528,
    name: "SetFileSysTask",
    handler: (emu, lib: DosLibrary) => {
      lib.SetFileSysTask();
      return emu.getRegister(0);
    },
  },
  // -534: GetArgStr
  // -540: SetArgStr
  {
    offset: -546,
    name: "FindCliProc",
    handler: (emu, lib: DosLibrary) => {
      lib.FindCliProc();
      return emu.getRegister(0);
    },
  },
  {
    offset: -552,
    name: "MaxCli",
    handler: (emu, lib: DosLibrary) => {
      lib.MaxCli();
      return emu.getRegister(0);
    },
  },

  // ============================================
  // Date/Time Routines
  // ============================================
  // -738: CompareDates
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

  // ============================================
  // Command Support
  // ============================================
  // -792: CheckSignal
  {
    offset: -798,
    name: "ReadArgs",
    handler: (emu, lib: DosLibrary) => {
      lib.ReadArgs();
      return emu.getRegister(0);
    },
  },
  // -804: FindArg
  // -810: ReadItem
  // -816: StrToLong
  // -822: MatchFirst
  // -828: MatchNext
  // -834: MatchEnd
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
  // -852: dosPrivate3 (private)
  {
    offset: -858,
    name: "FreeArgs",
    handler: (emu, lib: DosLibrary) => {
      lib.FreeArgs();
      return emu.getRegister(0);
    },
  },
  // -864: (reserved)

  // ============================================
  // Path Functions (##bias 870)
  // ============================================
  {
    offset: -870,
    name: "FilePart",
    handler: (emu, lib: DosLibrary) => {
      lib.FilePart();
      return emu.getRegister(0);
    },
  },
  {
    offset: -876,
    name: "PathPart",
    handler: (emu, lib: DosLibrary) => {
      lib.PathPart();
      return emu.getRegister(0);
    },
  },
  {
    offset: -882,
    name: "AddPart",
    handler: (emu, lib: DosLibrary) => {
      lib.AddPart();
      return emu.getRegister(0);
    },
  },
  // -888: StartNotify
  // -894: EndNotify
  // -900: SetVar
  // -906: GetVar
  // -912: DeleteVar
  // -918: FindVar
  // -924: dosPrivate4 (private)
  // -930: CliInitNewcli
  // -936: CliInitRun
  // -942: WriteChars
  // -948: PutStr
  {
    offset: -954,
    name: "VPrintf",
    handler: (emu, lib: DosLibrary) => {
      lib.VPrintf();
      return emu.getRegister(0);
    },
  },
  // -960: dosPrivate5 (private)
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
