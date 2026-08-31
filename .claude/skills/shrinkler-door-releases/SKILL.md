---
name: shrinkler-door-releases
description: Use whenever you build a 68K Amiga door binary (make amiga, package-for-amiga.sh, any doorrepo/door release) or prepare a door archive to send to a sysop. Shrinkler-packs the release binary, and says which binary the live board may run - a crunched door needs MORE emulator memory, not less, and the 500 KB door region refuses some of them.
---

# Shrinkler-packing door binaries

Every 68K door binary we ship gets Shrinkler-packed. It is a demoscene
executable cruncher (Blueberry, v4.7 here), it produces a self-decrunching
AmigaDOS executable, and on this project it takes DoorRepo from 121,608 to
45,968 bytes - **62% off** a download that half its users pull over a modem.

    shrinkler <input> <output>          # 1-2 s for a 120 KB door

`/opt/homebrew/bin/shrinkler` is installed. There is no flag to remember for
an ordinary door: the defaults treat the input as an executable and merge
nothing. `-d` is for raw data, not for us.

## The rule, and the trap inside it

**Crunch the RELEASE binary. Do not assume the board can run it.**

A crunched executable is smaller ON DISK and BIGGER IN MEMORY while it
decrunches: the packed image and the unpacked image are both resident, and
Shrinkler reports that cost as "Memory overhead during decrunching". Our
emulator gives a door `0x2000-0x7f000`, 500 KB, and `assertDoorSegmentsFit`
refuses anything larger BEFORE loading a byte
(`web/backend/src/amiga-emulation/memory-map.ts`).

Measured on 2026-08-31:

    DoorRepo plain      464 KB needed   loads, runs
    DoorRepo crunched   513 KB needed   REFUSED - DoorTooLargeError,
                                        segment 6 spans 0x76f08-0x82210
    SizeCheck plain      17,316 bytes   loads, runs
    SizeCheck crunched    8,676 bytes   loads, runs, exits 0

So: the emulator DOES run crunched executables - that was verified, not
assumed - and DoorRepo still cannot be shipped crunched to this board,
because crunching costs it ~49 KB of headroom it does not have. A smaller
door crunches and runs fine.

## What to do, every time

1. Build the door as usual (`make amiga`, or the door's own build).
2. Crunch it to a SEPARATE file. Never overwrite the plain binary - you need
   both, and you need to be able to tell them apart:

       shrinkler door.amiga door.amiga.shrinkled

3. **Probe the crunched one.** A compiling binary is not a working binary,
   and a crunched binary that will not load is the specific failure this
   skill exists to catch:

       npx tsx dev/scripts/door-probe/probe.ts <binary> --command <CMD> --timeout 20000

   - loads and reaches its prompt -> ship the crunched one everywhere,
     board included;
   - `DoorTooLargeError` -> the board runs the PLAIN binary and the release
     archive carries the crunched one. Say so in the release notes: the
     recipient's real Amiga has the RAM our emulator's door region does not.

4. Put the crunched binary in the archive. `Doors/<door>/` on this board
   keeps whichever passed step 3.

## Stripping - already done, do not go looking for it

Asked and measured on 2026-08-31: our Amiga binaries carry **no** symbol or
debug hunks. `AMIGA_CFLAGS` has no `-g`, and vbcc/vlink emit a stripped
executable by default - `grep` for any of the door's own function names, or
for a `.c` path, finds nothing in the binary. There is nothing to strip and
no size to win there. Do not add a strip step, and do not add `-g` to a
release build to "match" the native one.

## Where this belongs in the pipeline

`examples/doorrepo-c/package-for-amiga.sh` builds the release archive: it
tests, assembles, captures live server fixtures, then re-extracts the packed
source and rebuilds it to prove the archive is usable. The crunch belongs
between "assemble" and "pack", against `$PKG/bin/DoorRepo`, and the ReadMe
should name both sizes.

## Why we do this at all

The recipients are Amiga sysops on real hardware and slow links, and this is
demoscene practice: a door that arrives as 45 KB instead of 120 KB is the
difference between a quick download and a chore. It costs one command and
two seconds.
