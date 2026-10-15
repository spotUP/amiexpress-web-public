# Release group logos

Drop a logo in this directory and the board uses it. No code, no tooltype, no
restart - the directory is re-read when it changes.

```
Screens/groups/
  <KEY>.seq        40-column PETSCII art, raw C64 bytes    (what a C64 sees)
  <KEY>.txt        80-column ANSI art                      (optional)
  GROUPS.MAP       your corrections, one rule per line     (optional)
```

## The key

The filename is the group's name with everything that is not a letter or a
digit removed, uppercased, and clipped to 20 characters:

| Group | File |
|---|---|
| `Outlaws` | `OUTLAWS.seq` |
| `New Order` | `NEWORDER.seq` |
| `/X-POWER` | `XPOWER.seq` |
| `Mystic!` | `MYSTIC.seq` |

Accented letters fold to their base letter, so `Möbius` and `Mobius` are one
file.

## Drawing the art (Petmate)

Draw at **40 columns and at most 10 rows**, then:

**File -> Export -> SEQ**, with

- *Insert charset* **ON**
- *Insert CR* **ON**
- *Insert clear screen* **OFF** - the logo is composited into a record, not a
  whole screen
- *Strip blanks* **off**

Name it `<GROUP>.seq` and drop it here. Nothing converts it: those bytes go to
the C64 exactly as written.

**Taller than 10 rows is refused**, and the group's name is shown instead, with
a line in `logs/backend.log` naming it. A 20-row logo in a file listing would
eat the screen, and cutting art silently is worse than not showing it.

### One quirk worth knowing

Petmate does not clear its reverse-video state at the end of a row, but a C64
return does. So if the LAST cell of a row is reversed, the FIRST cell of the
next row comes out un-reversed. Avoid ending a row on a reversed cell and it
cannot bite you.

## GROUPS.MAP - correcting what the board guessed

One rule per line, first match wins, matched against the FILENAME:

```
# filename glob = group name
OTL-*    = Outlaws
FLT-*    = Fairlight
PDX*     = Paradox
```

A rule beats everything the board worked out for itself, so a release whose
FILE_ID.DIZ names no group still gets its logo. `#` starts a comment.

Copy `GROUPS.MAP.example` to `GROUPS.MAP` to start.

## What a deploy does to this directory

The image ships **this README and the `.example` only** - never a `.seq` and
never a `GROUPS.MAP`. Your art and your corrections are yours: a deploy brings
files you have never touched and leaves anything you have edited alone.
