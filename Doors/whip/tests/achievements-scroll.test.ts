/**
 * The achievements pane scrolls (2026-09-10).
 *
 * No widget binds arrow keys to scrolling, so the focused,
 * scrollable, 30-line pane sat still. Arrows/wheel now drive it
 * (ui/scroll-keys.ts, shared with the leaderboard).
 */

import assert from 'assert';
import { Screen } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import { showAchievements } from '../ui/achievements';

function open(): any {
  return new Screen({ title: 'whip', width: 80, height: 25, focusKeys: false } as any);
}

function press(screen: any, ch: string, name: string, extra: any = {}): void {
  screen.program.emit('keypress', ch, { name, full: name, ...extra });
}

const settle = () => new Promise((r) => setTimeout(r, 30));

const user: any = { userId: 'u1', achievements: [] };
const dataManager: any = {
  loadAchievements: async () => {
    const all: Record<string, any> = {};
    for (let i = 0; i < 20; i++) {
      all[`a${i}`] = { id: `a${i}`, name: `Achievement number ${i}`, description: 'do things', points: 10 };
    }
    return all;
  },
};

function contentOf(screen: any): any {
  let found: any;
  const walk = (el: any): void => {
    if (String(el.options?.label ?? '').includes('Achievements')) found = el;
    (el.children || []).forEach(walk);
  };
  walk(screen);
  return found;
}

export async function arrowsScrollThePane(): Promise<void> {
  const screen = open();
  try {
    const done = showAchievements(screen, user, dataManager);
    await settle();

    const box = contentOf(screen);
    assert.ok(box, 'the achievements pane exists');
    assert.ok(box.options?.scrollbar, 'the pane shows a scrollbar');
    assert.ok(box.getScrollHeight() > 0, 'there is something to scroll');
    assert.strictEqual(box.getScroll(), 0, 'starts at the top');

    press(screen, 'down', 'down');
    await settle();
    press(screen, 'down', 'down');
    await settle();
    assert.ok(box.getScroll() > 0, 'arrows scroll the pane');

    press(screen, 'home', 'home');
    await settle();
    assert.strictEqual(box.getScroll(), 0, 'home returns to the top');

    press(screen, 'q', 'q');
    await done;
  } finally { screen.destroy(); }
}

export async function wheelScrollsThePane(): Promise<void> {
  const screen = open();
  try {
    const done = showAchievements(screen, user, dataManager);
    await settle();

    const box = contentOf(screen);
    box.emit('wheeldown');
    await settle();
    assert.ok(box.getScroll() > 0, 'the wheel scrolls');

    press(screen, 'q', 'q');
    await done;
  } finally { screen.destroy(); }
}
