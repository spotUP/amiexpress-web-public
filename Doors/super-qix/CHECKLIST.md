# Super Qix — FAQ conformance checklist

Source spec: `~/Desktop/FAQ_Qix.txt` (Super Qix ARC/PS2 FAQ v1.0.1 by
Johann Mueller, 2003), plus four items reported directly by the user.

IDs are derived from the FAQ's own section numbering. `USER-*` are the
separately reported items.

Status values (REACHABILITY_PROTOCOL §5):
`DONE` · `PARTIAL` · `MISSING` · `CONTRADICTS` · `EXEMPT` (needs a written,
user-agreed reason)

A tick requires Gate 3 evidence: a test that drives the door's top-level entry
point, proves the new code ran, and asserts the spec's stated numbers.

**Total: 74 · DONE: 11 · EXEMPT: 0 · OPEN: 63**  _(last updated 2026-08-31)_

---

## User-reported (highest priority — these are live bugs)

| ID | Item | Status |
|----|------|--------|
| USER-1 | Marker may move ONLY along the outer frame and the edges of claimed area until it draws. Free movement anywhere is a bug. | DONE (tests/movement.test.ts) |
| USER-2 | Drawn stix must be visibly coloured while being drawn | DONE (tests/drawing.test.ts) |
| USER-3 | A completed fill animates right-to-left rather than appearing instantly | DONE (tests/drawing.test.ts) |
| USER-4 | Layout is broken: field is cut off and the footer overdraws it (screenshot) | DONE (tests/layout.test.ts) |

## 1. Introduction

| ID | Item | Status |
|----|------|--------|
| FAQ-1c | Marker starts at the centre of the bottom border | DONE (tests/movement.test.ts) |
| FAQ-1b | Level starts as an empty rectangle containing the Gremlin and TWO Skulls | PARTIAL |
| FAQ-1e | Closing a shape reveals part of the picture, awards points, may release a letter/power-up | PARTIAL |
| FAQ-1f | After claiming, the marker may travel the border of the claimed area; internal lines are NOT walkable | DONE (tests/movement.test.ts) |
| FAQ-1g | The outer border is a Time Meter: squares change colour two at a time until the whole border is red | MISSING |
| FAQ-1h | When the meter fills, two more Skulls are released and the counter resets | MISSING |
| FAQ-1i | Neither Gremlin nor Skulls can be destroyed | DONE (verify) |
| FAQ-1j | Later levels: enemies faster and more aggressive, timer counts down quicker | PARTIAL |

## 2.1 What to do

| ID | Item | Status |
|----|------|--------|
| FAQ-2.1a | Movement restricted to border or inside edges of claimed areas (same as USER-1) | DONE (tests/movement.test.ts) |
| FAQ-2.1b | On an edge: safe from the Gremlin, still vulnerable to Skulls | MISSING |
| FAQ-2.1c | Cannot leave the field edge without drawing | DONE (tests/movement.test.ts) |
| FAQ-2.1d | Holding Draw moves freely inside the field, leaving a YELLOW line | DONE (tests/drawing.test.ts) |
| FAQ-2.1e | The line turns BLUE and becomes safe once it reconnects to border or finished line | DONE (tests/drawing.test.ts) |
| FAQ-2.1f | Crossing your own line is not allowed | DONE (verify) |
| FAQ-2.1g | Backtracking along your own incomplete line IS allowed | MISSING |
| FAQ-2.1h | While drawing: Skulls cannot reach you, the Gremlin can | MISSING |
| FAQ-2.1i | Gremlin touching the marker OR any point of the incomplete stix costs a life | DONE (verify) |
| FAQ-2.1j | The region containing the Gremlin is always "Outside"; the other region fills | DONE (verify) |

## 2.2 Enemies

| ID | Item | Status |
|----|------|--------|
| FAQ-2.2a | Gremlin bounces semi-randomly, weighted towards the marker | PARTIAL |
| FAQ-2.2b | Gremlin cannot touch the marker while it is on a wall or claimed edge | MISSING |
| FAQ-2.2c | Gremlin kills by hitting the marker or any point of the incomplete line | DONE (verify) |
| FAQ-2.2d | Later levels: Gremlin zooms toward the marker whenever it detaches | MISSING |
| FAQ-2.2e | Later levels: the Gremlin splits into multiple independent copies | MISSING |
| FAQ-2.2f | Drawing between two copies: "Outside" is the LARGER area; the trapped copy disappears | MISSING |
| FAQ-2.2g | Two Skulls start directly opposite the marker, travelling in opposite directions | PARTIAL |
| FAQ-2.2h | Skulls are slower than the marker (outrunnable) and faster than letters/power-ups | PARTIAL |
| FAQ-2.2i | Skulls may follow any line, including internal lines the player cannot use | PARTIAL |
| FAQ-2.2j | Skulls cannot follow the player up an incomplete stix | MISSING |
| FAQ-2.2k | A Skull never instantly reverses direction on a line | MISSING |
| FAQ-2.2l | Timer expiry releases two Skulls from centre-top and resets the counter | MISSING |
| FAQ-2.2m | On death, all but two Skulls disappear | MISSING |
| FAQ-2.2n | Stopping while drawing starts a fuse burning from the line's end toward the marker | DONE (verify) |
| FAQ-2.2o | Moving stops the fuse; pausing again resumes it from where it stopped | PARTIAL |
| FAQ-2.2p | Backtracking counts as NOT moving for the fuse | MISSING |

## 2.3 Letters and power-ups

| ID | Item | Status |
|----|------|--------|
| FAQ-2.3a | Every fill, however small, has a chance to release a letter or power-up | PARTIAL |
| FAQ-2.3b | Letters drift in a straight line to the far wall, then travel back around the edges | MISSING |
| FAQ-2.3c | Power-ups follow the nearest already-drawn lines | MISSING |
| FAQ-2.3d | Word letters award no points until the level completes | MISSING |
| FAQ-2.3e | 1,000 points per key letter if the word is incomplete at the threshold | MISSING |
| FAQ-2.3f | 10,000 points per key letter AND instant level completion if the word is spelled | PARTIAL |
| FAQ-2.3g | A duplicate or non-word letter is an instant 500 points | MISSING |
| FAQ-2.3h | Collected letters are lost on continue | MISSING |

## 2.3.1 Power-up behaviour

| ID | Item | Status |
|----|------|--------|
| FAQ-2.3.1a | Power-ups are mutually exclusive — a new one cancels the current | MISSING |
| FAQ-2.3.1b | Hurry stacks; another power-up cancels only the LAST Hurry | MISSING |
| FAQ-2.3.1c | HURRY speeds up everything for ~10 seconds, cumulative | PARTIAL |
| FAQ-2.3.1d | SHIELD absorbs one Skull hit and stuns it ~1s; does NOT protect from the Gremlin | PARTIAL |
| FAQ-2.3.1e | FREEZE stops all enemies 5s; they remain deadly to touch | PARTIAL |
| FAQ-2.3.1f | WARP opens a doorway (~1-2s to open, ~1s open); entering advances the level with no end-of-level bonus | MISSING |
| FAQ-2.3.1g | 1-UP is a rare bonus granting a free life | MISSING |

## 2.4 Scoring

| ID | Item | Status |
|----|------|--------|
| FAQ-2.4.1a | Points scale with the size of the section completed | DONE (verify) |
| FAQ-2.4.1b | A section can be small enough to score zero yet still trigger a bonus release | MISSING |
| FAQ-2.4.1c | 500 points for an unneeded letter | MISSING |
| FAQ-2.4.1d | Rejoining within ~2 cells of the departure point scores 20x | MISSING |
| FAQ-2.4.1e | A second multiplier within a second or two raises it to 30x | MISSING |
| FAQ-2.4.2a | End of level: 1,000 points per 1% above the fill threshold | PARTIAL |
| FAQ-2.4.2b | End of level: 1,000 per key letter if the word is incomplete | MISSING |
| FAQ-2.4.2c | End of level: 10,000 per key letter if the word is complete | PARTIAL |
| FAQ-2.4.2d | One extra credit for filling 98% or more | PARTIAL |

## 2.5 Miscellaneous

| ID | Item | Status |
|----|------|--------|
| FAQ-2.5.1 | Default high score table: CAS/6/32750, THU/5/30010, ROC/5/28200, DRA/4/21280, FAN/3/20570 | CONTRADICTS |
| FAQ-2.5.2 | On completion the Gremlin becomes a Joker card that flies up erasing the stix while the picture is revealed | MISSING |
| FAQ-2.5.3b | Usually ONE Gremlin, which sometimes divides | PARTIAL |
| FAQ-2.5.3c | No Super Skulls that chase up an unfinished line | CONTRADICTS |
| FAQ-2.5.3d | No fast/slow draw option in Super Qix | DONE (tests/drawing.test.ts) |
| FAQ-2.5.3e | The marker can retrace its path | MISSING |

## 3. Levels

| ID | Item | Status |
|----|------|--------|
| FAQ-3a | 16 levels, then back to level 1 continuing the score | PARTIAL |
| FAQ-3b | The returned level 1 is identical to the first, enemy speeds included | MISSING |
| FAQ-3c | Level names: CASTLE, THUNDER, ROCKMAN, DRAGON, FANFARE, PLANET, GERDEN, JUNGLE, TOYBOX, FOUNTAIN, MERMAID, CARP, FLOWER, TENGU, ROCKET, REDCATS | CONTRADICTS |
| FAQ-3.1 | Level 16 completion message, three lines | MISSING |

## 4. Skill levels

| ID | Item | Status |
|----|------|--------|
| FAQ-4.1 | EASY: 5 lives, bonus lives at 20,000 and 50,000, fill 70%, continues allowed | MISSING |
| FAQ-4.2 | MEDIUM: 3 lives, bonus lives at 30,000 and 100,000, fill 75%, continues allowed | PARTIAL |
| FAQ-4.3 | HARD: 2 lives, no bonus lives, fill 85%, no continues | MISSING |

## 5. Strategies (emergent — no separate code)

| ID | Item | Status |
|----|------|--------|
| FAQ-5.1 | Gremlin-trapping yields huge fills | EXEMPT (candidate) |
| FAQ-5.2 | Spelling-bee strategy (small boxes maximise letter releases) | EXEMPT (candidate) |
| FAQ-5.3 | Multiplier strategy — restates FAQ-2.4.1d | EXEMPT (candidate) |

---

## Decisions taken (user, 2026-08-30)

1. **The FAQ wins on every contradiction.** Remove the Z/X slow-fast draw
   (FAQ-2.5.3d), remove the Super Sparx promotion (FAQ-2.5.3c), and adopt the
   FAQ's level words and default high-score table (FAQ-3c, FAQ-2.5.1). The
   background pictures are not tied to the level names, which is accepted.
2. **Presentation is approximated in ANSI.** Implement the completion sweep
   that erases the stix while revealing the picture (FAQ-2.5.2, partial) and
   the level-16 three-line message (FAQ-3.1). The menagerie of completion
   creatures is EXEMPT: it needs sprite animation a terminal cannot carry.
3. **All three skill levels are implemented** (FAQ-4.1, 4.2, 4.3), selected
   from the menu, with the high-score table recording the mode.
4. **Credit mechanics are EXEMPT** — a BBS door has no coin slot. The 98%
   milestone is kept as a reward (an extra life) rather than a free credit.

### Exemptions agreed

| ID | Reason |
|----|--------|
| FAQ-2.5.2-creatures | Completion creature menagerie needs sprite animation; the stix-erase sweep and picture reveal are implemented instead |
| FAQ-2.3h | No continue/credit concept in a BBS door |
| FAQ-2.4.2d-credit | Extra CREDIT is arcade-only; kept as an extra life at 98% |
| FAQ-4.1-continues | "Allow continues" is arcade-only |
| FAQ-4.2-continues | as above |
| FAQ-4.3-continues | as above |
| FAQ-5.1 | Emergent strategy, no separate code |
| FAQ-5.2 | Emergent strategy, no separate code |
| FAQ-5.3 | Restates FAQ-2.4.1d |
