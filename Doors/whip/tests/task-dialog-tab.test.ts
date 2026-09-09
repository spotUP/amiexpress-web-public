/**
 * WHIP's new-task dialog keeps Tab and Enter.
 *
 * WHIP runs with focusKeys:false (arrows must never yank focus out of its
 * lists), which also switches off the screen's default Tab navigation - and
 * neither editor moved focus itself, so the dialog was stuck in the title
 * input: Tab went nowhere and Enter (a textbox submit nobody listened for)
 * did nothing visible (2026-09-09). The dialog now traps focus to the modal
 * and advances it: Tab/Shift-Tab cycle, Enter steps to the next field.
 *
 * Driven, not read: a real Screen with focusKeys:false like the door, the
 * real createTask dialog, real keys through `program.emit('keypress')`.
 */

import assert from 'assert';
import { Screen } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import { createTask } from '../ui/task-editor';

// The dialog reads parties once to build the target-party list; everything
// else under test is keys and focus. The real DataManager does door storage
// I/O, which has no business in a key-routing test.
const dataManager: any = { loadParties: async () => [] };

function open(): any {
  // focusKeys:false is the whole point - it mirrors Doors/whip/app.ts.
  return new Screen({ title: 'whip', width: 80, height: 25, focusKeys: false } as any);
}

function press(screen: any, ch: string, name: string, extra: any = {}): void {
  screen.program.emit('keypress', ch, { name, full: name, ...extra });
}

const settle = () => new Promise((r) => setTimeout(r, 30));

const project: any = { id: 'p1', name: 'Test', type: 'demo', status: 'planning' };
const user: any = { userId: 'u1' };

export async function tabLeavesTheTitleInput(): Promise<void> {
  const screen = open();
  try {
    const done = createTask(screen, project, user, dataManager);
    await settle();

    const title = screen.getFocused();
    assert.ok(title, 'the dialog starts in the title input');

    press(screen, '\t', 'tab');
    await settle();

    assert.notStrictEqual(screen.getFocused(), title, 'Tab moves focus out of the title input');
    assert.ok(screen.getFocused(), 'focus lands on another widget, not nowhere');

    press(screen, '\x1b', 'escape');
    await done;
  } finally { screen.destroy(); }
}

export async function enterStepsToTheNextField(): Promise<void> {
  const screen = open();
  try {
    const done = createTask(screen, project, user, dataManager);
    await settle();

    const title = screen.getFocused();
    assert.ok(title, 'the dialog starts in the title input');

    press(screen, '\r', 'enter');
    await settle();

    assert.notStrictEqual(screen.getFocused(), title, 'Enter advances out of the title input');

    press(screen, '\x1b', 'escape');
    await done;
  } finally { screen.destroy(); }
}

export async function shiftTabCyclesBackwards(): Promise<void> {
  const screen = open();
  try {
    const done = createTask(screen, project, user, dataManager);
    await settle();

    const title = screen.getFocused();
    press(screen, '\t', 'tab');
    await settle();
    const second = screen.getFocused();
    assert.notStrictEqual(second, title, 'Tab moves forward first');

    press(screen, '\t', 'tab', { shift: true });
    await settle();

    assert.strictEqual(screen.getFocused(), title, 'Shift-Tab returns to the title input');

    press(screen, '\x1b', 'escape');
    await done;
  } finally { screen.destroy(); }
}
