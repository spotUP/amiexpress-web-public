---
name: door-sdk-freshness
description: Use whenever you edit sdk/ (the blessed UI engine, network engine, or any other engine under sdk/engines) or a TypeScript door under Doors/, and before telling the user to test it. Prevents testing stale/cached code - the exact failure mode that cost a whole session on 2026-08-24 (edited sdk/, told the user to test, backend was still running the old build in memory).
---

# Door / SDK freshness protocol

This BBS's dev backend (`web/backend`) runs via `tsx src/index.ts` as a
**long-lived process** across many door-test iterations. Node's
`require()`/`import` cache is per-process and never hot-reloads a changed
file on disk. `tsx` also keeps its own on-disk transform cache that doesn't
always invalidate on mtime. Doors under `Doors/*` consume the SDK via a
`file:../../sdk` dependency (symlinked into `node_modules`), built to
`sdk/dist` — nothing rebuilds that automatically on save. Any one of these
three facts, missed, produces the same symptom: you fix the bug, the user
tests, "looks the same." Follow this checklist every time instead of
guessing.

## A. After editing `sdk/engines/**` (or any other sdk/ source)

1. **Typecheck**: `cd sdk && npx tsc --noEmit -p tsconfig.json`
2. **Test**: add/update a regression test for the change, `npx jest <file>`.
   Do the RED-before/GREEN-after check (temporarily revert the fix, confirm
   the test fails, restore) before trusting a new test — see
   `superpowers:test-driven-development` / the global "every bug fix ships
   with a regression test" rule.
3. **Rebuild dist — do not skip this**: `npm run build:cjs && npm run
   build:esm`. Nothing watches `sdk/` for changes; `watch-doors.ts` (the
   file-watcher `start-servers.sh` starts) only watches `Doors/`.
4. **Verify the build actually picked up your edit**: `grep` the new code
   pattern directly in the rebuilt `sdk/dist/**/*.js`. A green `tsc` exit
   code only proves the types are consistent, not that you rebuilt the file
   you think you rebuilt (wrong tsconfig, wrong package, stale outDir).
5. **Confirm the symlink exists** for the door you're testing:
   `ls -la Doors/<door>/node_modules/@amiexpress/bbs-door-sdk` should point
   at `../../../../sdk`. If `node_modules` doesn't exist at all for that
   door, see section C first — the rebuild is irrelevant until the door is
   actually installed.
6. **Restart the dev backend** — sdk changes are invisible to the door
   file-watcher, so nothing will restart it for you:
   ```
   /path/to/repo/dev/scripts/kill-servers.sh
   ps aux | grep -E "(start-servers|kill-servers|watch-doors|tsx .*src/index.ts)" | grep -v grep   # must print nothing
   rm -rf "$(getconf DARWIN_USER_TEMP_DIR)"tsx-*    # defensive: tsx's cache doesn't always invalidate on mtime
   /path/to/repo/dev/scripts/start-servers.sh --bbs-only --quick
   ```
   Use the **absolute path** to `start-servers.sh` — a relative path
   silently fails with "No such file or directory" if the shell's cwd isn't
   exactly the repo root at that moment, and that failure is easy to miss
   in a backgrounded `nohup ... &` call.
7. **Wait for and read the actual ready line** before saying anything to
   the user: tail `logs/backend.log` (or `Monitor` it) for
   `[READY] AmiExpress BBS is ready for connections!`. Don't infer
   readiness from the shell command merely returning — starting the stack
   takes tens of seconds (loading every door, AREXX, telnet/SSH servers).
8. Only now tell the user to test.

## B. After editing a door's own `.ts` source (`Doors/<door>/**/*.ts`)

1. Typecheck the door if it has its own `tsconfig.json`.
2. The door file-watcher *should* auto-restart the backend for you — verify
   it actually did, don't assume: check that `logs/backend.log`'s
   `[initializeDoors] Registered door: <NAME>` line (or a fresh `[READY]`
   line) has a timestamp **after** your edit's mtime. If it's stale, treat
   it exactly like section A step 6 and restart by hand.
3. If the door has a **client-side bundle** (`client.ts` → `dist/client
   .bundle.js` via esbuild — arkanoid, grandmaster, livechat all do this),
   rebuilding the door's server-side TS does not touch that bundle. Run the
   door's own `npm run build` (or its specific `bundle:client` script) and
   confirm the bundle's mtime moved. The pre-commit hook enforces that
   `dist/` is committed alongside source for these doors — if you forget to
   rebuild, the hook is your last backstop, but don't rely on it during
   local testing.

## C. First local run of a door that's only ever run on the live/deployed site

1. `cd Doors/<door> && npm install`. Live deploys install dependencies as
   part of the build/Docker image; a fresh local checkout usually has *no*
   `node_modules` under `Doors/*` at all. Symptom: "Cannot find module
   '<whatever>'" pointing at a `require stack` full of that door's own
   `.ts` files — that's a missing-install error, not a stale-code error.
   Don't start editing code in response to it.
2. If it depends on a native module (`better-sqlite3` and similar): confirm
   it actually loads before testing through the BBS —
   `node -e "require('better-sqlite3')"` (swap the module name). A native
   module failing to load usually means an ABI mismatch with the Node
   version the door gets spawned/imported under, not a missing dependency.
3. Confirm `node_modules/@amiexpress/bbs-door-sdk` came out as a **symlink**
   to the repo's `sdk/`, not a copy — `file:` dependencies normally symlink,
   but if it's ever a real copy, sdk rebuilds will silently never reach
   this door.

## D. Never trust "I rebuilt/restarted" without checking — three cheap checks, always

1. `grep` the new source pattern directly in the rebuilt `dist/*.js` (proves
   the build picked up your edit).
2. Compare timestamps: **dist file mtime > source file mtime > running
   backend process start time** (`ps -p <pid> -o lstart=`). If the backend
   started *before* your dist file's mtime, it is serving stale code —
   restart it, full stop, no further diagnosis needed.
3. After restart, re-check `logs/backend.log`'s own last-modified time is
   after your restart command. `start-servers.sh` overwrites this file on
   each run, but if a run failed to launch (see A.6's absolute-path gotcha)
   you can end up reading a leftover log from a previous, still-old run.

## Zombie-process hygiene (compounds every symptom above)

Never start the backend with ad-hoc `npm run dev &` / `pkill` — use
`start-servers.sh` / `kill-servers.sh` only, always with `--bbs-only`. This
session's restart found **6 duplicate backend tsx processes** piled up from
earlier ad-hoc starts; with duplicates running, you cannot know which one
the browser is actually talking to, and killing "the" process by PID may
leave a stale sibling serving traffic. Zombie-verify (the `ps aux | grep -E
...` line in A.6) before every single restart, no exceptions.

## What this does NOT cover

A green build and a fresh restart only prove the code is *reachable* — they
don't prove it's *correct*. That's what `superpowers:verification-before-
completion` and the regression-test requirement are for. This skill exists
purely to eliminate "it looks the same" reports that are actually "you
tested a version of the code that doesn't exist anymore."
