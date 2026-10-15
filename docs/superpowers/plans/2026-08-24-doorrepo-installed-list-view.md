# DoorRepo: a dedicated "installed doors" list view

## Context

`examples/doorrepo-c/` is the reference AmiExpress door (C89, cross-compiled
for AmigaOS m68k via vbcc, native POSIX build for dev/test). Today, an
installed door is only visible as an inline marker (`+` prefix, `[CMD]` tag)
inside the single merged catalog-browse screen — there is no dedicated
"show me only what I've installed" screen, unlike DOORMAN's `InstalledView`
(`Doors/door-manager/app.ts:588`), which is a separate list+detail screen a
sysop reaches with `Tab` from the full repo browser.

This plan adds that screen to DoorRepo: `L` from the main browse screen opens
an ANSI list+detail view of only the installed doors, with `U`ninstall and
`S`trip-ads reachable directly from it (today those only exist on the full
catalog view, so a sysop has to find the door in the ~3300-row catalog again
just to remove it).

## Global Constraints

- C89 strict (`-std=c89 -Wall -Wextra -pedantic`, both `make native` and
  `make amiga` must stay clean).
- No new dynamic allocation. This codebase makes exactly one heap allocation
  for the whole program's life (the catalog array); everything else is
  static or stack, sized for a 68K door's `STACK=8192` icon setting. New
  state here follows the same rule: static arrays, not `malloc`.
- Every new pure/testable piece of logic goes in `flow.c`/`flow.h` (no I/O,
  unit-tested), matching the existing split between `flow.c` (logic) and
  `doorrepo.c` (I/O, UI, orchestration).
- Every behaviour ships with a test observed failing first (this project's
  own rule, and this codebase's own convention: `tests/` has one native
  suite per module, `make test` runs all of them — 406 assertions today).
- Follow this door's existing security discipline even though this feature
  has no new externally-supplied input to validate: no shell interpolation,
  no unbounded loops over attacker-controlled data. (The catalog rows this
  screen reads are already validated at parse time by
  `flow_is_safe_archive_filename()` — nothing new to check here.)
- ANSI is the primary UI; `cfg->ansi == 0` (`Ansi=no` in `DoorRepo.cfg`)
  must still work via a plain-text fallback, matching `browse_loop()`
  (`doorrepo.c:3637`) vs. `browse_loop_ansi()` (`doorrepo.c:3238`).

## Central design decision: `uninstall_door()` / `strip_installed_door()` take an archive name, not a catalog row

**Measured, not guessed.** Both functions are declared as taking
`const dr_entry *entry` (a full catalog row), but reading their bodies shows
neither needs more than a couple of scalar fields from it:

- `uninstall_door()` (`doorrepo.c:3062`) uses exactly ONE field off `entry`:
  `entry->archive` (passed to `index_lookup()`, `files_load()`,
  `index_remove()`). Nothing else.
- `strip_installed_door()` (`doorrepo.c:2580`) uses exactly TWO fields:
  `entry->archive` (same three calls) and `entry->junk` (an early gate: if
  the catalog says 0 ad files, it tells the sysop there's nothing to strip
  and returns before doing any work — a UX nicety, not a correctness
  requirement, since the real ad-detection happens later against the
  archive's own file listing via `files_load()`).

The new "installed" screen needs to call both functions for doors that may
have **no matching catalog row at all** (the archive was removed or renamed
upstream since install — see the scope note below), so passing a
`dr_entry*` isn't just inconvenient, it's sometimes impossible. **Fix:
change both signatures to take the archive name (and, for strip, the junk
count) as plain scalars instead of a struct pointer.** This is a 2-function,
2-call-site refactor — small and mechanical, not the "bigger, more invasive
change" it might look like from the type signature alone.

For the junk count when no catalog row exists: `dr_entry.junk` already has
an established sentinel for "unknown" — `long junk` uses `-1` for "the row
did not carry this field," and the type's own doc comment
(`listtxt.h:37-41`) is explicit: *"a UI gating a key on these must treat
unknown as 'offer it' (the pre-append behaviour) rather than hiding a key
that would have worked."* This screen follows that existing convention
exactly: pass `-1` when there's no catalog match, and `strip_installed_door`
already treats `-1` as "offer it" per that same rule (confirm this in Task 1
— if the current `entry->junk == 0` check is a strict `== 0` rather than
`<= 0`, -1 already falls through to "offer it" correctly; no change needed
there).

## Scope decision: doors with no matching catalog row

`g_index[]` (`doorrepo.c:2295`, capped at `INDEX_MAX_ENTRIES = 256`) is the
authoritative "what's installed" record — archive name + command, persisted
to `DownloadDir/DoorRepo.idx`. The catalog (`cat->rows[]`, up to
`MAX_CATALOG_ROWS = 4096`) is a separate, independently-refreshed listing
that can legitimately drop or rename an archive between when it was
installed and when this screen is opened.

**v1 scope: don't hide these doors, but don't fully render them either.**
Build the view's row list by walking `cat->rows[]` and keeping the ones
`index_lookup()` says are installed (see Task 2) — this gives every
installed door that's STILL in the catalog full detail-pane treatment
(name/type/size/description) for free, reusing the exact same rendering the
full browse screen already has. For installed doors that dropped out of the
catalog, show a one-line count in the screen's header ("+N installed door(s)
not in the current catalog listing") rather than synthesizing fake rows —
synthesizing placeholder `dr_entry` values would let the rest of the
rendering code silently treat guessed data as real, which is worse than an
honest gap. A follow-up (not this plan) can add a genuine "orphaned installs"
sub-list if that count is ever non-trivial in practice; nothing in this
design blocks that later.

## Keybindings claimed

- **`L`** on the main catalog-browse screen (`doorrepo.c`'s
  `browse_loop_ansi()`, its key switch at `doorrepo.c:3500-3634`) opens the
  new installed-list screen. Free at the time of writing (used letters
  there: `ENTER`/`R`, `F`, `A`, digits `1`-`9`, `I`, `S`, `U`, `B`, `V`, `C`,
  `Q`).
- Inside the new screen: **`U`** (uninstall) and **`S`** (strip ads) are
  reused with their existing meaning — no new mnemonic to learn, and no
  collision since this is a different screen/function.
- **`Q`** returns to the main browse screen (mirrors every other screen in
  this door — see Global Constraints' "no ESC binding" precedent in the
  README, which this plan does not change).
- A parallel effort is planning an `.info`/access-level editor and has
  tentatively claimed `M`. This plan does not touch `M`, `I` (install stays
  install), or any digit. **Collision check for the controller**: confirm
  the `.info`-editor plan didn't independently pick `L`.

## Task 1: refactor `uninstall_door()` / `strip_installed_door()` to take an archive name

**Files:**
- Modify: `doorrepo.c` (both function definitions, both call sites)

**Interfaces:**
```c
static void uninstall_door(const dr_config *cfg, const char *archive,
                           ansi_buf *b, char *frame, long framecap,
                           const ui_geometry *g);

static void strip_installed_door(const dr_config *cfg, const char *archive,
                                 long junk, ansi_buf *b, char *frame,
                                 long framecap);
```

- [ ] **Step 1**: Change both signatures as above. Inside each body, replace
      every `entry->archive` with the new `archive` parameter, and (in
      `strip_installed_door`) `entry->junk` with the new `junk` parameter.
- [ ] **Step 2**: Update the two existing call sites in
      `browse_loop_ansi()`'s switch (`doorrepo.c:3581` and `:3591`) to pass
      `cat->rows[view.index[selected]].archive` and (for strip)
      `cat->rows[view.index[selected]].junk` instead of the row pointer.
- [ ] **Step 3**: `make native && make test` — every existing test for these
      two functions (if any exist directly; check `tests/` for
      `doorrepo`-level coverage — most of this door's tests target `flow.c`
      pure functions, so this refactor may have zero existing direct tests
      to update, which is fine) must still pass. `make amiga-stub` to
      confirm the signature change is still m68k-clean.
- [ ] **Step 4**: Commit as its own step before Task 2 — this refactor has
      no user-visible behavior change and should be revertable independently
      of the new screen.

## Task 2: `ui_view` population for "installed only"

**Files:**
- Modify: `doorrepo.c` (new function near `ui_view_rebuild`,
  `doorrepo.c:1039`)
- Modify: `flow.h` / `flow.c` if any part of the filter logic is factored out
  as a pure predicate (see Step 1)

**Interfaces:**
```c
/* flow.c / flow.h — pure predicate, unit-testable without cat/index I/O */
int flow_is_installed_row(const char *row_archive,
                           const char *known_archives[], int known_count);

/* doorrepo.c — walks cat, keeps rows index_lookup() says are installed */
static void ui_view_rebuild_installed(ui_view *v, const dr_catalog *cat,
                                       const dr_config *cfg,
                                       unsigned long *orphan_count_out);
```

- [ ] **Step 1**: `flow_is_installed_row()` is a thin, pure wrapper so the
      "is this archive name in the known-installed set" check is
      unit-testable without a real `dr_catalog`/`g_index` (which live in
      `doorrepo.c` and touch the filesystem via `index_load()`). It takes a
      plain array of archive-name strings (the caller in `doorrepo.c` builds
      that array from `g_index[]` once per screen-open, not per row — see
      Step 2) and does a linear case-sensitive `strcmp` scan (matching
      `index_lookup()`'s own existing comparison — archive names are not
      case-folded anywhere else in this door, so don't introduce it here).
- [ ] **Step 2**: `ui_view_rebuild_installed()`: build a local
      `const char *archives[INDEX_MAX_ENTRIES]` from `g_index[]` (via
      `index_load()`/the existing `g_index`/`g_index_count` globals — this
      function lives in `doorrepo.c` so it can see them directly, unlike the
      pure predicate above), then walk `cat->rows[0..cat->count)` once,
      appending `i` to `v->index[]` when `flow_is_installed_row()` says yes.
      Set `v->count` to the number kept. Set `*orphan_count_out` to
      `g_index_count` minus however many distinct archives were actually
      matched (a door in `g_index` but never matched during the walk is an
      orphan per the Scope Decision above).
- [ ] **Step 3**: Tests in `tests/` (new file or appended to the existing
      `flow`-adjacent suite, matching this project's per-module test file
      naming): empty `g_index` (0 installed) against a non-empty catalog →
      `view.count == 0`, `orphan_count == 0`; one installed archive present
      in the catalog → `view.count == 1`, `orphan_count == 0`; one installed
      archive NOT in the catalog → `view.count == 0`, `orphan_count == 1`;
      mixed (some matched, some not) → correct split; the
      `INDEX_MAX_ENTRIES` boundary (256 installed entries, all matching) →
      no overflow, `view.count == 256`.

## Task 3: the new screen — `installed_loop_ansi()`

**Files:**
- Modify: `doorrepo.c` (new function, parallel to `browse_loop_ansi()`
  at `doorrepo.c:3238`; new case in the main browse screen's switch to
  invoke it)

**Interfaces:**
```c
static void installed_loop_ansi(const dr_config *cfg, dr_catalog *cat);
```

- [ ] **Step 1**: Structure this as a trimmed copy of `browse_loop_ansi()`'s
      skeleton (`doorrepo.c:3238-3634`), reusing `ui_geometry`,
      `ui_compute_geometry()`, the same detail-pane drawing calls
      (`ui_draw_info()` etc.) — this screen shows the SAME kind of
      list+detail layout, just over a different (smaller, pre-filtered) row
      set. Populate `view` via `ui_view_rebuild_installed()` (Task 2)
      instead of `ui_view_rebuild()`, once on entry — no live re-filtering
      needed (this list only changes when something is uninstalled from
      inside this same screen, at which point Step 3 below handles the
      refresh).
- [ ] **Step 2**: Remove keys that don't apply here: `F` (filter — the list
      is already "installed only," filtering it further is out of scope for
      v1), `C` (cycle type — same reasoning), `I` (install — nothing to
      install from an already-installed-only list), digits `1`-`9` (guide
      links — only meaningful with `V`/doc open, keep those since `V`
      itself stays, see Step 3). Keep: `ENTER`/`R` (download again —
      harmless, re-verifies/re-fetches an already-installed archive,
      matches existing behavior), `A` (view archive contents), `V` (view
      doc, still gated on `has_doc` per the existing precedent at
      `doorrepo.c:3605-3610`), `U`, `S` (now calling the Task 1 refactored
      signatures with `cat->rows[view.index[selected]].archive` /
      `.junk`), `Q` (return to the caller — this function returns `void`,
      not `browse_exit`, since there's only one way out).
- [ ] **Step 3**: After a successful `U`ninstall from this screen, rebuild
      `view` via `ui_view_rebuild_installed()` again (the uninstalled row
      must disappear) and clamp `selected` the same way
      `InstalledView.refresh()` does in DOORMAN (`app.ts:624-626`) — reuse
      whatever clamp helper `browse_loop_ansi()` already uses for this exact
      situation (uninstalling the last row in view) if one exists; if not,
      add a small one and note it as a Task 1-adjacent fix for
      `browse_loop_ansi()` too (it has the identical bug surface today).
- [ ] **Step 4**: Header line shows `N installed` (matching the top-level
      browse screen's `"3294 of 3294 doors   1 installed"` header format
      already visible in the door's live output) plus, when non-zero, the
      orphan count from Task 2 as a distinct, honestly-labeled line (not
      folded into the main count) — e.g. `"3 installed   (+1 not in current
      catalog listing)"`.
- [ ] **Step 5**: Footer legend: `ENTER/R=Get  A=Archive  V=Doc  U=Uninstall
      S=Strip  Q=Back` (drop `F=Find C=System` per Step 2; the `I=Install`
      slot this footer's sibling screen has is also dropped).

## Task 4: entry point + plain-text (non-ANSI) fallback

**Files:**
- Modify: `doorrepo.c` (new `case 'l': case 'L':` in `browse_loop_ansi()`'s
  switch, `doorrepo.c:3500-3634`; equivalent addition to the plain-text
  `browse_loop()`, `doorrepo.c:3637+`)

- [ ] **Step 1**: In `browse_loop_ansi()`'s switch, add:
  ```c
  case 'l': case 'L':
      installed_loop_ansi(cfg, cat);
      need_full_redraw = 1;
      break;
  ```
  (matching the existing pattern every other screen-opening key already
  uses to force a redraw on return).
- [ ] **Step 2**: `browse_loop()` (the `Ansi=no` fallback, line-at-a-time
  menu at `doorrepo.c:3637+`) needs the same capability without a full
  ANSI screen: add `[L]ist installed` to its menu line (currently `[N]ext
  [P]rev [T]ype [S]earch [A]ll [Q]uit`) and a plain-text equivalent loop —
  print each installed door as one line (`archive | cmd`, using the same
  data `ui_view_rebuild_installed()` produces, no ANSI positioning), accept
  a selection number, and offer `[U]ninstall [S]trip [Q]uit` the same way
  `browse_loop()` already accepts single-character menu choices. This can
  be a much simpler function than `installed_loop_ansi()` — no detail pane,
  no cursor movement, matching the existing ANSI/non-ANSI asymmetry
  elsewhere in this door (the non-ANSI path is consistently the simpler,
  line-oriented one).
- [ ] **Step 3**: Update the top-level browse screen's footer/help text (the
  README's own key table, and the in-door footer string) to document `L`.

## Testing (full picture)

- **Unit** (Task 2, Step 3): `flow_is_installed_row()` and
  `ui_view_rebuild_installed()`'s pure logic, per the cases listed above.
  Add to `make test`'s existing suite list.
- **Native integration**: `make live` (or the door's existing manual-run
  harness) — install a door, open the new `L` screen, confirm it appears
  with correct detail, uninstall it from inside that screen, confirm the
  list updates and the row disappears without a full-screen glitch.
- **m68k**: `make amiga-stub` (compiles/links clean, no networking needed)
  and `make amiga` (full build) after every task, matching this door's
  existing verification discipline (see `README.md`'s "Verification
  status" table for the bar this project holds itself to — compiling is not
  enough, a real run against the emulator is the standard for "done").
- **Emulator smoke test**: once built, run `doorrepo.amiga` under this
  repository's own AEDoorPort/XIM emulator (the harness the README
  documents using — `web/backend/src/scripts/run-amiga-door.ts`), scripted
  to: install a door, press `L`, confirm the installed door is listed,
  uninstall it from that screen, confirm it's gone, `Q` back to the main
  browse screen, confirm the main screen's own `+`/`[CMD]` marker for that
  door is also gone (proving the two screens share the same underlying
  `g_index` state, not two independently-tracked lists).

## Controller rulings

1. **Keybinding collision**: CONFIRMED CLEAR. The `.info`-editor plan
   (`2026-08-24-doorrepo-info-editor.md`) claims `M` only. This plan claims
   `L` only. No overlap.
2. **`browse_loop_ansi()`'s own uninstall-last-row clamp bug**: RULING —
   fold it into this plan's Task 3 Step 3, not a separate follow-up. This
   plan's new screen would otherwise copy the same clamp pattern from
   `browse_loop_ansi()` and inherit the bug into a second place; fixing it
   once, where it's first touched, is cheaper than fixing it twice later.
   Add a Task 3 Step 3a: before building the new screen's clamp, write a
   failing test (or a scripted repro via `make live`/emulator, if the bug
   is only reachable through the ANSI redraw path and not a pure function)
   that reproduces the existing bug in `browse_loop_ansi()`, fix it there,
   then reuse the same fixed logic in `installed_loop_ansi()`.
3. **Orphan-count display wording**: not load-bearing, implementer's call.
