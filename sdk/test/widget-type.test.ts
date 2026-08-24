/**
 * Widget `type` regression tests.
 *
 * Symptom (GRANDMASTER lobby, reported live 2026-08-25): "if i type o in the
 * chat input it switches back to the game tab".
 *
 * MultiplayerLobby guards every single-letter screen shortcut behind
 * widgetHasFocus(), which asks whether the focused element is a text-entry
 * widget:
 *
 *     const type = (focused as any).type;
 *     return type === 'list' || type === 'textbox' || type === 'textarea' || ...
 *
 * Several higher-level widgets defined a `type` getter, but Element and the
 * base widgets (Textbox, Textarea, List, Box, Button, Listbar) never did -
 * so for those `type` was permanently `undefined` and the guard ALWAYS
 * returned false. Every lobby shortcut therefore fired while the user typed
 * in the chat box: 'o' jumped to the Game tab, 's' started the match, and
 * 'q'/ESC left the lobby entirely.
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { Screen, Box, Button, List, Textbox } from '../engines/ui/blessed';

/** The exact predicate MultiplayerLobby.widgetHasFocus() applies. */
function isTextEntryFocused(focused: any): boolean {
  if (!focused || typeof focused !== 'object') return false;
  const type = focused.type;
  return type === 'list' || type === 'listbar' || type === 'textbox' ||
         type === 'textarea' || type === 'input';
}

describe('widget type', () => {
  let screen: Screen;

  beforeEach(() => {
    screen = new Screen({ title: 'Widget Type Test' });
  });

  afterEach(() => {
    if (screen && !screen.destroyed) screen.destroy();
  });

  it('identifies the base widgets rather than reporting undefined', () => {
    expect(new Textbox({ parent: screen } as any).type).toBe('textbox');
    expect(new List({ parent: screen, items: [] } as any).type).toBe('list');
    expect(new Button({ parent: screen, content: 'x' } as any).type).toBe('button');
    expect(new Box({ parent: screen } as any).type).toBe('box');
  });

  it('suppresses single-letter shortcuts while a text box has focus', () => {
    const input = new Textbox({ parent: screen } as any);
    input.focus();

    // getFocused(), NOT `screen.focused` - the latter is Element's inherited
    // "am I focused" BOOLEAN, which is exactly the trap that made the lobby's
    // guard useless.
    expect(isTextEntryFocused(screen.getFocused())).toBe(true);
    expect(typeof (screen as any).focused).toBe('boolean');
  });

  it('allows shortcuts when focus is on a plain button, not a text box', () => {
    const button = new Button({ parent: screen, content: ' Start ' } as any);
    button.focus();

    expect(isTextEntryFocused(screen.getFocused())).toBe(false);
  });
});
