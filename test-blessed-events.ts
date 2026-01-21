/**
 * Blessed Event Diagnostic Test
 * Tests: mouse events, keyboard, dropdowns, focus, hover
 */

import {
  ServerDoor as Door,
  type DoorContext,
  createScreen,
  createBox,
  DoorInputManager,
  DropdownMenu,
} from './sdk';

const door = new Door({
  name: 'Blessed Event Diagnostics',
  version: '1.0.0',
  author: 'Debug',
  description: 'Tests blessed event handling',
});

door.onStart(async (ctx: DoorContext) => {
  const { bbs } = ctx;

  console.log('[DIAG] Creating screen...');
  const screen = createScreen(bbs, { title: 'Event Diagnostics' });

  // TEST CONFIGURATION - Try different combinations
  const config = {
    enableGameMode: false,  // Should be FALSE for blessed UI
    enableGrabKeys: false,  // Should be FALSE for menus/buttons
    enableMouse: true,      // Should be TRUE
  };

  console.log('[DIAG] Input config:', config);
  const inputManager = new DoorInputManager(ctx, screen, {
    ...config,
    debug: true,
    debugName: 'EventDiag',
  });

  inputManager.enable();

  screen.on('destroy', () => {
    console.log('[DIAG] Screen destroyed, cleaning up');
    inputManager.disable();
  });

  // Event Log Display
  const logBox = createBox({
    parent: screen,
    top: 0,
    left: 0,
    width: '100%',
    height: '50%',
    label: ' Event Log ',
    border: { type: 'line', fg: 'cyan' },
    scrollable: true,
    alwaysScroll: true,
    mouse: true,
    tags: true,
  });

  const logs: string[] = [];
  const addLog = (msg: string) => {
    const timestamp = new Date().toISOString().split('T')[1].slice(0, -1);
    logs.push(`{gray-fg}[${timestamp}]{/} ${msg}`);
    if (logs.length > 100) logs.shift();
    logBox.setContent(logs.join('\n'));
    screen.render();
  };

  addLog('{cyan-fg}[INIT]{/} Diagnostic test started');
  addLog(`{yellow-fg}[CONFIG]{/} GameMode: ${config.enableGameMode}, GrabKeys: ${config.enableGrabKeys}, Mouse: ${config.enableMouse}`);

  // Test Panel with Hover
  const hoverPanel = createBox({
    parent: screen,
    top: '50%',
    left: 0,
    width: '50%',
    height: '50%-1',
    label: ' Hover Test ',
    border: { type: 'line', fg: 'green' },
    style: {
      bg: 'black',
      fg: 'white',
      hover: { bg: 'green', fg: 'black' },
      focus: { bg: 'blue', fg: 'white' },
    },
    content: 'Hover over me!\n\nClick to focus.\n\nPress TAB to test navigation.',
    mouse: true,
    clickable: true,
    focusable: true,
    keys: true,
    tags: true,
  });

  hoverPanel.on('mouseenter', () => addLog('{green-fg}[MOUSE]{/} Panel ENTER'));
  hoverPanel.on('mouseleave', () => addLog('{green-fg}[MOUSE]{/} Panel LEAVE'));
  hoverPanel.on('mousemove', () => addLog('{gray-fg}[MOUSE]{/} Panel MOVE'));
  hoverPanel.on('click', () => addLog('{cyan-fg}[MOUSE]{/} Panel CLICK'));
  hoverPanel.on('focus', () => addLog('{blue-fg}[FOCUS]{/} Panel FOCUSED'));
  hoverPanel.on('blur', () => addLog('{yellow-fg}[FOCUS]{/} Panel BLURRED'));

  // Test Button with Click
  const testButton = createBox({
    parent: screen,
    top: '50%',
    left: '50%',
    width: '50%',
    height: 3,
    label: ' Click Test ',
    border: { type: 'line', fg: 'yellow' },
    content: '{center}CLICK ME{/center}',
    style: {
      bg: 'black',
      fg: 'white',
      hover: { bg: 'yellow', fg: 'black' },
      focus: { bg: 'blue', fg: 'white' },
    },
    mouse: true,
    clickable: true,
    focusable: true,
    keys: true,
    tags: true,
  });

  testButton.on('click', () => addLog('{yellow-fg}[CLICK]{/} Button CLICKED!'));
  testButton.on('mouseenter', () => addLog('{yellow-fg}[MOUSE]{/} Button ENTER'));
  testButton.on('mouseleave', () => addLog('{yellow-fg}[MOUSE]{/} Button LEAVE'));
  testButton.on('focus', () => addLog('{blue-fg}[FOCUS]{/} Button FOCUSED'));

  // Test Dropdown Menu
  const menuButton = createBox({
    parent: screen,
    top: '50%+3',
    left: '50%',
    width: 20,
    height: 3,
    label: ' Dropdown Test ',
    border: { type: 'line', fg: 'magenta' },
    content: '{center}OPEN MENU{/center}',
    style: {
      bg: 'black',
      fg: 'white',
      hover: { bg: 'magenta', fg: 'white' },
    },
    mouse: true,
    clickable: true,
    focusable: true,
    keys: true,
    tags: true,
  });

  const dropdown = new DropdownMenu({
    parent: screen,
    items: [
      { label: 'Option 1', action: () => addLog('{magenta-fg}[MENU]{/} Selected: Option 1') },
      { label: 'Option 2', action: () => addLog('{magenta-fg}[MENU]{/} Selected: Option 2') },
      { label: 'Option 3', action: () => addLog('{magenta-fg}[MENU]{/} Selected: Option 3') },
    ],
  });

  menuButton.on('click', () => {
    addLog('{magenta-fg}[MENU]{/} Opening dropdown...');
    dropdown.openFor(menuButton);
  });

  // Test Keyboard Input
  screen.on('keypress', (_ch: any, key: any) => {
    addLog(`{cyan-fg}[KEY]{/} Pressed: ${key.name || key.sequence} (full: ${key.full})`);
  });

  // Status Bar
  const statusBar = createBox({
    parent: screen,
    bottom: 0,
    left: 0,
    width: '100%',
    height: 1,
    content: '{yellow-fg}Q{/}uit | {cyan-fg}TAB{/}Navigate | {green-fg}CLICK{/}Test | {magenta-fg}HOVER{/}Test',
    style: { bg: 'blue', fg: 'white' },
    tags: true,
  });

  screen.key(['q', 'Q'], () => {
    addLog('{red-fg}[EXIT]{/} Quitting...');
    setTimeout(() => screen.destroy(), 500);
  });

  hoverPanel.focus();
  screen.render();

  addLog('{green-fg}[READY]{/} Test started. Try clicking, hovering, and keyboard navigation!');

  await new Promise<void>((resolve) => {
    if (screen.destroyed) return resolve();
    screen.on('destroy', resolve);
  });
});

export default door;
