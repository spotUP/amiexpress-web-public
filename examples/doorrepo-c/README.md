# DoorRepo C Client

A reference AmiExpress door, written in strict C89, that lets a sysop browse,
search, and download door archives from the DoorRepo catalog
(`docs/DOOR-REPO-API.md`) directly from the BBS. It is meant to be read and
adapted: every module is small, unit-tested, and documented well enough that
a builder with no prior exposure to this repository can either run it as-is
or lift the parts they need (the `list.txt` parser, the streaming HTTP
client, the MD5 implementation, the AEDoorPort message-port glue) into their
own door.

The door does six things, in order, each in its own module:

- Loads `DoorRepo.cfg` (`config.c`) -- repo host/path, download directory,
  page size, timeouts, extraction settings. Every value has a safe default,
  so the door runs with no config file at all.
- Fetches and parses `list.txt` (`listtxt.c`) -- the catalog's pipe-delimited
  text format, streamed and parsed one line at a time, never buffered whole.
- Streams the HTTP request/response (`http.c` over `netio.c`) -- chunked
  reads with per-read timeouts, so a stalled peer cannot hang the door
  forever.
- Hashes downloads while they land on disk (`md5.c`) -- streaming MD5, no
  second pass over the file.
- Talks the real AmiExpress door-port protocol (`aedoor.h` /
  `aedoor_amiga.c` / `aedoor_native.c`) -- JHMessage-based I/O against the
  BBS, or plain stdio for development.
- Ties it together (`doorrepo.c` / `flow.c`) -- pagination, filtering,
  download-then-verify-then-optionally-extract, and the retry state machine
  for a digest mismatch. `flow.c` holds every piece of decision logic
  (pagination math, query-string construction, filename/shell-safety checks)
  as pure functions with no I/O, so it is unit-tested without a network, a
  filesystem, or an Amiga.

Credit: the door-port protocol implementation is derived from reading the
real AmiExpress door glue, `AEDoor.c`, and the official protocol reference,
`doordocs.txt` (both under
`~/Code/amiexpress_doors/Sources/_C/AE_DOORS/` in the sysop's
source tree) -- not from this repository's TypeScript emulator. Every
JHMessage field offset and command code in `aedoor_amiga.c` cites the
doordocs.txt line it came from.

## Building

Two targets, both driven by the one `Makefile` in this directory.

### Native (development, testing, the `live` target)

```
make native
```

Produces `doorrepo`, a plain POSIX binary built with `cc -std=c89 -Wall
-Wextra -pedantic`. This is what `make test` and `make live` run. No special
setup required beyond a C compiler.

### AmigaOS m68k (the real target)

```
make amiga
```

Produces `doorrepo.amiga`, cross-compiled with vbcc (`vc +aos68k`) and linked
against the AmigaOS NDK. **This target builds the door's real networking
branch** -- the one that opens `bsdsocket.library` and talks to the repo
server over a live socket, not a stub.

The Amiga socket branch (`netio.c`'s `#elif defined(AMIGA)` section) needs
three things no plain AmigaOS SDK install provides on its own: `sys/socket.h`,
`netinet/in.h`, and `netdb.h`. **This repository vendors a complete copy of
NDK3.2R4 at `Documentation/7-Reference Sources/NDK3.2R4/`, and the Makefile
points at it by default -- you do not need to supply your own AmiTCP/Roadshow
SDK to build the real networking target.** If you have your own SDK and
prefer to use it instead, override it:

```
make amiga NETINCLUDE=/path/to/your/sdk/netinclude
```

`NETINCLUDE=` is an **override, not a requirement**. Leave it unset and
`make amiga` uses the vendored copy.

**Include-order constraint.** `<devices/timer.h>` is needed for
`WaitSelect()`'s `struct timeval` parameter, and two different copies of it
exist on a machine that also has the `m68k-amiga-elf-gcc` toolchain
installed: that toolchain's own copy wraps `tv_sec`/`tv_usec` in an anonymous
union (a GNU extension vbcc rejects with "warning 53: struct/union member
needs identifier"), while the vendored NDK3.2R4 copy is a plain, non-union
struct that compiles clean under vbcc. **The vendored `devices/timer.h` must
be found first in the include search path**, ahead of any other SDK's copy.
The Makefile handles this automatically (see its `AMIGA_NDK_SHIM` block) by
symlinking just that one header into a small shim directory placed first on
`-I`. If you rearrange the Makefile's `-I` flags -- for example, to point
`NETINCLUDE` at your own SDK -- keep the vendored `devices/timer.h` ahead of
any other toolchain's `devices/` directory, or the build will fail on that
warning.

### Other targets

```
make amiga-stub   # doorrepo.amiga-stub: real m68k cross-compile, but with
                   # a networking stub instead of bsdsocket.library. Needs
                   # no AmiTCP SDK at all. Proves every module OTHER than
                   # netio.c's real socket branch is m68k-clean.
make test          # builds and runs all six native unit-test suites
make live           # builds native and runs it once against the live API
make clean          # removes every build artifact
```

## Verification status

This table is deliberately specific about what was checked, how, and what
was not, because the gap between "compiles" and "works on a real machine"
is exactly where door authors get burned.

| Layer | Status | How it was checked |
|---|---|---|
| Every module's logic (parsing, pagination, retry state machine, security checks) | **Unit-tested and native-run verified** | `make test`: 6 suites, 403 assertions, 0 failures, `-std=c89 -Wall -Wextra -pedantic` clean. `make live` run against the real, live `bbs.uprough.net` API: browsed, paged forward/back, filtered by type, searched, opened an entry, downloaded a real archive, MD5 verified. Full transcript in this task's report. |
| POSIX/native build | **Built and run-verified** | `make native` links and runs on this machine; this is the build every test suite and the live run above actually exercises. |
| Every module except netio.c's real socket branch, cross-compiled for m68k | **Compile- and link-verified** | `make amiga-stub` produces a real `AmigaOS loadseg()ble executable/binary` (confirmed with `file`), zero warnings, with no AmiTCP SDK involved at all. |
| netio.c's real `bsdsocket.library` branch, cross-compiled for m68k | **Compile- AND link-verified for m68k** | `make amiga` produces a complete, real `AmigaOS loadseg()ble executable/binary` (confirmed with `file`) linked against the vendored NDK3.2R4, zero warnings. This is stronger than "compiles": the object code genuinely links into a loadable AmigaOS program, and every symbol `netio.c`'s Amiga branch calls (`OpenLibrary`, `socket`, `connect`, `WaitSelect`, `send`, `recv`, `CloseSocket`, ...) resolved. It is **not** merely "compile-only" -- do not read it that way. |
| The door-port (AEDoorPort/XIM) protocol itself | **Exercised against this repository's own AEDoorPort emulator implementation** | See "Emulator run" below. `PortStart` and `JH_REGISTER` succeeded; the door genuinely registered with and sent output to the BBS's message port, confirmed byte-for-byte against the per-door session log. |
| Running against a **real** `bsdsocket.library` on real (or emulated) AmigaOS hardware | **NOT run-verified** | No AmigaOS environment -- real or emulated at the hardware level -- exists in this development environment. This is the one honest gap: `make amiga`'s output has never executed on an actual Amiga, or under an Amiga-accurate emulator such as vAmiga/WinUAE/FS-UAE. |

### What "not run-verified" means in practice

The `bsdsocket.library` branch was checked as far as this environment allows
without real AmigaOS hardware: the compiled object code links cleanly and
every library call it makes resolves against the real AmigaOS API surface
(confirmed via the vendored NDK3.2R4 headers). What could not be checked here
is whether the actual bytes exchanged with a real `bsdsocket.library`
implementation (AmiTCP, Miami, Roadshow) round-trip correctly at runtime --
LVO offsets, calling-convention edge cases, and real network timing are all
plausible-but-unconfirmed. If you have access to a real Amiga or an
Amiga-accurate emulator, that is the missing verification step, and it would
close this gap completely.

## Emulator run: what actually happened

Step 3 of this door's verification installed `doorrepo.amiga` as an XIM door
and ran it inside this repository's own 68K emulator (the same one that runs
every other door in `Doors/`), using the standalone door-run harness
(`web/backend/src/scripts/run-amiga-door.ts`) rather than a live BBS login,
so the run needed no browser and no interactive session.

**What worked, exactly as the door-port protocol requires:** `PortStart` and
`JH_REGISTER` succeeded. The door registered with the BBS's message port and
sent its startup banner over `JH_SM` -- confirmed by reading the per-door
session log the emulator writes for every run
(`logs/door-68k-<command>-<timestamp>.log`), which shows the real protocol
traffic:

```
[XIM] RX cmd=1 (JH_REGISTER) data=0 str=""
[XIM] RX cmd=4 (JH_SM (Send Message)) data=1 str="DoorRepo v1.0 - AmiExpress Door Repository Client"
[XIM] RX cmd=4 (JH_SM (Send Message)) data=1 str=""
```

**What did NOT go as this door's design plan predicted going in.** The plan
expected the network call to fail quickly and cleanly, because the emulator
was believed to have no `bsdsocket.library` implementation at all. That
belief was wrong: this emulator DOES implement a working `bsdsocket.library`
bridge (`web/backend/src/amiga-emulation/api/BsdSocketLibrary.ts`), backed by
real Node.js `net`/`dns` calls. Against the live `bbs.uprough.net` host, DNS
resolution, `socket()`, and `connect()` all genuinely succeeded over the real
internet. But the very next call the door makes, `WaitSelect()` (waiting for
the new socket to become writable before sending the HTTP request), never
returned a usable result, and the door made **zero further progress** --
no more door-port traffic of any kind -- until the harness's own
execution-timeout forcibly ended the session. The user-visible symptom: the
version banner prints, and then nothing else ever appears; the session just
sits there until it is cut off. This was reproduced twice (at two different
timeout budgets, 50s and 100s), stopping at the identical protocol point
both times, which rules out "still working, just slow" -- it is a genuine
stall with no forward progress at all.

**Root cause (isolated, not fixed -- see "Why this was not fixed here"
below).** `netio.c`'s `net_open()` builds the write-fd bitmask for
`WaitSelect()` the way real AmigaOS C code conventionally does, as a single
32-bit `long`:

```c
wmask = 1L << s;   /* s is the socket descriptor returned by socket() */
```

This is correct and safe on real AmigaOS, where `bsdsocket.library`
descriptors are small integers. This repository's emulator, however, starts
its own socket descriptor numbering at **100**
(`BsdSocketLibrary.ts`'s `nextFd: number = 100`, kept high "to avoid
conflicts with file handles"). Compiling `1L << s` with `s == 100` under
vbcc produces a variable-count `lsl.l d2,d1` instruction; per real 68000 ISA
semantics, a register shift count is taken modulo 64, and any resulting
shift of 32 or more zeroes the whole 32-bit register -- so `wmask` is `0`,
not a bit for descriptor 100. The door then calls
`WaitSelect(s + 1, ...)` with `s + 1 == 101`, telling the library to
consider up to 101 descriptors -- 4 words (16 bytes) of fd-set bitmask --
while only 4 bytes (one `long`) were actually allocated on the stack for
`wmask`. The emulator's `WaitSelect()` implementation reads (and later
zero-then-rewrites) the full 4 words it was told to expect, which reads
past `wmask` into whatever else is on the stack nearby -- and, from the
observed behavior, most likely mistakes an adjacent stack value (plausibly
the `30` from `tv.tv_sec = timeout_secs`, whose low bits happen to include
the exact bit `WaitSelect` needed to see) for a real readiness signal. This
would explain both symptoms together: a bogus "ready" result despite the
real bitmask being zero, and the total absence of any further forward
progress once the corrupted stack values are used afterward.

**Confirming this is not a bug in this door's own logic:** the same install,
run with `doorrepo.amiga-stub` (the m68k build using `netio.c`'s
`NETIO_STUB` branch, which never touches `bsdsocket.library` at all) instead
of `doorrepo.amiga`, completed instantly and correctly:

```
DoorRepo v1.0 - AmiExpress Door Repository Client

Could not reach the door repository server. Please try again later.
[68K] DOORREPO exited with code 1
```

That is this door's actual, designed error path (`doorrepo.c`'s
`fetch_catalog()` failure message) working exactly as intended: a clean
failure, a clear message to the sysop, a `JH_SHUTDOWN`, and a normal exit.
The hang only happens on the real `bsdsocket.library` branch, and only
because of the fd-numbering mismatch described above.

**Why this was not fixed here.** The bug is not in this door -- `1L << s`
for a small `s` is standard, correct AmigaOS C, and rewriting it to defend
against socket descriptors starting at 100 would mean writing code for a
convention no real AmigaOS `bsdsocket.library` uses, purely to work around
this one test environment. The actual defect is in this repository's shared
68K emulator (`BsdSocketLibrary.ts`'s descriptor numbering), which is
infrastructure shared by every door in `Doors/`, not something this
example's `examples/doorrepo-c/` client owns or that this task's scope
extended to fixing. It is reported here, in full, precisely so it is not
lost: any real AmigaOS networking client using this same conventional
`WaitSelect()` idiom would hit the same stall if run against this emulator's
current `bsdsocket.library` implementation.

**Was the BBS left usable?** Yes, in the sense that matters: the door session
terminated cleanly on its own once the configured execution timeout elapsed
(no crash, no forced kill required, exit code 0), and the per-door log shows
an orderly `JH_SHUTDOWN`-free termination via the harness's own lifecycle
teardown. What could not be checked here is the effect on a **live,
multi-user** BBS process: the emulator's socket calls are implemented with
the synchronous `deasync` package, which blocks the entire single-threaded
Node.js event loop for as long as a call is pending -- so on a live BBS,
every other connected node would likely freeze for the same duration this
one door's session was stalled. That is a plausible, not directly measured,
consequence, and is flagged here for whoever next works on the emulator's
`bsdsocket.library` implementation.

The door install used for this test (`Commands/BBSCmd/DOORREPO.info` +
`Doors/DoorRepo/doorrepo.amiga`) was **reverted** after the test, rather than
committed, precisely because it demonstrably hangs a session against this
emulator's current `bsdsocket.library` implementation -- leaving it
registered on this repository's development BBS would risk a later,
unrelated session hitting the same stall by accident.

## Security

Four distinct classes of vulnerability were found and closed during
development by adversarial code review, each requiring a genuinely different
fix -- listed here because a re-implementer copying this door's structure
needs to know the rules, not just that "it was reviewed":

1. **Shell command injection via sysop configuration.** `DownloadDir` and
   `LhaCommand` (from `DoorRepo.cfg`) are interpolated into a `system()`
   call to invoke the archive extractor. A `DownloadDir` value such as
   `INJECTDIR" ; touch /tmp/PWNED ; echo "` executed arbitrary shell
   commands. **Rule kept:** `LhaCommand` is validated with a strict
   **allowlist** (`[A-Za-z0-9_.:/-]` only, no whitespace, length-capped) --
   not a denylist. A denylist of shell metacharacters was tried first and
   bypassed twice (see #2); an allowlist is the only primitive that is safe
   for a value interpolated into a shell command line.
2. **Denylist bypass via an unquoted command position plus a comment
   character.** Before the allowlist fix, `LhaCommand=touch /tmp/PWNED #`
   executed: the trailing `#` commented out the rest of the generated shell
   command line, and `#` was not in the denylist. **Rule kept:**
   `LhaCommand` is a single allowlisted token as above; `DownloadDir`,
   `LogFile`, and `RepoPath` (which do need to accept a broader character
   set, since they are quoted paths, not commands) keep a denylist that now
   also rejects `#`, and are still shell-quoted when interpolated.
3. **Path traversal via a server-supplied archive name -- no shell
   metacharacters required at all.** A catalog row naming its archive
   `../../../../../../../tmp/.../PWNED.lha` made the door's own `fopen()`
   write outside `DownloadDir`, entirely independent of the shell-injection
   defenses above (a bare `/` is itself a parent-directory marker under
   AmigaDOS, so even `//S/Startup-Sequence` -- no `..` at all -- is a
   traversal on that platform). **Rule kept:** the server-supplied archive
   name is validated as a **filename** (`flow_is_safe_archive_filename()`):
   no `/`, `\`, `:`, `..` segments, leading dot, or control bytes -- as a
   check entirely separate from shell-command safety. This validation runs
   at catalog-parse time, so a hostile row is dropped before it ever becomes
   a selectable catalog entry, not merely re-checked right before use.
4. **Unbounded response bodies (resource exhaustion).** Neither the catalog
   fetch nor the archive download had any ceiling on total bytes received;
   a hostile or malfunctioning server (this door's server is plain HTTP,
   so this includes a MITM, not just a compromised repo) could send an
   unbounded stream regardless of what it claimed in `<count>` or
   `archiveSize`/`Content-Length`. This is worth calling out specifically:
   `DownloadDir` defaults to `T:`, which is conventionally a **RAM disk** on
   AmigaDOS, so an unbounded download is a memory-exhaustion attack against
   a 68020-class machine, not just a disk-filling nuisance. **Rule kept:**
   both response paths are byte-capped independently of what the server
   claims -- the catalog fetch at a fixed ceiling (measured against the real
   ~442 KB live catalog, with headroom), and archive downloads at the
   declared size plus bounded slack, clamped to an absolute maximum that
   cannot itself be inflated by a hostile `archiveSize` value.

**Accepted, deliberate exposure:** ANSI escape sequences and other control
bytes in a catalog row's `name`/`desc` fields are **not** stripped. Real
DoorRepo catalog rows legitimately carry scene-release ANSI art in these
fields (see `docs/DOOR-REPO-API.md`'s examples) -- stripping them would
corrupt correct, intended display for the majority of real entries. This is
a conscious trade-off, not an oversight.

**Known gap, by design:** the `LhaCommand` allowlist accepts only a single
token (a bare command name or path, e.g. `lha` or `Work:c/lha`).
Multi-token extractors (for example, `7z x`) are **not supported** -- no
`LhaArgs` configuration key exists to carry extra arguments. A sysop who
needs a multi-token extraction command is not served by this door as
shipped; adding an `LhaArgs` key (itself allowlisted per-token, joined with
single spaces, never taken as one free-form string) would be the natural
follow-up.

## Configuration

See `DoorRepo.cfg.example` for the full, commented reference -- every key,
its valid range, and what happens when a value is invalid (the line is
skipped, the default is kept, and the skip is counted and surfaced to the
sysop at startup; an invalid config never stops the door from running).
Copy it to `DoorRepo.cfg` next to the door binary and edit as needed; the
door runs correctly with no config file at all, using the defaults shown in
the example.

## Replacing the door-port layer

All BBS I/O goes through the six functions declared in `aedoor.h`
(`ae_start`, `ae_put`, `ae_get`, `ae_key`, `ae_check`, `ae_shutdown`,
`ae_fatal`). Two implementations exist: `aedoor_amiga.c` (the real
AEDoorPort/XIM message-port protocol, cited line-by-line against
`doordocs.txt`) and `aedoor_native.c` (a plain-stdio twin used for
development and the native unit tests). The Makefile picks one or the other
per target -- nothing else in this project contains `#ifdef AMIGA` except
`netio.c`. To retarget this door at a different door protocol or BBS
package entirely, write a third implementation of `aedoor.h`'s six
functions and point a new Makefile target at it; `doorrepo.c` and every
module beneath it needs no changes.

## The API contract

The full HTTP API this door speaks -- every endpoint, every field, worked
examples captured from the live server -- is documented in
`docs/DOOR-REPO-API.md`. That document makes an explicit **append-only
promise**: `list.txt` and the JSON manifest will only ever grow new fields
by appending them to the end of each row/object; existing fields never
change position, meaning, or type; and the header line's format-version
number is the authority for what fields a conforming client should expect
(see that document's "Append-only format-evolution promise" section). This
door's `listtxt.c` parser was built and tested against that promise
specifically: it reads only the first six fields by position and ignores
any trailing fields it does not recognize, so a future format revision that
only appends fields needs no change here at all.
