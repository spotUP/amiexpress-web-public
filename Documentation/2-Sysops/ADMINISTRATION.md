# System Administration Guide (Summary)
**Deep-dive logs and webhook guides are archived (`archive/SYSOP_WEBHOOK_GUIDE.md`, `archive/WEBHOOKS_README.md`, `archive/DEPLOYMENT_WEBHOOKS.md`).**

## 1. Daily Tasks
- Monitor call time limits, uploads, and downloads through the dashboard and the `/logs` directory; the system logs `upload.log`, `download.log`, and door output in `logs/door-68k.log` and `/tmp/*.out`.
- Review `bbsConfig.info` and security levels when granting access—levels still obey express.e bitmasks so sysops can open or lock conferences using the classic flags.
- Use `ADMIN` commands (most accessible through `S` for status, `M` for message overview) to confirm node counts, door statuses, and user reports.

## 2. File & Door Management
- When new files arrive, the BBS ensures each conference has a `Dir1` (or `DirX`) file; missing files are created with safe defaults so doors like AquaScan can read them 1:1.
- Use `FR` and `FM` commands to verify ASCII logos, file sizes, and flag bits; art lines are kept in the 33-char continuation block to match the classic look.
- For door runs, the log lives in `/logs/door-68k.log`, `/tmp/bulls.out`, and the harness output from `node web/backend/dist/scripts/run-amiga-door.js Doors/AquaScan/AquaScan.000 <node> <command>`.

## 3. Automation & Webhooks
- Configure deployment webhooks from `archive/WEBHOOK_INTEGRATION.md` to trigger node restarts or sync tasks; the same hooks feed `archive/SYSOP_WEBHOOK_GUIDE.md` where each hook maps to commands.
- Use `archive/DEPLOYMENT_SCRIPTS.md` to run sequential server start/stop scripts and capture telemetry.
- For automated imports/exports, monitor the `uploads/` directory and check log output for `Upload session invalid` errors; logs now capture more context so you can trace the root cause of missing DIR files exactly as express.e would.

## 4. Troubleshooting & Support
- When the BBS complains `Couldn't Open DirFile!` or `Upload session invalid`, confirm that the conference directories (`Conf1/Conf2/...`) exist and that `Dir1` file is present; the code now auto-creates them if missing.
- Validate door parsing issues (double line breaks, pauses) by reviewing the door logs and the `DEBUG_XIM_OUTPUT=1` harness flag.
- For misaligned ASCII or missing screens, compare to original express.e screen files preserved in `Screens/` and `Documentation/7-Reference Sources/petscii-bbs-2.1/`.

**Sysops can find scripts, diagnostics, and advanced automation outlines in the archive folder; today’s summary keeps operations compact while referencing those resources.**
