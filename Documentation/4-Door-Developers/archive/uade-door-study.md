# UADE-Based Door Emulation Study

This note distills the parts of UADE’s Amiga-side “score” plus the Unix host helpers that map directly to what our AmiExpress-Web door runtime still needs. Line references use the checkout paths in this repo.

## 1. UADE IPC + File I/O Model

- `dev/docs/uade/src/uade.c:461-536` shows how the score asks the host for file access via `AMIGAMSG_LOADFILE`, `AMIGAMSG_READ`, and `AMIGAMSG_FILESIZE`. Each request:
  * Reads the filename pointer from `$204`, validates it, and looks up the content via `lookup_amiga_file_cache()`.
  * Hands back size/bytes via `$208-$214`.
  * Logs a debug string so differences are visible when doors use the API.
- `lookup_amiga_file_cache()` (same file, lines 336-358) implements a one-file cache, calling `uade_request_amiga_file()` if the filename is new and invalidating the previous entry when a new file is cached.
- `dev/docs/uade/src/frontends/common/uadestate.c:333-410` and `frontends/include/uade/uadeipc.h` detail the host side of the transaction. When the score sends a `UADE_COMMAND_REQUEST_AMIGA_FILE`, the frontend:
  * Derives `playerdir`/`moduledir` from the currently loaded player/module.
  * Calls `uade_load_amiga_file()`, which wraps `uade_find_amiga_file()` and then `uade_file_load()` to deliver an in-memory blob.
  * Responds with a `uade_file` (filename, data pointer, size) so the score can satisfy follow-up READ/FILESIZE commands without reentering the host.
- `dev/docs/uade/src/frontends/common/unixsupport.c:110-199` implements `uade_find_amiga_file()` which emulates assigns:
  * `ENV:` → `<playerdir>/ENV`, `S:` → `<playerdir>/S`, `Instruments:` → `<module dir>/instruments`, and relative paths from `./`.
  * Case-insensitive directory scans (`uade_amiga_scandir`) ensure Amiga paths find real files even on case-sensitive hosts.

**Takeaway:** we already have `PathManager`, `AmigaFileCache`, and `FileManager` scaffolding, but the UADE flow proves we must (1) resolve every DOS `Open/LoadSeg/Lock` through an assign-aware resolver and (2) keep cached copies per filename so repeated `Read` calls never re-open a file. We should also mirror UADE’s debugging (log the final Amiga path + host path per request) to trace stubborn doors.

## 2. score.s DOS + Exec Hooks

- `dev/docs/uade/amigasrc/score/score.s:2086-2350` is the blueprint for our `dos.library` stubs:
  * `dos_lock` stores the last lock name and simply calls `dos_open`/`dos_close` to verify existence. It returns a fake lock pointer (always `$F0000000`) instead of a BPTR.
  * `dos_currentdir` copies the last lock into `curdir` and emits a warning string (“warning: using dos.library/CurrentDir()”) so host side logs prove when a module falls back to relative paths.
  * `dos_fixfilename` prepends `curdir` when the incoming path lacks a `:` assign, allocating a new buffer via `exec_alloc_mem`.
  * `dos_open`, `dos_read`, `dos_seek`, and `dos_close` don’t touch a filesystem at all—the score builds small message structs (`.dosopenmsg`, `dosreadmsg`) with the filename, offset, and length, sends them via `put_message`, then copies the results out of `msgptr`.
  * `dos_loadseg` emits a warning, constructs a `AMIGAMSG_LOADFILE` request, copies the file into CHIPRAM (`chippoint`), and runs a simple relocator.
- Exec/device/libraries:
  * `exec_supervisor`, `exec_open_device`, `exec_doio`, `exec_waitio`, `exec_open_library`, `exec_open_resource`, `exec_typeofmem`, etc. are all simple stubs (`score.s:2321-2880`). For example timer.device returns a fake IO unit but flips `vblanktimerstatusbit` when `TR_ADDREQUEST` completes, and `OpenLibrary` only recognizes `dos.library`, `uade.library`, and `icon.library`.
  * `exec_cause` patches soft interrupts by writing the handler pointer into `TRAP_VECTOR_3` and calling the code with `A5`/`A3` set up.
  * `OpenLibrary` registers every opened library in `dos_lib_base`/`uade_lib_base` structures and logs warnings if an unknown name appears (`openlibwarnmsg`).
- Message port semantics:
  * `exec_open_library`/`exec_open_device` rely on working `FindPort/CreatePort/Wait/GetMsg/ReplyMsg` which the score expects to be functional before any `SystemTagList` call happens.
  * `JH_*` command IDs (`~/Code/Reference/AmiExpress-Sources/axcommon.e:72-195`) match XIM message types our `XIMProtocol` exposes (`JH_WRITE`, `JH_PM`, `DT_*`, `BB_*`, etc.).

**Takeaway:** replicate the behaviors, not just the APIs. For example, our `DosLibrary` should log the same warnings when `CurrentDir()` is used and should stash the original Amiga path with each lock (so we can reapply relative paths, exactly like `dos_fixfilename`). Exec stubs (Supervisor, OpenDevice(timer/audio), WaitIO, GetMsg/PutMsg) must match the score’s expectations or Bulls bails out before entering the XIM loop.

## 3. Kickstart + Memory Layout

- `dev/docs/uade/src/include/memory.h:39-92` and `src/memory.c:420-485` configure `kickmem_bank` at `$F80000` with `kickmem_size = 0x80000`. All illegal writes log errors unless `ersatzkickfile` is set.
- `default_xlate()` (memory.c:494-499) falls back to `kickmem_xlate(get_long(0xF80000))`, which is how UADE survives bogus pointers without a full ROM boot.

**Takeaway:** We already load the Bulls binary directly, but the UADE strategy reminds us: even when we skip Kickstart, we must populate the exception vectors (`ExecLibrary.setupExceptionVectors()`) and provide safe fallbacks for `get_real_address()` lookups. Mapping ExecBase at `$10000` and ensuring the exception table contains stub handlers is the minimum Kickstart parity we need.

## 4. AmiExpress Door Launch Semantics (express.e)

- `~/Code/Reference/AmiExpress-Sources/express.e:4231-4370` (`runDoor`) shows the exact sequence when `/X` starts a door:
  1. Build the CLI string `"<door_binary> <node>"`.
  2. Select the port name: `AEDoorPort<Node>` for XIM, `DoorControl<Node>` for SIM/TIM/TIM doors.
  3. If the port doesn’t exist, `createPort()` is called before launching the process.
  4. `startProcess()` (express.e:3304-3334) wraps `SystemTagList` with tags for `SYS_INPUT`, `SYS_OUTPUT`, `SYS_ASYNCH`, `NP_STACKSIZE`, etc. When `doorTrap` is enabled, output is redirected to `Node#/StartProcess`.
  5. For XIM doors, the BBS loops forever waiting on `Wait(ximSig)` then `GetMsg(mp)` and dispatches each `jhMessage` via `processXimMsg()`.
- The `jhMessage` structure lives in `~/Code/Reference/AmiExpress-Sources/axcommon.e:543-557` (message node header + 200 byte string + data/command fields), and `MAX_CMD` is 1003 (`axcommon.e:364`).

**Takeaway:** our runtime must emulate two separate processes: the door (68k) and the host side message pump. Bulls will only enter its internal loop once it can `FindPort("AEDoorPort1")`, `CreatePort()` for a reply port, and receive signal bits back when the BBS replies. That means:
  * Exec’s port registry must match the semantics from express.e, including `mp.sigbit` bitmasks.
  * The CLI (pr_CLI, arguments, stack size) should mirror `startProcess()` tags so doors see the expected environment.

## 5. Plan to Finish XIM Door Emulation

1. **Complete DOS path semantics**
   - Ensure `DosLibrary.enableNewFileSystem()` seeds `curdir` from `Lock()` like UADE’s `lastlock` buffer (`score.s:2086-2135`). Every `Lock` result should stores both the host path and the original Amiga path so `dos_fixfilename` style logic can prepend the `CurrentDir` string before resolving relative opens.
   - Mirror UADE’s cache flow by logging the Amiga path, resolved host path, and size for each `Open/Read/LoadSeg` so we can diff against a real Bulls log.

2. **Exec port + signal fidelity**
   - Drive `ExecLibrary.createPort/AddPort/FindPort/Wait/GetMsg/Signal` from a shared registry exactly like the score expects (one `AEDoorPort` per node registered up front; door reply ports created on demand). When `PutMsg` queues an entry, write it into the `mp_MsgList` like UADE does and trigger `Signal(mp_SigTask, 1<<mp_SigBit)`.
   - Implement `Wait()` so it blocks until `sigRecvd & sigWait` matches (store the wait mask and only return once `Signal` sets the bit). Right now it returns immediately, so the door’s `Wait()` loop runs busy and may bail out.

3. **AE.Master/AEDoorPort injection**
   - In `AmigaDoorSession`, create/register `AE.Master` and `AEDoorPort#` message ports before the door sees Exec (Mirrors `runDoor`’s `FindPort + createPort`). Set up the `mp.sigbit` values and `mp.sigTask` to point at the BBS-side pseudo task so `Wait` and `Signal` use real masks.
   - Populate the door’s data segment (A4 offsets `0x44C`, `0x450`, `0x474`) as soon as Bulls copies its global struct, but also update the struct when `CreatePort` returns—the binary might allocate its own reply port later.

4. **Kickstart/Exec base polish**
   - Keep ExecBase at `$10000`, but also write the library list/port list headers so `FindPort` can walk them like real Exec (`ExecLibrary.initializeExecList`). UADE’s `default_xlate()` fallback warns when memory is bogus—add a similar guard to our `MoiraEmulator.readString()`/`readMemory32()` wrappers so we immediately log when the door pokes invalid addresses.

5. **Host side XIM pump**
   - Verify `XIMProtocol` handles every `JH_`/`DT_` code from `processXimMsg` (express.e:3372-3900). Add logging for unimplemented commands so we know which ones the door requests; matching express.e is key.
   - Make sure our socket input feeds `JH_LI/JH_PM` exactly like express.e expects (line input timing, carriage returns, etc.).

6. **Validation**
   - Compare our backend log with the real Amiga trace in `~/Code/amiexpress_doors/bulls.log`: Bulls should log the same `Lock/Open` sequence. Add instrumentation around `DosLibrary.lock/openCurrentDir` to print a condensed summary so we can diff per door run.
   - Once Bulls moves past the banner, capture the XIM traffic to ensure our replies match express.e (order of `JH_REGISTER`, `JH_WRITE`, DT queries, etc.).

Following the score/UADE blueprint gives us enough information to finish the door runtime: every missing behavior is spelled out in either `score.s` (DOS/Exec stubs) or `express.e` (XIM host loop). Implementing the plan above should unblock Bulls and any other legacy 68K doors.
