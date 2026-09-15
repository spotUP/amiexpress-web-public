# Consolidating Artist Edits Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An artist sees one card per SCREEN, not one per version, and saving keeps the copies that already agreed in agreement.

**Architecture:** The gallery already groups by content hash and already hides `codesOnly` screens, so provisioning is solved. What remains is DRIFT - the same screen in several versions - and it is handled in two places: the gallery groups a name's versions into one card that names the version most scopes read, and the save fans out to the copies that already matched (`same-content`, which `screen-write-plan.ts` already models). Nothing silently rewrites a copy that was already different.

**Tech Stack:** TypeScript, React, vitest (admin); the screen index and `screenIsProgram` on the backend are used as they are.

**Spec:** none - this plan is the design. It is short enough to argue in place, and the decisions it rests on were taken by the sysop on 2026-09-15 (below).

## Global Constraints

- MEASURED ON THE LIVE BOARD, 2026-09-15, with the board's own `buildScreenIndex` over all 269 indexed screens. Every number below is from that run, not an estimate:
  - 214 art files an artist may see, in **59** content-grouped cards, for **44** distinct screen names - so **15 cards are drift**, a quarter of the gallery.
  - 45 `codesOnly` files are already hidden from artists; 43 are `program`; the 8 that are BOTH art and program (a bulletin with an include at the end) stay visible and must keep working.
  - Worst drift: `bull20.txt` 6 versions, `menu.txt` 4, `guestlogon.txt` 2 across 41 copies.
- An artist must never be shown a screen that is only directives, and never be asked about MCI. The sysop keeps both (his words: "the sysop would be interested in the mci codes etc but artist dont even need to see them").
- Never silently reconcile drift. `logoff.txt`'s three versions differ only in MCI - `~2SR_`, `~3SR_`, and a different assign spelling - and that difference decides WHICH SCREEN A CALLER OF A GIVEN SECURITY LEVEL GETS. `bull.txt`'s versions differ in which bulletins a node includes. Measured, both, on live.
- SECURITY-LEVEL VARIANTS ARE THE SAME SCREEN TO AN ARTIST. The sysop, 2026-09-15: "if the security level differs doesn't matter to the artists, the board should take care of that, the artist should only edit one screen." So `Logon.txt` and `Logon100.txt` are one card, and the fan-out writes the level variants the same way it writes the per-node copies.
- BUT THE GROUPING KEY IS NOT A REGEX ON THE FILENAME. `variantOf` (screen-index.service.ts:1017) only reads a level when it already knows the base screen name, and it refuses a level that is not a multiple of five because express.e only looks for those - which is why `BULL3.TXT` is a different screen and not level 3. A naive "strip the trailing digits" would fold `bull20.txt` (bulletin twenty) into `bull.txt` (the bulletin menu): both parse, 20 is a multiple of five, and the result is the artist editing the wrong drawing. Group by the screen the INDEX says a file serves, never by the basename.
- The gallery is a vite bundle: no `fs`, no `path`, nothing that reaches the filesystem.
- Admin tests run with the project's own vitest: `./node_modules/.bin/vitest run` from `web/config-app`.

---

### Task 1: A name's versions become one card

**Files:**
- Modify: `web/config-app/src/pages/screen-index-view.ts` (`buildGalleryItems`, the `byContent` grouping ~line 517)
- Test: `web/config-app/src/test/one-card-per-screen.test.ts` (create)

**Interfaces:**
- Consumes: `ScreenFileShape` as it is.
- Produces: a gallery item gains `versions: number` and `otherVersions: ScreenFileShape[][]` - the groups this card stands in front of, most-read first.

- [ ] **Step 1: Write the failing test**

```ts
/**
 * An artist sees a SCREEN, not its versions.
 *
 * Measured on the live board 2026-09-15: 214 art files in 59 content-grouped
 * cards for 44 names, so 15 cards were a screen the artist had already seen.
 * `logoff.txt` in three versions is three cards today and one after this.
 */
import { buildGalleryItems } from '../pages/screen-index-view';

const file = (relPath: string, sha256: string, scopes: number) => ({
  relPath, sha256, bytes: 800, format: 'ansi' as const,
  readBy: Array.from({ length: scopes }, (_, i) => ({ scope: `Node${i}`, via: 'resolved' as const })),
});

it('groups a name that drifted into ONE card', () => {
  const index = { files: {
    'Node0/logoff.txt': file('Node0/logoff.txt', 'aaa', 38),
    'Node7/logoff.txt': file('Node7/logoff.txt', 'bbb', 1),
    'Conf4/logoff.txt': file('Conf4/logoff.txt', 'ccc', 2),
  } };

  const items = buildGalleryItems(index as never, { showGenerated: false });

  expect(items).toHaveLength(1);
  expect(items[0].versions).toBe(3);
});

it('puts the version most scopes read in front', () => {
  const index = { files: {
    'Node7/logoff.txt': file('Node7/logoff.txt', 'bbb', 1),
    'Node0/logoff.txt': file('Node0/logoff.txt', 'aaa', 38),
  } };

  const [card] = buildGalleryItems(index as never, { showGenerated: false });

  expect(card.file.sha256).toBe('aaa');
  expect(card.otherVersions).toHaveLength(1);
});

it('folds a security-level variant into the same card', () => {
  // The artist draws "the logon screen" once; which level a caller has is the
  // board's business (sysop, 2026-09-15).
  const index = { files: {
    'Node0/Logon.txt': { ...file('Node0/Logon.txt', 'aaa', 40), readBy: [{ scope: 'Node0', via: 'resolved', serves: 'Logon' }] },
    'Node0/Logon100.txt': { ...file('Node0/Logon100.txt', 'bbb', 1), readBy: [{ scope: 'Node0', via: 'resolved', serves: 'Logon', securityLevel: 100 }] },
  } };

  expect(buildGalleryItems(index as never, { showGenerated: false })).toHaveLength(1);
});

it('does NOT fold bulletin twenty into the bulletin menu', () => {
  // `bull20` parses as `bull` at level 20 - 20 is a multiple of five - and it
  // is nothing of the kind. The index knows; a basename regex does not.
  const index = { files: {
    'Screens/bull.txt': { ...file('Screens/bull.txt', 'aaa', 4), readBy: [{ scope: 'board', via: 'resolved', serves: 'BULL' }] },
    'Conf3/bull20.txt': { ...file('Conf3/bull20.txt', 'bbb', 1), readBy: [{ scope: 'Conf3', via: 'resolved', serves: 'BULL20' }] },
  } };

  expect(buildGalleryItems(index as never, { showGenerated: false })).toHaveLength(2);
});

it('leaves two DIFFERENT screens as two cards', () => {
  const index = { files: {
    'Screens/logoff.txt': file('Screens/logoff.txt', 'aaa', 4),
    'Screens/join.txt': file('Screens/join.txt', 'bbb', 4),
  } };

  expect(buildGalleryItems(index as never, { showGenerated: false })).toHaveLength(2);
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
cd web/config-app && ./node_modules/.bin/vitest run src/test/one-card-per-screen.test.ts
```

Expected: FAIL - the first case returns 3 items, because grouping is by content hash alone.

- [ ] **Step 3: Group the content groups by name**

In `buildGalleryItems`, after the existing `groups` array is built, fold the groups by screen name. Keep the existing content grouping - it is what makes "41 copies" one thing - and add a second pass over it:

```ts
  /**
   * One card per SCREEN, not per version.
   *
   * The content grouping above turns 41 identical copies into one group; this
   * turns the SEVERAL GROUPS of one screen into one card. Measured on the
   * live board: 59 cards for 44 names, so 15 of them were a screen the artist
   * had already scrolled past - `bull20.txt` alone was six.
   *
   * The card stands for the version the most scopes actually READ, because
   * that is the one an edit should change; the rest ride along as
   * `otherVersions` so the drift is visible inside the card rather than
   * spread across the gallery.
   */
  const scopesOf = (copies: ScreenFileShape[]): number =>
    copies.reduce((n, f) => n + (f.readBy?.length ?? 0), 0);

  const byName = new Map<string, ScreenFileShape[][]>();
  for (const copies of groups) {
    const name = screenNameOf(copies[0]);
    byName.set(name, [...(byName.get(name) ?? []), copies]);
  }

  return [...byName.values()].map((versions) => {
    const ranked = [...versions].sort((a, b) => scopesOf(b) - scopesOf(a));
    const [front, ...rest] = ranked;
    return { ...itemFor(front), versions: ranked.length, otherVersions: rest };
  });
```

`itemFor` is whatever the function already builds per group - extract it rather than duplicating it.

`screenNameOf` is NOT the basename. It is the screen the index says this file
serves - `file.readBy?.[0]?.serves`, or the catalogue name the index matched -
falling back to the basename only for a file the index could not place. The
difference is not cosmetic: `Logon.txt` and `Logon100.txt` must fold together
(the sysop's rule - a level variant is the same screen to an artist), while
`bull20.txt` must NOT fold into `bull.txt`, and a basename regex gets the
second one wrong because 20 is a multiple of five and `variantOf` would read it
as a level. The index has already decided both; this reads its answer.

- [ ] **Step 4: Run the tests**

```bash
cd web/config-app && ./node_modules/.bin/vitest run
```

Expected: PASS, including the existing gallery tests - the theme-shadowing behaviour above this must not change.

- [ ] **Step 5: Commit**

```bash
git add web/config-app/src/pages/screen-index-view.ts web/config-app/src/test/one-card-per-screen.test.ts
git commit -m "feat(studio): one card per screen, not one per version"
```

---

### Task 2: The card says what the drift is

**Files:**
- Modify: `web/config-app/src/components/ScreenGallery.tsx`
- Test: `web/config-app/src/test/a-card-shows-its-drift.test.tsx` (create)

**Interfaces:**
- Consumes: Task 1's `versions`, `otherVersions`.
- Produces: no new exports.

- [ ] **Step 1: Write the failing test**

```tsx
it('says how many versions there are and how much of the board reads this one', async () => {
  renderGallery([{ ...card, versions: 3, scopes: 38, otherScopes: 3 }]);

  expect(await screen.findByText(/3 versions/i)).toBeInTheDocument();
  expect(await screen.findByText(/38 of 41/)).toBeInTheDocument();
});

it('says nothing at all when a screen has one version', async () => {
  renderGallery([{ ...card, versions: 1 }]);

  expect(screen.queryByText(/versions/i)).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
cd web/config-app && ./node_modules/.bin/vitest run src/test/a-card-shows-its-drift.test.tsx
```

Expected: FAIL - no such text is rendered.

- [ ] **Step 3: Draw it**

On a card whose `versions > 1`, add one line under the title: `{versions} versions - serving {scopes} of {scopes + otherScopes} scopes`. A card with one version says nothing, so the ordinary screen looks exactly as it does today. Use the design system's own type and spacing tokens; `design-system-usage.test.ts` refuses raw palette classes.

- [ ] **Step 4: Run the tests**

```bash
cd web/config-app && ./node_modules/.bin/vitest run
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/config-app/src/components/ScreenGallery.tsx web/config-app/src/test/a-card-shows-its-drift.test.tsx
git commit -m "feat(studio): a card that stands for several versions says so"
```

---

### Task 3: Saving keeps the copies that already agreed

> **AMENDED DURING EXECUTION, 2026-09-15.** The default this task set out to
> add is already there, and `same-content` - the choice the sysop and I both
> picked when I asked - is the rule this dialog was explicitly changed AWAY
> from. `ArtistScreenDialog:240-258` records why: the sysop uploaded a PETSCII
> title, it landed on `Node0/BBSTITLE.SEQ`, and from then on that file matched
> nothing, so the next upload fanned out to itself alone and the board went on
> serving the other 46 copies. He reported it twice - "the bbs still reads the
> old bbs title petscii". The dialog now writes the UNION of every copy the
> screen resolves to and every copy still identical to this one.
>
> Setting `same-content` as the default would re-break that. So this task does
> NOT touch the fan-out. What it delivers is the half that was genuinely
> missing: the artist is told the count BEFORE the click, not after.


**Files:**
- Modify: `web/config-app/src/pages/ArtistScreenDialog.tsx` (the save path's fan-out default)
- Test: `web/config-app/src/test/saving-keeps-copies-in-step.test.tsx` (create)

**Interfaces:**
- Consumes: `screen-write-plan.ts`'s `FanOutChoice`, unchanged.
- Produces: no new exports.

- [ ] **Step 1: Write the failing test**

```tsx
/**
 * The default is `same-content`: the copies that were identical before the
 * edit are identical after it. A copy that ALREADY differed is not touched -
 * on this board `logoff.txt`'s versions differ by the security level they
 * serve, and one save must not decide that for every node.
 */
it('writes the copies that already matched, and no others', async () => {
  const save = vi.fn().mockResolvedValue({ success: true });
  renderDialog({ save, file: { relPath: 'Node0/logoff.txt', sha256: 'aaa' }, identicalCopies: 38, otherVersions: 3 });

  await userEvent.click(await screen.findByRole('button', { name: /save/i }));

  expect(save).toHaveBeenCalledWith(expect.objectContaining({ fanOut: 'same-content' }));
});

it('tells the artist how many copies that is, before the click', async () => {
  renderDialog({ file: { relPath: 'Node0/logoff.txt', sha256: 'aaa' }, identicalCopies: 38, otherVersions: 3 });

  expect(await screen.findByText(/38 copies/i)).toBeInTheDocument();
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
cd web/config-app && ./node_modules/.bin/vitest run src/test/saving-keeps-copies-in-step.test.tsx
```

Expected: FAIL - the dialog does not default the fan-out.

- [ ] **Step 3: Default it**

Set the dialog's fan-out to `same-content` and show the count beside the save button. The other choices stay available - `this-file` for a deliberate divergence, `all-copies` to reconcile drift, `share-then-write` when the right answer is a SCREENS tooltype - but the artist who just draws gets the safe one without deciding.

- [ ] **Step 4: Run the tests**

```bash
cd web/config-app && ./node_modules/.bin/vitest run
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/config-app/src/pages/ArtistScreenDialog.tsx web/config-app/src/test/saving-keeps-copies-in-step.test.tsx
git commit -m "feat(studio): a save keeps the copies that already agreed in agreement"
```

---

### Task 4: Reconciling drift is one deliberate action

**Files:**
- Modify: `web/config-app/src/components/ScreenGallery.tsx` (the card's disclosure)
- Test: `web/config-app/src/test/reconciling-drift-is-deliberate.test.tsx` (create)

**Interfaces:**
- Consumes: Task 1's `otherVersions`; `screen-write-plan.ts`'s `all-copies`.
- Produces: no new exports.

- [ ] **Step 1: Write the failing test**

```tsx
it('shows what the other versions are, and where they are read', async () => {
  renderGallery([{ ...card, versions: 3, otherVersions: [
    { scopes: ['Node7'], sha256: 'bbb' }, { scopes: ['Conf4'], sha256: 'ccc' },
  ] }]);

  await userEvent.click(await screen.findByRole('button', { name: /3 versions/i }));

  expect(await screen.findByText('Node7')).toBeInTheDocument();
  expect(await screen.findByText('Conf4')).toBeInTheDocument();
});

it('never reconciles without being asked', async () => {
  const save = vi.fn();
  renderGallery([{ ...card, versions: 3 }], { save });

  await userEvent.click(await screen.findByRole('button', { name: /3 versions/i }));

  // Opening the disclosure is not a decision.
  expect(save).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
cd web/config-app && ./node_modules/.bin/vitest run src/test/reconciling-drift-is-deliberate.test.tsx
```

Expected: FAIL - there is no disclosure.

- [ ] **Step 3: Build the disclosure**

The `{n} versions` line becomes a button opening a list: one row per other version, naming the scopes that read it. Each row offers "make this one match" - which is `all-copies` for that pair, through the same save path as Task 3 - and nothing happens until a row is chosen.

- [ ] **Step 4: Run the tests**

```bash
cd web/config-app && ./node_modules/.bin/vitest run && npx tsc --noEmit && npm run build
```

Expected: PASS, typecheck clean, admin bundle builds.

- [ ] **Step 5: Commit**

```bash
git add web/config-app/src/components/ScreenGallery.tsx web/config-app/src/test/reconciling-drift-is-deliberate.test.tsx
git commit -m "feat(studio): drift is shown inside the card and reconciled on purpose"
```

---

### Task 5: Prove it against the live board's own screens

**Files:**
- Test: `web/config-app/src/test/the-gallery-shrinks-on-the-real-board.test.ts` (create)
- Fixture: `web/config-app/src/test/fixtures/live-screen-index.json` (create - the index of the live board's screens, facts only, no bodies)

**Interfaces:**
- Consumes: everything above.
- Produces: nothing - this is the gate.

- [ ] **Step 1: Build the fixture from the real board**

```bash
cd web/backend && npx tsx -e "
const { buildScreenIndex } = require('./src/screens/screen-index.service');
const idx = buildScreenIndex(process.env.BBS_DATA_DIR || '../../');
const slim = Object.fromEntries(Object.entries(idx.files).map(([k, f]) => [k, {
  relPath: f.relPath, sha256: f.sha256, bytes: f.bytes, format: f.format,
  codesOnly: f.codesOnly, program: f.program, generated: f.generated, readBy: f.readBy,
}]));
require('fs').writeFileSync('../config-app/src/test/fixtures/live-screen-index.json', JSON.stringify({ files: slim }, null, 1));
"
```

- [ ] **Step 2: Write the test**

```ts
/**
 * The numbers this work exists for, measured on the live board 2026-09-15:
 * 214 art files, 59 content-grouped cards, 44 distinct names. The gallery
 * showed 59; an artist should see 44.
 */
import index from './fixtures/live-screen-index.json';
import { buildGalleryItems } from '../pages/screen-index-view';

it('shows one card per screen for the real board', () => {
  const items = buildGalleryItems(index as never, { showGenerated: false });

  const names = new Set(items.map(i => i.file.relPath.split('/').pop()!.toLowerCase()));
  expect(items.length).toBe(names.size);
  expect(items.length).toBeLessThan(59);
});

it('shows no screen that is only directives', () => {
  const items = buildGalleryItems(index as never, { showGenerated: false });

  expect(items.every(i => !i.file.codesOnly)).toBe(true);
});

it('still shows a bulletin that is art AND runs an include', () => {
  // 8 of the live board's files are both. They are art and must stay.
  const items = buildGalleryItems(index as never, { showGenerated: false });

  expect(items.some(i => i.file.program && !i.file.codesOnly)).toBe(true);
});
```

- [ ] **Step 3: Run it**

```bash
cd web/config-app && ./node_modules/.bin/vitest run src/test/the-gallery-shrinks-on-the-real-board.test.ts
```

Expected: PASS.

- [ ] **Step 4: Walk it in the real admin**

```bash
./dev/scripts/start-servers.sh --bbs-only
```

`http://localhost:3001/admin/` -> ANSI Studio. Count the cards: fewer than before, one per screen name. `bull20.txt` appears ONCE, saying 6 versions. Open it, edit a pixel, save: the copies that matched change together, and the versions that differed are untouched. Confirm on disk with `md5sum` across the copies before and after.

- [ ] **Step 5: Commit**

```bash
git add web/config-app/src/test/the-gallery-shrinks-on-the-real-board.test.ts web/config-app/src/test/fixtures/live-screen-index.json
git commit -m "test(studio): the gallery shows one card per screen on the real board"
```
