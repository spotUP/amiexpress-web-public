/**
 * ANSIEditor draw-mode undo/redo, driven through the widget's real
 * keyboard/mouse event paths.
 *
 * Task 4 of the "ansi-editor sprite-capable" plan
 * (.superpowers/sdd/2026-09-01-ansi-editor-sprite-capable/). Before this
 * change, the widget reimplemented every drawing tool inline
 * (handleToolClick()'s switch, the shape-preview switch) instead of calling
 * the ten imported core-library tool handlers (drawTool, lineTool, boxTool,
 * boxFillTool, ellipseTool, ellipseFillTool, fillTool, pickTool, selectTool,
 * getToolHandler) or the undo primitives (undoDrawing, clearUndoStack) - all
 * twelve were dead imports (research section 4-5). Ctrl+Z/Ctrl+Y/U were
 * wired in draw mode but inert: they only ever manipulated the unrelated
 * text-mode `this.undoStack` (an array of whole-document string snapshots),
 * which draw-mode operations never pushed onto.
 *
 * This file drives the widget exactly the way ansi-editor-dimensions.test.ts
 * does - real Screen, real `drawCanvas.emit('keypress'|'click'|'mouse', ...)`
 * calls - and asserts on the actual canvas content the widget renders from,
 * not on source text.
 */

import { Screen } from '../../engines/ui/blessed/core/screen';
import { ANSIEditor } from '../../engines/ui/blessed/widgets/ansi-editor';

function makeScreen(): any {
  return new Screen({
    title: 'ansi-editor-draw-undo',
    responsive: true,
    width: 100,
    height: 40,
  } as any);
}

/**
 * Switch drawing tool by calling the widget's real switchTool() directly.
 * The single-letter keyboard shortcuts (t/d/l/r/e/f/p/s) only work when the
 * CURRENT tool is not 'text' - the widget's default tool is 'text'
 * (Moebius-style: typing captures every key while active), so a keyboard
 * shortcut can never be the FIRST tool switch in a test. Calling switchTool()
 * directly still exercises the widget's real tool-switch code path
 * (including its in-progress-shape-cancel/chunk-flush behavior), it just
 * skips re-deriving "which key means which tool", which is not what these
 * tests are about.
 */
function switchToTool(editor: any, tool: string): void {
  editor.switchTool(tool);
}

/** Press a Ctrl+<key> combination on the draw canvas (Ctrl+Z / Ctrl+Y). */
function pressCtrl(editor: any, name: string): void {
  editor.drawCanvas.emit('keypress', '', { name, ctrl: true, shift: false, meta: false, alt: false });
}

/** Press Space on the draw canvas - draws at the cursor for non-text tools. */
function pressSpace(editor: any): void {
  editor.drawCanvas.emit('keypress', ' ', { name: 'space', ctrl: false, shift: false, meta: false, alt: false });
}

/** Simulate a left-mouse click at canvas-local (x, y), matching the widget's own ileft/itop math. */
function clickCanvasLocal(editor: any, x: number, y: number): void {
  editor.drawCanvas.emit('click', {
    x: editor.drawCanvas.ileft + x,
    y: editor.drawCanvas.itop + y,
    button: 'left',
  });
}

/** Simulate a mouse action (e.g. 'mousemove') at canvas-local (x, y). */
function mouseAction(editor: any, action: string, x: number, y: number): void {
  editor.drawCanvas.emit('mouse', {
    action,
    x: editor.drawCanvas.ileft + x,
    y: editor.drawCanvas.itop + y,
    button: 'left',
  });
}

describe('ANSIEditor draw-mode undo/redo (via real key/mouse dispatch)', () => {
  let screen: any;
  let editor: any;

  beforeEach(() => {
    screen = makeScreen();
    editor = new ANSIEditor({ parent: screen } as any); // default 80x25, initialMode: draw
  });

  afterEach(() => screen?.destroy());

  it('drawing a character then Ctrl+Z reverts it, and Ctrl+Y redoes it', () => {
    switchToTool(editor, 'draw');
    editor.cursor = { line: 3, col: 4 };
    editor.currentChar = 'X';

    pressSpace(editor);
    expect(editor.getCoreCanvas()[3][4].char).toBe('X');

    pressCtrl(editor, 'z');
    expect(editor.getCoreCanvas()[3][4].char).toBe(' ');

    pressCtrl(editor, 'y');
    expect(editor.getCoreCanvas()[3][4].char).toBe('X');
  });

  it('a dragged line commits as ONE undo entry - one Ctrl+Z reverts the whole line, not just the last preview repaint', () => {
    switchToTool(editor, 'line');
    editor.currentChar = 'L';

    clickCanvasLocal(editor, 2, 2); // first click: start
    // Multiple preview repaints while dragging - must not create multiple
    // undo entries (each onMove replaces the canvas array, but only onStart
    // pushed to the undo stack).
    mouseAction(editor, 'mousemove', 3, 2);
    mouseAction(editor, 'mousemove', 4, 2);
    mouseAction(editor, 'mousemove', 5, 2);
    clickCanvasLocal(editor, 5, 2); // second click: commit

    const canvas = editor.getCoreCanvas();
    expect(canvas[2][2].char).toBe('L');
    expect(canvas[2][3].char).toBe('L');
    expect(canvas[2][4].char).toBe('L');
    expect(canvas[2][5].char).toBe('L');

    pressCtrl(editor, 'z');

    const reverted = editor.getCoreCanvas();
    expect(reverted[2][2].char).toBe(' ');
    expect(reverted[2][3].char).toBe(' ');
    expect(reverted[2][4].char).toBe(' ');
    expect(reverted[2][5].char).toBe(' ');

    // A single undo reverted the WHOLE line - there is nothing left from
    // this operation for a second Ctrl+Z to partially unwind further.
    // (The canvas started blank, so a second undo is a documented no-op.)
    pressCtrl(editor, 'z');
    const stillBlank = editor.getCoreCanvas();
    expect(stillBlank[2][2].char).toBe(' ');
  });

  /**
   * Final-fix-wave IMPORTANT 1 (reviewer's exact probe, empirically
   * reproduced against the real widget before this fix). The colinear-drag
   * test above can't catch this: every mousemove and the final commit all
   * fall on the same row, so a stale preview repaint is visually
   * indistinguishable from the committed shape. This drag is deliberately
   * NON-colinear - the last reported mousemove (5,2) lands on a different
   * cell than the eventual commit direction (2,6) - which is exactly the
   * shape a terminal's coalesced motion reporting under load produces
   * (this widget repaints all 80x25 cells per move). Before the fix,
   * onEnd drew the final shape onto the CURRENT (preview-mutated) canvas
   * instead of the pre-drag snapshot, so both the horizontal preview trail
   * from the mousemove AND the committed vertical line landed together -
   * two shapes from one gesture.
   */
  it('a NON-COLINEAR drag commits the shape ONCE - the last preview repaint does not survive alongside it', () => {
    switchToTool(editor, 'line');
    editor.currentChar = 'L';

    clickCanvasLocal(editor, 2, 2); // first click: start at (col=2, row=2)
    mouseAction(editor, 'mousemove', 5, 2); // preview paints a HORIZONTAL trail across row 2: cols 3,4,5
    clickCanvasLocal(editor, 2, 6); // second click: commit a VERTICAL line down col 2, rows 2..6

    const canvas = editor.getCoreCanvas();

    // The committed vertical line landed in full.
    expect(canvas[2][2].char).toBe('L');
    expect(canvas[3][2].char).toBe('L');
    expect(canvas[4][2].char).toBe('L');
    expect(canvas[5][2].char).toBe('L');
    expect(canvas[6][2].char).toBe('L');

    // The stale horizontal preview trail from the mousemove must NOT
    // survive the commit.
    expect(canvas[2][3].char).toBe(' ');
    expect(canvas[2][4].char).toBe(' ');
    expect(canvas[2][5].char).toBe(' ');

    // Still exactly one undo entry for the whole gesture.
    pressCtrl(editor, 'z');
    const reverted = editor.getCoreCanvas();
    expect(reverted[2][2].char).toBe(' ');
    expect(reverted[6][2].char).toBe(' ');
  });

  /**
   * Final-fix-wave IMPORTANT 3. A chunk opened by drawTool.onStart (a
   * freehand drag) is normally flushed on mouseup, but a mouseup can be
   * missed - the pointer leaves the canvas mid-drag. Ctrl+Z must still
   * undo exactly the in-progress drag, not the unrelated stroke before it,
   * and the pending chunk must not resurrect later when a late mouseup
   * finally does fire.
   */
  it('undoing mid-drag with no mouseup reverts the drag, not the stroke before it, and the pending chunk cannot resurrect on a late mouseup', () => {
    switchToTool(editor, 'draw');
    editor.currentChar = 'A';
    editor.cursor = { line: 1, col: 1 };
    editor.drawAtCursor(false); // an unrelated prior stroke, its own undo entry

    editor.currentChar = 'X';
    mouseAction(editor, 'mousedown', 3, 3); // drag starts - opens a pending chunk, paints (3,3)
    mouseAction(editor, 'mousemove', 4, 3); // drag continues - no mouseup fires

    expect(editor.getCoreCanvas()[3][3].char).toBe('X');
    expect(editor.getCoreCanvas()[3][4].char).toBe('X');

    // Undo WITHOUT a mouseup ever having fired.
    pressCtrl(editor, 'z');

    const afterMidDragUndo = editor.getCoreCanvas();
    // The in-progress drag reverts fully - flushDrawChunk() at the top of
    // undo() flushes the pending chunk first, so the popped entry IS the
    // drag's own pre-drag snapshot.
    expect(afterMidDragUndo[3][3].char).toBe(' ');
    expect(afterMidDragUndo[3][4].char).toBe(' ');
    // The unrelated prior stroke is untouched by this same keypress.
    expect(afterMidDragUndo[1][1].char).toBe('A');

    // A late mouseup fires now (pointer re-enters and releases). Before the
    // fix, this would push the now-stale pre-drag snapshot back onto the
    // undo stack, and a later Ctrl+Z would resurrect the already-undone
    // drag content instead of undoing the unrelated prior stroke.
    mouseAction(editor, 'mouseup', 4, 3);

    const afterLateMouseup = editor.getCoreCanvas();
    expect(afterLateMouseup[3][3].char).toBe(' ');
    expect(afterLateMouseup[3][4].char).toBe(' ');

    pressCtrl(editor, 'z'); // must undo the unrelated prior stroke - nothing to resurrect
    expect(editor.getCoreCanvas()[1][1].char).toBe(' ');
    expect(editor.getCoreCanvas()[3][3].char).toBe(' '); // still blank - no resurrection
  });

  it('flood fill then Ctrl+Z reverts the whole filled region', () => {
    switchToTool(editor, 'fill');
    editor.currentChar = 'F';

    clickCanvasLocal(editor, 10, 10);

    const filled = editor.getCoreCanvas();
    // A blank uniform canvas flood-fills entirely from any point.
    expect(filled[0][0].char).toBe('F');
    expect(filled[24][79].char).toBe('F');

    pressCtrl(editor, 'z');

    const reverted = editor.getCoreCanvas();
    expect(reverted[0][0].char).toBe(' ');
    expect(reverted[24][79].char).toBe(' ');
  });

  it('two editors open at once do not undo each other', () => {
    const screenB = makeScreen();
    const editorB: any = new ANSIEditor({ parent: screenB } as any);

    try {
      switchToTool(editor, 'draw');
      editor.cursor = { line: 1, col: 1 };
      editor.currentChar = 'A';
      pressSpace(editor);

      switchToTool(editorB, 'draw');
      editorB.cursor = { line: 1, col: 1 };
      editorB.currentChar = 'B';
      pressSpace(editorB);

      expect(editor.getCoreCanvas()[1][1].char).toBe('A');
      expect(editorB.getCoreCanvas()[1][1].char).toBe('B');

      // Undo editor A only.
      pressCtrl(editor, 'z');

      expect(editor.getCoreCanvas()[1][1].char).toBe(' ');
      // Editor B is completely unaffected by A's undo.
      expect(editorB.getCoreCanvas()[1][1].char).toBe('B');
    } finally {
      screenB.destroy();
    }
  });

  it("switching tools mid-shape-drag abandons the in-progress shape (matches today's behavior of never touching the canvas until the second click)", () => {
    switchToTool(editor, 'line');
    editor.currentChar = 'L';

    clickCanvasLocal(editor, 6, 6); // first click: start
    mouseAction(editor, 'mousemove', 8, 6); // in-progress preview paints onto the canvas

    // Abandon by switching tools instead of completing the shape.
    switchToTool(editor, 'draw');

    const canvas = editor.getCoreCanvas();
    expect(canvas[6][6].char).toBe(' ');
    expect(canvas[6][8].char).toBe(' ');
  });

  it('the ellipse tool now treats the two clicks as a bounding-box diagonal (library convention), not center+radius (the old inline convention) - a named, deliberate geometry change; Ctrl+Z still reverts it as one entry', () => {
    switchToTool(editor, 'ellipse');
    editor.currentChar = 'E';

    // A degenerate horizontal ellipse (ry=0) is easiest to pin exactly:
    // clicking (10,10) then (20,10) draws a straight horizontal segment.
    clickCanvasLocal(editor, 10, 10);
    clickCanvasLocal(editor, 20, 10);

    const canvas = editor.getCoreCanvas();
    // Library convention: center = floor(midpoint) = (15,10),
    // rx = floor(abs(20-10)/2) = 5 -> spans columns 10..20.
    expect(canvas[10][15].char).toBe('E'); // center
    expect(canvas[10][10].char).toBe('E'); // left edge of the bounding box
    expect(canvas[10][20].char).toBe('E'); // right edge of the bounding box
    // NOT the old inline convention, which would have centered the ellipse
    // AT the first click (10,10) with rx = full distance (10), spanning
    // columns 0..20 - column 5 would also be painted under that convention.
    expect(canvas[10][5].char).toBe(' ');

    pressCtrl(editor, 'z');
    const reverted = editor.getCoreCanvas();
    expect(reverted[10][15].char).toBe(' ');
  });

  it('outline ellipse (rx,ry both > 1) draws the library\'s solid Bresenham curve - the exact cell set, not just its bounding box - and Ctrl+Z reverts all of it', () => {
    switchToTool(editor, 'ellipse');
    editor.currentChar = 'E';

    // rx=8, ry=2 centered at (20,10): first click (12,8), second click
    // (28,12) -> center=(20,10), rx=floor(16/2)=8, ry=floor(4/2)=2.
    clickCanvasLocal(editor, 12, 8);
    clickCanvasLocal(editor, 28, 12);

    const canvas = editor.getCoreCanvas();
    const drawn = new Set<string>();
    for (let y = 8; y <= 12; y++) {
      for (let x = 12; x <= 28; x++) {
        if (canvas[y][x].char === 'E') drawn.add(`${x},${y}`);
      }
    }

    // Canvas.drawEllipse()'s midpoint algorithm - the exact cell set the
    // library draws for this rx/ry. Pinned empirically (fix-round-1
    // CRITICAL 2): the deleted inline previewEllipse() used parametric
    // angle-sampling and produced a gappy outline that MISSED several of
    // these cells (e.g. (20,8) and (20,12), the top/bottom poles) - a
    // regression back to that algorithm would silently thin the curve
    // without failing any bounding-box-only assertion.
    expect(drawn.has('20,8')).toBe(true);  // top pole
    expect(drawn.has('20,12')).toBe(true); // bottom pole
    expect(drawn.has('12,10')).toBe(true); // left pole
    expect(drawn.has('28,10')).toBe(true); // right pole
    expect(drawn.size).toBe(32); // full solid outline cell count for rx=8,ry=2

    pressCtrl(editor, 'z');
    const reverted = editor.getCoreCanvas();
    for (const key of drawn) {
      const [x, y] = key.split(',').map(Number);
      expect(reverted[y][x].char).toBe(' ');
    }
  });

  it('filled ellipse (rx,ry both > 1) uses the library\'s Math.floor scanline width, not the deleted Math.round version - narrower by design, and Ctrl+Z reverts the whole fill as one entry', () => {
    switchToTool(editor, 'ellipse-fill');
    editor.currentChar = 'F';

    // Same rx=8, ry=2 bounding box as the outline test above.
    clickCanvasLocal(editor, 12, 8);
    clickCanvasLocal(editor, 28, 12);

    const canvas = editor.getCoreCanvas();
    // Canvas.drawEllipseFilled() computes each scanline's half-width as
    // Math.floor(rx * sqrt(1 - (dy/ry)^2)). At dy=1 (y=9 or y=11): rx=8,
    // ry=2 -> 8*sqrt(1-0.25) = 8*sqrt(0.75) ~= 6.928 -> floor = 6, so that
    // row spans x=14..26 (center 20 +/- 6). The deleted inline version used
    // Math.round instead - round(6.928) = 7, which would span x=13..27,
    // TWO cells wider - the exact discrepancy fix-round-1 CRITICAL 2 named.
    expect(canvas[9][14].char).toBe('F');  // floor-width row, left edge
    expect(canvas[9][26].char).toBe('F');  // floor-width row, right edge
    expect(canvas[9][13].char).toBe(' ');  // NOT painted - round() would have painted this
    expect(canvas[9][27].char).toBe(' ');  // NOT painted - round() would have painted this

    pressCtrl(editor, 'z');
    const reverted = editor.getCoreCanvas();
    expect(reverted[9][14].char).toBe(' ');
    expect(reverted[10][20].char).toBe(' ');
  });

  /**
   * fix-round-1 CRITICAL 1 regression test - the reviewer's exact repro,
   * driven through addLayer() (Layer > Add Layer, reachable via the
   * top-menu-bar Layer dropdown in both hosts - see report for why this,
   * not the layer-panel row click, is the reachable path). Draw on one
   * layer, switch away (creating a fresh layer), draw again, switch away
   * AGAIN (so the second draw also has a pending undo entry at the moment
   * of the switch), then hit Ctrl+Z with nothing drawn since. Before the
   * fix, addLayer()'s `this.cellCanvas = newLayer.canvas` was a bare
   * assignment that never touched coreState, so coreState stayed pointed at
   * whatever canvas it was last synced to (the second layer, mid-'B'-draw)
   * while this.cellCanvas/activeLayerIndex had already moved to the third
   * layer. Ctrl+Z would then pop the "before B" snapshot and, via
   * syncFromCoreState()'s `this.layers[activeLayerIndex].canvas =
   * this.cellCanvas`, write it into the THIRD layer's slot - silently
   * replacing whatever was there with a snapshot that has nothing to do
   * with it, while the second layer's 'B' was left untouched (not undone)
   * on a layer nobody was even looking at. Fixed by having every
   * non-tool-bracket `this.cellCanvas =` assignment go through
   * adoptCellCanvas(), which resyncs coreState immediately and clears its
   * undo history - so this Ctrl+Z is a documented no-op instead.
   */
  it('switching layers (Layer > Add Layer) twice, then Ctrl+Z with nothing drawn since, corrupts no layer', () => {
    switchToTool(editor, 'draw');
    editor.currentChar = 'A';
    editor.cursor = { line: 1, col: 1 };
    editor.drawAtCursor(false); // layer 0 now has 'A'

    editor.addLayer(); // creates layer 1, switches active to it

    editor.currentChar = 'B';
    editor.cursor = { line: 2, col: 2 };
    editor.drawAtCursor(false); // layer 1 now has 'B' - and a pending undo entry

    editor.addLayer(); // creates layer 2, switches active to it - layer 1's
                        // pending undo entry must not survive this switch

    // Seed layer 2 (now active) with a distinct marker, written directly
    // (not through a tracked tool call) so a corrupting undo can't
    // coincidentally look like a no-op just because layer 2 started blank -
    // if this.layers[2].canvas gets replaced with a stale snapshot array,
    // this cell (and the array reference itself) won't survive.
    const layer2CanvasRef = editor.layers[2].canvas;
    layer2CanvasRef[5][5] = { char: 'Z', fg: 7, bg: 0, blink: false };

    // Nothing has been drawn (through a tool) since the second switch -
    // Ctrl+Z must be a no-op, not a silent write into layer 2.
    pressCtrl(editor, 'z');

    expect(editor.layers[0].canvas[1][1].char).toBe('A'); // untouched
    expect(editor.layers[1].canvas[2][2].char).toBe('B'); // untouched
    expect(editor.layers[2].canvas).toBe(layer2CanvasRef); // same array, not swapped for a stale snapshot
    expect(editor.layers[2].canvas[5][5].char).toBe('Z'); // marker survives
  });

  /**
   * fix-round-1 CRITICAL 1 - the same bug, pinned directly at the exact
   * Layer-panel row click handler the finding named
   * (ansi-editor.ts's layerRow.on('click', ...) inside updateLayerPanel()).
   * createLayerPanel() - the method that builds this.layerPanel and binds
   * that handler - is never called from anywhere in the widget (confirmed
   * by repo-wide grep: the sidebar's layer list/add/delete/merge buttons
   * are all built inside it, and nothing invokes it), so this exact click
   * path is currently unreachable from any host's UI. It is still real code
   * that this task's adoptCellCanvas() fix touches, so it gets its own
   * direct regression test - constructing the panel explicitly (something
   * no current host does) rather than skipping coverage of code the report
   * claims is fixed.
   */
  it('the Layer-panel row click handler itself (currently unreachable dead UI, but real fixed code) does not corrupt a layer on Ctrl+Z either', () => {
    editor.createLayerPanel(); // normally never called - see comment above
    switchToTool(editor, 'draw');
    editor.currentChar = 'A';
    editor.cursor = { line: 1, col: 1 };
    editor.drawAtCursor(false); // layer 0 now has 'A'

    editor.addLayer(); // creates layer 1, switches active to it
    editor.currentChar = 'B';
    editor.cursor = { line: 2, col: 2 };
    editor.drawAtCursor(false); // layer 1 now has 'B' - pending undo entry

    // Switch back to layer 0 via the actual bound click handler.
    // updateLayerPanel() rebuilds children top-layer-first, so layer 0's
    // row is the second child (displayIdx 1) with 2 layers present.
    const layer0Row = editor.layerPanel.children[1];
    layer0Row.emit('click', { button: 'left' });
    expect(editor.activeLayerIndex).toBe(0);

    pressCtrl(editor, 'z');

    expect(editor.layers[0].canvas[1][1].char).toBe('A'); // untouched
    expect(editor.layers[1].canvas[2][2].char).toBe('B'); // untouched
  });

  /**
   * fix-round-1 CRITICAL 1 - the setCoreCanvas() equivalent. The brief
   * named this as "the undo across a canvas resize case" - unreachable only
   * because no host calls setCoreCanvas() yet, which changes when the
   * sprite editor uses it for frame swapping. Same root cause, same fix
   * (adoptCellCanvas()).
   */
  it('setCoreCanvas(), then Ctrl+Z with nothing drawn since, does not resurrect the pre-swap canvas onto the newly swapped-in one', () => {
    switchToTool(editor, 'draw');
    editor.currentChar = 'A';
    editor.cursor = { line: 1, col: 1 };
    editor.drawAtCursor(false); // pending undo entry, tied to the original canvas

    const swappedIn = editor.getCoreCanvas()!.map((row: any[]) => row.map(() => ({ char: ' ', fg: 7, bg: 0, blink: false })));
    swappedIn[3][3] = { char: 'S', fg: 7, bg: 0, blink: false };
    editor.setCoreCanvas(swappedIn);

    pressCtrl(editor, 'z');

    const canvas = editor.getCoreCanvas();
    expect(canvas[3][3].char).toBe('S');   // the swapped-in frame's own content survives
    expect(canvas[1][1].char).toBe(' ');   // the OLD canvas's 'A' must not reappear here
  });

  /**
   * Final-fix-wave IMPORTANT 2. Before this fix, pasteClipboard()/
   * insertRow()/deleteRow()/flipHorizontal()/flipVertical() all mutated
   * this.cellCanvas directly and pushed no undo entry. A Ctrl+Z right
   * after any of them popped the snapshot from BEFORE the unrelated stroke
   * that preceded it, silently discarding both the mutator's own effect
   * and that prior stroke in a single keypress. Each mutator now routes
   * through the library's undo recording (pasteSelection() for paste, an
   * explicit snapshotUndoState() for the other four), so one Ctrl+Z undoes
   * exactly that mutator's own effect and leaves the prior stroke intact.
   */
  describe('canvas mutators are undoable (IMPORTANT 2)', () => {
    it('pasteClipboard is undoable - one Ctrl+Z undoes exactly the paste, not the stroke before it', () => {
      switchToTool(editor, 'draw');
      editor.currentChar = 'A';
      editor.cursor = { line: 1, col: 1 };
      editor.drawAtCursor(false); // unrelated prior stroke, its own undo entry

      editor.clipboard = [[{ char: 'P', fg: 7, bg: 0, blink: false }]];
      editor.cursor = { line: 10, col: 10 };
      editor.pasteClipboard();

      expect(editor.getCoreCanvas()[10][10].char).toBe('P');

      pressCtrl(editor, 'z');

      const canvas = editor.getCoreCanvas();
      expect(canvas[10][10].char).toBe(' '); // the paste is undone
      expect(canvas[1][1].char).toBe('A');   // the prior stroke survives this same keypress
    });

    it('insertRow is undoable - one Ctrl+Z undoes exactly the insert, not the stroke before it', () => {
      switchToTool(editor, 'draw');
      editor.currentChar = 'A';
      editor.cursor = { line: 1, col: 1 };
      editor.drawAtCursor(false); // unrelated prior stroke, above the insertion point

      editor.currentChar = 'M';
      editor.cursor = { line: 5, col: 5 };
      editor.drawAtCursor(false); // marker that insertRow will shift down by one row

      editor.cursor = { line: 2, col: 0 };
      editor.insertRow(); // inserts a blank row at line 2 - row 5's content moves to row 6

      expect(editor.getCoreCanvas()[6][5].char).toBe('M');

      pressCtrl(editor, 'z');

      const canvas = editor.getCoreCanvas();
      expect(canvas[5][5].char).toBe('M'); // shift reverted - marker back at its original row
      expect(canvas[1][1].char).toBe('A'); // prior stroke (above the insert point) untouched
    });

    it('deleteRow is undoable - one Ctrl+Z undoes exactly the delete, not the stroke before it', () => {
      switchToTool(editor, 'draw');
      editor.currentChar = 'A';
      editor.cursor = { line: 1, col: 1 };
      editor.drawAtCursor(false); // unrelated prior stroke, above the deletion point

      editor.currentChar = 'M';
      editor.cursor = { line: 5, col: 5 };
      editor.drawAtCursor(false); // marker that deleteRow will shift up by one row

      editor.cursor = { line: 3, col: 0 };
      editor.deleteRow(); // deletes row 3 - row 5's content moves up to row 4

      expect(editor.getCoreCanvas()[4][5].char).toBe('M');

      pressCtrl(editor, 'z');

      const canvas = editor.getCoreCanvas();
      expect(canvas[5][5].char).toBe('M'); // shift reverted - marker back at its original row
      expect(canvas[1][1].char).toBe('A'); // prior stroke (above the delete point) untouched
    });

    it('flipHorizontal is undoable - one Ctrl+Z undoes exactly the flip, not the stroke before it', () => {
      switchToTool(editor, 'draw');
      editor.currentChar = 'A';
      editor.cursor = { line: 1, col: 1 };
      editor.drawAtCursor(false); // marker, mirrors to (1, canvasW-2) under a full-canvas flip

      editor.flipHorizontal(); // no selection -> flips the whole 80-wide canvas

      const flipped = editor.getCoreCanvas();
      expect(flipped[1][78].char).toBe('A'); // mirrored: col 1 <-> col 78 (width 80)
      expect(flipped[1][1].char).toBe(' ');

      pressCtrl(editor, 'z');

      const canvas = editor.getCoreCanvas();
      expect(canvas[1][1].char).toBe('A');  // the whole flip reverted - back at the original spot
      expect(canvas[1][78].char).toBe(' '); // and not left behind at the mirrored spot too
    });

    it('flipVertical is undoable - one Ctrl+Z undoes exactly the flip, not the stroke before it', () => {
      switchToTool(editor, 'draw');
      editor.currentChar = 'A';
      editor.cursor = { line: 1, col: 5 };
      editor.drawAtCursor(false); // marker, mirrors to (canvasH-2, 5) under a full-canvas flip

      editor.flipVertical(); // no selection -> flips the whole 25-tall canvas

      const flipped = editor.getCoreCanvas();
      expect(flipped[23][5].char).toBe('A'); // mirrored: row 1 <-> row 23 (height 25)
      expect(flipped[1][5].char).toBe(' ');

      pressCtrl(editor, 'z');

      const canvas = editor.getCoreCanvas();
      expect(canvas[1][5].char).toBe('A');  // the whole flip reverted - back at the original spot
      expect(canvas[23][5].char).toBe(' '); // and not left behind at the mirrored spot too
    });
  });
});

describe("ANSIEditor text mode's own undo is unchanged", () => {
  let screen: any;
  let editor: any;

  beforeEach(() => {
    screen = makeScreen();
    editor = new ANSIEditor({ parent: screen, initialMode: 'text' } as any);
  });

  afterEach(() => screen?.destroy());

  it('setContent() pushes text-mode undo snapshots and Ctrl+Z still reverts between them', () => {
    editor.setContent('first');
    editor.setContent('second');

    expect(editor.lines.join('\n')).toBe('second');

    editor.undo();

    expect(editor.lines.join('\n')).toBe('first');
  });
});
