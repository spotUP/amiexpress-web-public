# Milestones (Summary)
- ✅ **Documentation reorganization (2025-12-04)**: Cleaned `Documentation/1-6` down to summary files, moved hundreds of legacy notes into per-folder `archive/` directories, and centralized door/emulator source material under `Documentation/7-Reference Sources/`.
- ✅ **AquaScan & WHO harness**: Door runs now use the TypeScript harness with `DEBUG_XIM_OUTPUT=1` logs, producing `logs/door-68k.log` output that matches express.e prompts and lifecycles.
- ⚠️ **FR art/pause alignment**: Need final polish on ASCII art splitting, double-line detection, and pause timing before AquaScan output is indistinguishable from the original.
- ⚠️ **68K SIM doors**: Implementation paused pending better understanding of `FindPort`/port cleanup behavior from the archived disassembly notes.
- ⚠️ **Network restoration**: `npm` access to `registry.npmjs.org` is blocked in this sandbox, preventing some verification runs and package downloads.

Next incremental milestone: finish the AquaScan FR fixes, re-validate door logs via the harness, and then revisit the SIM door port to unlock the remaining dials.
