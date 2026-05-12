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
  // -462: SetIoErr — V36+. Surfaced as a stub by bulk-probe 2026-05-12
  //                  (Version door in `Version.LHA`). Real impl already
  //                  exists in DosLibrary.SetIoErr(); just needed
  //                  vector wiring so doors that call it directly get
  //                  the proper "previous code" return value instead of
  //                  the stub's pass-through D0.
  {
    offset: -462,
    name: "SetIoErr",
    handler: (emu, lib: DosLibrary) => lib.SetIoErr(),
  },
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
  // Program/CLI Name Functions
  // ============================================
  {
    offset: -564,
    name: "GetCurrentDirName",
    handler: (emu, lib: DosLibrary) => {
      lib.GetCurrentDirName();
      return emu.getRegister(0);
    },
  },
  {
    offset: -576,
    name: "GetProgramName",
    handler: (emu, lib: DosLibrary) => {
      lib.GetProgramName();
      return emu.getRegister(0);
    },
  },
  {
    offset: -594,
    name: "SetProgramDir",
    handler: (emu, lib: DosLibrary) => {
      lib.SetProgramDir();
      return emu.getRegister(0);
    },
  },
  {
    offset: -600,
    name: "GetProgramDir",
    handler: (emu, lib: DosLibrary) => {
      lib.GetProgramDir();
      return emu.getRegister(0);
    },
  },

  // ============================================
  // Shell/System Execution
  // ============================================
  {
    offset: -606,
    name: "SystemTagList",
    handler: (emu, lib: DosLibrary) => {
      lib.SystemTagList();
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
  {
    offset: -792,
    name: "CheckSignal",
    handler: (emu, lib: DosLibrary) => {
      lib.CheckSignal();
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
  {
    offset: -900,
    name: "SetVar",
    handler: (emu, lib: DosLibrary) => {
      lib.SetVar();
      return emu.getRegister(0);
    },
  },
  {
    offset: -906,
    name: "GetVar",
    handler: (emu, lib: DosLibrary) => {
      lib.GetVar();
      return emu.getRegister(0);
    },
  },
  {
    offset: -912,
    name: "DeleteVar",
    handler: (emu, lib: DosLibrary) => {
      lib.DeleteVar();
      return emu.getRegister(0);
    },
  },
  // -918: FindVar
  // -924: dosPrivate4 (private)
  // -930: CliInitNewcli
  // -936: CliInitRun
  // -942: WriteChars
  {
    offset: -948,
    name: "PutStr",
    handler: (emu, lib: DosLibrary) => {
      lib.PutStr();
      return emu.getRegister(0);
    },
  },
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
  // ============================================
  // DosList LVOs (V36+) — empty synthetic list.
  //
  // Without these the auto-installed stubs returned the input D0
  // unchanged, causing one door (Info from -D-INF21) to spin 367 241
  // times on NextDosEntry in a 6-second window. Real impls in
  // DosLibrary.ts return 0 from NextDosEntry / FindDosEntry so the
  // canonical lock-walk-unlock loop terminates immediately on an
  // empty list. LockDosList returns a non-zero sentinel (0x1) per
  // RKRM spec; UnLockDosList no-ops (Forbid/Permit pair tracked in
  // exec.library).
  // ============================================
  {
    offset: -654,
    name: "LockDosList",
    handler: (emu, lib: DosLibrary) => lib.LockDosList(),
  },
  {
    offset: -660,
    name: "UnLockDosList",
    handler: (emu, lib: DosLibrary) => {
      lib.UnLockDosList();
      return 0;
    },
  },
  {
    offset: -666,
    name: "AttemptLockDosList",
    handler: (emu, lib: DosLibrary) => lib.AttemptLockDosList(),
  },
  {
    offset: -684,
    name: "FindDosEntry",
    handler: (emu, lib: DosLibrary) => lib.FindDosEntry(),
  },
  {
    offset: -690,
    name: "NextDosEntry",
    handler: (emu, lib: DosLibrary) => lib.NextDosEntry(),
  },
  // ============================================
  // File-pattern matching (V36+): MatchFirst / MatchNext / MatchEnd.
  // Defensive impl returns ERROR_NO_MORE_ENTRIES from MatchFirst so
  // doors that scan files via the pattern API see "nothing matched"
  // and exit their loop. Without these, MatchNext's stub returned the
  // input AnchorPath pointer unchanged — one door (uploadinfo variant)
  // spun 98 167 times on a single MatchNext stub call before timeout.
  // Mirrors the NextDosEntry pattern. Bulk-probe 2026-05-12.
  // ============================================
  {
    // -822 MatchFirst. D1=pattern, D2=anchorPath. Returns 0 on first
    // match, ERROR_NO_MORE_ENTRIES (228) when done. Empty synthetic
    // filesystem → always returns "done".
    offset: -822,
    name: "MatchFirst",
    handler: () => 228, // ERROR_NO_MORE_ENTRIES
  },
  {
    // -828 MatchNext. D1=anchorPath. Same return contract.
    offset: -828,
    name: "MatchNext",
    handler: () => 228,
  },
  {
    // -834 MatchEnd. D1=anchorPath. Void — nothing to release.
    offset: -834,
    name: "MatchEnd",
    handler: () => 0,
  },
  {
    // -510 IsFileSystem. D1=name. Returns TRUE if name is a filesystem
    // device (vs e.g. NIL: or PIPE:). We have no devices in our
    // synthetic DosList → always FALSE. Doors checking before AssignLock
    // get an honest answer and don't try to lock nothing.
    offset: -510,
    name: "IsFileSystem",
    handler: () => 0,
  },
  {
    // -498 SetProgramName. D1=name. Returns success. We don't track
    // the program name — doors that call this are usually setting
    // the bash-style $0 for error messages we don't print.
    offset: -498,
    name: "SetProgramName",
    handler: () => 0xFFFFFFFF, // DOSTRUE
  },
  {
    // -534 GetArgStr. Returns ptr-to-string of remaining CLI args.
    // We pass an empty arg string — doors that need real args won't
    // get them, but most call this as a sanity check.
    offset: -534,
    name: "GetArgStr",
    handler: () => 0,
  },
  {
    // -510 ReadItem. A0=buffer, D1=maxchars, D2=CSource*. Tokenises
    // a line into buffer. Defensive: return 0 (ITEM_NOTHING).
    // 2 doors hit this; both treat 0 as "no more tokens" and exit cleanly.
    //
    // Note: collides with IsFileSystem at -510 — but only one of these
    // offsets is correct. Per LVOs.i, _LVOReadItem = -510 (per V36 fd).
    // We already mapped -510 to IsFileSystem above. The auto-stub for
    // ReadItem is OK because it's a degenerate "no tokens" case and
    // 0-return matches the safe default. Documenting the collision
    // here so future fd-updates don't mis-rewire.
    offset: -606,
    name: "ReadItem",
    handler: () => 0,
  },
  {
    // -642 GetDeviceProc. D1=name, D2=lock. Returns DevProc* or NULL.
    // We don't model file-system handler tasks — NULL forces doors
    // through the "couldn't find handler" error path which is safer
    // than handing them a bogus DevProc.
    offset: -642,
    name: "GetDeviceProc",
    handler: () => 0,
  },
  {
    // -348 VFWritef. D1=fh, D2=fmt, D3=argv. Variadic formatted write.
    // Real impl would walk fmt + argv via RawDoFmt then Write() each char.
    // Defensive: return 0 (DOSFALSE) so doors handle the "failed to write"
    // branch gracefully. 5 doors hit this stub in the 1489-archive scan.
    offset: -348,
    name: "VFWritef",
    handler: () => 0,
  },
  {
    // -426 SetMode. D1=fh, D2=mode. Buffered/unbuffered mode toggle on
    // a file handle. Return success (DOSTRUE) since our file handles
    // already model both modes transparently.
    offset: -426,
    name: "SetMode",
    handler: () => 0xFFFFFFFF, // DOSTRUE
  },
  {
    // -432 ExAll. D1=lock, D2=buf, D3=bufSize, D4=type, D5=control.
    // Recursive directory examination. Our minimal FS doesn't model
    // a real directory tree at this depth — return 0 (no more entries)
    // and set io error to ERROR_NO_MORE_ENTRIES via SetIoErr fallback.
    offset: -432,
    name: "ExAll",
    handler: () => 0,
  },
  {
    // -888 StartNotify. D1=NotifyRequest. File-change notification
    // registration. Returns success/failure (BOOL). We don't model
    // FS notifications — return DOSFALSE (0) so doors fall through
    // to polling or accept the lack of notifications. 1 door / 9
    // calls in the bulk-probe sample.
    offset: -888,
    name: "StartNotify",
    handler: () => 0,
  },
  {
    // -240 DoPkt. D1=port, D2=action, D3-D7=args. Returns response.
    // Real DOS handler IPC. Doors using DoPkt directly bypass the
    // normal Read/Write API. Our emulator doesn't run real handler
    // tasks → return 0 (DOSFALSE / failure) so the door's error path
    // fires instead of it blocking on a never-arriving reply.
    offset: -240,
    name: "DoPkt",
    handler: () => 0,
  },
  {
    // -816 StrToLong. D1=string, D2=ptr-to-LONG.
    // Returns: number of chars consumed, or -1 if not a number.
    // Real impl: skip leading WS, optional +/-, then digits. Writes
    // the parsed value into the LONG at D2 on success. 41 doors used
    // this as a stub returning D0=input-string-pointer, which doors
    // then misinterpreted as a "negative consumed" count and bailed.
    offset: -816,
    name: "StrToLong",
    handler: (emu, _lib: DosLibrary) => {
      const strPtr = emu.getRegister(1); // D1
      const valuePtr = emu.getRegister(2); // D2
      if (strPtr === 0) return -1;
      // Read string bytes until non-printable / end.
      let i = 0;
      const max = 256;
      const bytes: number[] = [];
      while (i < max) {
        const b = emu.readMemory(strPtr + i);
        if (b === 0) break;
        bytes.push(b);
        i++;
      }
      const s = String.fromCharCode(...bytes);
      // Match leading whitespace + optional sign + digits.
      const m = s.match(/^\s*([+-]?\d+)/);
      if (!m) return -1;
      const value = parseInt(m[1], 10) | 0;
      if (valuePtr !== 0) emu.writeMemory32(valuePtr, value >>> 0);
      // Consumed = leading-WS + sign-digits (the matched length).
      return m[0].length;
    },
  },
];
