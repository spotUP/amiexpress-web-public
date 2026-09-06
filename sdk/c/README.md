# `sdk/c` — the AmiExpress C door SDK

**Status: phases 0-4 built, phase 5 (the proof door) outstanding.** The
session, the geometry, the widgets, the input decoder, the dialogs, the theme
and the settings reader all exist with tests; `ui_doc` was the last dialog the
plan named and landed 2026-09-07. What is left is the plan's phase 5: one real
door ported end to end, and the binary-size and repaint measurements written
down.

The two things below came first, and they are the two the plan said had
to come first
(`thoughts/shared/plans/2026-09-02-amiga-c-door-sdk.md`).

## 1. A door knows where it is running

`ae_host.h` is the door's side of the contract the board publishes
(`Documentation/4-Door-Developers/HOST_DETECTION.md`). It answers before
anything else offers anything, because what a door is *allowed* to assume has
to exist before the things that assume it.

```c
#include "ae_host.h"

if (ae_host() == AE_HOST_WEB && ae_can(AE_CAP_WIDE)) {
    /* more than 80 columns */
}
```

Everything defaults to the safe answer. A door that finds no `AE_HOST` — a
door on classic AmiExpress — is told it has an 80x25 ANSI terminal and
nothing else. A host the SDK has never heard of is treated the same way, even
if it claims capabilities.

`AE_CAP_PETSCII` does **not** mean write PETSCII. PETSCII on this board is a
transducer in the backend; the capability means the caller is a C64, so draw
for 40 columns.

## 2. A door links only what it calls — measured, not asserted

The plan called for gcc's `-ffunction-sections` and `--gc-sections`. vbcc has
neither, and the host's `ar` (and llvm's `emar`) cannot write an archive
`vlink` will read — both produce *File format not recognized*.

What works here: an Amiga hunk library is the **concatenation** of hunk
object files, and `vlink` pulls a unit out of one only when something
references a symbol in it.

| Link | Size |
|---|---|
| `hello` against only the two modules it calls | 5,048 bytes |
| `hello` against `libae.lib`, which holds three | **5,048 bytes** |
| `hello` with the third object named on the link line | 5,476 bytes |
| `hello_box`, which actually calls `ae_box()` | 5,508 bytes |

So the rule for this toolchain is: **one module per `.c` file, and doors link
the library, never a list of objects.** Naming an object costs its full size
whether it is called or not.

That also answers the question the plan left open — *"464 KB for DoorRepo is a
door that links everything it has; the number that matters is what a SMALL
door costs, and nobody has measured it"*. It costs about 5 KB.

## Building

```sh
make test      # host build, runs the ae_host tests - no Amiga toolchain needed
make amiga     # real 68K binaries with vbcc
make measure   # the size proof above, and it fails if the rule stops holding
```

`make test` is the part CI can run anywhere. `make amiga` and `make measure`
need vbcc, vlink and an NDK; the paths are at the top of the `Makefile` and
are overridable (`make amiga VBCC=... NDK=...`).

## What is deliberately not here yet

Everything else. Phase 0 is the host query and the linking proof; widgets,
theme, layout, settings and the AEDoor transport are phases 1 and up, and
`examples/doorrepo-c/` remains the working reference for how a real C door
talks to this board today.

## What a door costs

Measured with `make measure` on 2026-09-07, vbcc 0.9hp3, `+aos68k`. These are
the numbers the plan's Risk 2 asked for and nobody had:

| Binary | Bytes | What it carries |
|---|---:|---|
| `hello` | 5,048 | the whole library linked, no widget called |
| `hello_box` | 5,508 | one `ae_box` |
| `hello_list` | 8,736 | a bordered list with a scroll bar |
| `theme-picker` | 24,084 | the proof door: list, chrome, input, theme, settings |

So the box widget costs 460 bytes, the list and its ANSI layer 3,688, and a
REAL door 24 KB - **4% of the 500 KB door region**. The plan feared the
library alone might cost 40 KB and push tight doors over the edge; it does
not. DoorRepo's 464 KB is its own data, not an SDK tax.

Two of those numbers are checked, not just printed: `make measure` fails if
the smallest door crosses 8 KB or the proof door crosses 64 KB, and it fails
if `hello` is found carrying `ae_box` symbols - which would mean the library
is being linked whole and the granular link is a fiction.

### Repaint: half measured

A full 80x24 coloured frame from a C door is **4,409 bytes on the wire**,
which at the 198-byte JH_SM payload is **22.3 messages** - the plan estimated
20-30, and that half of Risk 1 now has a number instead of an estimate.

`examples/bench/bench_repaint.c` is the door that produced it: N full-screen
frames, every row painted, every row changing colour each frame so nothing
anywhere can elide a repaint as "no change". It is built by `make amiga` and
is meant to be measured by SLOPE - one frame against eleven - so the
emulator's start-up and the door's registration fall out of the difference.

**The milliseconds are still missing**, and the reason is worth writing down
so the next attempt does not start where this one did. Driving the bench
through `web/backend/src/scripts/run-amiga-door.ts` is not repeatable today:
one run completed (exit 0, 4,409 bytes out), and every run after it hung,
including the identical command. The hang is not the emulator and not the
arguments - a hung run stops after the two `[DoorLogger]` lines, before
`door:status initializing`, where a good run goes on to print 1,616 lines.
Imports are not the cause either: loading `AmigaDoorSession` on its own takes
886 ms. `SKIP_DB_INIT=1` makes no difference. So the stall is inside the
runner's own start-up, between creating the logger and starting the session,
and that is where to look next.

Until that is fixed the 45 ms per message in `handoff.md` stands unverified.
If it holds, 22 messages is about a second per frame, and every widget needs
the dirty-region interface the plan's Risk 1 describes - so this measurement
decides real design, and guessing it would be worse than leaving it open.

**Also unmeasured: repaint latency.** `handoff.md` says ~45 ms per 198-byte
XIM message and a full 80x24 coloured frame is 20-30 messages; the plan's
Risk 1 turns on whether that holds. It needs a door driven through the real
emulator, not a link, so it is not in `make measure`.
