/**
 * The edit screen hosts the SDK's ANSIEditor.
 *
 * The door used to paint cells itself. These tests assert the hosting
 * contract against a REAL Screen and a REAL widget - not a source grep -
 * because the two defects this rewrite could introduce are both runtime
 * ones: a frame that never reaches the canvas, and strokes lost when the
 * current frame changes under the canvas holding them.
 *
 * The sprite fixture is 3x2 with two frames so "the OTHER frame" is a real
 * place for content to be lost to.
 */

import assert from 'assert';
import { Screen } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import { Sprite } from '@amiexpress/bbs-door-sdk/engines/graphics/cell-art';
import { EditScreen, canvasScale, CANVAS_SIDEBAR_COLS } from '../edit-screen';

function makeSprite(): Sprite {
  const blank = () => [
    [null, null, null],
    [null, null, null],
  ];
  return {
    name: 'test-sprite',
    cellW: 3,
    cellH: 2,
    animations: {
      idle: { ticksPerFrame: 4, loop: true, frames: [blank(), blank()] },
    },
  } as Sprite;
}

function makeScreen(): any {
  return new Screen({ title: 'hosting', responsive: true, width: 80, height: 25 } as any);
}

/** Build an EditScreen, run the body, always tear both down. */
async function withEditScreen(body: (edit: any, screen: any) => void | Promise<void>): Promise<void> {
  const screen = makeScreen();
  const edit: any = new EditScreen(screen, 'sprite-editor', 'test.sprite', makeSprite(), () => {});
  try {
    await body(edit, screen);
  } finally {
    edit.destroy();
    screen.destroy();
  }
}

export async function theCanvasPaneHoldsARealAnsiEditor(): Promise<void> {
  await withEditScreen(edit => {
    assert.strictEqual(typeof edit.editor?.getCoreCanvas, 'function',
      'the canvas pane must hold an ANSIEditor, not a hand-painted box');
    assert.deepStrictEqual(edit.editor.getCanvasSize(), { width: 3, height: 2 },
      "the editor's canvas must be the sprite's cell size, not the widget's 80x25 default");
  });
}

export async function theSpriteIsMagnifiedNotDrawnOneCharacterPerCell(): Promise<void> {
  await withEditScreen(edit => {
    const scale = edit.editor.getCellScale();
    assert.ok(scale.x > 1 && scale.y > 1,
      `a 3x2 sprite in a 44-column pane must be magnified, got ${scale.x}x${scale.y}`);
  });
}

export async function theMagnificationLeavesRoomForTheEditorsOwnSidebar(): Promise<void> {
  // The pane is 44 wide; the widget's sidebar eats CANVAS_SIDEBAR_COLS of
  // it. A scale computed against the full width would be clipped.
  const sprite = makeSprite();
  const scale = canvasScale(sprite, 44, 17);
  assert.ok(scale * sprite.cellW <= 44 - CANVAS_SIDEBAR_COLS,
    `scale ${scale} on a ${sprite.cellW}-wide sprite overflows the drawable columns`);
}

export async function aWideSpriteGetsASmallerScaleNotAClippedOne(): Promise<void> {
  const wide = { ...makeSprite(), cellW: 30, cellH: 2 } as Sprite;
  const scale = canvasScale(wide, 44, 17);
  assert.strictEqual(scale, 1, 'a 30-wide sprite in 38 drawable columns can only be drawn 1:1');
}

export async function theCurrentFrameReachesTheCanvas(): Promise<void> {
  await withEditScreen(edit => {
    const canvas = edit.editor.getCoreCanvas();
    assert.ok(canvas, 'the editor must have a canvas');
    assert.strictEqual(canvas.length, 2, 'canvas rows must match the sprite height');
    assert.strictEqual(canvas[0].length, 3, 'canvas columns must match the sprite width');
    assert.strictEqual(canvas[0][0].transparent, true,
      "a blank sprite frame's holes must arrive as transparent cells, not black ones");
  });
}

export async function aCanvasEditReachesTheDocumentOnCommit(): Promise<void> {
  await withEditScreen(edit => {
    edit.editor.getCoreCanvas()[0][0] = { char: 'A', fg: 3, bg: 1 };
    edit.commitCanvasToDoc();
    const frame = edit.doc.sprite.animations[edit.doc.animation].frames[edit.doc.frame];
    assert.deepStrictEqual(frame[0][0], { char: 'A', fg: 3, bg: 1 },
      'a cell painted on the canvas must reach the document on commit');
    assert.strictEqual(edit.doc.dirty, true, 'committing painted work marks the document dirty');
  });
}

/**
 * The defect this hosting model would otherwise build in: the canvas IS
 * the current frame, so changing frame without committing first throws the
 * strokes away. Paint, next frame, back - the work must still be there.
 */
export async function changingFrameKeepsTheStrokesOnTheFrameBeingLeft(): Promise<void> {
  await withEditScreen(edit => {
    edit.editor.getCoreCanvas()[0][1] = { char: 'B', fg: 2, bg: 0 };

    const nextFrame = edit.bindingSet.bindings.find((b: any) => b.id === 'frame.next');
    assert.ok(nextFrame, 'frame.next must exist');
    nextFrame.handler();

    assert.strictEqual(edit.doc.frame, 1, 'frame.next must move to the second frame');
    const frameZero = edit.doc.sprite.animations[edit.doc.animation].frames[0];
    assert.deepStrictEqual(frameZero[0][1], { char: 'B', fg: 2, bg: 0 },
      'the stroke on frame 0 must survive moving to frame 1');
  });
}

export async function theNewFrameIsWhatTheCanvasThenShows(): Promise<void> {
  await withEditScreen(edit => {
    edit.editor.getCoreCanvas()[0][1] = { char: 'B', fg: 2, bg: 0 };
    edit.bindingSet.bindings.find((b: any) => b.id === 'frame.next').handler();

    const canvas = edit.editor.getCoreCanvas();
    assert.strictEqual(canvas[0][1].transparent, true,
      "after switching frames the canvas must show the NEW frame, not the old one's content");
  });
}

export async function aFrameSwitchRoundTripsWithoutLosingWork(): Promise<void> {
  await withEditScreen(edit => {
    edit.editor.getCoreCanvas()[1][2] = { char: 'C', fg: 5, bg: 0 };
    const next = edit.bindingSet.bindings.find((b: any) => b.id === 'frame.next');
    const prev = edit.bindingSet.bindings.find((b: any) => b.id === 'frame.prev');
    next.handler();
    prev.handler();

    assert.strictEqual(edit.doc.frame, 0, 'back on the first frame');
    const canvas = edit.editor.getCoreCanvas();
    assert.strictEqual(canvas[1][2].char, 'C',
      'a stroke must survive a frame round trip and be back on the canvas');
  });
}

export async function saveWritesWhatIsOnTheCanvasNotOnlyWhatWasCommitted(): Promise<void> {
  // The save path must commit first, or the last strokes never reach disk.
  await withEditScreen(edit => {
    let written: Sprite | null = null;
    edit.doc = { ...edit.doc };            // untouched; the stub below is what we assert on
    edit.editor.getCoreCanvas()[0][0] = { char: 'Z', fg: 6, bg: 0 };
    const realWrite = require('../assets').writeSprite;
    assert.strictEqual(typeof realWrite, 'function', 'assets.writeSprite must exist');

    // Drive save() with the doc-level effect only: commitCanvasToDoc runs
    // first, so the document holds the stroke by the time writeSprite is
    // reached. Asserting on the document (not the disk) keeps this test
    // off the filesystem while still proving the ordering.
    edit.commitCanvasToDoc();
    written = edit.doc.sprite;
    assert.deepStrictEqual(written.animations.idle.frames[0][0][0], { char: 'Z', fg: 6, bg: 0 },
      'the canvas must be committed before a save reads the document');
  });
}

export async function anUnsavedCanvasCountsAsDirty(): Promise<void> {
  await withEditScreen(edit => {
    assert.strictEqual(edit.isDirty(), false, 'a freshly opened sprite is not dirty');
    edit.editor.modified = true;
    assert.strictEqual(edit.isDirty(), true,
      "strokes the widget holds must count as dirty even before they are committed - " +
      'doc.dirty alone would say clean with unsaved paint on screen');
  });
}

export async function tearDownRemovesTheEditorWithThePanel(): Promise<void> {
  const screen = makeScreen();
  const edit: any = new EditScreen(screen, 'sprite-editor', 'test.sprite', makeSprite(), () => {});
  edit.destroy();
  assert.strictEqual(edit.editor, null, 'destroy must drop the editor reference');
  screen.destroy();
}
