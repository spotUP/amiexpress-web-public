# DoorRepo `.info`/Access-Level Editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** an installed door's `ACCESS=` level can be viewed and changed from inside DoorRepo, and a door can be "disabled" (locked to an unreachable access level) and later "restored" to what it had before — without uninstalling it. This is the first slice of DoorRepo growing DOORMAN-parity door-management features (install/uninstall/strip/view already exist; this adds edit).

**Not building:** a clone of DOORMAN's `doToggleEnabled()`. That function is a documented no-op — it flips an in-memory flag and returns the message `"(session only — edit .info ENABLED tooltype to persist)"`, and nothing anywhere reads an `ENABLED` tooltype. There is also a `!`-prefix "commented tooltype" convention in `web/backend/src/scripts/info-editor.ts` (a standalone dev CLI) that is equally unwired — the real command loader (`command-execution.handler.ts`) never checks it. The mechanism that **actually works**, confirmed live (a sysop tightened `ACCESS=255` on a real `.info` and the door was genuinely locked to sysops before the next restart even happened, via the freshness-check cache invalidation), is `ACCESS=`. This plan builds against that, which makes it a real feature and not a second decorative stub.

**Architecture:** DoorRepo has never read its own `.info` files — only written them, once, at install time (`install_door()`, `flow_build_info_content()`). This plan adds a reader (parse the four existing tooltypes plus one new one this plan introduces) and generalizes the writer (currently hardcodes `ACCESS=0`) to take an explicit access level. A new `M` key on an *installed* entry opens a text-input editor pre-filled with the door's current access level; a separate one-key toggle (case for "just disable it") sets a sentinel value and remembers the prior one so it can be restored. The four tooltypes the BBS reads (`TYPE`, `LOCATION`, `STACK`, `ACCESS`) are never reordered or reformatted — an editor here is not a license to rewrite the whole file's shape, only to change one value in place using the same atomic-write pattern `install_door()` already established.

**Tech Stack:** C89 (`-std=c89 -Wall -Wextra -pedantic`), native POSIX build for dev/test, vbcc cross-compile (`vc +aos68k`) for the real m68k target. No new dependencies.

**Spec:** none exists for this feature yet — this plan doc is the spec. If a reviewer finds a genuine design defect mid-implementation, rule on it and record the ruling (per the ledger convention `superpowers:subagent-driven-development` already uses in this repo) rather than stalling.

## Global Constraints

- **C89 strict.** No `//` comments, no variable declarations after statements, no `long long`, no designated initializers. `make native` with `-pedantic` must stay clean.
- **Every `.info` write goes through the temp-file-then-`rename()` pattern**, exactly as `install_door()` already does (`doorrepo.c` ~2930–2975) and for the same reason: a directory's mtime changes when a file is *created*, not when its content is filled in later, and the BBS's freshness check keys off directory mtime. A `fopen()`+`fwrite()` in place, without the temp+rename dance, reintroduces a real production bug this codebase already fixed once.
- **`ACCESS`, `TYPE`, `LOCATION`, `STACK` stay in that exact tooltype vocabulary and format** (`KEY=value`, one per line, `\n` terminated) — `command-execution.handler.ts` parses exactly these four keys today; anything this plan adds (a 5th tooltype for the disable/restore sentinel) must degrade gracefully if an OLDER `.info` file (written before this feature existed) doesn't have it, and must not break that TypeScript parser if it reads a file this feature wrote (verify by reading its tooltype parser before assuming "extra key = ignored").
- **New numeric input is validated with an allowlist (digits only, range-checked), never a denylist** — this codebase has a documented history of denylist bypasses (README "Security" section) and treats "validate what's allowed" as the house rule even for non-shell input.
- **No emojis.** ASCII tokens only in any door-side or log text (`[OK]`, `[ERROR]`, `[WARN]`), matching this project's global convention.
- **Every new piece of decision logic is a pure function in `flow.c`/`flow.h`, unit-tested in `tests/test_flow.c`, no I/O.** This is not a style preference in this codebase — `make test` runs 406 existing assertions across 6 suites and the whole door is built around keeping decision logic separately testable from `aedoor`/ANSI/filesystem I/O. A new feature that puts validation logic inline in `doorrepo.c`'s UI code, untested, is a defect here the way an untested backend function would be flagged in the TypeScript half of this project.
- **Every behaviour ships with a test observed FAILING first**, matching this project's global rule.
- **Test the real thing, not a smaller substitute.** The final step of this plan is a `make live` (or emulator) pass against a REAL installed door on this dev machine, editing its REAL `.info`, confirming the BBS backend actually treats the change as live (this project's own rule: "a feature that compiles but is unreachable is not done" applies here exactly as it does to TypeScript work).

---

### Task 1: Read a `.info` file's tooltypes (new capability)

**Files:**
- Modify: `flow.h`, `flow.c` (new pure-ish function — it does file I/O, so it is NOT one of the pure functions unit-tested without a filesystem; keep the actual *parsing* of one line pure and testable, and put only the `fopen`/`fgets` loop in a thin wrapper)
- Test: `tests/test_flow.c`

**Interfaces:**
```c
/* Parses ONE "KEY=value\n" tooltype line. Returns 0 and fills key_out/
 * value_out on success; non-zero (and leaves both outputs as empty
 * strings) on a malformed line (no '=', empty key, line too long for the
 * caller's buffers) - malformed lines are skipped by the caller, not
 * fatal, matching flow_index_parse_line()'s "a hand-edited file can have
 * a bad line" tolerance. Trailing \r and \n are stripped (a .info edited
 * on a Windows machine or copied through a CRLF-preserving transfer must
 * still parse). */
int flow_parse_tooltype_line(const char *line, char *key_out, unsigned long key_size,
                              char *value_out, unsigned long value_size);
```
```c
/* Reads all tooltypes DoorRepo cares about from the .info at info_path in
 * one pass: TYPE, LOCATION, STACK, ACCESS, and (if present) the DRACCESS
 * this plan's Task 2 introduces. RULING (controller, pre-implementation):
 * built as ONE struct-returning reader from the start, not a narrow
 * ACCESS-only reader widened mid-Task-4 - Task 4's rewrite needs TYPE/
 * LOCATION back too so it never silently resets them, and building this
 * twice would be exactly the duplication this project's rules forbid.
 * Each field's "found" flag is independent: a `.info` missing STACK (hand-
 * edited, or written by a different tool) still yields whatever it does
 * have rather than failing the whole read. access/prior_access are `long`
 * (numeric, parsed); type/location are fixed-size char buffers the caller
 * supplies (same ownership pattern as flow_index_parse_line's out params -
 * no dynamic allocation in this codebase). Returns 1 if the file opened at
 * all, 0 if it could not be opened (missing/unreadable) - the caller
 * checks each field's own found-flag for anything finer than that. */
typedef struct {
    int type_found;      char type[16];
    int location_found;  char location[192];
    int stack_found;     long stack;
    int access_found;    long access;
    int prior_access_found; long prior_access;
} dr_info_fields;

int flow_read_door_info(const char *info_path, dr_info_fields *out);
```

- [ ] **Step 1: Write the failing tests**

```c
/* tests/test_flow.c - add near the flow_index_* tests */
TEST(parse_tooltype_line_basic) {
    char key[32], value[64];
    int rc = flow_parse_tooltype_line("ACCESS=10\n", key, sizeof(key), value, sizeof(value));
    ASSERT_EQ(rc, 0, "parses ACCESS=10");
    ASSERT_STR_EQ(key, "ACCESS", "key is ACCESS");
    ASSERT_STR_EQ(value, "10", "value is 10");
}
TEST(parse_tooltype_line_strips_crlf) {
    char key[32], value[64];
    flow_parse_tooltype_line("ACCESS=10\r\n", key, sizeof(key), value, sizeof(value));
    ASSERT_STR_EQ(value, "10", "CRLF stripped from value");
}
TEST(parse_tooltype_line_no_equals_fails) {
    char key[32], value[64];
    int rc = flow_parse_tooltype_line("GARBAGE LINE\n", key, sizeof(key), value, sizeof(value));
    ASSERT_TRUE(rc != 0, "no '=' is malformed");
    ASSERT_STR_EQ(key, "", "key left empty on failure");
}
TEST(parse_tooltype_line_empty_key_fails) {
    char key[32], value[64];
    int rc = flow_parse_tooltype_line("=10\n", key, sizeof(key), value, sizeof(value));
    ASSERT_TRUE(rc != 0, "empty key is malformed");
}
```
Run `make test` from `examples/doorrepo-c/` — these fail (function does not exist yet, build error). That build failure IS the RED state; note it in the implementation report rather than treating a compile error as an unrelated blocker.

- [ ] **Step 2: Implement `flow_parse_tooltype_line`** in `flow.c`, declare in `flow.h`. Model it on `flow_index_parse_line`'s style (same file, ~line 897): find the first `=`, reject if absent or at position 0, copy key/value with `strncpy`+explicit null-terminate (never bare `strcpy` into a caller buffer), strip a trailing `\r` and/or `\n` from the value.

- [ ] **Step 3: Implement `flow_read_door_info`** in `flow.c` (this one does `fopen`/`fgets`, so it is the thin wrapper, not itself unit-tested the way pure functions are — but exercise it with a real temp file in `tests/test_flow.c` if the test harness already does that anywhere for other I/O-touching helpers; if not, cover it only via Task 4's `make live` pass and say so explicitly in the report rather than silently skipping coverage). Zero-initialize `*out` (every `_found` flag starts 0). Loop `fgets()` over the file, call `flow_parse_tooltype_line` per line, and:
  - `key == "TYPE"`: copy `value` into `out->type` (bounds-checked, `strncpy`+explicit null-terminate), set `type_found = 1`.
  - `key == "LOCATION"`: same into `out->location`, set `location_found = 1`.
  - `key == "STACK"`: parse `value` with `strtol` base 10, same validation as ACCESS below, set `stack_found = 1` on success.
  - `key == "ACCESS"`: parse `value` with `strtol`, base 10; reject (leave `out->access` untouched, `access_found` stays 0) if the parse consumed zero characters, if there's trailing garbage after the number, or if the value is negative.
  - `key == "DRACCESS"` (see Task 2): same numeric parse into `out->prior_access`, `prior_access_found = 1`.
  - Cap the loop at a fixed small line count (this door's `.info` files are 4-5 lines; use the same defensive-cap instinct as `flow_declared_count_exceeds_cap` elsewhere in this codebase — an `.info` is a local file this door itself wrote, but "trust nothing you read back" is cheap insurance here).
  - Return 0 immediately if `fopen()` fails (file missing/unreadable); otherwise 1, regardless of which individual fields were found.

- [ ] **Step 4: Run `make test`, confirm GREEN.**

---

### Task 2: Extend the `.info` writer to carry an explicit `ACCESS` and an optional "prior access" tooltype

**Files:**
- Modify: `flow.h`, `flow.c` (`flow_build_info_content`'s signature changes — this has exactly one existing caller, `install_door()` in `doorrepo.c`, update it too)
- Test: `tests/test_flow.c`

**Interfaces:**
```c
/* CHANGED signature - was flow_build_info_content(out, outsize, door_type, cmd, binary_rel).
 * New `access` parameter: the ACCESS tooltype's value. install_door()'s one call
 * site passes 0 (its existing behaviour, unchanged).
 * New `prior_access` parameter: -1 means "omit the DRACCESS line entirely"
 * (the normal case - a door that has never been disabled has no reason to
 * carry a 5th tooltype); >= 0 writes a DRACCESS=<value> line, which is how
 * "disable, remembering what ACCESS used to be" persists across DoorRepo
 * restarts and across the BBS reading the file (the BBS's own tooltype
 * parser must be confirmed, not assumed, to ignore an unrecognized key -
 * see Task 2 Step 1). */
int flow_build_info_content(char *out, unsigned long outsize,
                             const char *door_type, const char *cmd,
                             const char *binary_rel, long access, long prior_access);
```

- [ ] **Step 1: Before writing any code, confirm `command-execution.handler.ts`'s tooltype parser genuinely ignores a 5th, unrecognized key rather than erroring or misreading TYPE/LOCATION/STACK/ACCESS when a DRACCESS line is present.** Read the parser (`web/backend/src/handlers/command-execution.handler.ts`, and whatever shared `.info`/tooltype parsing utility it calls into — grep the backend for how `.info` files are actually parsed into `{TYPE, LOCATION, STACK, ACCESS}`). If it iterates lines looking for known keys and skips unknown ones, DRACCESS is safe. If it assumes exactly four lines in a fixed order, this plan's Task 2 needs a different design (e.g., append DRACCESS as a trailing comment-style line the BBS parser structurally cannot reach) — **do not guess this, verify it, and record what you found** (this is exactly the kind of measured-not-guessed fact this project's rules require before writing to a file another system depends on being able to parse).

- [ ] **Step 2: Write the failing tests**

```c
TEST(build_info_content_no_prior_access_omits_draccess) {
    char out[320];
    flow_build_info_content(out, sizeof(out), "XIM", "GVS", "5D-GetVersion", 0, -1);
    ASSERT_TRUE(strstr(out, "DRACCESS") == (char *) 0, "no DRACCESS line when prior_access is -1");
    ASSERT_TRUE(strstr(out, "ACCESS=0") != (char *) 0, "ACCESS=0 still present");
}
TEST(build_info_content_with_prior_access_appends_draccess) {
    char out[320];
    flow_build_info_content(out, sizeof(out), "XIM", "GVS", "5D-GetVersion", 255, 20);
    ASSERT_TRUE(strstr(out, "ACCESS=255") != (char *) 0, "disabled sentinel written");
    ASSERT_TRUE(strstr(out, "DRACCESS=20") != (char *) 0, "prior access remembered");
}
TEST(build_info_content_preserves_type_location_stack_format) {
    /* Byte-for-byte parity check against the pre-existing format, minus
     * the hardcoded ACCESS=0 - a regression here silently breaks every
     * door DoorRepo installs, not just the editor feature. */
    char out[320];
    flow_build_info_content(out, sizeof(out), "XIM", "GVS", "5D-GetVersion", 0, -1);
    ASSERT_STR_EQ(out, "TYPE=XIM\nLOCATION=Doors:GVS/5D-GetVersion\nSTACK=65536\nACCESS=0\n",
                  "format unchanged when access=0, prior_access=-1");
}
```
Run `make test`: RED (old 5-arg signature call sites fail to compile, or the function does not yet emit DRACCESS).

- [ ] **Step 3: Implement.** Widen `info_content`'s buffer size estimate in the `need = strlen(...)` calculation to account for the longest possible `ACCESS=<n>\n` (3-digit access level, this codebase's `ACCESS=255` example is the ceiling any real BBS uses) and the longest possible `DRACCESS=<n>\n` line, or omit it. Update `install_door()`'s one call site to pass `(0, -1)` for `access, prior_access` — this is the ONLY behavioural change at that call site; install still always starts a door at ACCESS=0.

- [ ] **Step 4: Run `make test`, confirm GREEN. Run `make native` and `make amiga-stub` (or `make amiga` if the NDK is set up) to confirm the changed signature compiles clean under `-Wall -Wextra -pedantic` on both targets - a signature change is exactly the kind of edit that silently breaks a target you didn't rebuild.**

---

### Task 3: Access-level validation (pure function, allowlist not denylist)

**Files:**
- Modify: `flow.h`, `flow.c`
- Test: `tests/test_flow.c`

**Interfaces:**
```c
/* Validates a sysop-typed access-level string. Digits only (no leading
 * '+'/'-', no whitespace, no leading zeros beyond a single "0"), length
 * 1-3 characters, numeric value 0-255 inclusive (this project's own
 * ACCESS convention treats 255 as "sysop-only, the practical maximum" -
 * see command-execution.handler.ts's own ACCESS=255 example). On success
 * returns 0 and writes the parsed value to *value_out; on failure returns
 * non-zero and leaves *value_out untouched - this is the ONE validator
 * for this feature's only new input surface, so callers never need a
 * second ad-hoc check. */
int flow_validate_access_level(const char *input, long *value_out);
```

- [ ] **Step 1: Write the failing tests**

```c
TEST(validate_access_level_accepts_zero)   { long v; ASSERT_EQ(flow_validate_access_level("0", &v), 0, "0 is valid"); ASSERT_EQ(v, 0, "value is 0"); }
TEST(validate_access_level_accepts_max)    { long v; ASSERT_EQ(flow_validate_access_level("255", &v), 0, "255 is valid"); ASSERT_EQ(v, 255, "value is 255"); }
TEST(validate_access_level_rejects_over_max) { long v; ASSERT_TRUE(flow_validate_access_level("256", &v) != 0, "256 rejected"); }
TEST(validate_access_level_rejects_negative) { long v; ASSERT_TRUE(flow_validate_access_level("-1", &v) != 0, "-1 rejected (leading '-' not a digit)"); }
TEST(validate_access_level_rejects_empty)    { long v; ASSERT_TRUE(flow_validate_access_level("", &v) != 0, "empty rejected"); }
TEST(validate_access_level_rejects_garbage)  { long v; ASSERT_TRUE(flow_validate_access_level("12x", &v) != 0, "trailing garbage rejected"); }
TEST(validate_access_level_rejects_whitespace) { long v; ASSERT_TRUE(flow_validate_access_level(" 10", &v) != 0, "leading space rejected"); }
TEST(validate_access_level_rejects_overlong)  { long v; ASSERT_TRUE(flow_validate_access_level("1234", &v) != 0, "4+ digits rejected (over range anyway, but reject on length first)"); }
```
Run `make test`: RED (function doesn't exist).

- [ ] **Step 2: Implement.** Allowlist check first (every byte in `'0'`-`'9'`, matching `flow_is_plain_alnum`'s style but digits-only — check whether a `flow_is_plain_digits` or equivalent already exists before writing a new one; reuse over reinvention per this project's rules), THEN length check (1-3 chars), THEN `strtol` with endptr check (endptr must point at the string's terminating `\0`, or there was trailing garbage), THEN range check (0-255).

- [ ] **Step 3: Run `make test`, confirm GREEN.**

---

### Task 4: The UI — edit access level, and a one-key disable/restore

**Files:**
- Modify: `doorrepo.c` (entry-detail key dispatch switch, ~3500-3634; footer text, `ui_draw_footer` ~1545)

**Interfaces:** none new exported — this task is UI glue calling Tasks 1-3's functions plus the existing `ui_text_prompt`/`ui_confirm`/`flow_build_info_temp_path`/atomic-rename pattern from `install_door()`.

**Key choice: `M` ("Modify access").** Free at both the entry-detail level (current keys: ENTER/R, F, A, digits 1-9, I, S, U, B, V, C, Q) and the browse-list level (N, P, T, S, A, Q). Only shown in the footer for an INSTALLED entry (`index_lookup(cfg, entry->archive) != NULL`) — mirrors how `U`/`S` are already conditionally shown, and matches the plain fact that an uninstalled archive has no `.info` to edit.

- [ ] **Step 1: `do_edit_access()` function**, called from the `case 'm': case 'M':` arm, modeled on `strip_installed_door`'s shape (takes `cfg`, `entry`, ansi buf/frame, geometry):
  1. `cmdname = index_lookup(cfg, entry->archive)`; if NULL, this key shouldn't have been reachable (footer gate), but defend anyway — `ae_put` a one-line "not installed" message and return, same pattern `strip_installed_door` uses for its own NULL check.
  2. `flow_build_info_path(...)` to get the `.info` path (existing function, already used by `install_door`/`uninstall_door`).
  3. `flow_read_door_info(info_path, &fields)` (Task 1's struct-returning reader). If it returns 0, or `fields.access_found` is 0 (no ACCESS line — should not happen for a door DoorRepo itself installed, but could for a hand-edited `.info` or one installed by some other tool), default `current_access` to 0 and say so via `ae_put`, do not silently proceed with an uninitialized value. Likewise default `fields.type`/`fields.location` handling: if either is not found, this is a `.info` this editor cannot safely rewrite (it would have to fabricate TYPE/LOCATION) — `ae_put` a clear message and return without writing anything, rather than guessing.
  4. `ui_text_prompt(...)` pre-filled with `current_access` formatted as a string (use `ui_append_ulong` or `sprintf` matching this file's existing number-to-string style), label something like `"New access level (0-255):"`.
  5. `flow_validate_access_level()` on the result. On failure, `ae_put` the specific reason if cheaply available (or a generic "0-255 only" message — this door's error-message style throughout is specific, so prefer specific if `flow_validate_access_level` is extended to distinguish failure reasons; if not, a plan-time decision either way is fine, just be consistent), re-prompt or return to the list (your call — `ui_filter_prompt`'s own re-prompt-on-empty pattern is the precedent to follow).
  6. Build new content: `flow_build_info_content(out, sizeof(out), fields.type, cmdname, <binary_rel derived from fields.location - it's stored as "Doors:<cmd>/<binary_rel>", strip the known prefix>, new_access, prior_access)` — TYPE and LOCATION come from Task 1's reader, never hardcoded or reconstructed from scratch, since the writer emits all four tooltypes every time and this editor must not silently reset TYPE/LOCATION to something wrong.
  7. Write via the SAME temp-file-then-`rename()` sequence as `install_door()` (do not reimplement it inline a second time — if it isn't already a shared helper, this is the moment to extract one; two independent copies of atomic-.info-write logic is exactly the duplication this project's rules forbid).
  8. `log_line(cfg, ...)` on success/failure, matching `install_door`/`uninstall_door`'s logging convention (`DoorRepo.log`'s existing `INSTALL OK`/`INSTALL FAILED` style — pick a consistent verb, e.g. `ACCESS OK archive=... cmd=... from=<old> to=<new>`).

- [ ] **Step 2: One-key disable/restore.** RULING (controller, pre-implementation): reuse `M` — one key, not two. Typing a new value IS both "edit" and "disable"/"restore" depending on what's typed; no separate mode. Exact rule, so this is unambiguous to implement:
  - If `prior_access_found == 0` (not currently tracking a "before" value) and `new_access != current_access`: set `prior_access = current_access` before calling `flow_build_info_content` — this is the first edit away from the door's normal level, so remember it.
  - If `prior_access_found == 1` (already tracking one) and `new_access == prior_access`: this edit IS the restore — write with `prior_access = -1` (Task 2's "omit DRACCESS" sentinel), clearing the tracked value, since the door is back to its remembered normal level and there is nothing left to remember.
  - If `prior_access_found == 1` and `new_access` is neither `current_access` nor `prior_access` (a further edit to a THIRD level while already disabled): keep the existing `prior_access` unchanged — it still remembers the ORIGINAL normal level, not the most recent disabled level, so restore always returns to where the door started, not to whatever it was most recently set to.

- [ ] **Step 3: Footer text.** `ui_draw_footer` (~1545) needs `M=Access` (or whatever short label fits the existing footer's terseness — `R=Get A=Archive V=Doc F=Find C=System Q=Quit` is the pattern) added, gated on `index_lookup(...) != NULL` the same way `U`/`S` already are.

- [ ] **Step 4: `make native`, run the door interactively (or via a scripted input sequence like the README's emulator-run transcript) against a door already installed by a prior `make live` run; confirm the prompt shows the CURRENT access level, not always 0.**

---

### Task 5: End-to-end verification

**Files:** none (verification only)

- [ ] **Step 1: `make test`** — full suite, all 6+ modules (now including the new `flow.c` tests from Tasks 1-3), confirm 0 failures, `-Wall -Wextra -pedantic` clean.
- [ ] **Step 2: `make amiga-stub`** (no AmiTCP SDK required) — confirm the changed/new code compiles clean for m68k. If an AmiTCP SDK / vbcc toolchain genuinely isn't available in this environment, say so explicitly rather than skipping silently; check first (the README says the vendored NDK3.2R4 is checked in, so `make amiga` should also be attempted).
- [ ] **Step 3: A real edit against a real installed door**, either via `make live` (native, against the real production API and a real local install) or, if a scripted native run doesn't exercise the ANSI full-screen path convincingly, this repo's own 68K emulator (see the README's "Emulator run" section for the harness: `web/backend/src/scripts/run-amiga-door.ts`, `logs/door-68k-<command>-<timestamp>.log`). Install a real door (or reuse one already installed on this dev machine — `5D-GVS.LHA`/`GVS` was installed live tonight per this session's own testing), open the editor, change ACCESS, confirm:
  - the `.info` file on disk actually changed (read it back with `cat`/`type`, not just trust the door's own claimed success),
  - the BBS's `command-execution.handler.ts` picks up the change WITHOUT a restart (this is the exact freshness-check behavior documented in that file's own comments — confirm it, don't assume it, since this plan is adding a NEW way to trigger that code path that nothing has exercised before),
  - restoring (if the disable/restore design from Task 4 Step 2 was built) actually returns the door to its original access level, not to 0 or some other default.
- [ ] **Step 4: Update `examples/doorrepo-c/README.md`'s key table and "What the door looks like in use" section** to document the new key, matching the existing table's format exactly (one row, `| Key | Does |`).

## Controller review notes (resolved before handoff)

The plan-writer's own self-review flagged that a narrow ACCESS-only reader (Task 1) would be insufficient once Task 4 also needs TYPE/LOCATION back. Ruled and folded into the plan above rather than left open: Task 1 now specifies `flow_read_door_info()` (struct-returning, all five tooltypes) from the start, and Task 4's disable/restore logic (Step 2) is now a fully specified three-case rule rather than an implementer's judgment call.
