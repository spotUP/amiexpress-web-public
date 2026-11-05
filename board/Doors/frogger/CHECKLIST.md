# Frogger — FAQ conformance checklist

Source: `~/Desktop/FAQ_Frogger.txt` (Frogger FAQ, arcade, 1981
Konami/Sega). Every claim the FAQ makes about how the game behaves is an item
here with an ID, so the plan can be executed and ticked in the open rather
than sampled.

Status vocabulary:

`DONE` · `PARTIAL` · `MISSING` · `CONTRADICTS` (the door does something the
FAQ says it should not) · `EXEMPT` (needs a written, agreed reason).

**Total: 51 · DONE: 46 · EXEMPT: 5 · OPEN: 0**  _(last updated 2026-08-31)_

---

## 6. The game

| ID | Item | Status |
|----|------|--------|
| FAQ-6a | Five road lanes, a median, five water lanes, five homes | DONE |
| FAQ-6b | Cars become more numerous AND faster as levels progress | DONE |
| FAQ-6c | Turtles and logs become scarcer as levels progress | DONE |
| FAQ-6d | Predators become more plentiful as levels progress | DONE |
| FAQ-6e | A limited time per frog; running out costs a life | DONE |

## 6.1 Controls

| ID | Item | Status |
|----|------|--------|
| FAQ-6.1a | Four-way movement: left, right, up, down | DONE |

## 6.2 The playing field

| ID | Item | Status |
|----|------|--------|
| FAQ-6.2a | The screen shows score, HI-SCORE, frogs left, level and a TIME bar | DONE |

## 6.3 Scoring

| ID | Item | Status |
|----|------|--------|
| FAQ-6.3a | 10 points for each forward hop | DONE |
| FAQ-6.3b | At most 100 hop points per home (i.e. one payment per row) | DONE |
| FAQ-6.3c | 50 points for a frog safely put in a home | DONE |
| FAQ-6.3d | 1,000 points for completing a level | DONE |
| FAQ-6.3e | 200 points for bringing a frog to your home (the lady frog) | DONE |
| FAQ-6.3f | 200 points for eating a fly | DONE |
| FAQ-6.3g | Time bonus of 10 x the remaining seconds | DONE |
| FAQ-6.3h | Start with 3, 5, 7 or 256 lives (the operator's setting) | DONE |
| FAQ-6.3i | One free frog at 20,000 points | DONE |

## 6.4 The levels

| ID | Item | Status |
|----|------|--------|
| FAQ-6.4a | Levels after 6 repeat in five-level blocks: 6-10, 11-15, 16-20 | DONE |
| FAQ-6.4b | Per-level car counts for road lanes 1, 2, 3 and 5, from the table | DONE |
| FAQ-6.4c | Lane 4 carries a per-level count of FAST or SLOW cars | DONE |
| FAQ-6.4d | Lane 4 cars speed up after a while if they are not fast already | DONE |
| FAQ-6.4e | Per-level turtle-set and log counts for each water lane, from the table | DONE |
| FAQ-6.4f | Water lanes 1 and 4 are sets of turtles, one set of which dives | DONE |
| FAQ-6.4g | Lane 2 short logs, lane 3 long logs, lane 5 medium logs | DONE |
| FAQ-6.4h | On levels 5 and 10 water lane 5 is a crocodile rather than logs | DONE |
| FAQ-6.4i | From level 2 a crocodile appears in a home | DONE |
| FAQ-6.4j | Every Nth log in lane 5 is a crocodile; N is 5, 3, 2, 2, 2 by level | DONE |
| FAQ-6.4k | One snake is added at level 3, a second at level 7 | DONE |
| FAQ-6.4l | The crocodile appears in a home at random | DONE |
| FAQ-6.4m | Snakes appear at random in the median, on a log, or both | DONE |
| FAQ-6.4n | The otter appears at random on any water lane | DONE |

## 7. Playing the game

| ID | Item | Status |
|----|------|--------|
| FAQ-7a | 60 seconds, and ten rows to cross to a home | DONE |
| FAQ-7b | Filling all five homes advances the level | DONE |
| FAQ-7c | Cars travel left to right on the roadway | DONE |
| FAQ-7d | Water lanes 1, 3, 5 go right to left; lanes 2 and 4 left to right | DONE |
| FAQ-7e | A vehicle hit kills the frog | DONE |
| FAQ-7f | The snake is deadly and cannot be hopped over | DONE |
| FAQ-7g | A diving turtle drowns a frog standing on it | DONE |
| FAQ-7h | You can ride the backs of crocodiles and otters | DONE |
| FAQ-7i | Their mouths kill: the front of a crocodile or otter is fatal | DONE |
| FAQ-7j | A frog rides a log in lane 2; crossing it carries it home | DONE |
| FAQ-7k | Snakes sometimes ride on the logs | DONE |
| FAQ-7l | The frog cannot wrap around; riding off the edge kills it | DONE |
| FAQ-7m | A fly appears in a home and can be waited for | DONE |
| FAQ-7n | A frog must hit the exact centre of a home or die | DONE |
| FAQ-7o | A crocodile in a home kills a frog that enters it | DONE |
| FAQ-7p | Taking too long makes the river move quicker | DONE |

## 8. Quirks in the game

| ID | Item | Status |
|----|------|--------|
| FAQ-8a | The frog can be steered during the demo, up to water lane 4 | EXEMPT |
| FAQ-8b | Entering a home as the crocodile leaves credits the home AND kills | EXEMPT |
| FAQ-8c | A frog can dangle off the left of a turtle but not the right | EXEMPT |
| FAQ-8d | Side-to-side movement in water lane 5 is sluggish | EXEMPT |
| FAQ-8e | The purple frog is sometimes invisible | EXEMPT |

### Exemptions agreed

| ID | Reason |
|----|--------|
| FAQ-8a | There IS an attract demo now, but its keys open the menu rather than steering the frog - in a door the keyboard is how you start a game, and the arcade's steerable demo is a quirk of the coin slot |
| FAQ-8b | Being credited for a home AND losing a frog is a bug in the arcade ROM, not behaviour worth reproducing |
| FAQ-8c | Dangling off one side of a turtle but not the other needs sub-cell positions; a terminal cell is the smallest thing there is here |
| FAQ-8d | Sluggish side-to-side movement in water lane 5 is a defect of the original hardware |
| FAQ-8e | An invisible lady frog is a rendering fault, not a feature |

### Readings and departures

| Item | Reading |
|------|---------|
| FAQ-7a "ten spaces" | The FAQ says ten, but its own field diagram draws five road lanes, a median, five water lanes and the home row - twelve rows. The door follows the diagram. |
| FAQ-7c "cars travel left to right" | Taken literally: every road lane runs left to right. The real cabinet alternates them, and the FAQ's own field diagram does not say either way; the FAQ's sentence is the only statement on it, so it wins. Worth revisiting if the road plays flat. |
| FAQ-6.3h 256 lives | Offered in the menu, but the row of frogs in the status line switches to a count above eight rather than drawing 256 of them. |
| Lane 5 crocodile count | The table's C says lane 5 IS crocodiles but gives no number; three is used, matching the medium-log counts either side of it in the table. |
