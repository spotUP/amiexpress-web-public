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

### Repaint, measured

A full 80x24 coloured frame from a C door is **4,409 bytes** on the wire -
**22.3 messages** at the 198-byte JH_SM payload, against the plan's estimate
of 20-30 - and it costs **215 ms**.

Measured by slope on 2026-09-07, best of three runs each, through the real
emulator (`web/backend/src/scripts/run-amiga-door.ts`):

| | |
|---|---:|
| `bench_repaint` (1 frame) | 4,835 ms |
| `bench_repaint11` (11 frames) | 6,988 ms |
| ten extra frames | 2,153 ms |
| **one full-screen repaint** | **215 ms** |
| per 198-byte message | 9.7 ms |
| per byte | 49 us |

**`handoff.md`'s "~45ms per 198-byte XIM message" is wrong by five times.**
It predicts about a second per full frame; a frame costs a fifth of that.
That was the number the plan's Risk 1 turned on, and the answer changes the
design decision it was guarding: a widget does NOT need a dirty-region
interface from its first line of code. 215 ms is still far too slow to
repaint a screen that has not changed, which is what `ui_list`'s existing
"only these two rows" path is for - but the general invalidate/repaint cycle
the risk demanded is not required.

Two traps cost most of the time here, both worth knowing before repeating it:

- **`run-amiga-door.ts` waits for stdin `end` with no timeout** when stdin is
  not a TTY (its own comment says so). Under a pipe that never closes it
  hangs forever, before the emulator starts and before `door:status
  initializing` - which looks exactly like a broken door. Redirect
  `</dev/null`.
- **A frame count on the command line never reaches the door.** AmigaDOS
  hands a door one command-line string; the node survives and the rest does
  not. Two runs meant to differ produced byte-identical output. Hence two
  binaries differing only by `-DBENCH_FRAMES`, which is beyond argument -
  and verified by their output: 4,409 bytes against 48,499, exactly eleven
  times.

Repaint is not part of `make measure`: it needs the emulator, which a link
does not, and it takes about a minute. Reproduce it with
`make amiga && cd ../../web/backend && npx tsx src/scripts/run-amiga-door.ts
../../sdk/c/build/amiga/bench_repaint11 1 </dev/null`.
