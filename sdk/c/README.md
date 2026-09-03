# `sdk/c` — the AmiExpress C door SDK

**Status: phase 0.** Two things exist, and they are the two the plan said had
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

## 3. Phase 1: who is calling, and on what screen

`ae_session.h` answers the other half of the question `ae_host.h` started:
the user's name, location, level and time left, whether their terminal takes
ANSI, the screen's width and height, and the conference they are in.

Two decisions worth knowing:

- **The caller owns the storage.** The existing C door keeps its BBS message
  buffer in a `static` (`examples/doorrepo-c/aedoor_amiga.c:199-204`), so two
  subsystems in one door cannot both talk to the board. `ae_open` takes the
  buffer, the library keeps no globals, and the 264-byte floor is enforced.
- **The transport is a seam.** On the Amiga a field is one AEDoor round trip;
  in the tests it is a table. Same accessors either way, which is why phase 1
  is tested without an emulator.

Everything answers something usable when the board says nothing: 80x25, not
ANSI, and a name a door can print without checking. A dropped carrier stops
every later round trip rather than returning an answer shaped like a real one.

`ui_profile.h` is the layout tier - borders, columns, gap, padding and
whether decoration may run - matching
`sdk/engines/ui/blessed/core/responsive-constants.ts` value for value, pinned
from the TypeScript side by `sdk/test/c-sdk-agrees-with-typescript.test.ts`
so the two cannot drift in silence.

The linking rule still holds with both modules in the library: `hello` is
5,048 bytes, byte for byte what it was before they existed.

## What is deliberately not here yet

Widgets (a bordered list, a masthead, a footer), input decoding, dialogs, the
theme tokens and settings - phases 2 to 4 - and the real AEDoor transport,
which `examples/doorrepo-c/aedoor_amiga.c` still owns and which phase 2 lifts
into `sdk/c/` behind the `ae_transport_fn` seam this phase introduced.
