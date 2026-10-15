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

**FAQ total: 74 · DONE: 74 · EXEMPT: 9 · OPEN: 0**
**QUIX total: 30 · DONE: 30 · OPEN: 0**  _(last updated 2026-08-31)_

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
| FAQ-1b | Level starts as an empty rectangle containing the Gremlin and TWO Skulls | DONE (tests/enemies.test.ts) |
| FAQ-1e | Closing a shape reveals part of the picture, awards points, may release a letter/power-up | DONE |
| FAQ-1f | After claiming, the marker may travel the border of the claimed area; internal lines are NOT walkable | DONE (tests/movement.test.ts) |
| FAQ-1g | The outer border is a Time Meter: squares change colour two at a time until the whole border is red | DONE (tests/enemies.test.ts) |
| FAQ-1h | When the meter fills, two more Skulls are released and the counter resets | DONE (tests/enemies.test.ts) |
| FAQ-1i | Neither Gremlin nor Skulls can be destroyed | DONE (tests/enemies.test.ts) |
| FAQ-1j | Later levels: enemies faster and more aggressive, timer counts down quicker | DONE (tests/enemies.test.ts) |

## 2.1 What to do

| ID | Item | Status |
|----|------|--------|
| FAQ-2.1a | Movement restricted to border or inside edges of claimed areas (same as USER-1) | DONE (tests/movement.test.ts) |
| FAQ-2.1b | On an edge: safe from the Gremlin, still vulnerable to Skulls | DONE (tests/enemies.test.ts) |
| FAQ-2.1c | Cannot leave the field edge without drawing | DONE (tests/movement.test.ts) |
| FAQ-2.1d | Holding Draw moves freely inside the field, leaving a YELLOW line | DONE (tests/drawing.test.ts) |
| FAQ-2.1e | The line turns BLUE and becomes safe once it reconnects to border or finished line | DONE (tests/drawing.test.ts) |
| FAQ-2.1f | Crossing your own line is not allowed | DONE (tests/gremlin-and-fuse.test.ts) |
| FAQ-2.1g | Backtracking along your own incomplete line IS allowed | DONE (tests/gremlin-and-fuse.test.ts) |
| FAQ-2.1h | While drawing: Skulls cannot reach you, the Gremlin can | DONE (tests/enemies.test.ts) |
| FAQ-2.1i | Gremlin touching the marker OR any point of the incomplete stix costs a life | DONE (tests/enemies.test.ts) |
| FAQ-2.1j | The region containing the Gremlin is always "Outside"; the other region fills | DONE (tests/gremlin-and-fuse.test.ts) |

## 2.2 Enemies

| ID | Item | Status |
|----|------|--------|
| FAQ-2.2a | Gremlin bounces semi-randomly, weighted towards the marker | DONE (tests/gremlin-and-fuse.test.ts) |
| FAQ-2.2b | Gremlin cannot touch the marker while it is on a wall or claimed edge | DONE (tests/enemies.test.ts) |
| FAQ-2.2c | Gremlin kills by hitting the marker or any point of the incomplete line | DONE (tests/enemies.test.ts) |
| FAQ-2.2d | Later levels: Gremlin zooms toward the marker whenever it detaches | DONE (tests/gremlin-and-fuse.test.ts) |
| FAQ-2.2e | Later levels: the Gremlin splits into multiple independent copies | DONE (tests/gremlin-and-fuse.test.ts) |
| FAQ-2.2f | Drawing between two copies: "Outside" is the LARGER area; the trapped copy disappears | DONE (tests/gremlin-and-fuse.test.ts) |
| FAQ-2.2g | Two Skulls start directly opposite the marker, travelling in opposite directions | DONE (tests/enemies.test.ts) |
| FAQ-2.2h | Skulls are slower than the marker (outrunnable) and faster than letters/power-ups | DONE (tests/enemies.test.ts) |
| FAQ-2.2i | Skulls may follow any line, including internal lines the player cannot use | DONE |
| FAQ-2.2j | Skulls cannot follow the player up an incomplete stix | DONE (tests/enemies.test.ts) |
| FAQ-2.2k | A Skull never instantly reverses direction on a line | DONE (tests/enemies.test.ts) |
| FAQ-2.2l | Timer expiry releases two Skulls from centre-top and resets the counter | DONE (tests/enemies.test.ts) |
| FAQ-2.2m | On death, all but two Skulls disappear | DONE (tests/enemies.test.ts) |
| FAQ-2.2n | Stopping while drawing starts a fuse burning from the line's end toward the marker | DONE (tests/gremlin-and-fuse.test.ts) |
| FAQ-2.2o | Moving stops the fuse; pausing again resumes it from where it stopped | DONE (tests/gremlin-and-fuse.test.ts) |
| FAQ-2.2p | Backtracking counts as NOT moving for the fuse | DONE (tests/gremlin-and-fuse.test.ts) |

## 2.3 Letters and power-ups

| ID | Item | Status |
|----|------|--------|
| FAQ-2.3a | Every fill, however small, has a chance to release a letter or power-up | DONE |
| FAQ-2.3b | Letters drift in a straight line to the far wall, then travel back around the edges | DONE |
| FAQ-2.3c | Power-ups follow the nearest already-drawn lines | DONE |
| FAQ-2.3d | Word letters award no points until the level completes | DONE |
| FAQ-2.3e | 1,000 points per key letter if the word is incomplete at the threshold | DONE |
| FAQ-2.3f | 10,000 points per key letter AND instant level completion if the word is spelled | DONE |
| FAQ-2.3g | A duplicate or non-word letter is an instant 500 points | DONE |
| FAQ-2.3h | Collected letters are lost on continue | EXEMPT |

## 2.3.1 Power-up behaviour

| ID | Item | Status |
|----|------|--------|
| FAQ-2.3.1a | Power-ups are mutually exclusive — a new one cancels the current | DONE |
| FAQ-2.3.1b | Hurry stacks; another power-up cancels only the LAST Hurry | DONE |
| FAQ-2.3.1c | HURRY speeds up everything for ~10 seconds, cumulative | DONE |
| FAQ-2.3.1d | SHIELD absorbs one Skull hit and stuns it ~1s; does NOT protect from the Gremlin | DONE |
| FAQ-2.3.1e | FREEZE stops all enemies 5s; they remain deadly to touch | DONE |
| FAQ-2.3.1f | WARP opens a doorway (~1-2s to open, ~1s open); entering advances the level with no end-of-level bonus | DONE |
| FAQ-2.3.1g | 1-UP is a rare bonus granting a free life | DONE |

## 2.4 Scoring

| ID | Item | Status |
|----|------|--------|
| FAQ-2.4.1a | Points scale with the size of the section completed | DONE (verify) |
| FAQ-2.4.1b | A section can be small enough to score zero yet still trigger a bonus release | DONE |
| FAQ-2.4.1c | 500 points for an unneeded letter | DONE |
| FAQ-2.4.1d | Rejoining within ~2 cells of the departure point scores 20x | DONE |
| FAQ-2.4.1e | A second multiplier within a second or two raises it to 30x | DONE |
| FAQ-2.4.2a | End of level: 1,000 points per 1% above the fill threshold | DONE |
| FAQ-2.4.2b | End of level: 1,000 per key letter if the word is incomplete | DONE |
| FAQ-2.4.2c | End of level: 10,000 per key letter if the word is complete | DONE |
| FAQ-2.4.2d | One extra credit for filling 98% or more (granted as an extra life - a BBS door has no credits) | DONE |

## 2.5 Miscellaneous

| ID | Item | Status |
|----|------|--------|
| FAQ-2.5.1 | Default high score table: CAS/6/32750, THU/5/30010, ROC/5/28200, DRA/4/21280, FAN/3/20570 | DONE |
| FAQ-2.5.2 | On completion the Gremlin becomes a Joker card that flies up erasing the stix while the picture is revealed | EXEMPT |
| FAQ-2.5.3b | Usually ONE Gremlin, which sometimes divides | DONE (tests/gremlin-and-fuse.test.ts) |
| FAQ-2.5.3c | No Super Skulls that chase up an unfinished line | DONE (tests/enemies.test.ts) |
| FAQ-2.5.3d | No fast/slow draw option in Super Qix | DONE (tests/drawing.test.ts) |
| FAQ-2.5.3e | The marker can retrace its path | DONE (tests/gremlin-and-fuse.test.ts) |

## 3. Levels

| ID | Item | Status |
|----|------|--------|
| FAQ-3a | 16 levels, then back to level 1 continuing the score | DONE |
| FAQ-3b | The returned level 1 is identical to the first, enemy speeds included | DONE |
| FAQ-3c | Level names: CASTLE, THUNDER, ROCKMAN, DRAGON, FANFARE, PLANET, GERDEN, JUNGLE, TOYBOX, FOUNTAIN, MERMAID, CARP, FLOWER, TENGU, ROCKET, REDCATS | DONE |
| FAQ-3.1 | Level 16 completion message, three lines | DONE |

## 4. Skill levels

| ID | Item | Status |
|----|------|--------|
| FAQ-4.1 | EASY: 5 lives, bonus lives at 20,000 and 50,000, fill 70%, continues allowed (continues excepted) | DONE |
| FAQ-4.2 | MEDIUM: 3 lives, bonus lives at 30,000 and 100,000, fill 75%, continues allowed (continues excepted) | DONE |
| FAQ-4.3 | HARD: 2 lives, no bonus lives, fill 85%, no continues (continues excepted) | DONE |

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

---

## QUIX reference comparison (Q-*)

A second pass, against the QUIX reference implementation
(`https://codeberg.org/SirWumpus/quix` @ `1e1d40dbeb`) rather than the FAQ.
Research: `thoughts/shared/research/2026-08-31_quix-reference-comparison.md`.
Plan: `thoughts/shared/plans/2026-08-31-super-qix-quix-gaps.md`.

Every item below was verified by reverting the change and watching the named
test fail. Where a revert could not fail a test - a negative assertion, or new
code with nothing to revert to - the opposite mutation was applied instead and
is noted.

### Your own line stops you, it does not kill you

| ID | Item | Status |
|----|------|--------|
| Q-1a | Walking into your own line refuses the move and costs no life | DONE (tests/gremlin-and-fuse.test.ts `theMarkerCannotCrossItsOwnLine`) |
| Q-1b | A refused crossing lights the Fuse | DONE (tests/gremlin-and-fuse.test.ts `aRefusedCrossingLightsTheFuse`) |
| Q-1c | Backtracking one cell still works and still does not reset the stall timer | DONE (tests/gremlin-and-fuse.test.ts `theMarkerCanBacktrackAlongItsOwnLine`, `backtrackingDoesNotResetTheFuseTimer`) |
| Q-1d | The Fuse still kills when it reaches the marker | DONE (tests/gremlin-and-fuse.test.ts `theFuseStillKillsWhenItReachesTheMarker`) |

### More Gremlins, and a fill worth more because of them

| ID | Item | Status |
|----|------|--------|
| Q-2a | Level 1 starts with one Gremlin | DONE (tests/enemies.test.ts `levelOneStartsWithOneGremlin`) |
| Q-2b | A Gremlin is added every fourth level | DONE (tests/enemies.test.ts `aGremlinIsAddedEveryFourthLevel`) |
| Q-2c | The count never exceeds MAX_GREMLINS | DONE (tests/enemies.test.ts `theGremlinCountStopsAtTheCap`) |
| Q-2d | The same claim scores more with more Gremlins on the board | DONE (tests/drawing.test.ts `theSameClaimIsWorthMoreWithMoreGremlins`) |
| Q-2e | Tick speed does NOT change with the count (recorded as a departure) | DONE (tests/enemies.test.ts `theGremlinCountDoesNotChangeTheGamesSpeed`) |

### Capturing a Gremlin pays

| ID | Item | Status |
|----|------|--------|
| Q-3a | Sealing a Gremlin into a claim counts as a capture | DONE (tests/gremlin-and-fuse.test.ts `sealingAGremlinIntoAClaimCountsAsACapture`) |
| Q-3b | A Gremlin left outside the claim does not | DONE (tests/gremlin-and-fuse.test.ts `aGremlinLeftOutsideTheClaimIsNotACapture`) |
| Q-3c | The level-end tally pays CAPTURE_POINTS for each | DONE (tests/level-outro.test.ts `theLevelEndPaysForEachCapturedGremlin`) |
| Q-3d | The BONUS panel shows a CAPTURE row when there were captures | DONE (tests/level-outro.test.ts `theBonusPanelShowsACaptureRow`) |
| Q-3e | ...and omits it when there were none | DONE (tests/level-outro.test.ts `theBonusPanelOmitsTheCaptureRowWhenThereWereNone`; a negative assertion, so verified by making the row unconditional and watching it fail) |
| Q-3f | The count resets between levels | DONE (tests/level-outro.test.ts `theCaptureCountResetsBetweenLevels`) |

### A ceiling on lives

| ID | Item | Status |
|----|------|--------|
| Q-4a | Lives stop at MAX_LIVES however they are earned | DONE (tests/levels-and-skill.test.ts `livesStopAtTheCeilingHoweverTheyAreEarned`, all three award routes) |
| Q-4b | All three award sites go through one function | DONE (tests/levels-and-skill.test.ts `everyLifeAwardGoesThroughOneFunction`, asserted against the source so a FOURTH site added later is caught) |

### The door's conveniences

| ID | Item | Status |
|----|------|--------|
| Q-5a | Help lists every binding, generated from the live map | DONE (tests/controls.test.ts `theHelpScreenListsEveryBinding`, `theHelpScreenFollowsARemap`, `theDoorGeneratesItsHelpFromTheKeyMap`) |
| Q-5b | Ctrl-D repaints the board | DONE (tests/controls.test.ts `ctrlDIsRecognisedAsTheRedrawKey`, `theDoorRepaintsOnCtrlD`) |
| Q-5c | A remapped key moves the marker | DONE (tests/controls.test.ts `aRemappedKeyMovesTheMarker`, `theDoorDispatchesMovementThroughTheKeyMap`) |
| Q-5d | The arrow keys keep working after a remap | DONE (tests/controls.test.ts `theArrowKeysKeepWorkingAfterARemap`, `aRemapRefusesKeysTheGameAlreadyNeeds`) |
| Q-5e | A remap survives leaving and re-entering the door | DONE (tests/controls.test.ts `aRemapSurvivesLeavingAndReenteringTheDoor`, `theDoorLoadsAndSavesTheBindings`) |
| Q-5f | High scores are written outside `dist/` and survive a deploy | DONE (tests/controls.test.ts `highScoresAreWrittenOutsideDist`) |
| Q-5g | A full BBS handle can be recorded as a high score | DONE (tests/controls.test.ts `aFullBbsHandleCanBeRecorded`) |
| Q-5h | The high score name is taken from the session, not typed | DONE (tests/controls.test.ts `theHighScoreNameComesFromTheSession`) |

### The ledger

| ID | Item | Status |
|----|------|--------|
| Q-6a | CHECKLIST.md carries the QUIX section and the deliberate departures | DONE (this section) |

### Two defects found while reading our own source

Neither came from the reference; both were found while comparing against it,
and both were live faults on the board.

| What | Where it was | Why it mattered |
|------|--------------|-----------------|
| High scores were written into `dist/` | `server.ts:12`, `path.join(__dirname, 'highscores.json')` | `__dirname` is `dist/` under the compiled door, and every deploy rebuilds it - so the board was wiped on each deploy. Arkanoid was fixed for exactly this; Super Qix never was. |
| The save RPC rejected any name longer than three characters | `server.ts:63` | A BBS handle is not three initials, so a player called SPOTUP could not get onto the board at all - the same fault Frogger had. `MAX_NAME_LENGTH` already existed at 3 and was ignored: `index.ts` and `server.ts` both hardcoded the figure. |

### Deliberate departures from the QUIX reference (user-agreed)

| Departure | Reason |
|-----------|--------|
| Tick speed is not scaled by the Gremlin count | The reference's `udelay((10 - quixnum) * 30)` is an 1980s terminal's pacing; ours was measured against BBS keypress timing (~660ms between taps) and retuning it would undo that work |
| Captures pay 250, though FAQ 2.2 says they pay nothing | Agreed with the user: it rewards the trapping play the FAQ itself calls the most spectacular in the game, and the reference pays for it (`quix.c:299`) |
| The filled side is chosen by area, not by Gremlin counts | FAQ 2.1 and 2.2 settle this the other way, and ours follows the FAQ |
| The Gremlin count is capped at four, not the reference's ten | Ten Gremlins on a 38x18 field leaves nowhere to draw. One arrives every fourth level, so a 16-level lap ends at the cap exactly as it ends. |
| The Gremlin count does NOT reset when a lap does | Noted here because it contradicts a FAQ 3 quote already carried in `getLevelConfig`: "there are no changes between the initial L.1 and the L.1 you come back to". That quote is about enemy SPEEDS, which still hold; handing back three Gremlins at level 17 would undo the lap the player just finished, and the reference never resets its count either. `theSecondLapIsIdenticalToTheFirst` still checks the speeds and the level word. |


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
| FAQ-2.5.2 | The Joker card and its menagerie need sprite animation. The stix ARE erased and the picture IS revealed, by the wipe the user asked for: "on the arcade the full image draws from right to left when a level is cleared, removing my lines as well" |
| FAQ-4.x-continues | "Allow continues" is a coin-op setting; a BBS door has no coin slot |

### Deliberate departures from the arcade (user-agreed)

| Departure | Reason |
|-----------|--------|
| Arrow keys alone draw; no hold-to-draw key | In a terminal the arrows are the whole controller, and stepping off safe ground into open field has no other meaning. User: "we can skip holding a key for drawing arrow keys is enough in a bbs context" |
| Enemy pacing retuned (fuse 3000ms, Sparx 0.55, Qix 1.1) | Measured ~660ms between keypresses at BBS pace: people tap arrow keys, they do not hold them. At arcade timings an ordinary draw died 30 times out of 30, always to the fuse, which lit in less time than the gap between two taps. Retuned to 6/30. |
| A Hurry multiplies the pace by 1.4 rather than the arcade's "unmanageably fast" | A terminal redraws a whole frame per tick over a socket. Two stacked Hurries already double the pace here; the arcade's runaway acceleration is unplayable rather than funny at this frame rate. |
| Death does not return the marker to the spawn point | It retreats to where its line began; a death on safe ground leaves it standing. The arcade's respawn point is a fixed board position the player can see coming; here it read as the game throwing away your progress. |
