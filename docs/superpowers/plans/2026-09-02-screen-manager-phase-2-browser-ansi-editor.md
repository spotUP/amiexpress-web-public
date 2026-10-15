# Screen Manager Phase 2: the ANSI editor in the browser

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Edit a screen's ANSI art in the admin - colours, CP437 characters,
the drawing tools - and save the exact bytes back to the board.

**Architecture:** The SDK's ANSI editor core is pure TypeScript with no Node
imports: `core/canvas.ts` (Cell[][] and every drawing primitive),
`core/editor-state.ts` (undo/redo), `tools/drawing-tools.ts` (the tools and
selection), `core/file-ops.ts` (`loadANSFile`/`saveANSFile`, CP437 and SAUCE).
The browser reuses all of it and adds only what a terminal did not need: a
canvas renderer and mouse/keyboard input. One implementation of each tool
behind two front-ends - the convergence that made this possible landed on
2026-09-01 and forking it again would undo that.

**Tech Stack:** TypeScript, React, vitest + @testing-library, HTML canvas.
config-app already resolves a sibling package by `file:` path
(`@amiexpress/terminal`), which is how the SDK arrives.

**Spec:** `docs/superpowers/specs/2026-09-01-screen-file-manager-design.md`

## Global Constraints

- **Bytes, never text.** A screen crosses as base64 and becomes a `Uint8Array`;
  `loadANSFile`/`saveANSFile` own the CP437 and SAUCE handling. No string
  round-trip touches content - a UTF-8 pass turns an Amiga high-bit byte into
  U+FFFD.
- **Reuse the SDK core; add only rendering and input.** A tool implemented
  twice is the bug this phase exists to avoid.
- **`transparent` does not survive ANSI.** `types.ts:89` says so explicitly:
  the flag is for hosts holding a live `Cell[][]`, and the ANSI codec is lossy
  by design. Do not "fix" it.
- Every write goes through the existing `PUT /api/screens/file` with its
  backup, its fan-out choice and its refusals - the editor is a new way to
  produce bytes, not a new way to write them.
- config-app: `npm test`, `npx tsc --noEmit -p tsconfig.json`.
- A feature the UI cannot reach is not a feature: every task ends with
  something a sysop can see.

---

### Task 1: The SDK reaches the browser

**Files:**
- Modify: `web/config-app/package.json` (a `file:` dependency on the SDK)
- Modify: `web/config-app/vite.config.ts` (resolve the source, as the terminal package is resolved)
- Test: `web/config-app/src/test/sdk-editor-core-in-browser.test.ts`

**Interfaces:**
- Produces: the SDK's editor core, importable from config-app.

- [ ] **Step 1: Write the failing test**

```ts
/**
 * The SDK's editor core has to run in a browser bundle, not just in Node.
 *
 * core/, tools/ and input/ carry no Node imports - only api/ and ui/ bind to
 * blessed - so this is a packaging question, and packaging questions are
 * exactly what a smoke test settles before three tasks are built on top.
 */
import { describe, expect, it } from 'vitest';
import { createCanvas, setCell, getCell } from '@amiexpress/bbs-door-sdk/engines/ui/ansi-editor/core/canvas';

describe('the SDK editor core, in a browser bundle', () => {
  it('creates a canvas and holds a cell', () => {
    const canvas = createCanvas(4, 2);
    setCell(canvas, 1, 1, { char: 'A', fg: 15, bg: 0 });

    expect(getCell(canvas, 1, 1)).toMatchObject({ char: 'A', fg: 15 });
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd web/config-app && npm test -- sdk-editor-core-in-browser`
Expected: FAIL - the module cannot be resolved.

- [ ] **Step 3: Add the dependency the way the terminal package is added**

`package.json`, beside `"@amiexpress/terminal": "file:../../packages/terminal"`:

```json
    "@amiexpress/bbs-door-sdk": "file:../../sdk",
```

Then `npm install` in `web/config-app`. If Vite does not resolve the
subpath, add an alias in `vite.config.ts` pointing
`@amiexpress/bbs-door-sdk` at `../../sdk`, mirroring the terminal entry, and
say in a comment that the editor core is imported from SOURCE so the browser
and the door share one implementation rather than a stale `dist`.

- [ ] **Step 4: Run the test again**

Expected: PASS. If it fails on a transitive blessed import, import the leaf
module path (`.../core/canvas`) rather than the package index - the index
re-exports the blessed-bound `api/`.

- [ ] **Step 5: Commit**

```bash
git add web/config-app/package.json web/config-app/package-lock.json \
        web/config-app/vite.config.ts \
        web/config-app/src/test/sdk-editor-core-in-browser.test.ts
git commit -m "build(admin): the SDK editor core resolves in the browser bundle"
```

---

### Task 2: Bytes in, bytes out

**Files:**
- Create: `web/config-app/src/pages/screen-bytes.ts`
- Test: `web/config-app/src/test/screen-bytes.test.ts`

**Interfaces:**
- Consumes: `loadANSFile(data: Uint8Array): Promise<{ canvas: Cell[][]; width: number; height: number; sauce?: SAUCERecord }>`
  and `saveANSFile(canvas: Cell[][], iceColors?: boolean, sauce?: Partial<SAUCERecord>): Uint8Array`
  from `.../ansi-editor/core/file-ops`.
- Produces:
  ```ts
  export function base64ToBytes(base64: string): Uint8Array;
  export function bytesToBase64(bytes: Uint8Array): string;
  export async function screenToCanvas(base64: string): Promise<Cell[][]>;
  export function canvasToScreen(canvas: Cell[][]): string;   // base64
  ```

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';
import { base64ToBytes, bytesToBase64, screenToCanvas, canvasToScreen } from '../pages/screen-bytes';

describe('a screen crossing into the editor and back', () => {
  it('base64 round-trips a high-bit byte untouched', () => {
    const bytes = new Uint8Array([0xa1, 0x0d, 0x0a, 0xdb]);

    expect(base64ToBytes(bytesToBase64(bytes))).toEqual(bytes);
  });

  it('a plain line of text becomes cells and comes back as the same characters', async () => {
    const canvas = await screenToCanvas(bytesToBase64(new TextEncoder().encode('HI')));

    expect(canvas[0][0].char).toBe('H');
    expect(canvas[0][1].char).toBe('I');
  });

  it('colour survives the round trip', async () => {
    const ansi = new TextEncoder().encode('\x1b[31mR');
    const canvas = await screenToCanvas(bytesToBase64(ansi));

    expect(canvas[0][0]).toMatchObject({ char: 'R', fg: 4 });

    const again = await screenToCanvas(canvasToScreen(canvas));
    expect(again[0][0]).toMatchObject({ char: 'R', fg: 4 });
  });

  it('a CP437 block character survives as itself', async () => {
    // 0xDB is the full block - the character half of every ANSI drawing.
    const canvas = await screenToCanvas(bytesToBase64(new Uint8Array([0xdb])));

    expect(canvas[0][0].char).toBe('█');
    expect(base64ToBytes(canvasToScreen(canvas))[0]).toBe(0xdb);
  });
});
```

- [ ] **Step 2: Run it, watch it fail, implement, run it again**

Run: `cd web/config-app && npm test -- screen-bytes`

`base64ToBytes` uses `atob` and a `Uint8Array` from char codes;
`bytesToBase64` uses `btoa` over `String.fromCharCode` in chunks - a 16 KB
screen blows the argument limit in one call. `screenToCanvas` and
`canvasToScreen` are thin wrappers over `loadANSFile`/`saveANSFile`.

- [ ] **Step 3: Commit**

```bash
git add web/config-app/src/pages/screen-bytes.ts web/config-app/src/test/screen-bytes.test.ts
git commit -m "feat(admin): a screen's bytes become cells and come back unchanged"
```

---

### Task 3: The canvas renders

**Files:**
- Create: `web/config-app/src/components/AnsiCanvas.tsx`
- Test: `web/config-app/src/test/ansi-canvas.test.tsx`

**Interfaces:**
- Consumes: `Cell[][]` (Task 2), the 16-colour EGA palette.
- Produces:
  ```tsx
  interface AnsiCanvasProps {
    canvas: Cell[][];
    cursor?: { x: number; y: number } | null;
    onCellPointer?: (x: number, y: number, event: 'down' | 'move' | 'up') => void;
  }
  export function AnsiCanvas(props: AnsiCanvasProps): JSX.Element;
  ```

- [ ] **Step 1: Write the failing test**

```tsx
import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AnsiCanvas } from '../components/AnsiCanvas';
import { createCanvas, setCell } from '@amiexpress/bbs-door-sdk/engines/ui/ansi-editor/core/canvas';

describe('the ANSI canvas', () => {
  it('draws one cell per column and row', () => {
    const canvas = createCanvas(4, 2);
    render(<AnsiCanvas canvas={canvas} />);

    expect(screen.getByTestId('ansi-canvas').getAttribute('data-cols')).toBe('4');
    expect(screen.getByTestId('ansi-canvas').getAttribute('data-rows')).toBe('2');
  });

  it('reports which cell the pointer is on, in canvas coordinates', () => {
    const canvas = createCanvas(8, 4);
    const onCellPointer = vi.fn();
    render(<AnsiCanvas canvas={canvas} onCellPointer={onCellPointer} />);

    const element = screen.getByTestId('ansi-canvas');
    // jsdom gives every element a zero-size box, so the component must read
    // cell size from its own metrics rather than from getBoundingClientRect.
    fireEvent.pointerDown(element, { clientX: 0, clientY: 0 });

    expect(onCellPointer).toHaveBeenCalledWith(0, 0, 'down');
  });
});
```

- [ ] **Step 2: Run it, watch it fail, implement, run it again**

Draw with `<canvas>`: a fixed cell size, `fillRect` for the background,
`fillText` for the character, the 16-colour EGA palette from the terminal
package if it exports one and a local constant if not. Expose `data-cols` and
`data-rows` so a test can assert the grid without reading pixels. Pointer
coordinates are `floor(offsetX / cellWidth)`, `floor(offsetY / cellHeight)`.

- [ ] **Step 3: Commit**

```bash
git add web/config-app/src/components/AnsiCanvas.tsx web/config-app/src/test/ansi-canvas.test.tsx
git commit -m "feat(admin): the ANSI canvas, drawn cell by cell"
```

---

### Task 4: Drawing, through the SDK's own tools

**Files:**
- Create: `web/config-app/src/pages/screen-editor-state.ts`
- Test: `web/config-app/src/test/screen-editor-state.test.ts`

**Interfaces:**
- Consumes: `EditorState` from `.../core/editor-state`, `handleDrawEvent`,
  `getToolHandler`, `undoDrawing`, `redoDrawing` from `.../tools/drawing-tools`.
- Produces:
  ```ts
  export interface EditorSurface {
    canvas: Cell[][];
    tool: DrawingTool;
    fg: number;
    bg: number;
    char: string;
  }
  export function createSurface(canvas: Cell[][]): EditorSurface;
  export function pointerToCanvas(surface: EditorSurface, x: number, y: number, phase: 'down' | 'move' | 'up'): EditorSurface;
  export function typeCharacter(surface: EditorSurface, x: number, y: number, char: string): EditorSurface;
  export function undo(surface: EditorSurface): EditorSurface;
  export function redo(surface: EditorSurface): EditorSurface;
  ```

- [ ] **Step 1: Write the failing test**

```ts
describe('drawing on a screen', () => {
  it('a pointer down with the draw tool paints one cell in the chosen colour', () => {
    const surface = { ...createSurface(createCanvas(8, 4)), tool: 'draw' as const, fg: 12, char: '█' };
    const after = pointerToCanvas(surface, 2, 1, 'down');

    expect(getCell(after.canvas, 2, 1)).toMatchObject({ char: '█', fg: 12 });
  });

  it('typing puts the character where the cursor is', () => {
    const after = typeCharacter(createSurface(createCanvas(8, 4)), 3, 2, 'X');

    expect(getCell(after.canvas, 3, 2)?.char).toBe('X');
  });

  it('undo puts the cell back the way it was, and redo returns it', () => {
    const start = { ...createSurface(createCanvas(8, 4)), tool: 'draw' as const, fg: 9, char: '#' };
    const drawn = pointerToCanvas(start, 1, 1, 'down');

    expect(getCell(undo(drawn).canvas, 1, 1)?.char).not.toBe('#');
    expect(getCell(redo(undo(drawn)).canvas, 1, 1)?.char).toBe('#');
  });

  it('the line tool draws from the down cell to the up cell, not one dot', () => {
    const surface = { ...createSurface(createCanvas(8, 4)), tool: 'line' as const, fg: 15, char: '█' };
    const drawn = pointerToCanvas(pointerToCanvas(surface, 0, 0, 'down'), 4, 0, 'up');

    expect(getCell(drawn.canvas, 2, 0)?.char).toBe('█');
  });
});
```

- [ ] **Step 2: Run it, watch it fail, implement, run it again**

Every one of these delegates: `pointerToCanvas` builds the event
`handleDrawEvent` expects and hands it the SDK's `EditorState`; `undo`/`redo`
call `undoDrawing`/`redoDrawing`. If a test needs behaviour the SDK does not
have, STOP - that is a change to the SDK and belongs there, behind its own
test, not reimplemented here.

- [ ] **Step 3: Commit**

```bash
git add web/config-app/src/pages/screen-editor-state.ts web/config-app/src/test/screen-editor-state.test.ts
git commit -m "feat(admin): drawing runs through the SDK's own tools"
```

---

### Task 5: The editor, as a screen a sysop opens

**Files:**
- Create: `web/config-app/src/components/ScreenEditor.tsx`
- Modify: `web/config-app/src/pages/ScreenFilesPage.tsx`
- Test: `web/config-app/src/test/screen-editor.test.tsx`

**Interfaces:**
- Consumes: Tasks 2-4, and `apiClient.putScreenFile` with the fan-out choices
  from `screen-write-plan.ts`.
- Produces: an Edit button on an ANSI or text screen that opens the editor, and
  a Save that writes the bytes back.

- [ ] **Step 1: Write the failing test**

```tsx
it('opens the editor on an ANSI screen and saves the bytes back', async () => {
  const user = userEvent.setup();
  render(<ScreenFilesPage />, { wrapper });

  await user.click(await screen.findByText('BBSTITLE'));
  await user.click(await screen.findByRole('button', { name: /edit/i }));
  expect(await screen.findByTestId('ansi-canvas')).toBeTruthy();

  await user.click(screen.getByRole('button', { name: /save/i }));

  await waitFor(() => expect(putScreenFile).toHaveBeenCalled());
  const [, base64] = putScreenFile.mock.calls[0];
  expect(base64ToBytes(base64).length).toBeGreaterThan(0);
});

it('a RIP screen offers no editor - phase 3 owns that', async () => {
  // ... open a .rip screen, assert the Edit button is absent and the reason is shown
});
```

- [ ] **Step 2: Run it, watch it fail, implement, run it again**

`ScreenEditor` holds the surface from Task 4, renders `AnsiCanvas` from Task
3, a 16-colour picker for foreground and background, the tool buttons the SDK
declares (`draw`, `line`, `box`, `box-fill`, `ellipse`, `fill`, `text`,
`select`), and undo/redo. Save serialises with `canvasToScreen` and calls
`putScreenFile` through the SAME fan-out dialog the upload path already uses -
editing the LOGON screen must offer "all 41 nodes" exactly as replacing it
does.

- [ ] **Step 3: Commit**

```bash
git add web/config-app/src/components/ScreenEditor.tsx \
        web/config-app/src/pages/ScreenFilesPage.tsx \
        web/config-app/src/test/screen-editor.test.tsx
git commit -m "feat(admin): edit a screen's art in the browser, and save the bytes"
```

---

### Task 6: MCI codes are editable, not decoration

**Files:**
- Create: `web/config-app/src/pages/mci-tokens.ts`
- Modify: `web/config-app/src/components/ScreenEditor.tsx`
- Test: `web/config-app/src/test/mci-tokens.test.ts`

**Interfaces:**
- Consumes: the index's `mci` facts (`code`, `target`, `resolves`).
- Produces:
  ```ts
  export interface MciToken { code: string; target: string; line: number; column: number; resolves: boolean }
  export function findMciTokens(canvas: Cell[][], known: MciReferenceShape[]): MciToken[];
  export const MCI_INSERTS: { code: string; label: string; template: string }[];
  ```

- [ ] **Step 1: Write the failing test**

```ts
it('finds a ~CC_ token and where it sits on the canvas', () => {
  const canvas = canvasFromText('run ~CC_gwall| now');
  const [token] = findMciTokens(canvas, [{ code: 'CC', target: 'gwall', resolves: true, scopeSpecific: false }]);

  expect(token).toMatchObject({ code: 'CC', target: 'gwall', line: 0, column: 4, resolves: true });
});

it('a token whose target is gone is reported as broken, in place', () => {
  const canvas = canvasFromText('~CC_nosuchdoor|');
  const [token] = findMciTokens(canvas, [{ code: 'CC', target: 'nosuchdoor', resolves: false, scopeSpecific: false }]);

  expect(token.resolves).toBe(false);
});

it('the insert list offers the codes this board actually uses', () => {
  expect(MCI_INSERTS.map(i => i.code)).toEqual(['CC', 'SS', 'SR', 'CL']);
});
```

- [ ] **Step 2: Run it, watch it fail, implement, run it again**

The editor highlights each token's cells, shows a broken one in the alert
colour, and offers the four inserts the board's screens actually use (252
`~SS_`, 173 `~CC_`, 108 `~SR_`, 42 `~CL.` - measured, not guessed). A screen is
a program, and the editor should say so.

- [ ] **Step 3: Commit**

```bash
git add web/config-app/src/pages/mci-tokens.ts \
        web/config-app/src/components/ScreenEditor.tsx \
        web/config-app/src/test/mci-tokens.test.ts
git commit -m "feat(admin): MCI codes are highlighted, checked and insertable"
```

---

## Manual verification - the sysop's

At `/admin` -> Screen Files, with a screen open:

- [ ] Edit opens the art as the caller sees it
- [ ] Draw, line and fill work with a chosen foreground and background
- [ ] Undo and redo go back and forward, including across a line
- [ ] Typing puts characters on the canvas
- [ ] An MCI code is highlighted; a deleted door's `~CC_` shows as broken
- [ ] Save offers the same fan-out as replacing the file, and the board shows
      the edited screen afterwards
- [ ] A `.rip` screen offers no editor, and says why
