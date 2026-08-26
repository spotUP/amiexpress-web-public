/**
 * Toggling the sidebar removes the sidebar.
 *
 * Reported 2026-08-26: "toggle sidebar only clears the content in the
 * sidebar, it doesn't remove the sidebar."
 *
 * It hid the channel list and the user list and left the PANEL standing, so
 * the sidebar went blank and the chat never got the space back. There were
 * also two implementations - F2 went through updateChatLayout, the View menu
 * toggled the lists on its own - so fixing one would have left the other.
 */

import { readFileSync } from 'fs';
import { join } from 'path';

const DOOR = join(__dirname, '..', '..', '..', '..', 'Doors', 'livechat');
const shortcuts = readFileSync(join(DOOR, 'handlers', 'keyboard-shortcuts.ts'), 'utf8');
const server = readFileSync(join(DOOR, 'server.ts'), 'utf8');

describe('hiding the sidebar', () => {
  it('hides the panel, not just the lists inside it', () => {
    expect(shortcuts).toMatch(/sidebarPanel\.hide\(\)/);
    expect(shortcuts).toMatch(/sidebarPanel\.show\(\)/);
  });

  it('lets the door lay the rest out', () => {
    // This function used to recompute the chat panel's left and width
    // itself - a second source of truth for the same arithmetic, which knew
    // nothing about what the solver decides.
    expect(shortcuts).toMatch(/relayout\?\.\(\)/);
    expect(shortcuts).not.toMatch(/cl as any\)\.position\.width = wd/);
  });
});

describe('the two ways to toggle it', () => {
  it('share one implementation', () => {
    expect(shortcuts).toMatch(/toggleSidebar: \(\) => \{/);
    expect(server).toMatch(/const \{ updateChatLayout, toggleSidebar \}/);
  });

  it('is what the View menu calls', () => {
    // The menu used to toggle the lists directly, reproducing the bug by
    // another route.
    const handler = server.slice(server.indexOf('onToggleSidebar:'), server.indexOf('onToggleSidebar:') + 400);

    expect(handler).toMatch(/toggleSidebar\(\)/);
    expect(handler).not.toMatch(/channelList\.toggle\(\)/);
  });
});
