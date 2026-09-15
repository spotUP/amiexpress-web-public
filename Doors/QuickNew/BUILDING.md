# Rebuilding QuickNew

QuickNew V2.2 by Calypso/GOD, 2019 update by REbEL/QTX. `QuickNew.asm` beside
this file is the source the shipped `QuickNew` binary is built from, and the
build is reproducible:

    vasmm68k_mot -Fhunkexe -m68020 -o QuickNew -nosym QuickNew.asm

`vasm` and `vlink` are in Homebrew (`vasmm68k_mot`, `vlink`).

## Why -m68020

The source uses `BEQ.L`, a long branch, which is 68020 and later. The door does
not otherwise need an 020 and runs on the board's emulated CPU as it always
has; the flag only lets the assembler accept the branch.

## Three branches had to be widened to build at all

`vasm` honours an explicit `.S` and refuses when the target is out of range;
DevPac evidently widened these silently in 1994, which is why the original
built. They are `.W` now:

  * `BEQ.S lbC0008C4` - the `@M` placeholder test
  * `BRA.S lbC000850` - the placeholder scan loop
  * one in `writeblockfitted` added by the width work below

These three are worth sending upstream on their own: REbEL's source does not
assemble under a modern assembler without them.

## What was added here

`WIDTH/N` on the command line, so the batch line can read

    doors:quicknew/quicknew doors:quicknew/quicknew.config1 7 40

and the door fits its output to that many columns. **The argument is optional
and defaults to 80**, so a board that never passes it is not affected in any
way - that is checked rather than assumed: at the default width the output is
byte-for-byte what the stock binary produced, file rows and all.

### Tidying

"i think the quicknew output is messy with all the doubled spaces etc can we
make it more tidy when we are recoding it anyway?" - the sysop, 2026-09-15.

Those runs of spaces are the CONFIG's: each template carries a hand-tuned
stretch to push the counts into a column, and a section title of a different
length puts them somewhere else. The door now does the aligning instead, so a
config needs no padding at all and any board's templates line up.

One pipeline, and the order matters:

  1. Collapse every run of spaces to one. Escapes cost no columns.
  2. If the line now FITS, give the slack back to the LAST run, so the line
     ends exactly on the width and the counts land in the same column on every
     row whatever the section is called.
  3. If it is STILL too wide, keep `WIDTH-3` columns and end with `...`.

Collapsing before cutting is deliberate: "Abandoned Applications" is 94 columns
in this board's config and 87 once its eight-space gap is one, and cutting first
threw the counts away to keep padding nobody wanted.

A line with no run of spaces is passed through untouched.

What fitting means:

  * A line that already fits is passed through in the ORIGINAL single `Write`,
    from the same pointer with the same length. Not reconstructed identically -
    the same call.
  * A line that does not fit keeps `WIDTH-3` visible columns and ends with
    `...`. ANSI escapes are zero width and CSI sequences are never split, so
    the part that survives keeps the colours the sysop wrote.
  * The filename grid takes fewer columns when the row would overflow. A width
    of 80 or more does not consult this at all.
  * The credit line is a line too, and fits like the rest.

Measured on this board's config: 80 columns byte-identical to stock; 40 columns
widest line exactly 40, none over, grid reflowed from five names per row to two.
