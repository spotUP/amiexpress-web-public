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

## 4. Phase 2 (in progress): a door draws a bordered list

`ui_list.h` is the widget the catalogue actually needs - nearly every door is
"show these rows, let somebody pick one". It owns the scrolling arithmetic,
which is the part every hand-rolled copy gets wrong: the window follows the
selection and is written in exactly one place, it never shows past the last
row, a list shorter than its box does not scroll, and the selection clamps
rather than wrapping.

The scroll bar appears only when there is something to scroll - a list that
fits keeps the column a bar would have taken - and its thumb is proportional
with a floor of one row, because a thumb that rounds to nothing reads as a
broken widget rather than a long list.

`ui_ansi.h` is `examples/doorrepo-c/ansi.h` LIFTED, not rewritten: the same
13 primitives a real C door has been drawing with, with one change. Flushing
no longer calls `ae_put()` itself - a library cannot own the board
connection - so the caller says where a finished frame goes.
`ui_screen_flush()` hands it to the session; a test hands it to a buffer it
can read back.

### What it costs

| Binary | Size |
|---|---|
| `hello` - no widget, whole library linked | 5,048 bytes |
| `hello_box` - one `ae_box()` call | 5,508 |
| `hello_list` - a bordered list with a scroll bar | 8,096 |

So the list widget and the ANSI layer under it are **3,048 bytes**, and a
door that draws no list still costs 5,048 - the same number as before any of
this existed.

`ui_chrome.h` is the three bars a door wears. The one with history is the
footer: DoorRepo's old one concatenated every key and cut at `cols`, which
silently dropped `Q=Quit` on any row that had ads AND a doc. The rule lifted
from `flow.c:1887` guarantees the opposite - the suffix is appended whatever
the width, optional keys go in PRIORITY order, and a shorter lower-priority
key never appears in place of a longer one that was dropped. A test walks
every width from 10 to 200 and finds `Q=Quit` in all of them.

The masthead cuts the rail rather than the title, and the status line drops
its right side rather than letting two strings collide mid-row - which is
what a caller reads as corruption.

## 5. Phase 3: a door reads a key and asks a question

`ui_key.h` is `examples/doorrepo-c/flow.c`'s decoder, lifted with its
reasoning intact - including the part its own comments say cost DOORMAN six
debugging rounds. An ESC is ambiguous: it is either a keypress or the start
of a sequence, and the only way to tell is to settle for a moment and ask,
WITHOUT consuming, whether anything else arrived. A byte that turns out not
to belong to the sequence is handed BACK, never eaten - which is why "ESC
then Q" from a sub-screen no longer quits the whole door.

`ui_input.h` is the same door's line editor and confirm dialog. The editing
rules are unchanged; what changed is the coupling. Those read the key
straight from the BBS and flushed straight to it, so neither could exist
without a session, let alone be tested. Here the key source and the frame
are the caller's, and the suite drives them keystroke by keystroke.

Two rules in there look like details and are not: a cursor key inside a
prompt is swallowed rather than inserting an escape sequence into text the
door is about to act on, and the colours and cursor are put back before
returning, or the caller's next screen is painted in the prompt's blue.

A caller who hangs up mid-edit gets -1, not an empty string: a door must end
the session rather than act on "".

## 6. Phase 4: the board's themes, at eight colours

The sysop's answer to "must a C door look like its TypeScript twin?" was yes
- "the identity of our doors is important" - so all seven themes are here,
not just classic.

**The table is generated, never hand-written.** `tokens.ts` stays the one
place a theme is defined; `tools/generate-theme-tables.ts` reduces each token
to one of the eight colours a C door has and writes
`include/theme_tables.h`. `make check-themes` fails when that header is stale,
which is the plan's "cannot drift in silence".

The reduction took three attempts, and the two failures are worth keeping:

| Rule | What it got wrong |
|---|---|
| Nearest RGB | `gray` became **yellow** - ANSI yellow (170,85,0) is numerically nearer to (85,85,85) than white is. A dim row rendered yellow is not a shade off, it is a different thing on screen. |
| Nearest hue | neon's `#FF3D9A` became **red**, because red sits 29 degrees away and magenta 31 - a tie decided by rounding, on a colour every viewer calls pink. |
| Hue sectors | Correct. Achromatic colours are decided on brightness alone, and only what is essentially the ground goes to black - a `dim` that maps onto the background is not dim, it is gone. |

What does not survive: `double` borders (`ansi_box` draws `+ - |`) and the
exact shades. What does: the identity - phosphor stays green, neon stays
magenta, classic stays cyan and yellow.

`ui_settings.h` reads the files a TypeScript door reads:
`door.settings.json` marks the root and `settings.json` holds the sysop's
answers (`sdk/core/settings.ts`). A sysop configures a door once and it does
not matter which language it happens to be written in.

Reading only - writing is the admin UI's job, and a door that rewrote its own
settings file would race the thing editing it. `ui_door_dir` walks up from
where the binary started, so a compiled door in `dist/` finds the settings
beside its source, exactly as `resolveDoorRoot()` does.

Falling back is explicit everywhere: a missing key takes the door's own
default, a garbled number falls back rather than reading as 0 (which is a
real setting), and a value too long for the caller is an error rather than a
silent truncation - truncating a path or a URL is how a door ends up asking
for something that does not exist.

## 7. Phase 5 (in progress): the transport, and what a C door still cannot do

`include/aedoor.h` and both backends moved here from DoorRepo: the exec
message round trip (`src/ae_transport_amiga.c`) and the host stand-in the
tests use (`src/ae_transport_native.c`). `ae_chunk.h` moved with them - how
many bytes fit in one JH_SM message without tearing an ANSI escape across
two of them is a fact about the protocol, not about DoorRepo.

`ui_screen_flush()` writes through it now, so a frame composed by any widget
in this SDK reaches a real caller in one `ae_put`.

`ae_field_read`/`ae_field_write` are the round trips `ae_session` needed and
DoorRepo never used, so the user fields work on a real board now.
`ae_open_bbs()` is the one call a door makes to get a session wired to them.

**The direction flag reads backwards from what it looks like**: `Data != 0`
is a READ and `Data == 0` is a WRITE. Getting it the wrong way round does not
error - it writes the door's uninitialised buffer into the caller's user
record - so it is stated in the code rather than left to be inferred.

### The proof door

`examples/theme-picker/` is `Doors/theme-picker` (255 lines of TypeScript),
ported: **19,856 bytes** of 68K binary, drawn with the SDK's widgets, reading
and writing through the protocol.

It is deliberately the same door. The theme in force is MARKED rather than
merely highlighted, because the highlight follows the cursor and says nothing
about what is saved. The screen is drawn in the theme you are leaving, so it
is itself an example of what you have. And it asks where it is running before
offering to save: on a classic AmiExpress it lists the themes and says
plainly that the board cannot keep one, rather than pretending ENTER did
something.

And the real AEDoor transport: `examples/doorrepo-c/aedoor_amiga.c` still
owns it, and `ui_screen`'s sink is deliberately the one place that changes
when it is lifted in behind `ae_transport_fn` - rather than every door.
