# Door Examples (Summary)
**Example walkthroughs (AquaScan run logs, Who door flows, Bulls fixes) now live in `archive/`.**

## 1. AquaScan
- Run via `npx tsx scripts/run-amiga-door.ts Doors/AquaScan/AquaScan.000 1 "FR"` to reproduce the FR listing.
- Camera line parsing now flags ASCII art lines and stores them in the continuation block so the main metadata line stays clean; refer to `dir-file.util.ts` for the detection logic.
- When AquaScan prints ASCII logos, the updated door code pauses based on the user’s stored terminal height; the harness log shows the `press <RETURN>` prompt matching express.e.

## 2. WHO Door
- WHO now routes through `BBSCMD` per express.e, avoiding the old TypeScript handler that intercepted the command prematurely.
- The harness logs (in `/tmp/bulls.out`) show each `JH_*` handshake and confirm the door exits cleanly, as it did in express.e on node 0.

## 3. Error Cases
- If FR outputs duplicated lines or early breaks, enable `DEBUG_XIM_OUTPUT=1` and examine `logs/door-68k.log`; the new parser splits art vs data before pushing continuation text.
- Upload issues that previously logged `Upload session invalid` now log the path and session token; check the new detailed logging in the door console output.

**Need the actual archives of door binaries/art?** They live now under `Documentation/7-Reference Sources/Doors_with_Source/` and `vAmiga/`; these directories hold the raw files used for comparison.
