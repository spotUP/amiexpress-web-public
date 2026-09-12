/**
 * WHIP's new-task dialog shows its Save and Cancel buttons.
 *
 * The borderless 1-row buttons were in the widget tree - focused, clickable,
 * all green on paper - but never emitted a pixel: the whole dialog had no
 * visible way out except Ctrl+Enter and Escape (screenshot, 2026-09-09).
 * The dialog now uses the SDK ConfirmModal button shape (bordered,
 * height 3), and this test paints the dialog and reads the pixels back.
 *
 * Driven, not read: a real Screen like the door, the real createTask
 * dialog, paint captured out of program.write.
 */

import assert from 'assert';
import { Screen } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import { createTask } from '../ui/task-editor';

function open(): any {
  return new Screen({ title: 'whip', width: 80, height: 25, focusKeys: false } as any);
}

function press(screen: any, ch: string, name: string, extra: any = {}): void {
  screen.program.emit('keypress', ch, { name, full: name, ...extra });
}

const settle = () => new Promise((r) => setTimeout(r, 30));

const project: any = { id: 'p1', name: 'Test', type: 'demo', status: 'planning' };
const user: any = { userId: 'u1' };

// The dialog reads parties once to build the target-party list; storage I/O
// has no business in a paint test.
const dataManager: any = { loadParties: async () => [] };

export async function saveAndCancelButtonsPaint(): Promise<void> {
  const screen = open();
  try {
    const chunks: string[] = [];
    const program = screen.program;
    const origWrite = program.write.bind(program);
    program.write = (s: string) => { chunks.push(String(s)); return origWrite(s); };

    const done = createTask(screen, project, user, dataManager);
    await settle();
    screen.render();
    await settle();

    const painted = chunks.join('');
    assert.ok(painted.includes('Save'), 'the Save button paints');
    assert.ok(painted.includes('Cancel'), 'the Cancel button paints');

    press(screen, '\x1b', 'escape');
    await done;
  } finally { screen.destroy(); }
}

const dataManagerWithUsers: any = {
  loadParties: async () => [],
  loadUsers: async () => ({
    u1: { userId: 'u1', handle: 'spot' },
    u2: { userId: 'u2', handle: 'ace' },
  }),
};

export async function assigneePickerListsHandles(): Promise<void> {
  const screen = open();
  try {
    const chunks: string[] = [];
    const program = screen.program;
    const origWrite = program.write.bind(program);
    program.write = (s: string) => { chunks.push(String(s)); return origWrite(s); };

    const done = createTask(screen, { id: 'p1', name: 'Demo' }, user, dataManagerWithUsers);
    await settle();
    screen.render();
    await settle();

    const painted = chunks.join('');
    assert.ok(painted.includes('Assignee'), 'the Assignee picker paints');
    assert.ok(painted.includes('spot'), 'known handles are offered');
    assert.ok(painted.includes('Demo'), 'the dialog names its project');

    press(screen, '\x1b', 'escape');
    await done;
  } finally { screen.destroy(); }
}
