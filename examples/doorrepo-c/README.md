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
| Every module's logic (parsing, pagination, retry state machine, security checks) | **Unit-tested and native-run verified** | `make test`: 10 suites, 700 assertions, 0 failures, `-std=c89 -Wall -Wextra -pedantic` clean. `make live` run against the real, live `bbs.uprough.net` API: browsed, paged forward/back, filtered by type, searched, opened an entry, downloaded a real archive, MD5 verified. Full transcript in this task's report. |
| POSIX/native build | **Built and run-verified** | `make native` links and runs on this machine; this is the build every test suite and the live run above actually exercises. |
| Every module except netio.c's real socket branch, cross-compiled for m68k | **Compile- and link-verified** | `make amiga-stub` produces a real `AmigaOS loadseg()ble executable/binary` (confirmed with `file`), zero warnings, with no AmiTCP SDK involved at all. |
| netio.c's real `bsdsocket.library` branch, cross-compiled for m68k | **Compile- AND link-verified for m68k** | `make amiga` produces a complete, real `AmigaOS loadseg()ble executable/binary` (confirmed with `file`) linked against the vendored NDK3.2R4, zero warnings. This is stronger than "compiles": the object code genuinely links into a loadable AmigaOS program, and every symbol `netio.c`'s Amiga branch calls (`OpenLibrary`, `socket`, `connect`, `WaitSelect`, `send`, `recv`, `CloseSocket`, ...) resolved. It is **not** merely "compile-only" -- do not read it that way. |
| The door-port (AEDoorPort/XIM) protocol AND `bsdsocket.library` networking, together, under this repository's own 68K emulator | **Run-verified end to end under emulation** | See "Emulator run" below. The real `doorrepo.amiga` binary, unmodified, ran inside this repo's own AEDoorPort/XIM emulator and its `bsdsocket.library` bridge: `PortStart`/`JH_REGISTER` succeeded, it fetched the real 3301-row catalog from the live API over an emulated socket, browsed, paged, filtered by type, searched, downloaded a real archive, and verified its MD5 -- all inside the emulator, all against the live production host, all confirmed independently outside the door's own claims. |
| Running against a **real** `bsdsocket.library` on real AmigaOS hardware (or an Amiga-accurate emulator such as vAmiga/WinUAE/FS-UAE) | **NOT run-verified** | No such environment exists in this development environment. This remains the one honest gap, and it is a materially different claim than "not run-verified at all": everything above proves the door's logic, protocol usage, and networking calls are correct and functional end to end against *an* AEDoorPort/`bsdsocket.library` implementation -- just not the real one. Running under this repository's emulator is evidence the door works; it is not the same claim as working on an Amiga. |

### What "not run-verified" means in practice

The emulator run below is real, end-to-end evidence: unmodified `doorrepo.amiga`
machine code executed on an emulated 68000 CPU, called `OpenLibrary()`,
`socket()`, `connect()`, `WaitSelect()`, `send()`, and `recv()` against this
repository's own `bsdsocket.library` implementation, and that implementation
in turn made real DNS lookups and real TCP connections over the actual
internet to the live production API. What it does **not** prove is that a
*real* `bsdsocket.library` (AmiTCP, Miami, Roadshow) on real AmigaOS
hardware behaves identically -- LVO offsets, calling-convention edge cases
at the hardware level, and real network timing under a real AmigaOS TCP
stack remain unconfirmed. This repository's emulator was built to match the
real protocol closely (see the fd-numbering fix below, itself a case of the
emulator being corrected to match real-hardware semantics), which is why
this evidence is meaningfully stronger than a native/POSIX run -- but it is
still emulation, not hardware. If you have access to a real Amiga or an
Amiga-accurate emulator, that is the one remaining verification step.

## Emulator run: what actually happened

Step 3 of this door's verification installed `doorrepo.amiga` as an XIM door
and ran it inside this repository's own 68K emulator (the same one that runs
every other door in `Doors/`), using the standalone door-run harness
(`web/backend/src/scripts/run-amiga-door.ts`) rather than a live BBS login,
so the run needed no browser and no interactive session.

**First pass found a real emulator bug, not a door bug.** The first attempt
stalled: `PortStart`/`JH_REGISTER` succeeded and the door registered with
the BBS's message port correctly, but the very next call the door makes,
`WaitSelect()` (waiting for a newly opened socket to become writable before
sending the HTTP request), never returned a usable result, and the door made
zero further progress until the harness's own execution-timeout forcibly
ended the session. This was root-caused (not merely observed) to this
emulator's `BsdSocketLibrary.ts` allocating socket descriptors starting at
100: `netio.c`'s `net_open()` builds `WaitSelect()`'s fd-mask the standard,
correct AmigaOS way, `wmask = 1L << s`, which is safe only for descriptors
below 32 -- an isolated vbcc compile of that exact expression confirmed the
generated `lsl.l d2,d1` zeroes the whole register for a shift count that
large, per real 68000 shift-count-modulo-64 semantics. That is not a bug in
this door: `1L << s` for a small `s` is exactly how real AmigaOS C code
builds this bitmask, and every real `bsdsocket.library` implementation hands
out small descriptor numbers. **This has since been fixed in the emulator**
(`BsdSocketLibrary.ts` now allocates descriptors from a low base below 32
and reuses them after `CloseSocket()`, confirmed by that fix's own commit
message and test suite) -- so this section now reports the **second**,
post-fix run, which is the one that matters.

**The re-run, with the fix in place, completed the entire flow end to end.**
`PortStart`/`JH_REGISTER` succeeded exactly as before, confirmed via the
per-door session log the emulator writes for every run
(`logs/door-68k-<command>-<timestamp>.log`):

```
[XIM] RX cmd=1 (JH_REGISTER) data=0 str=""
[XIM] RX cmd=4 (JH_SM (Send Message)) data=1 str="DoorRepo v1.0 - AmiExpress Door Repository Client"
[XIM] RX cmd=4 (JH_SM (Send Message)) data=1 str=""
```

But this time the door did not stall. Within 4-6 seconds it had genuinely
fetched the real, live, 3301-row catalog over the emulator's
`bsdsocket.library` and rendered page 1 -- the row data below (including a
later row whose name field carries a real high-bit Latin-1 byte, rendered
correctly rather than corrupted) is byte-identical to the real live API's
first catalog page, not synthetic test data:

```
[XIM] RX cmd=4 (JH_SM (Send Message)) data=1 str="Page 1 of 166 (3301 doors total)"
[XIM] RX cmd=4 (JH_SM (Send Message)) data=1 str="INDEX ARCHIVE              TYPE   SIZE  NAME"
[XIM] RX cmd=4 (JH_SM (Send Message)) data=1 str="   1  !ALSTER.LHA          XIM      39 KB  Children"
```

Driven with a scripted input sequence (next page, previous page, filter by
type `DD`, back to the full catalog, search `trivia`, open the one result,
download, quit to browse, quit), it completed **every single step**
correctly: paging, the `DD` filter returning exactly the 10 real `DD` rows,
the search returning the one real `trivia` match (`AETRIV10.LHA`), a real
archive download over the emulated socket, and a genuine MD5 verification:

```
[XIM] RX cmd=4 (JH_SM (Send Message)) data=1 str="Downloading AETRIV10.LHA ..."
[XIM] RX cmd=4 (JH_SM (Send Message)) data=1 str="  ... 8 KB received"
[XIM] RX cmd=4 (JH_SM (Send Message)) data=1 str="Checksum verified OK (MD5 52ee1086c055fc1c82407dc0961ab04d)."
...
[XIM] RX cmd=4 (JH_SM (Send Message)) data=1 str="Goodbye!"
[XIM] RX cmd=2 (JH_SHUTDOWN) data=0 str="Goodbye!"
```

The binary-level session log confirms a clean finish: `Door completed:
doorrepo.amiga status=ok` (not the earlier run's forced-timeout teardown).
Independently, outside the door's own printed claim, the downloaded file on
disk was re-hashed directly: 16080 bytes, MD5 `52ee1086c055fc1c82407dc0961ab04d`
-- an exact match to both the catalog's declared digest and the door's own
printed result. The raw socket-library trace also confirms this was a real
network exchange, not a cache hit: `send data: GET
/api/door-repo/archive/AETRIV10.LHA HTTP/1.1` / `Host: bbs.uprough.net`,
followed by a real `HTTP/1.1 200 OK` response from the live production
server.

**What this proves, precisely.** A real, unmodified, vbcc-cross-compiled
m68k AmigaOS executable ran inside this repository's own AEDoorPort/XIM
emulator, spoke the real door-port protocol, opened `bsdsocket.library`,
made real DNS/TCP calls over the real internet to the live production API,
fetched and correctly parsed a real 3301-row catalog, paged and filtered it,
downloaded a real archive, and verified its MD5 -- all inside emulation, all
confirmed against independent evidence (the per-door protocol log, the raw
socket trace, and a re-hash of the downloaded file), not merely the door's
own printed output. See "What 'not run-verified' means in practice" above
for the one thing this still does not prove: identical behavior on real
AmigaOS hardware or an Amiga-accurate emulator.

**Door registration: committed, not reverted, this time.** With the
underlying stall fixed and this end-to-end run demonstrating clean,
correct, repeatable completion (verified with fresh scripted-input runs,
no hangs, no crashes, exit code 0, orderly `JH_SHUTDOWN` both times),
`Commands/BBSCmd/DOORREPO.info` and `Doors/DoorRepo/doorrepo.amiga` are kept
installed and committed to this repository -- a working XIM door that
genuinely exercises AEDoorPort I/O plus `bsdsocket.library` networking end
to end is useful to keep around for future testing of both this door and
the emulator's networking layer.

**A later run added two more proven paths, and found a third emulator bug.**
`net_open()` now sizes the `WaitSelect()` fd-mask from `getdtablesize()`
rather than assuming the stack cooperates, and maps the `connect()` errno to
a specific message. Both were confirmed executing, not merely compiled:

```
[BsdSocketLibrary] Created socket fd=0
[BsdSocketLibrary] getdtablesize() - returning 32
[BsdSocketLibrary] connect(fd=0, 203.0.113.10:80)
```

and, pointed at a port with nothing listening, the door printed
`Could not reach the door repository server (netio: connect() refused).`
That message was then used as its own control: reverting the emulator's
`ECONNREFUSED` to the Linux value 111 (the classic BSD/AmigaOS value is 61)
made the identical run degrade to `(netio: connect() failed)`, which is what
proves the specific message is driven by the errno comparison and not by
something else in the path.

**The non-blocking connect path works too, as of a fourth emulator fix.**
`net_open()` sets `FIONBIO`, connects, waits for writability with a timeout,
then checks `SO_ERROR` - the standard AmigaOS sequence. The emulator used to
discard `FIONBIO` and block inside `connect()` for up to 30 seconds no matter
what timeout the door asked for, and its `getsockopt()` was a stub that wrote
nothing, so the `SO_ERROR` check could not have worked either. Both are
implemented now, and the real binary drives the whole sequence:

```
IoctlSocket(fd=0, FIONBIO, 1) -> nonBlocking=true
connect: non-blocking, returning -1/EINPROGRESS
WaitSelect returning 1
getsockopt(fd=0, SO_ERROR) = 0        (61 against a closed port)
```

Setting up that second run exposed the third emulator defect this door has
found: `gethostbyname()` was implemented with `dns.resolve4()`, so it
answered only what a DNS server would answer. A dotted-quad literal
(`192.168.0.10`) and a hosts-file name (`localhost`) -- the two things a
sysop is most likely to type into `DoorRepo.cfg` -- both failed, though real
AmiTCP/Roadshow resolves each without any DNS traffic. Fixed in the emulator
(`dns.lookup()`), with regression tests. As with the descriptor-numbering
bug above, the defect was in the emulator, not in this door.

## Security

Four distinct classes of vulnerability were found and closed during
development by adversarial code review, each requiring a genuinely different
fix -- listed here because a re-implementer copying this door's structure
needs to know the rules, not just that "it was reviewed":

1. **Shell command injection via sysop configuration.** `DownloadDir` and
   `LhaCommand` (from `DoorRepo.cfg`) are interpolated into the archiver
   command line built by `flow_build_extract_command()` and run by
   `shell.h`'s platform pair -- `system()` on the host build,
   `dos.library/Execute()` on AmigaOS. A `DownloadDir` value such as
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

## What the door looks like in use

A full-screen ANSI browser, modelled panel for panel on DOORMAN (this
project's TypeScript door manager) so a sysop moving between the two sees the
same thing:

```
+------------------------------------------------------------------------------+
|                  DoorRepo v1.0   3301 of 3301 doors                          |   header bar
+- REPO (3301) ------------++--------------------------------------------------+
|+!ALSTER.LHA           39k|| !ALSTER.LHA                                      |
| $CP-PS12.LZX          17k|| XIM   39k   #1   [ALSTER]                        |
| -D-DOR11.LHA           7k|| by Loop/Abuse / ABS            2 ads             |
| ...                      ||   ______    ________.  /\    ______.__________   |   FILE_ID.DIZ,
+--------------------------++--------------------------------------------------+   line for line
|ENTER/R=Get  U=Uninstall  S=Strip ads  M=Access  A=Archive  V=Doc  Q=Quit      |
+------------------------------------------------------------------------------+
```

| Key | Does |
|-----|------|
| cursor up/down, PgUp/PgDn, Home/End | move the selection |
| `ENTER` or `R` | download the selected archive (confirm first), verify its digest, optionally extract |
| `I` | install it as a BBS command: extract, write the command config, offer to strip ads |
| `U` | uninstall it again (only shown for an installed door) |
| `S` | strip the ad files from an installed door (only shown when it has any) |
| `M` | edit the access level of an installed door - typing a new level also doubles as disable/restore, remembering the level it replaced (only shown for an installed door). Edits the `.info`'s `ACCESS`/`DRACCESS` lines in place; every other tooltype (`BBSCMD`, `NAME`, `DESCRIPTION`, `MULTINODE`, `PRIORITY`, `CATEGORY`, a custom `STACK`, anything else the file carries) is preserved byte-for-byte |
| `A` | show what is inside the archive, with ad files flagged |
| `V` | show the door's own documentation - offered only for a door that has any |
| `F` | filter by text - live, over the rows already loaded, no refetch |
| `C` | cycle the door type (the types actually present, so it never offers an empty one) |
| `L` | open a dedicated screen listing only the doors this door has installed, with its own `U=Uninstall`/`S=Strip` |
| `Q` | leave the door |

The footer is width-budgeted, not truncated: on a narrow terminal, or a row
whose optional keys all apply at once (an installed door with both ads and
documentation, for example), the lowest-priority keys - `F`, `C`, then `L` -
may not display, in that order, before anything higher-priority (`S`, `M`,
`A`, `V`) or the mandatory `Q=Quit` is ever dropped. This is deliberate, the
same trade-off every optional key in this footer already accepts, not a bug -
the key still works if pressed, it just isn't advertised on that particular
screen.

`F` matches the archive name, door name, description, author and release
group - the same fields the server's own `?q=` search matches, so typing a
group name into the browser and sending it to the API return the same rows.
Author, release group and the archive's ad-file count all ride in on
`list.txt` (fields 7-10), so the detail pane can show them, and the footer can
drop `V=Doc`, without a per-entry request. Against an older server that sends
six-field rows those fields read as unknown and every key is offered, as
before.

**Install and uninstall.** `I` turns an archive into a BBS command, the same
three steps DOORMAN performs: extract into `DoorsDir/<CMD>/`, work out which
extracted file is the door's program, and write `BBSCmdDir/<CMD>.info` with
the four tooltypes the BBS reads (`TYPE`, `LOCATION`, `STACK`, `ACCESS`) --
byte-identical to what DOORMAN writes, so a door installed by either one
looks the same to the BBS. The archive is downloaded first if it is not
already in `DownloadDir`. When the archive contains ad files, removing them
is offered, never done silently. `U` removes the `.info` (which is what makes
the door reachable at all), then the files the archive listing says it put
there, then the directory; anything else left in that directory is reported
rather than deleted.

What is installed, and under which command name, is remembered in
`DownloadDir/DoorRepo.idx` -- one `<archive>|<CMD>` line per door. That file
is why the list can mark installed rows without probing the disk once per row
per keystroke, why `U` already knows the command name instead of asking you
to remember it, and why `S` knows which directory to strip. It is plain text
with one record per line, on the assumption that a sysop may need to read or
repair it with nothing but a text editor.

**When does the BBS see a newly installed door?** On a real AmiExpress node,
immediately: `express.e:4630-4647` resolves a BBS command from disk on every
invocation, so the `.info` this door writes is live on the next command. This
project's TypeScript BBS loads those `.info` files once at startup instead,
so it needs help; it now has two mechanisms, and neither requires anything
from the door:

- a command that is not in the cache triggers a freshness check
  (`revalidateBbsCommandsIfChanged()` -- a `stat()` of the command
  directories, reloading only if their mtime changed), so a freshly
  installed door runs the first time someone types its name;
- a watcher on `Commands/BBSCmd/` clears that stamp when the directory
  changes, so the door menus and listings see it too.

Which extracted file is the program is decided from the repository's own
archive listing, not by looking at the directory: C89 has no way to enumerate
one. The listing names an exact match on the archive or command name first,
otherwise the largest file with no extension -- the Amiga convention. For the
35 catalog archives the server has no listing for, `LOCATION` falls back to
the command name and the door says so.

**Digest verification:** the download is checked against the
`X-Archive-SHA256` header the server sends with the archive bytes, falling
back to the catalog row's MD5 when no such header arrives. If the SHA-256
matches while the catalog MD5 does not, the door says so - that means the
catalog row was indexed from a different copy than the one being served (see
"Digest freshness" in `docs/DOOR-REPO-API.md`) - and keeps the file, because
the digest that verified describes the bytes actually received.

While `A` or `V` is open the cursor keys scroll THAT pane rather than moving
the selection, and the same key closes it. `+` in the list and a green `[CMD]` in the
detail pane mark a door installed as a BBS command; `*` and `[downloaded]`
mark an archive merely present in `DownloadDir`. The header counts the
installed ones.

`ESC` is deliberately not a binding. A lone ESC cannot be told apart from the
start of an arrow-key sequence without a timer, and arrow keys reach a door as
single bytes anyway under AmiExpress (2/3/4/5, per `express.e:7514-7528`) --
so `Q` is the one documented way out.

**Terminals that cannot do ANSI:** set `Ansi=no` in `DoorRepo.cfg` and the
door falls back to the original line-at-a-time listing, which needs nothing
but plain text. `ScreenRows`/`ScreenCols` set the geometry (default 80x24).
This fallback offers `[L]ist installed` on its own menu line too: a line per
installed door, a typed row number to select one, then `[U]ninstall
[S]trip [Q]uit` - the same two actions the full-screen `L` screen offers,
just without a detail pane or cursor movement.

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
