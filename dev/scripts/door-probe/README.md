# Door probe

One-shot diagnosis tool for new 68K doors. Point it at any Hunk binary
and get back a structured report: what XIM ops it called, what LVOs
fired (with real / stub / missing status), what errors it logged, and
an actionable recommendation. Designed to turn the "fire it up, watch
logs, guess" bring-up loop into a single command.

## Usage

```
npx tsx dev/scripts/door-probe/probe.ts <binary> [options]
```

Options:

| Flag | Meaning |
|------|---------|
| `--doortype XIM\|SIM\|TIM\|IIM\|SUP` | Door class (default XIM) |
| `--command <name>` | Pass through to harness `--command` |
| `--timeout <ms>` | Hard deadline (default 12000) |
| `--input-script <file>` | Stdin script for interactive doors |
| `--out <report.md>` | Write report to file (else stdout) |
| `--json` | Emit JSON instead of markdown |
| `--assigns <json>` | Forward to harness `--assigns` |
| `--tooltypes <json>` | Forward to harness `--tooltypes` |

Exit codes:
- `0` — door ran, no hard blockers
- `1` — not a Hunk binary, or unimplemented LVO observed
- `2` — bad CLI args / binary not found / spawn error

Input-script format (one entry per line):

```
# comment lines start with #
<delayMs> <bytes-with-\r-\n-\t-\xNN-escapes>
```

Example for a door that waits at a `(Y/n)` prompt:

```
2000 n\r
```

## What the report tells you

```markdown
# Door probe — MyDoor

- Path / size / Hunk magic / $VER string / referenced libraries

## Run result
- Exit code / timeout / wall clock / stdout preview

## XIM ops
- JH_REGISTER × 1, JH_SM × 22, PRV_COMMAND × 1 ...

## LVOs called
### exec.library
- [OK] AllocMem × 10        ← real handler, works fine
- [STUB] FreeSignal × 1      ← returns success, no behaviour
- [MISSING] DoIO × 1         ← faulted; hard blocker

## Errors observed
- ...

## Recommendations
- Missing LVO impl(s): ... — these are hard blockers
- Stubbed LVOs the door actually called: ... — read NDK autodoc, impl, re-probe
- (or) No blockers detected — add to regression corpus
```

## Why this is faster than reading logs

The probe categorises every trap by **what the door actually called**:

- `[OK]` — real handler ran. Door works against this LVO.
- `[STUB]` — `LibraryTraps` registered a generic returns-success stub,
  the door called it, the handler did nothing useful. The door might
  *appear* to work but a downstream call reading the (nonexistent)
  result will fail.
- `[MISSING]` — unimplemented; logged as `*** UNIMPLEMENTED ***`
  by `LibraryTraps`. The door faulted at this point.

Stub-vs-missing is the most important distinction the probe makes —
in raw logs both look similar but a `STUB` means the harness *thinks*
it handled the call. That's why doors with all-OK + a few stubs can
still misbehave (the stub gave them a lie).

## Recommended workflow for a new door

1. Drop binary into `Doors/<Name>/` (or run from anywhere on disk —
   the probe doesn't need it installed).
2. `npx tsx dev/scripts/door-probe/probe.ts Doors/MyDoor/MyDoor`
3. Read the recommendations block. If "no blockers detected", great
   — install the `.info`, register the BBSCmd, register in the
   regression corpus (`dev/scripts/door-corpus/`).
4. If blockers: each line of the LVO list with `[STUB]` or
   `[MISSING]` points at a specific function in
   `web/backend/src/amiga-emulation/api/`. Implement against the NDK
   autodoc, re-probe.
5. For interactive doors that timeout: write a `--input-script` file
   driving them through their menu (one keystroke at a time with
   delays), re-probe. Once the input script reaches a clean exit, it
   becomes the corpus entry's `inputScript`.

## Known limitations

- The probe spawns the same harness CI uses (`run-amiga-door.ts`).
  Doors that require running BBS state (active session, real Conf.DB
  data, real user record) will hit the same data-missing errors a
  bare harness produces. That's intentional — the harness boots the
  binary in isolation. For BBS-context probing, run the door from
  inside a real BBS session and read backend.log.
- Stub-vs-real classification reads stderr regex patterns; a future
  log-format change in `LibraryTraps.ts` / `ExecLibrary.ts` would
  invalidate the parser. Patterns live in
  `dev/scripts/door-probe/probe.ts`; review there if the report
  looks wrong.
- AREXX doors (`.rexx` scripts) aren't handled by the 68K harness.
  AREXX-specific probing is a future tool — for now, run AREXX
  doors through a real BBS session.
