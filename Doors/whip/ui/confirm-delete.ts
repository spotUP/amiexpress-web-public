/**
 * The one delete confirmation this door asks.
 *
 * There were two copies of it - one in the project list, one on the kanban
 * board - each building a raw `blessed.question` box with its own frame,
 * its own colours and no focus trap, which is the shape that produced five
 * separate reports against CARD LOBBY on 2026-09-02. `ConfirmModal` is the
 * SDK's, takes the caller's theme, traps input while it is up, and paints
 * the destructive answer red and the safe one green.
 */

import { ConfirmModal } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import type { Screen } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import { S } from '../door-theme';

/**
 * Ask before deleting something.
 *
 * @param kind what is being deleted, lower case - "project", "task"
 * @param name its name, shown in quotes
 */
export function confirmDelete(screen: Screen, kind: string, name: string): Promise<boolean> {
  return new Promise((resolve) => {
    let settled = false;

    const answer = (value: boolean): void => {
      if (settled) return;
      settled = true;
      // Destroyed, not hidden: this opens once per delete, and ConfirmModal's
      // own close only hides - a hidden modal stays among the screen's
      // children for the rest of the session.
      modal.destroy();
      screen.render();
      resolve(value);
    };

    const modal = new ConfirmModal({
      parent: screen,
      title: `Delete ${kind}`,
      message: `Delete ${kind} "${name}"?`,
      confirmText: '[ Delete ]',
      cancelText: '[ Cancel ]',
      confirmColor: 'red',
      cancelColor: 'green',
      themeStyles: S,
      onConfirm: () => answer(true),
      onCancel: () => answer(false),
    });

    modal.display();
  });
}
