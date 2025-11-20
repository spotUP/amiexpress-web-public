/**
 * DOS.library function vectors
 * Reference: AROS dos.library & AmigaOS LVO tables
 * LVO = Library Vector Offset (in bytes from library base)
 */
const DOS_VECTORS: LibraryVector[] = [
  {
    offset: -552, // LVO -552 - DOS OpenLibrary (critical for Bulls)
    name: "OpenLibrary",
    handler: (emu, lib: DosLibrary) => {
      const nameAddr = emu.getRegister(9); // A1
      const version = emu.getRegister(0); // D0
      const name = emu.readString(nameAddr);
      console.log(`[DOS] OpenLibrary("${name}", ${version})`);
      // Bulls needs dos.library to be opened successfully
      // Return dos.library base address at 0x20000
      emu.setRegister(0, 0x20000); // Return dos.library base
      return 0x20000;
    },
  },
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
    offset: -948,
    name: "PutStr",
    handler: (emu, lib: DosLibrary) => {
      return lib.PutStr();
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
    offset: -906, // LVO -906 (0xFFFFFC7A)
    name: "FGets",
    handler: (emu, lib: DosLibrary) => {
      lib.FGets();
      return emu.getRegister(0); // Returns buffer pointer or NULL
    },
  },
  {
    offset: -90, // LVO -90 - UnLock
    name: "UnLock",
    handler: (emu, lib: DosLibrary) => {
      lib.UnLock();
      return 0;
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
    offset: -150, // LVO -150 - FreeLock (same as UnLock for our purposes)
    name: "FreeLock",
    handler: (emu, lib: DosLibrary) => {
      lib.UnLock(); // FreeLock and UnLock do the same thing
      return 0;
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
      lib.WaitForChar();
      return emu.getRegister(0); // Returns -1 if char available, 0 if timeout
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
    offset: -126, // LVO -126 (0xFFFFFF82) - FindVar
    name: "FindVar",
    handler: (emu, lib: DosLibrary) => {
      lib.FindVar();
      return emu.getRegister(0); // Returns pointer to LocalVar structure in D0
    },
  },
  {
    offset: -534, // LVO -534 (0xFDE6) - V36+
    name: "GetArgStr",
    handler: (emu, lib: DosLibrary) => {
      lib.GetArgStr();
      return emu.getRegister(0); // Returns pointer in D0
    },
  },
  {
    offset: -576, // LVO -576 (0xFDC0) - V36+
    name: "GetCliProgramName",
    handler: (emu, lib: DosLibrary) => {
      lib.GetCliProgramName();
      return emu.getRegister(0); // Returns success/failure in D0
    },
  },
];
