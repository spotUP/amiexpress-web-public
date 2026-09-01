/**
 * What the studio is allowed to bind, now that it hosts the ANSI editor.
 *
 * In draw mode the widget types every printable character onto the canvas.
 * A single-letter studio hotkey would therefore fire the op AND paint the
 * letter - the same class of defect studio 2c's derived glyph-exclusion
 * set existed to work around, except there is nothing to exclude any more:
 * the studio simply claims no printable key. These are the invariants that
 * keep it that way, asserted on the REAL binding table a constructed
 * EditScreen built, not on the source.
 */

import assert from 'assert';
import { Screen } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import { Sprite } from '@amiexpress/bbs-door-sdk/engines/graphics/cell-art';
import { EditScreen } from '../edit-screen';

function makeSprite(): Sprite {
  return {
    name: 'bindings-fixture',
    cellW: 2,
    cellH: 2,
    animations: {
      idle: {
        ticksPerFrame: 4, loop: true,
        frames: [[[null, null], [null, null]]],
      },
    },
  } as Sprite;
}

async function withBindings(body: (bindings: any[], edit: any) => void): Promise<void> {
  const screen: any = new Screen({ title: 'bindings', responsive: true, width: 80, height: 25 } as any);
  const edit: any = new EditScreen(screen, 'sprite-editor', 'fixture.sprite', makeSprite(), () => {});
  try {
    body(edit.bindingSet.bindings, edit);
  } finally {
    edit.destroy();
    screen.destroy();
  }
}

export async function theStudioBindsNoPrintableCharacter(): Promise<void> {
  await withBindings(bindings => {
    for (const binding of bindings) {
      for (const key of binding.keys) {
        assert.ok(!(key.length === 1 && key >= ' '),
          `'${key}' (binding ${binding.id}) is a printable character - the hosted editor would ` +
          'both run the op and paint the letter onto the canvas');
      }
    }
  });
}

export async function theStudioBindsNoShiftedPrintableEither(): Promise<void> {
  // 'S-x' delivers 'X' to the canvas just as surely as 'x' delivers 'x'.
  await withBindings(bindings => {
    for (const binding of bindings) {
      for (const key of binding.keys) {
        assert.ok(!/^S-.$/.test(key),
          `'${key}' (binding ${binding.id}) is a shifted printable - same problem as a bare letter`);
      }
    }
  });
}

export async function theStudioAvoidsTheWidgetsOwnControlKeys(): Promise<void> {
  // What the ANSIEditor consumes itself in draw mode: Ctrl+S save, Ctrl+M
  // mode, Ctrl+Z undo, Ctrl+Y redo, Ctrl+H half-block sub-row. Binding any
  // of these here would shadow or double-fire the widget's own handling -
  // Ctrl+S in particular would save twice.
  const taken = new Set(['C-s', 'C-m', 'C-z', 'C-y', 'C-h']);
  await withBindings(bindings => {
    for (const binding of bindings) {
      for (const key of binding.keys) {
        assert.ok(!taken.has(key),
          `'${key}' (binding ${binding.id}) collides with the hosted editor's own control key`);
      }
    }
  });
}

export async function saveAndEscapeAreLeftToTheWidgetButStillOffered(): Promise<void> {
  // The widget binds Ctrl+S and ESC and calls the studio's onSave/onExit.
  // The studio must NOT bind them again (double save, double dialog) - but
  // both must still appear as menu entries with their hint, or a sysop has
  // no visible way to discover them.
  await withBindings(bindings => {
    const save = bindings.find((b: any) => b.id === 'file.save');
    assert.ok(save, 'file.save must exist');
    assert.deepStrictEqual(save.keys, [], 'the widget already binds Ctrl+S - binding it here saves twice');
    assert.ok(save.hotkeyHint.includes('C-s'), 'the menu must still show the Ctrl+S hint');

    const close = bindings.find((b: any) => b.id === 'file.closeEditor');
    assert.ok(close, 'file.closeEditor must exist');
    assert.ok(!close.keys.includes('escape'),
      'the widget binds ESC and routes it here - binding it again opens two dialogs');
    assert.ok(close.keys.includes('C-q'), 'C-q stays as the explicit second route out');
  });
}

export async function everyBindingIsReachableFromAMenu(): Promise<void> {
  // With most ops now menu-only this matters more, not less: a menu entry
  // is the ONLY way to reach them.
  await withBindings((bindings, edit) => {
    // bindings.ts renders a menu entry as `Label (hint)` when the binding
    // carries a hotkeyHint, so compare on the label prefix rather than the
    // whole string.
    const labels: string[] = [];
    for (const menu of edit.bindingSet.menuItems()) {
      for (const item of menu.items) labels.push(item.label);
    }
    for (const binding of bindings) {
      assert.ok(labels.some(l => l === binding.label || l.startsWith(`${binding.label} (`)),
        `binding ${binding.id} ('${binding.label}') has no menu entry - it would be unreachable by mouse`);
    }
  });
}

export async function theDrawingOpsAreGoneFromTheStudioTable(): Promise<void> {
  // Cursor movement, colours, glyphs, tools and per-cell painting belong
  // to the widget now. A binding here for any of them would be a second
  // implementation of something the widget already does.
  await withBindings(bindings => {
    const ids = new Set(bindings.map((b: any) => b.id));
    for (const gone of ['cursor.up', 'cursor.down', 'cursor.left', 'cursor.right',
                        'paint.paint', 'paint.eraseAtCursor', 'paint.nextGlyph',
                        'paint.nextFg', 'paint.prevFg', 'paint.nextBg', 'paint.prevBg',
                        'tool.paint', 'tool.erase', 'tool.pick', 'tool.fill',
                        'view.toggleMode']) {
      assert.ok(!ids.has(gone),
        `${gone} must not be in the studio's table - the hosted editor owns drawing`);
    }
  });
}
