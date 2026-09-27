/**
 * New task: type the title, press Enter, and it is saved.
 *
 * Sysop, 2026-09-27: "When you create a new task, type the title and press
 * Enter - that should trigger OK at once." Enter in the title used to step
 * to the Category list, and a quick task needed Tab through six fields to
 * reach Save. Enter in a NEW task's title is now Save; the blank-title
 * refusal still holds, and the caller can type straight on after it.
 *
 * Driven: a real Screen with focusKeys:false like the door, the real
 * createTask dialog, the title typed key by key through program.emit.
 */

import assert from 'assert';
import { Screen } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import { createTask } from '../ui/task-editor';

const project: any = { id: 'p1', name: 'Demo', type: 'demo', status: 'active' };
const user: any = { userId: 'u1', handle: 'tester' };

function open(): any {
  return new Screen({ title: 'whip', width: 80, height: 25, focusKeys: false } as any);
}

function press(screen: any, ch: string, name: string, extra: any = {}): void {
  screen.program.emit('keypress', ch, { name, full: name, ...extra });
}

function type(screen: any, text: string): void {
  for (const ch of text) press(screen, ch, ch.toLowerCase());
}

const settle = () => new Promise((r) => setTimeout(r, 30));

function findByLabel(screen: any, label: string): any {
  let found: any;
  const walk = (el: any): void => {
    if (String(el.options?.label ?? '') === label) found = el;
    (el.children || []).forEach(walk);
  };
  walk(screen);
  return found;
}

function recordingDataManager(added: any[]): any {
  return {
    loadUsers: async () => ({}),
    loadProjects: async () => [project],
    addTask: async (t: any) => { added.push({ ...t }); },
  };
}

export async function enterInANewTaskTitleSavesAtOnce(): Promise<void> {
  const screen = open();
  const added: any[] = [];
  try {
    const dialog = createTask(screen, project, user, recordingDataManager(added));
    await settle();

    type(screen, 'Rip');
    press(screen, '\r', 'enter');
    await settle();
    await settle();

    assert.strictEqual(added.length, 1, 'Enter in the title saved the task - no Tab down to Save');
    assert.strictEqual(added[0].title, 'Rip');
    const result = await dialog;
    assert.ok(result, 'the dialog closed with the saved task');
    assert.strictEqual(findByLabel(screen, ' Title '), undefined, 'and it is gone from the screen');
  } finally {
    screen.destroy();
  }
}

export async function enterOnABlankNewTitleIsRefusedAndTheCallerTypesOn(): Promise<void> {
  const screen = open();
  const added: any[] = [];
  try {
    const dialog = createTask(screen, project, user, recordingDataManager(added));
    await settle();

    press(screen, '\r', 'enter');
    await settle();
    await settle();
    assert.strictEqual(added.length, 0, 'a blank title is never stored');
    assert.ok(findByLabel(screen, ' Error '), 'the caller is told why');

    // Dismiss the error. KNOWN SDK DEFECT, not pinned here: a dismissed
    // blessed message hands focus back to ITSELF (Message.display pushes it
    // with focusPush AND trapFocus; hide's releaseFocusTrap then focusPops
    // the message), so a second Enter is needed before keys reach the title
    // again. This test presses until focus is back in the title, at most
    // three times, and pins only what the door owns.
    const error = findByLabel(screen, ' Error ');
    const title = findByLabel(screen, ' Title ');
    for (let i = 0; i < 3 && screen.getFocused() !== title; i++) {
      press(screen, '\r', 'enter');
      await settle();
    }
    assert.ok(error.hidden, 'the error was dismissed');
    assert.strictEqual(added.length, 0, 'dismissing the error saves nothing');
    // assert.ok, not strictEqual: a failing strictEqual on two blessed
    // elements inspects both whole widget graphs and never returns.
    assert.ok(screen.getFocused() === title, 'the caller is back in the title of the still-open dialog');
    type(screen, 'Gfx');
    press(screen, '\r', 'enter');
    await settle();
    await settle();

    assert.strictEqual(added.length, 1, 'the retyped title saves on Enter');
    assert.strictEqual(added[0].title, 'Gfx');
    await dialog;
  } finally {
    screen.destroy();
  }
}
