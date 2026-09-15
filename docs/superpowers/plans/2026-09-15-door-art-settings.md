# Door Art Settings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A door setting whose value names an art file becomes an editable slot in the ANSI Studio, with a picker that swaps which file the door uses.

**Architecture:** One new macro in the C settings DSL emits `"art": true` on an ordinary string setting. The backend's art service grows a third slot kind beside `markers` and `quicknew` - a whole file named by a setting's current value - addressed as `setting:<key>` so the existing narrow-variant storage keeps working unchanged. The Studio's existing card and `DoorArtDialog` canvas are reused; only the card's chrome grows a filename, a row count and a picker.

**Tech Stack:** C89 (vbcc, hosted `cc` for the emitter), TypeScript, zod, Express, React + vite, jest (backend), vitest (admin).

**Spec:** `docs/superpowers/specs/2026-09-15-door-art-settings-design.md`

## Global Constraints

- Scope is REQUESTS' bulletin art only. `super-qix`'s backgrounds and every TypeScript door are OUT - no TypeScript door has art to declare.
- `Doors/REQUESTS/door.settings.json` is GENERATED. Never hand-edit it; change `sdk/c/examples/requests/settings.c` and run `make -C sdk/c settings`.
- `make -C sdk/c settings` rewrites every door in `SETTINGS_DOORS`. After running it, check `git diff --stat Doors/*/door.settings.json` and confirm only the intended door changed.
- An art value may contain AT MOST ONE subdirectory level. Regex states the intent; a resolved-path containment check enforces it. Both, always - a bug in one must not be a hole.
- Art bytes are latin1 and carry ESC and high-bit bytes. Never read or write them as UTF-8, and never edit an art file with a text editor tool.
- `screen-tables.ts` and everything under `web/backend/src/screens` is bundled for the BROWSER (vite aliases `@bbs/screens`). No `fs`, no `path` in anything it imports.
- Backend jest needs its explicit config: `npx jest --config dev-scripts/jest.config.ts --rootDir .` from `web/backend`.
- Admin tests run with the project's own vitest: `./node_modules/.bin/vitest run` from `web/config-app` (a bare `npx vitest` pulls the wrong binary).

---

### Task 1: The C macro, and REQUESTS declares its art

**Files:**
- Modify: `sdk/c/include/ae_settings.h` (the `ae_setting` struct, and a macro beside the nine existing ones)
- Modify: `sdk/c/src/ae_settings.c:76-78` (emit the flag next to `secret`)
- Modify: `sdk/c/examples/requests/settings.c` (two settings become art)
- Regenerate: `Doors/REQUESTS/door.settings.json`
- Test: `web/backend/tests/doors/c-sdk-settings-manifest.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `AE_SETTING_ART(key, label, def, cfgkey, help)`; a manifest setting carrying `"art": true`.

- [ ] **Step 1: Write the failing test**

Append inside the existing `describe('a C SDK door declares its own settings')` in `web/backend/tests/doors/c-sdk-settings-manifest.test.ts`:

```ts
  it('REQUESTS marks its two art files as art, and nothing else', () => {
    if (!compiler) return;
    const parsed = JSON.parse(generate('requests')) as {
      settings: Array<{ key: string; type: string; art?: boolean }>;
    };
    const art = parsed.settings.filter((s) => s.art === true).map((s) => s.key);

    // The two settings whose VALUE is a filename. `bulletin` names the screen
    // the door WRITES - a destination, not a drawing - and must not be here.
    expect(art).toEqual(['bulletinHeader', 'bulletinTail']);
    for (const s of parsed.settings) {
      if (s.art) expect(s.type).toBe('string');
    }
  });
```

- [ ] **Step 2: Run it and watch it fail**

```bash
cd web/backend && npx jest --config dev-scripts/jest.config.ts --rootDir . tests/doors/c-sdk-settings-manifest.test.ts
```

Expected: FAIL - `expect(art).toEqual(['bulletinHeader','bulletinTail'])` receives `[]`, because nothing emits the flag yet.

- [ ] **Step 3: Add the struct field**

In `sdk/c/include/ae_settings.h`, add to `ae_setting` AFTER `from_system_config` (last member on purpose, for the same reason that one is: every existing macro predates it and C zero-fills what an initializer does not name):

```c
  /* The VALUE of this setting names an art file inside the door's own
     folder, so the ANSI Studio offers it as a drawable slot and the picker
     is this setting. Only meaningful on AE_SET_STRING. */
  int         art;
```

- [ ] **Step 4: Add the macro**

In the same file, beside `AE_SETTING_STR_HELP`:

```c
/* A string setting whose value NAMES AN ART FILE in the door's folder. The
   admin still gets an ordinary field (that is what writes the value); the
   Studio additionally gets a slot, and its picker writes this same setting.
   One declaration, one filename, no second list. */
#define AE_SETTING_ART(key, label, def, cfgkey, help)                         \
  { key, cfgkey, label, AE_SET_STRING, def, 0, 0, help, 0, 0, 0, 0, NULL,     \
    NULL, 1 },
```

- [ ] **Step 5: Emit it**

In `sdk/c/src/ae_settings.c`, directly after the `secret` line (`if (s->secret) fputs(",\n      \"secret\": true", out);`):

```c
    /* Before `default`, like `secret`: a reader meets what the field IS
       before what it currently holds. */
    if (s->art) fputs(",\n      \"art\": true", out);
```

- [ ] **Step 6: Declare REQUESTS' art**

In `sdk/c/examples/requests/settings.c`, replace the two `AE_SETTING_STR_HELP` lines for `bulletinHeader` and `bulletinTail` with `AE_SETTING_ART`, keeping their labels, defaults, cfg keys and help text byte-identical:

```c
  AE_SETTING_ART("bulletinHeader", "Bulletin header art", "Bulletin_Header.txt", "BulletinHeader",
    "The art above the request table, relative to the door's own folder. Its height comes off the 23-row budget, so taller art shows fewer requests.")
  AE_SETTING_ART("bulletinTail", "Bulletin tail art", "Bulletin_Tail.txt", "BulletinTail",
    "The art below the request table, relative to the door's own folder.")
```

Leave `bulletin` as `AE_SETTING_STR_HELP`.

- [ ] **Step 7: Regenerate and check nothing else moved**

```bash
make -C sdk/c settings
git diff --stat Doors/REQUESTS/door.settings.json Doors/SUBS/door.settings.json Doors/TEXTTV/door.settings.json
```

Expected: only `Doors/REQUESTS/door.settings.json` changed. If SUBS or TEXTTV moved, their `settings.c` had drifted from their shipped manifest - stop and report it rather than committing someone else's revert.

- [ ] **Step 8: Run the C suite and the manifest test**

```bash
make -C sdk/c test
cd web/backend && npx jest --config dev-scripts/jest.config.ts --rootDir . tests/doors/c-sdk-settings-manifest.test.ts
```

Expected: C suite green; the manifest suite green including the new case and the byte-compare for all three doors.

- [ ] **Step 9: Commit**

```bash
git add sdk/c/include/ae_settings.h sdk/c/src/ae_settings.c sdk/c/examples/requests/settings.c Doors/REQUESTS/door.settings.json web/backend/tests/doors/c-sdk-settings-manifest.test.ts
git commit -m "feat(sdk/c): a setting can say its value names an art file"
```

---

### Task 2: The schema learns the flag

**Files:**
- Modify: `web/backend/src/doors/door-settings.service.ts:210-230` (`SettingSchema`)
- Test: `web/backend/tests/doors/door-art-settings.test.ts` (create)

**Interfaces:**
- Consumes: Task 1's `"art": true` in a manifest.
- Produces: `DoorSetting.art?: boolean`, `.artMaxLines?: number`, `.artMaxLineLength?: number` surviving `readManifestFromDir`.

- [ ] **Step 1: Write the failing test**

Create `web/backend/tests/doors/door-art-settings.test.ts`:

```ts
/**
 * A manifest's art flag survives the schema.
 *
 * Zod STRIPS unknown keys. A manifest carrying `art: true` against a schema
 * that does not declare it loses the flag between the file and every reader,
 * and the Studio shows nothing with no error anywhere - the same silent
 * shape as a board setting missing from its zod schema, which has cost this
 * board a save that did nothing before.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { readManifestFromDir } from '../../src/doors/door-settings.service';

function doorWith(settings: unknown[]): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ae-door-art-'));
  fs.writeFileSync(
    path.join(dir, 'door.settings.json'),
    JSON.stringify({ command: 'REQUESTS', cfgFile: 'REQUESTS.cfg', settings }),
  );
  return dir;
}

describe('an art-valued setting', () => {
  it('keeps its flag through the schema', () => {
    const dir = doorWith([
      { key: 'bulletinHeader', label: 'Bulletin header art', type: 'string',
        default: 'Bulletin_Header.txt', cfgKey: 'BulletinHeader', art: true },
    ]);

    const manifest = readManifestFromDir(dir);

    expect(manifest?.settings[0].art).toBe(true);
  });

  it('carries optional editor limits', () => {
    const dir = doorWith([
      { key: 'h', label: 'H', type: 'string', default: 'a.txt', art: true,
        artMaxLines: 12, artMaxLineLength: 80 },
    ]);

    const manifest = readManifestFromDir(dir);

    expect(manifest?.settings[0].artMaxLines).toBe(12);
    expect(manifest?.settings[0].artMaxLineLength).toBe(80);
  });

  it('refuses art on a setting that is not a string', () => {
    // A number cannot name a file. Rejected at the manifest, the way a
    // `choice` with no choices already is, so the door reports no settings
    // rather than offering a slot that cannot resolve.
    const dir = doorWith([
      { key: 'n', label: 'N', type: 'number', default: 1, art: true },
    ]);

    expect(readManifestFromDir(dir)).toBeNull();
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
cd web/backend && npx jest --config dev-scripts/jest.config.ts --rootDir . tests/doors/door-art-settings.test.ts
```

Expected: FAIL - first case receives `undefined` for `.art`.

- [ ] **Step 3: Extend the schema**

In `web/backend/src/doors/door-settings.service.ts`, add to `SettingSchema`'s object body (beside `secret`):

```ts
  /**
   * This setting's VALUE names an art file in the door's folder, so the ANSI
   * Studio offers it as a slot and the picker writes this setting. Declared
   * in C with AE_SETTING_ART.
   */
  art: z.boolean().optional(),
  /** Editor limits for that slot. Omitted, the canvas ceilings apply. */
  artMaxLines: z.number().int().min(1).max(100).optional(),
  artMaxLineLength: z.number().int().min(1).max(1000).optional(),
```

and add a second `.refine` after the existing `choice` one:

```ts
).refine(
  s => !s.art || s.type === 'string',
  { message: 'art is only meaningful on a string setting - a number cannot name a file' },
```

Add the same three optional fields to the `DoorSetting` interface beside `secret`.

- [ ] **Step 4: Run the tests**

```bash
cd web/backend && npx jest --config dev-scripts/jest.config.ts --rootDir . tests/doors/door-art-settings.test.ts tests/doors/c-sdk-settings-manifest.test.ts
```

Expected: PASS, all cases.

- [ ] **Step 5: Commit**

```bash
git add web/backend/src/doors/door-settings.service.ts web/backend/tests/doors/door-art-settings.test.ts
git commit -m "fix(doors): the manifest schema keeps an art flag instead of stripping it"
```

---

### Task 3: Resolving an art value to a path, safely

**Files:**
- Create: `web/backend/src/doors/door-art-file.ts`
- Test: `web/backend/tests/doors/door-art-file.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `ART_VALUE_RE: RegExp`
  - `resolveArtValue(doorDir: string, value: string): string` - absolute path, throws on anything that escapes
  - `listArtChoices(doorDir: string): Array<{ file: string; lines: number }>`
  - `artFileLines(file: string): number` - rendered rows, the trailing newline not counting as one

- [ ] **Step 1: Write the failing test**

Create `web/backend/tests/doors/door-art-file.test.ts`:

```ts
/**
 * An art setting's value becomes a path, and only inside the door's folder.
 *
 * The value is sysop input arriving through a settings form, so it is exactly
 * the field a traversal would come through. The regex states the intent and
 * the containment check enforces it - both, so a bug in one is not a hole.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { resolveArtValue, listArtChoices } from '../../src/doors/door-art-file';

let dir: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ae-art-file-'));
  fs.mkdirSync(path.join(dir, 'headers'));
  fs.writeFileSync(path.join(dir, 'Bulletin_Header.txt'), 'a\nb\n', 'latin1');
  fs.writeFileSync(path.join(dir, 'headers', 'Header3.ansi'), 'x\ny\nz\n', 'latin1');
  fs.writeFileSync(path.join(dir, 'REQUESTS.cfg'), 'Host=x\n', 'latin1');
});

describe('resolveArtValue', () => {
  it('takes a bare filename', () => {
    expect(resolveArtValue(dir, 'Bulletin_Header.txt'))
      .toBe(path.join(dir, 'Bulletin_Header.txt'));
  });

  it('takes one subdirectory level, because the alternates live in one', () => {
    expect(resolveArtValue(dir, 'headers/Header3.ansi'))
      .toBe(path.join(dir, 'headers', 'Header3.ansi'));
  });

  it.each([
    ['../../../etc/passwd', 'parent traversal'],
    ['/etc/passwd', 'absolute'],
    ['BBS:Screens/x.txt', 'an Amiga assign'],
    ['headers\\Header3.ansi', 'a backslash'],
    ['a/b/c.txt', 'two levels'],
    ['', 'empty'],
    ['headers/', 'a directory'],
  ])('refuses %s (%s)', (value) => {
    expect(() => resolveArtValue(dir, value)).toThrow();
  });
});

describe('listArtChoices', () => {
  it('finds the art beside the door and one level down, with line counts', () => {
    const choices = listArtChoices(dir);

    expect(choices).toEqual(
      expect.arrayContaining([
        { file: 'Bulletin_Header.txt', lines: 2 },
        { file: 'headers/Header3.ansi', lines: 3 },
      ]),
    );
  });

  it('is art only - a config file is not a drawing', () => {
    expect(listArtChoices(dir).map((c) => c.file)).not.toContain('REQUESTS.cfg');
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
cd web/backend && npx jest --config dev-scripts/jest.config.ts --rootDir . tests/doors/door-art-file.test.ts
```

Expected: FAIL - `Cannot find module '../../src/doors/door-art-file'`.

- [ ] **Step 3: Write the module**

Create `web/backend/src/doors/door-art-file.ts`:

```ts
/**
 * An art setting's value, as a path.
 *
 * The value names a file in the door's OWN folder - `Bulletin_Header.txt`, or
 * `headers/Header3.ansi` for the alternates that live one level down. It
 * arrives from a settings form, so it is precisely the field a traversal
 * would come through, and it is checked twice: the regex says what a value
 * may look like, and the resolved path is re-checked to be inside the door's
 * directory. A bug in either one is not a hole in both.
 */
import * as fs from 'fs';
import * as path from 'path';

/** One name, or one directory and one name. Nothing else. */
const SEGMENT = String.raw`[A-Za-z0-9_-][A-Za-z0-9._-]*`;
export const ART_VALUE_RE = new RegExp(`^${SEGMENT}(\\/${SEGMENT})?$`);

/** Extensions the Studio can draw. A cfg is not a drawing. */
const ART_EXT = ['.txt', '.ans', '.ansi', '.asc', '.ascii'];

const isArtName = (name: string): boolean =>
  ART_EXT.includes(path.extname(name).toLowerCase());

export function resolveArtValue(doorDir: string, value: string): string {
  if (!ART_VALUE_RE.test(value)) {
    throw new Error(`"${value}" is not a file inside this door's folder`);
  }
  const root = path.resolve(doorDir);
  const full = path.resolve(root, value);
  // Belt to the regex's braces. `root + path.sep` and not `startsWith(root)`:
  // a sibling directory whose name merely begins with the door's would pass
  // the looser test.
  if (full !== root && !full.startsWith(root + path.sep)) {
    throw new Error(`"${value}" resolves outside this door's folder`);
  }
  return full;
}

/** Lines a caller sees - a trailing newline does not make one. */
export function artFileLines(file: string): number {
  const text = fs.readFileSync(file, 'latin1');
  if (text === '') return 0;
  const parts = text.replace(/\r\n/g, '\n').split('\n');
  return parts[parts.length - 1] === '' ? parts.length - 1 : parts.length;
}

/**
 * Every art file the door ships, beside it and one level down - the
 * candidates a picker offers.
 */
export function listArtChoices(doorDir: string): Array<{ file: string; lines: number }> {
  const out: Array<{ file: string; lines: number }> = [];
  const add = (rel: string): void => {
    try {
      out.push({ file: rel, lines: artFileLines(path.join(doorDir, rel)) });
    } catch {
      /* unreadable is not a choice */
    }
  };

  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(doorDir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (entry.isFile() && isArtName(entry.name)) add(entry.name);
    if (!entry.isDirectory() || entry.name === 'node_modules' || entry.name === 'dist') continue;
    let inner: fs.Dirent[];
    try {
      inner = fs.readdirSync(path.join(doorDir, entry.name), { withFileTypes: true });
    } catch {
      continue;
    }
    for (const file of inner) {
      if (file.isFile() && isArtName(file.name)) add(`${entry.name}/${file.name}`);
    }
  }
  return out.sort((a, b) => a.file.localeCompare(b.file));
}
```

- [ ] **Step 4: Run the tests**

```bash
cd web/backend && npx jest --config dev-scripts/jest.config.ts --rootDir . tests/doors/door-art-file.test.ts
```

Expected: PASS, all 11 cases.

- [ ] **Step 5: Commit**

```bash
git add web/backend/src/doors/door-art-file.ts web/backend/tests/doors/door-art-file.test.ts
git commit -m "feat(doors): an art setting's value resolves to a path inside the door"
```

---

### Task 4: File-backed slots in the art service

**Files:**
- Modify: `web/backend/src/doors/door-settings.service.ts` (`listDoorArtSections` ~1259, `readDoorArtSections` ~1219, `writeDoorArtSection` ~1316, and `readArtManifest` ~1191)
- Test: `web/backend/tests/doors/door-art-settings.test.ts` (extend)

**Interfaces:**
- Consumes: Task 2's `setting.art`; Task 3's `resolveArtValue`, `listArtChoices`.
- Produces: slots whose `section` is `setting:<key>` and whose `file` is the setting's current value; `DoorArtListing` gains `choices?: Array<{file: string; lines: number}>` and `missing?: boolean`.

- [ ] **Step 1: Write the failing test**

Append to `web/backend/tests/doors/door-art-settings.test.ts`:

```ts
import { listDoorArtSections, readDoorArtSections, writeDoorArtSection } from '../../src/doors/door-settings.service';

function requestsDoor(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ae-req-'));
  fs.mkdirSync(path.join(dir, 'headers'));
  fs.writeFileSync(path.join(dir, 'Bulletin_Header.txt'), 'one\ntwo\n', 'latin1');
  fs.writeFileSync(path.join(dir, 'headers', 'Header3.ansi'), 'a\nb\nc\n', 'latin1');
  fs.writeFileSync(path.join(dir, 'door.settings.json'), JSON.stringify({
    command: 'REQUESTS',
    cfgFile: 'REQUESTS.cfg',
    settings: [
      { key: 'bulletinHeader', label: 'Bulletin header art', type: 'string',
        default: 'Bulletin_Header.txt', cfgKey: 'BulletinHeader', art: true },
    ],
  }));
  // The door's CURRENT value lives in the saved settings, not the default.
  fs.writeFileSync(path.join(dir, 'door.settings.values.json'),
    JSON.stringify({ bulletinHeader: 'Bulletin_Header.txt' }));
  return dir;
}

describe('an art setting is a Studio slot', () => {
  it('lists as a slot addressed by its key, with the file it currently names', () => {
    const dir = requestsDoor();

    const slots = listDoorArtSections(dir, 'REQUESTS');

    expect(slots).toEqual([expect.objectContaining({
      section: 'setting:bulletinHeader',
      file: 'Bulletin_Header.txt',
      label: 'Bulletin header art',
      lines: 2,
    })]);
  });

  it('offers the alternates as choices', () => {
    const dir = requestsDoor();

    const [slot] = listDoorArtSections(dir, 'REQUESTS');

    expect(slot.choices).toEqual(expect.arrayContaining([
      { file: 'Bulletin_Header.txt', lines: 2 },
      { file: 'headers/Header3.ansi', lines: 3 },
    ]));
  });

  it('reads the whole file, bytes intact', () => {
    const dir = requestsDoor();
    fs.writeFileSync(path.join(dir, 'Bulletin_Header.txt'), '\x1b[35m\xa6art\n', 'latin1');

    const [content] = readDoorArtSections(dir, 'REQUESTS');

    expect(Buffer.from(content.content, 'base64').toString('latin1')).toBe('\x1b[35m\xa6art\n');
  });

  it('writes the whole file, bytes intact', () => {
    const dir = requestsDoor();

    writeDoorArtSection(dir, 'Bulletin_Header.txt', 'setting:bulletinHeader',
      Buffer.from('\x1b[34m\xa6new\n', 'latin1').toString('base64'), 'REQUESTS');

    expect(fs.readFileSync(path.join(dir, 'Bulletin_Header.txt'), 'latin1'))
      .toBe('\x1b[34m\xa6new\n');
  });

  it('reports a setting naming a file that is not there, rather than throwing', () => {
    const dir = requestsDoor();
    fs.unlinkSync(path.join(dir, 'Bulletin_Header.txt'));

    const [slot] = listDoorArtSections(dir, 'REQUESTS');

    // The Studio offers the picker, not the editor. A 500 here would take the
    // whole door-art tab down over one door's unset setting.
    expect(slot.missing).toBe(true);
    expect(slot.lines).toBe(0);
  });

  it('refuses to write through a value that escapes the door', () => {
    const dir = requestsDoor();

    expect(() => writeDoorArtSection(dir, '../escape.txt', 'setting:bulletinHeader',
      Buffer.from('x', 'latin1').toString('base64'), 'REQUESTS')).toThrow();
    expect(fs.existsSync(path.join(path.dirname(dir), 'escape.txt'))).toBe(false);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
cd web/backend && npx jest --config dev-scripts/jest.config.ts --rootDir . tests/doors/door-art-settings.test.ts
```

Expected: FAIL - `listDoorArtSections` throws `This door declares no art sections for the Studio`.

- [ ] **Step 3: Teach the manifest reader that settings can be art**

In `door-settings.service.ts`, change `readArtManifest` so a door with art SETTINGS is not rejected. Replace its `if (sections.length === 0) throw ...` with:

```ts
  const artSettings = (manifest.settings ?? []).filter(
    s => s.art && (!want || !s.commands || s.commands.some(c => c.toUpperCase() === want)),
  );
  if (sections.length === 0 && artSettings.length === 0) {
    throw new Error('This door declares no art sections for the Studio');
  }
  return { ...manifest, artSections: sections, artSettings };
```

and widen its return type to `DoorSettingsManifest & { artSections: DoorArtSection[]; artSettings: DoorSetting[] }`.

- [ ] **Step 4: List them**

Add near `listDoorArtSections`, and call it from there (`return [...sectionListings, ...settingListings]`):

```ts
/** The section name an art SETTING is addressed by. Namespaced so it can
 *  never collide with an Empire section, and stable across a file swap -
 *  which is what lets the C64 and Teletext variants survive the picker. */
export const artSettingSection = (key: string): string => `setting:${key}`;
export const artSettingKey = (section: string): string | null =>
  section.startsWith('setting:') ? section.slice('setting:'.length) : null;

function artSettingListings(doorDir: string, command?: string): DoorArtListing[] {
  const manifest = readArtManifest(doorDir, command);
  const values = readValuesFromDir(doorDir);
  return manifest.artSettings.map((setting) => {
    const value = String(values[setting.key] ?? setting.default ?? '');
    let lines = 0;
    let missing = true;
    try {
      lines = artFileLines(resolveArtValue(doorDir, value));
      missing = false;
    } catch {
      /* the picker, not the editor */
    }
    return {
      file: value,
      section: artSettingSection(setting.key),
      label: setting.label,
      lines,
      missing,
      maxLines: setting.artMaxLines ?? 100,
      maxLineLength: setting.artMaxLineLength ?? 1000,
      choices: listArtChoices(doorDir),
    };
  });
}
```

Add `missing?: boolean` and `choices?: Array<{ file: string; lines: number }>` to `DoorArtListing`, and import all three helpers from `./door-art-file`:

```ts
import { resolveArtValue, listArtChoices, artFileLines } from './door-art-file';
```

- [ ] **Step 5: Read and write them**

In `readDoorArtSections`, before the Empire branch:

```ts
    const settingKey = artSettingKey(entry.section);
    if (settingKey !== null) {
      const body = entry.missing
        ? ''
        : fs.readFileSync(resolveArtValue(doorDir, entry.file), 'latin1');
      return {
        file: entry.file,
        section: entry.section,
        label: entry.label,
        content: Buffer.from(body, 'latin1').toString('base64'),
        lines: entry.lines,
        maxLines: entry.maxLines,
        maxLineLength: entry.maxLineLength,
        variants: { c64: drawn('c64'), ttx: drawn('ttx') },
      };
    }
```

In `writeDoorArtSection`, before it looks for a matching `artSections` entry:

```ts
  const settingKey = artSettingKey(section);
  if (settingKey !== null) {
    const declared = readArtManifest(doorDir, command).artSettings
      .find((s) => s.key === settingKey);
    if (!declared) throw new Error('This door declares no art setting by that name');
    // The FILE comes from the request, but only a value the setting could
    // legally hold, resolved inside the door - a request in one door's name
    // cannot write another's file, exactly as for a section.
    const full = resolveArtValue(doorDir, fileName);
    fs.writeFileSync(full, Buffer.from(contentBase64, 'base64').toString('latin1'), 'latin1');
    return readDoorArtSections(doorDir, command)
      .find((c) => c.section === section)!;
  }
```

- [ ] **Step 6: Run the tests**

```bash
cd web/backend && npx jest --config dev-scripts/jest.config.ts --rootDir . tests/doors/door-art-settings.test.ts tests/doors/
```

Expected: PASS, including the existing `emp_tools` art-section cases - the Empire path must be untouched.

- [ ] **Step 7: Commit**

```bash
git add web/backend/src/doors/door-settings.service.ts web/backend/tests/doors/door-art-settings.test.ts
git commit -m "feat(doors): an art setting is a Studio slot backed by a whole file"
```

---

### Task 5: The endpoints carry the new slot

**Files:**
- Modify: `web/backend/src/api/door-art-routes.ts` (the GET list ~84, GET one ~116, PUT ~148)
- Test: `web/backend/tests/api/door-art-settings-routes.test.ts` (create)

**Interfaces:**
- Consumes: Task 4's listings with `section: 'setting:<key>'`, `choices`, `missing`.
- Produces: `/api/door-art` entries carrying `choices` and `missing`; PUT accepting a `setting:` section.

- [ ] **Step 1: Write the failing test**

Create `web/backend/tests/api/door-art-settings-routes.test.ts`. The harness is
the router with its door list injected - `createDoorArtRouter({ getDoors })`
exists so a route test need not boot a BBS:

```ts
import express from 'express';
import request from 'supertest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { createDoorArtRouter } from '../../src/api/door-art-routes';

let doorDir: string;

beforeEach(() => {
  doorDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ae-req-routes-'));
  fs.mkdirSync(path.join(doorDir, 'headers'));
  fs.writeFileSync(path.join(doorDir, 'Bulletin_Header.txt'), 'one\ntwo\n', 'latin1');
  fs.writeFileSync(path.join(doorDir, 'headers', 'Header3.ansi'), 'a\nb\nc\n', 'latin1');
  fs.writeFileSync(path.join(doorDir, 'door.settings.json'), JSON.stringify({
    command: 'REQUESTS',
    cfgFile: 'REQUESTS.cfg',
    settings: [
      { key: 'bulletinHeader', label: 'Bulletin header art', type: 'string',
        default: 'Bulletin_Header.txt', cfgKey: 'BulletinHeader', art: true },
    ],
  }));
  fs.writeFileSync(path.join(doorDir, 'door.settings.values.json'),
    JSON.stringify({ bulletinHeader: 'Bulletin_Header.txt' }));
});

const app = () => {
  const a = express();
  a.use(express.json());
  a.use('/api', createDoorArtRouter({
    getDoors: () => [{ command: 'REQUESTS', name: 'Global Requests', location: doorDir }],
  }));
  return a;
};
```

Then the cases:

```ts
  it('lists an art setting as a slot with its choices', async () => {
    const res = await request(app()).get('/api/door-art');

    const requests = res.body.data.find((d: { command: string }) => d.command === 'REQUESTS');
    expect(requests.sections).toEqual([expect.objectContaining({
      section: 'setting:bulletinHeader',
      file: 'Bulletin_Header.txt',
      choices: expect.arrayContaining([{ file: 'headers/Header3.ansi', lines: 3 }]),
    })]);
  });

  it('saves a drawing back into the file the setting names', async () => {
    const body = Buffer.from('\x1b[34mdrawn\n', 'latin1').toString('base64');

    const res = await request(app())
      .put('/api/door-art/REQUESTS')
      .send({ file: 'Bulletin_Header.txt', section: 'setting:bulletinHeader', content: body });

    expect(res.status).toBe(200);
    expect(fs.readFileSync(path.join(doorDir, 'Bulletin_Header.txt'), 'latin1'))
      .toBe('\x1b[34mdrawn\n');
  });

  it('refuses a file that escapes the door, with 400 and no write', async () => {
    const res = await request(app())
      .put('/api/door-art/REQUESTS')
      .send({ file: '../escape.txt', section: 'setting:bulletinHeader',
              content: Buffer.from('x', 'latin1').toString('base64') });

    expect(res.status).toBe(400);
    expect(fs.existsSync(path.join(path.dirname(doorDir), 'escape.txt'))).toBe(false);
  });
```

- [ ] **Step 2: Run it and watch it fail**

```bash
cd web/backend && npx jest --config dev-scripts/jest.config.ts --rootDir . tests/api/door-art-settings-routes.test.ts
```

Expected: FAIL - REQUESTS absent from the listing, since the router only asked for `artSections`.

- [ ] **Step 3: Pass the fields through**

The router already maps `listDoorArtSections` output. Confirm it does not pick fields one by one; if it does, add `choices` and `missing`. Extend `handleError`'s status mapping so a resolve failure is a 400:

```ts
    const statusCode = message.includes('not found') || message.includes('No door') ? 404
                     : message.includes('outside this door') || message.includes('not a file inside') ? 400
                     : message.includes('at most') || message.includes('must be') ? 400
                     : 500;
```

- [ ] **Step 4: Run the tests**

```bash
cd web/backend && npx jest --config dev-scripts/jest.config.ts --rootDir . tests/api/
```

Expected: PASS, including the existing door-art route tests.

- [ ] **Step 5: Commit**

```bash
git add web/backend/src/api/door-art-routes.ts web/backend/tests/api/door-art-settings-routes.test.ts
git commit -m "feat(api): door art carries file-backed slots and their choices"
```

---

### Task 6: The Studio card shows the file and offers the picker

**Files:**
- Modify: `web/config-app/src/pages/ScreenFilesPage.tsx` (the door-art card)
- Modify: `web/config-app/src/api/client.ts:855-882` (types only, if the listing is typed)
- Test: `web/config-app/src/test/door-art-picker.test.tsx` (create)

**Interfaces:**
- Consumes: Task 5's `choices`, `missing`, `file` on a listing entry.
- Produces: no new exports; UI behaviour only.

- [ ] **Step 1: Write the failing test**

Create `web/config-app/src/test/door-art-picker.test.tsx`, following `door-art-opens-in-a-dialog.test.tsx` for its render harness and API mock:

```tsx
/**
 * A file-backed art slot says which file it is drawing, and lets the sysop
 * pick another. The picker writes the SETTING - it is the same value the
 * admin form edits, so there is one place the choice is recorded.
 */
it('names the file the door currently uses, and its rows', async () => {
  renderStudio({ sections: [{
    section: 'setting:bulletinHeader', file: 'Bulletin_Header.txt', label: 'Bulletin header art',
    lines: 8, maxLines: 100, maxLineLength: 1000,
    choices: [{ file: 'Bulletin_Header.txt', lines: 8 }, { file: 'headers/Header3.ansi', lines: 7 }],
  }] });

  expect(await screen.findByText('Bulletin_Header.txt')).toBeInTheDocument();
  expect(await screen.findByText(/8 rows/)).toBeInTheDocument();
});

it('writes the setting when another file is chosen', async () => {
  const saveSetting = vi.fn().mockResolvedValue({ success: true });
  renderStudio({ saveSetting, sections: [{
    section: 'setting:bulletinHeader', file: 'Bulletin_Header.txt', label: 'Bulletin header art',
    lines: 8, maxLines: 100, maxLineLength: 1000,
    choices: [{ file: 'Bulletin_Header.txt', lines: 8 }, { file: 'headers/Header3.ansi', lines: 7 }],
  }] });

  await userEvent.click(await screen.findByRole('button', { name: /choose another/i }));
  await userEvent.click(await screen.findByRole('option', { name: /headers\/Header3\.ansi/ }));

  expect(saveSetting).toHaveBeenCalledWith('REQUESTS',
    expect.objectContaining({ bulletinHeader: 'headers/Header3.ansi' }));
});

it('offers the picker and not the editor when the file is missing', async () => {
  renderStudio({ sections: [{
    section: 'setting:bulletinHeader', file: 'Bulletin_Header.txt', label: 'Bulletin header art',
    lines: 0, missing: true, maxLines: 100, maxLineLength: 1000,
    choices: [{ file: 'headers/Header3.ansi', lines: 7 }],
  }] });

  expect(await screen.findByRole('button', { name: /choose another/i })).toBeEnabled();
  expect(screen.queryByRole('button', { name: /^edit$/i })).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
cd web/config-app && ./node_modules/.bin/vitest run src/test/door-art-picker.test.tsx
```

Expected: FAIL - the filename and the picker are not rendered.

- [ ] **Step 3: Draw it**

In `ScreenFilesPage.tsx`'s door-art card, for an entry whose `section` starts with `setting:`, render below the label: the `file` string, `{lines} rows`, an **Edit** button (existing `DoorArtDialog`, suppressed when `missing`) and a **Choose another** control listing `choices` as `file - N rows`. Choosing calls the existing door-settings save with `{ [key]: file }`, where `key` is `section.slice('setting:'.length)`, then invalidates the `['door-art']` query.

Use the design system's existing Select/Menu and Button components - no raw Tailwind palette classes, no hand-rolled dropdown (`design-system-usage.test.ts` enforces this).

- [ ] **Step 4: Run the tests**

```bash
cd web/config-app && ./node_modules/.bin/vitest run
```

Expected: PASS, including `design-system-usage.test.ts` and the existing door-art dialog tests.

- [ ] **Step 5: Typecheck and build both halves**

```bash
cd web/config-app && npx tsc --noEmit && npm run build
cd ../backend && npx tsc --noEmit
```

Expected: all clean. The vite BUILD matters here and a typecheck does not replace it.

- [ ] **Step 6: Commit**

```bash
git add web/config-app/src/pages/ScreenFilesPage.tsx web/config-app/src/api/client.ts web/config-app/src/test/door-art-picker.test.tsx
git commit -m "feat(studio): an art slot names its file and offers the alternates"
```

---

### Task 7: Prove it on the live board's own art

**Files:**
- Test: manual, plus `web/backend/tests/doors/door-art-settings.test.ts` (one added case)

**Interfaces:**
- Consumes: everything above.
- Produces: nothing - this is the reachability gate.

- [ ] **Step 1: Add the case that uses the REAL door directory**

```ts
  it('finds REQUESTS own art in the repo, not just a fixture', () => {
    const repoDoor = path.join(__dirname, '..', '..', '..', '..', 'Doors', 'REQUESTS');

    const slots = listDoorArtSections(repoDoor, 'REQUESTS');

    expect(slots.map((s) => s.section)).toEqual(
      expect.arrayContaining(['setting:bulletinHeader', 'setting:bulletinTail']),
    );
    const header = slots.find((s) => s.section === 'setting:bulletinHeader')!;
    expect(header.file).toBe('Bulletin_Header.txt');
    expect(header.lines).toBe(8);
    // The 20 alternates that moved across from the classic Request door.
    expect(header.choices!.length).toBeGreaterThanOrEqual(20);
  });
```

- [ ] **Step 2: Run the whole affected surface**

```bash
cd web/backend && npx jest --config dev-scripts/jest.config.ts --rootDir . tests/doors/ tests/api/ tests/screens/
make -C sdk/c test
cd ../config-app && ./node_modules/.bin/vitest run
```

Expected: green throughout.

- [ ] **Step 3: Drive it in the real admin**

```bash
./dev/scripts/start-servers.sh --bbs-only
```

Open `http://localhost:3001/admin/` -> ANSI Studio -> door art. REQUESTS must show two slots, `Bulletin_Header.txt` (8 rows) and `Bulletin_Tail.txt` (2 rows). Open the header, confirm the logo draws on the canvas in colour, close without saving. Choose `bulletindesign/Header3.ansi`, confirm the card now says that file at 7 rows, and confirm `Doors/REQUESTS/REQUESTS.cfg` gained `BulletinHeader=bulletindesign/Header3.ansi`.

- [ ] **Step 4: Confirm the door still writes the bulletin**

With the new header selected, run the door and check the screen it writes:

```bash
cd web/backend && printf '4000 Q\n' | npx tsx src/scripts/run-amiga-door.ts \
  ../../Doors/REQUESTS/requests 1 --doortype XIM --timeout 45
```

Then confirm the written bulletin still fits: 23 rows or fewer, header 7 rows, and one MORE request row than before. This is the gate that matters - a picker that changes a card but not the screen a caller reads has changed nothing.

- [ ] **Step 5: Commit**

```bash
git add web/backend/tests/doors/door-art-settings.test.ts
git commit -m "test(doors): the art slots resolve against the real REQUESTS folder"
```
