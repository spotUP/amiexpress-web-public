/**
 * The new-project form shows what each field is for.
 *
 * Its four labels - Project Name, Type, Status, Description - were one-row
 * `createBox` calls with no border key, so each took Panel's line border, and
 * a one-row box with a frame has no interior. The form asked for four values
 * and named none of them.
 *
 * Driven, not read: a real Screen, the real form, and the bytes it painted.
 */

import assert from 'assert';
import { Screen } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import { createProject } from '../ui/project-list';

const LABELS = ['Project Name:', 'Type:', 'Status:', 'Description (optional):'];

async function openForm(): Promise<{ screen: any; painted: string }> {
  const writes: string[] = [];
  const screen: any = new Screen({
    title: 'whip', width: 80, height: 25,
    output: (d: string) => writes.push(d),
  } as any);

  const user: any = { username: 'sysop', level: 1, xp: 0, achievements: [] };
  const dataManager: any = {
    loadProjects: async () => [],
    saveProject: async () => {},
    createProject: async () => {},
  };
  const achievementManager: any = { checkAchievements: async () => [], unlock: async () => {} };

  void createProject(screen, user, dataManager, achievementManager);
  await new Promise((r) => setTimeout(r, 120));

  return { screen, painted: writes.join('') };
}

function boxWithContent(screen: any, text: string): any {
  const walk = (node: any): any => {
    for (const child of node.children ?? []) {
      if (String(child.options?.content ?? '') === text) return child;
      const found = walk(child);
      if (found) return found;
    }
    return undefined;
  };
  return walk(screen);
}

export async function everyFieldLabelIsALabelNotAFramedBox(): Promise<void> {
  const { screen } = await openForm();
  try {
    for (const text of LABELS) {
      const label = boxWithContent(screen, text);
      assert.ok(label, `the form must carry a "${text}" label`);
      assert.ok(!label.border,
        `"${text}" is one row high - a frame would leave it no interior to draw in`);
    }
  } finally { screen.destroy(); }
}

export async function theLabelsReachTheScreen(): Promise<void> {
  const { screen, painted } = await openForm();
  try {
    const squeezed = painted
      .replace(/\x1b\][^\x07]*\x07/g, '')
      .replace(/\x1b\[[0-9;?]*[a-zA-Z]/g, '')
      .replace(/\s+/g, '');

    for (const text of LABELS) {
      assert.ok(squeezed.includes(text.replace(/\s+/g, '')),
        `"${text}" is painted, not swallowed by its own border`);
    }
  } finally { screen.destroy(); }
}
