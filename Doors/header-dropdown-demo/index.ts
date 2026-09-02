/**
 * Header Dropdown Demo
 * Inline one-line menu labels with dropdowns (no button widgets).
 */

import {
  ServerDoor as Door,
  type DoorContext,
  DropdownMenu,
  Box,
  type Screen,
  createScreen,
  DoorInputManager,
  createBox
} from '@amiexpress/bbs-door-sdk';
import { T, applyTheme } from './door-theme';

const door = new Door({
  name: 'Header Dropdown Demo',
  version: '1.0.0',
  author: 'AmiExpress',
  description: 'Header dropdown menu bar demo',
});

interface MenuSpec {
  label: string;
  items: { label: string; separator?: boolean; action?: () => void }[];
}

door.onStart(async (ctx: DoorContext) => {
  const { bbs } = ctx;

  if ((bbs as any)?.disableGameMode) {
    (bbs as any).disableGameMode();
  }

  // 1. Create Screen (using helper for Amiga compatibility & tags)
  // The board's theme, before any widget reads a colour from it.
  applyTheme(bbs);

  const screen = createScreen(bbs, {
    dockBorders: true,
    title: 'Header Dropdown Demo',
  });
  screen.program.write('\x1b[2J');
  screen.program.write('\x1b[H');
  screen.clearRegion(0, screen.width, 0, screen.height);
  screen.alloc();

  // 2. Create input manager (dropdown menu door with mouse support)
  const inputManager = new DoorInputManager(ctx, screen, {
    enableGameMode: false,  // Menu UI, not a game
    enableGrabKeys: false,  // Blessed widgets handle their own input
    enableMouse: true,      // Door has dropdown menu mouse support
  });

  // 3. Enable input (handles all input setup automatically)
  inputManager.enable();

  // 4. Setup cleanup on destroy
  screen.on('destroy', () => {
    inputManager.disable();
  });

  // --- UI Construction ---

  // Header Bar (Simple Box, no dockable overhead for speed)
  const header = new Box({
    parent: screen,
    top: 0,
    left: 0,
    width: '100%',
    height: 1, // Single line
    tags: true,
    style: {
      bg: T.bar,
      fg: T.ink,
    },
    // No border
  });

  // Status Panel
  const status = createBox({
    parent: screen,
    top: 1, // Below header
    left: 0,
    width: '100%',
    height: '100%-1', // Fill rest of screen
    label: ` {${T.accent}-fg}Status{/} `,
    style: {
      border: { fg: T.accent },
    },
    content: `{${T.dim}-fg}Use Tab/Shift+Tab to switch menus, Enter/Space to open, Esc to close.{/${T.dim}-fg}`,
  });

  const menuSpecs: MenuSpec[] = [
    {
      label: 'File',
      items: [
        { label: 'New' },
        { label: 'Open' },
        { label: 'Save' },
        { label: '─', separator: true },
        { label: 'Exit', action: () => screen.destroy() },
      ],
    },
    {
      label: 'Edit',
      items: [
        { label: 'Undo' },
        { label: 'Redo' },
        { label: 'Copy' },
        { label: 'Paste' },
      ],
    },
    {
      label: 'View',
      items: [
        { label: 'Zoom In' },
        { label: 'Zoom Out' },
        { label: 'Reset Zoom' },
      ],
    },
    {
      label: 'Help',
      items: [
        { label: 'Help Topics' },
        { label: 'About' },
      ],
    },
  ];

  const labelBoxes: Box[] = [];
  const dropdowns: DropdownMenu[] = [];
  let focusedIndex = 0;
  let activeMenuIndex: number | null = null;

  const updateStatus = (text: string) => {
    status.setContent(text);
    screen.render();
  };

  const updateLabelStyles = () => {
    labelBoxes.forEach((box, index) => {
      const focused = index === focusedIndex;
      box.setContent(focused
        ? `{inverse} ${menuSpecs[index].label} {/inverse}`
        : ` ${menuSpecs[index].label} `
      );
    });
    screen.render();
  };

  const closeActiveMenu = () => {
    if (activeMenuIndex === null) return;
    dropdowns[activeMenuIndex].close();
    activeMenuIndex = null;
  };

  const openMenu = (index: number) => {
    closeActiveMenu();
    activeMenuIndex = index;
    dropdowns[index].openFor(labelBoxes[index]);
  };

  let cursorLeft = 2;
  menuSpecs.forEach((spec, index) => {
    const labelText = ` ${spec.label} `;
    const label = new Box({
      parent: header,
      top: 0, // In single-line header
      left: cursorLeft,
      width: labelText.length,
      height: 1,
      tags: true,
      clickable: true,
      keys: true,
      mouse: true,
      focusable: true,
      style: {
        fg: T.ink,
        bg: T.bar,
        hover: { bg: T.accent, fg: T.ground },
        focus: { bg: T.accent, fg: T.ground },
      },
      content: labelText,
    });

    label.on('focus', () => {
      focusedIndex = index;
      updateLabelStyles();
    });

    label.on('click', () => {
      focusedIndex = index;
      updateLabelStyles();
      openMenu(index);
    });

    label.on('keypress', (_ch: string, key: any) => {
      if (key.name === 'enter' || key.name === 'space' || key.name === 'down') {
        openMenu(index);
        return;
      }
      if (key.name === 'left') {
        focusLabel((index - 1 + labelBoxes.length) % labelBoxes.length);
        return;
      }
      if (key.name === 'right') {
        focusLabel((index + 1) % labelBoxes.length);
        return;
      }
      if (key.name === 'escape') {
        closeActiveMenu();
        return;
      }
    });

    labelBoxes.push(label);

    const dropdown = new DropdownMenu({
      parent: screen,
      label: ` ${spec.label} `,
      items: spec.items.map((item) => ({
        label: item.label,
        separator: item.separator,
        action: () => {
          if (item.action) {
            item.action();
            return;
          }
          updateStatus(`{${T.accent}-fg}Selected:{/${T.accent}-fg} ${spec.label} -> ${item.label}`);
        },
      })),
      // Set dropdown style to light blue (cyan)
      style: {
        bg: T.accent,
        fg: T.ground,
        focus: { bg: T.bar, fg: T.ink }
      } as any
    });

    dropdown.on('select', () => {
      activeMenuIndex = null;
    });

    dropdown.on('tab-next', () => {
      focusLabel((index + 1) % labelBoxes.length);
      openMenu(focusedIndex);
    });

    dropdown.on('tab-prev', () => {
      focusLabel((index - 1 + labelBoxes.length) % labelBoxes.length);
      openMenu(focusedIndex);
    });

    dropdowns.push(dropdown);

    cursorLeft += labelText.length + 1;
  });

  const focusLabel = (index: number) => {
    focusedIndex = index;
    labelBoxes[focusedIndex].focus();
    updateLabelStyles();
  };

  screen.key(['tab'], () => {
    if (activeMenuIndex !== null) return;
    focusLabel((focusedIndex + 1) % labelBoxes.length);
  });

  screen.key(['S-tab'], () => {
    if (activeMenuIndex !== null) return;
    focusLabel((focusedIndex - 1 + labelBoxes.length) % labelBoxes.length);
  });

  screen.key(['escape'], () => {
    closeActiveMenu();
  });

  screen.key(['q', 'Q'], () => {
    screen.destroy();
  });

  updateLabelStyles();
  focusLabel(0);
  screen.render();

  // 4. Await Exit (keeps door alive until screen is destroyed)
  await new Promise<void>((resolve) => {
    if (screen.destroyed) return resolve();
    screen.on('destroy', resolve);
  });
});

export default door;
