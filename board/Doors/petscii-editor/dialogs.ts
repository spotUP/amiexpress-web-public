/**
 * The requesters.
 *
 * A PETSCII screen is forty columns by twenty-five rows, which is the whole
 * of a C64's glass - so there is nowhere to put a permanent toolbar without
 * taking a row of the art. Everything that is not the canvas appears over it,
 * does its job and goes away. That is the sprite studio's own rule
 * (`Doors/sprite-editor/studio.ts`), and at forty columns it stops being a
 * preference.
 *
 * `screen.dialogOpen` is set HERE, around the await, and nowhere else. A call
 * site only awaits a promise. The fork base carries the scars of the other
 * arrangement: four separate leaks where a new consumer opened a requester
 * and forgot to arm the guard.
 */

import { Box, List, Textbox, ConfirmModal } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import { T } from './door-theme';

/** A requester never wider than the glass it sits on. */
function requesterWidth(screen: any, wanted: number): number {
  return Math.min(wanted, Math.max(20, screen.width - 2));
}

/** A centred single-line prompt. Resolves the trimmed value, or null on Escape. */
export function promptText(screen: any, title: string, initial = ''): Promise<string | null> {
  screen.dialogOpen = true;
  return new Promise<string | null>((resolve) => {
    const box = new Box({
      parent: screen,
      top: 'center', left: 'center', width: requesterWidth(screen, 38), height: 3,
      label: ` ${title} `,
      tags: true,
      border: { type: 'line' },
      style: { border: { fg: T.accent }, fg: T.ink, bg: T.ground },
    });
    const input = new Textbox({
      parent: box,
      top: 0, left: 1, width: '100%-2', height: 1,
      value: initial,
      mouse: true,
      style: { fg: T.ink, focus: { fg: T.accent } },
    });

    const finish = (value: string | null): void => {
      input.destroy();
      box.destroy();
      screen.dialogOpen = false;
      screen.render();
      resolve(value);
    };

    input.on('submit', (value: string) => {
      const trimmed = (value ?? '').trim();
      if (!trimmed) return;               // an empty name is not a name; stay open
      finish(trimmed);
    });
    input.on('cancel', () => finish(null));

    box.setFront();
    input.focus();
    screen.render();
  });
}

/** A list to pick from. Resolves the chosen index, or null on Escape. */
export function chooseFrom(
  screen: any,
  title: string,
  items: string[],
): Promise<number | null> {
  screen.dialogOpen = true;
  return new Promise<number | null>((resolve) => {
    const height = Math.min(screen.height - 2, Math.max(3, items.length + 2));
    const list = new List({
      parent: screen,
      top: 'center', left: 'center',
      width: requesterWidth(screen, 36), height,
      label: ` ${title} `,
      items: items.length > 0 ? items : ['(nothing here yet)'],
      interactive: items.length > 0,
      keys: true, mouse: true, vi: false,
      border: { type: 'line' },
      style: {
        border: { fg: T.accent },
        item: { fg: T.ink },
        selected: { fg: T.ground, bg: T.accent },
      },
    } as any);

    const finish = (index: number | null): void => {
      list.destroy();
      screen.dialogOpen = false;
      screen.render();
      resolve(index);
    };

    list.on('select', (_item: unknown, index: number) => finish(items.length > 0 ? index : null));
    list.key(['escape'], () => finish(null));

    list.setFront();
    list.focus();
    screen.render();
  });
}

/** A message to read and dismiss. */
export function notice(screen: any, title: string, message: string): Promise<void> {
  screen.dialogOpen = true;
  return new Promise<void>((resolve) => {
    const box = new Box({
      parent: screen,
      top: 'center', left: 'center',
      width: requesterWidth(screen, 36), height: 5,
      label: ` ${title} `,
      content: message,
      tags: false,
      border: { type: 'line' },
      style: { border: { fg: T.accent }, fg: T.ink, bg: T.ground },
    });

    const finish = (): void => {
      box.destroy();
      screen.dialogOpen = false;
      screen.render();
      resolve();
    };

    box.key(['escape', 'enter', 'space'], finish);
    box.setFront();
    box.focus();
    screen.render();
  });
}

/**
 * A FULL PAGE OF HELP, which is the first thing this door shows.
 *
 * "petscii edit needs a help screen when it starts" (the sysop, 2026-09-23).
 * Nothing on the canvas says which key draws a corner or picks a colour, and
 * the answer is a C64's own chords rather than anything a caller can guess
 * from an empty screen - so the door opens by saying so, once, and F1 says it
 * again whenever it is asked.
 *
 * It takes the whole glass on purpose: at forty columns a bordered box inside
 * a box would leave thirty-four columns for two columns of key names.
 */
export function helpScreen(screen: any, lines: string[]): Promise<void> {
  screen.dialogOpen = true;
  return new Promise<void>((resolve) => {
    const box = new Box({
      parent: screen,
      top: 0, left: 0, width: screen.width, height: screen.height,
      content: lines.join('\n'),
      tags: false,
      style: { fg: T.ink, bg: T.ground },
    });

    const finish = (): void => {
      box.destroy();
      screen.dialogOpen = false;
      screen.render();
      resolve();
    };

    box.key(['escape', 'enter', 'space', 'f1'], finish);
    box.setFront();
    box.focus();
    screen.render();
  });
}

/** A yes/no for something that cannot be taken back. */
export function confirm(screen: any, message: string): Promise<boolean> {
  screen.dialogOpen = true;
  return new Promise<boolean>((resolve) => {
    const finish = (result: boolean): void => {
      // hide() before destroy(): ConfirmModal traps focus, and Element.hide()
      // is what releases the trap - but only while the widget is not yet
      // destroyed.
      modal.hide();
      modal.destroy();
      screen.dialogOpen = false;
      screen.render();
      resolve(result);
    };

    const modal = new ConfirmModal({
      parent: screen,
      message,
      confirmColor: 'red',
      cancelColor: 'green',
      style: { border: { fg: T.warn } },
      onConfirm: () => finish(true),
      onCancel: () => finish(false),
    } as any);

    modal.display();
  });
}
