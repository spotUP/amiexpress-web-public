# BBC Micro

What the `BEEB` door runs. Two things live here, and neither ships with the
board.

```
Beeb/
  roms/          the machine's ROMs - YOURS, see below
    os.rom
    BASIC.ROM
    b/DFS-1.2.rom
  software/      disc images (.ssd, .dsd) and tapes (.uef)
```

## ROMs

**There is no open-source BBC ROM.** Acorn never granted permission to
redistribute the OS or BASIC and asked archives to take their images down -
unlike Amstrad, who did grant it for the CPC. There is no AROS-equivalent
for the Beeb. So the board ships none and loads what you put here, exactly
as it already does for the Amiga's Kickstart (`KickstartRom.ts`).

For a Model B the emulator asks for these three, by these names:

| File | What it is |
|---|---|
| `roms/os.rom` | the machine's operating system (OS 1.20) |
| `roms/BASIC.ROM` | BBC BASIC |
| `roms/b/DFS-1.2.rom` | the disc filing system, needed to load anything from disc |

Dump them from your own machine, or obtain them however you legitimately
can. A missing ROM shows as a black screen in the emulator - if that
happens, check the browser's network tab for a 404 under `/beeb/roms/`.

### The DFS version has to match the disc controller

This board pins the emulated machine to `B-DFS1.2` (`MODEL` in
`Doors/beeb/library.ts`), which is a Model B with the **8271** floppy
controller. That model wants a **DFS 1.2x** ROM.

A **DFS 2.2x or later is for the 1770 controller** and will not drive discs
here. The failure is nastier than a missing file: the machine boots to
BASIC perfectly, and then every disc command fails. The BBC reports that as
`File not found`, which points nowhere near the real cause. This cost an
evening on 2026-09-17, on a file correctly named `DFS-1.2.rom` whose own
header said `DFS 2.42`.

The door reads each ROM's own header and says so now, rather than letting
you find out when a game will not load. If you would rather run a 1770 DFS,
change `MODEL` to `B1770` and `REQUIRED_ROMS` to match - they are next to
each other and must be changed together.

## Software

Disc images go in `software/` and the door lists whatever it finds. Put
there what you have the right to run.

The emulator is served at `/beeb/` and reads this folder through
`/beeb/discs/`, so a title called `elite.ssd` is loaded as
`/beeb/?disc1=elite.ssd&autoboot`.
