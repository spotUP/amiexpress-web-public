---
name: port-game-engine
description: Use when porting an existing game's mechanics 1:1 into a TypeScript door - a classic puzzle/arcade game with open-source reimplementations to port from and community FAQs to fill the gaps. Encodes the order of work, how to rank conflicting sources, how to build layered oracles so fidelity is proved rather than asserted, and the language-semantic traps that silently corrupt a port. Written from the TETRIS ATTACK port; the next target is Dr. Mario.
---

# Porting a game engine 1:1

A 1:1 port is not "write the game from the wiki". It is a translation with a
proof obligation: for a given seed and a given sequence of inputs, your engine
must produce the same game, frame for frame, as the thing you ported from.

This worked once, on TETRIS ATTACK (Panel de Pon). The evidence throughout is
from that port. `Doors/grandmaster/core/panels/` is the reference
implementation; read it alongside this.

## The one thing that matters

**Find a published expected value and reproduce it before you trust anything.**
Every hour spent hunting an oracle pays for itself many times over. Without one
you are writing a game that resembles the original; with one you are writing
the original.

On TETRIS ATTACK the oracles were, in increasing strength:

| Oracle | Proves |
|---|---|
| Constant tables | You transcribed correctly |
| A seeded panel-buffer string | PRNG, seeding hash, float conversion, generation rules, every rejection loop |
| A board snapshot after setup | The above, plus board construction and row ordering |
| **A recorded replay's final score and death frame** | Effectively the whole engine at once |

The last one is the goal. Do not stop before it.

## Order of work

Do these in order. Each depends on the one before, and doing them out of order
means debugging several unknowns at once.

1. **Survey every implementation and rank them.** Do not assume the first one
   you find is authoritative.
2. **Establish the source of truth**, and write the tie-break rule down.
3. **Port the PRNG and prove it against a published seed.** Nothing else is
   trustworthy until this passes.
4. **Port the data tables**, verbatim, from fetched source.
5. **Port the state machine**, then the rules that drive it.
6. **Port the frame loop** and pin the orderings inside it.
7. **Port the input codec** and replay loading.
8. **Reproduce a recorded game.**

## 1. Survey the field

Look for, in this order: open-source reimplementations; the original's own
disassembly or ROM research; community FAQs and guides; sprite rips.

For TETRIS ATTACK the field was four implementations and three FAQs, and they
were of wildly different quality:

- **panel-attack/panel-game** (Lua): per-level frame tables, full stop-time
  formula, seeded PRNG, its own test suite with expected values, committed
  replay fixtures. **Authoritative.**
- **a544jh/panel-pop** (C++): no stop time at all, one hardcoded rise integer,
  `rand()` seeded from the clock, and a combo table that sends *zero* garbage at
  combo 12+ from a negative loop bound. Useless as a rules reference — but it
  had **the only open-source AI**, which nothing else did.
- **tzwaan/tetris-attack-js** and **nguyenrt/Tetris-Attack-Clone**: no garbage,
  no stop time, no determinism, no tests. One is unlicensed. Nothing to take.

**A weak implementation is still useful for two things**: a part nobody else
implemented, and cross-validation. tetris-attack-js's score tables, written in
2017 with no knowledge of panel-attack, were *identical* to panel-attack's —
which is worth more than either source alone.

**Community FAQs fill gaps no code has.** The three Tetris Attack FAQs supplied
a whole game mode (Stage Clear), the CPU difficulty range (levels 0–7), the
chain-garbage cap, Puzzle mode's undo, and the in-game tutorial's own
description of the stop-time mechanic — which then cross-validated the source's
`dangerConstant` branch.

## 2. Rank the sources, and write the rule down

Put the tie-break in the plan and in the code, because you will hit it
repeatedly and you should not re-litigate it each time.

The rule that worked:

> Where two reimplementations disagree, the one with tests and citations wins.
> Where a reimplementation and the ORIGINAL disagree, the original wins.

Applied once, visibly: panel-attack grows chain garbage without limit; both the
SNES manual FAQ and panel-pop cap it at a 12-tall block. The cap ships, with the
reason at the constant.

Check whether a source cites anything. panel-pop's README says "modelled after
SNES version" and its commit log is all "tweak", "fix (hopefully)" — that is
eyeballing, and it rates accordingly.

## 3. The PRNG comes first, and it may not be in the repo

**Find out what actually generates the randomness.** panel-attack calls
`love.math.newRandomGenerator()`, so the generator is C++ inside the LÖVE
engine, not in the game repo at all. Porting the game without noticing that
would produce a plausible, permanently wrong board.

Three parts, each with a way to be silently wrong:

- the **seeding hash** (LÖVE runs Thomas Wang's 64-bit hash first, repeating
  while the result is 0)
- the **step** (xorshift\*: three shifts mutate the state, the returned value is
  state × constant, and the multiply is *not* stored back)
- the **conversion to a float**, which is a bit-pattern reinterpret, not a
  division. `Number(state) / 2**64` is a different number and desyncs everything

In TypeScript: `BigInt` masked to 64 bits, and a `DataView` for the reinterpret.

Then prove it. Upstream's `PanelGenTests.lua` publishes expected buffers per
seed; ours matched on the first run, and that single assertion simultaneously
proved the PRNG, the seeding, the float conversion, the generation rules, the
rejection loop and the starting-board removal.

## 4. Fetch the source. Never work from a summary

Research agents summarise well and are wrong in the details that matter. Every
file ported here was `curl`ed and read. Two examples of what summaries missed:

- `isBadRow` walks its count table with `ipairs`, which starts at index 1, so
  colour 0 is skipped and a row of empties counts as "bad".
- The starting-board removal indexes from the *front* of the buffer, which is
  the *top* of the stack, because rows enter at the bottom and push upward.

Pin the commit you fetched from and put it in the file header, so a later reader
can diff against the same bytes.

## 5. Preserve bugs. Deliberately, and with a comment

A faithful port reproduces the original's defects, because seeds and replays
depend on them. Each one gets a comment saying it is intentional and what breaks
without it.

From TETRIS ATTACK:

- `0/0` must stay `NaN` so the first horizontally adjacent panel pair of a game
  is accepted. "Fixing" the zero denominator changes the first roll of every
  game — and the test caught exactly that.
- `assignMetalLocations` is called on a starting board that can never carry
  shock panels, purely to advance the RNG.
- A row like `"4043E0"` already holds a marker but still parses as the number
  4043 in scientific notation, so it is reprocessed and spends extra rolls.
  Upstream's own comment concludes this "has to be considered correct
  behaviour".

If a defect is genuinely not load-bearing, still port it, then fix it in a
separate commit that says what changed.

## 6. Language-semantic traps

These are the failures that produce a working game which is subtly, permanently
wrong. From Lua to TypeScript specifically:

| Trap | What happens |
|---|---|
| **`0` is truthy in Lua, falsy in JS** | `while not tonumber(char)` exits on `"0"` in Lua and spins forever in JS. Test numeric-ness with `isNaN`, never truthiness. Hit twice here. |
| **`NaN <= x` is false in both** — rely on it | The first-pair-accepted quirk ports for free *if* you leave the division alone |
| **1-based indexing** | Keep the original's indexing rather than renormalising. Row 0 exists in this engine on purpose. Renumbering touches every comparison and is how a port acquires an off-by-one nobody ever finds |
| **`string.sub` with negative indices** | Returns `""` when the string is shorter, which `charAt` with a negative index happens to match — verify rather than assume |
| **`ipairs` stops at the first nil** and starts at 1 | Index 0 entries are skipped |
| **`#table` on a table with `[0]` set** | Counts from 1; your `array.length` is one more |
| **Multi-byte characters** | Iterate codepoints, not bytes, in any codec |

## 7. Layer the oracles, and prove each one RED

Build tests in increasing strength, and **prove each catches something** by
breaking the code and watching the right test fail.

The best RED proof from this port: "fixing" the `0/0` NaN quirk failed the
Modern **5** board and *only* Modern 5 — because it is the one level of the
three whose denial frequency reaches that code path. That precision is the
signal that a test is load-bearing rather than decorative.

## 8. When a test fails, suspect the test first

Eight test failures during the engine port. **Seven were faults in the test, one
was a real missing behaviour.** Typical test faults: filler columns that
accidentally matched; asserting a value *after* running past the moment it held;
using a four-frame swap as a "stays active" fixture; checking a cursor position
at game over when the rising stack had moved it.

The one real bug was worth all of them: **holding manual raise while topped out
is an instant loss**, and it is the *only* way to die while raising, because the
health drain lives in passive raise which a manual raise short-circuits. Without
it the stack topped out and ran forever. It was found by driving a real replay —
which is the argument for getting to replays as fast as possible.

## 9. Watch for version-gated behaviour

This is the trap that cost the most time here, and it is invisible.

Most of panel-attack's committed replay fixtures were recorded on engine
versions 045–047, which used a **different panel generator**. Loading one with
the modern generator does not error — it silently plays a different board. The
fixture died at frame 336 instead of 402 and nothing said why.

**Before building on a fixture, check what version produced it and whether the
code has a compatibility path for that version.** Look for directories named
`compatibility`, `legacy`, or version constants used in branches. Port the
compatibility path too, and verify it against *its* own published oracles before
trusting it.

## 10. Scope the port, then fill gaps from the community

Decide up front which parts have a source and which do not, and be explicit
where you are inventing:

- Mechanics: from the authoritative implementation.
- Anything it never implemented (here: a board-playing AI): from the weaker
  implementation that did, parameterised if the original had settings the port
  lacks.
- Anything no code implements (here: Stage Clear, CPU levels, Puzzle undo): from
  FAQs and the game's own text, clearly marked as such.

## Checklist

- [ ] Every implementation surveyed and ranked; the ranking written down
- [ ] Tie-break rule stated: implementations vs each other, and vs the original
- [ ] Actual source fetched at a pinned commit, not summarised
- [ ] PRNG identified — including if it lives outside the repo — and proved against a published seed
- [ ] Data tables transcribed from fetched source, with a table oracle each
- [ ] Deliberate bugs preserved, each with a comment saying why
- [ ] Language-semantic traps audited (the table above)
- [ ] Oracles layered: tables, seed, snapshot, replay
- [ ] Each oracle proved RED by breaking the code
- [ ] Compatibility/legacy paths identified before relying on fixtures
- [ ] A recorded game reproduced exactly
- [ ] Invented parts marked as invented
