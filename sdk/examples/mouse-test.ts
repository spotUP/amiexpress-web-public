/**
 * Mouse Event Routing Test
 *
 * Demonstrates how mouse events flow through the blessed library:
 * Program → Screen → Elements
 *
 * This test creates clickable boxes and logs mouse interactions.
 */

import { Screen, Box, Button, List } from '../engines/ui/blessed';

// Create screen
const screen = new Screen({
  title: 'Mouse Event Routing Test',
});

// Enable mouse support
screen.enableMouse();

// Create a title box
const title = new Box({
  parent: screen,
  top: 0,
  left: 'center',
  width: '100%',
  height: 3,
  content: '{center}{bold}Mouse Event Routing Test{/bold}{/center}\n\n' +
           '{center}Click on the boxes below to test mouse routing{/center}',
  tags: true,
  style: {
    fg: 'white',
    bg: 'blue',
  },
});

// Create clickable box 1
const box1 = new Box({
  parent: screen,
  top: 5,
  left: 5,
  width: 30,
  height: 8,
  border: { type: 'line' },
  label: ' Box 1 (Clickable) ',
  content: '{center}Click me!{/center}\n\n' +
           '{center}Clicks: 0{/center}',
  tags: true,
  style: {
    fg: 'white',
    bg: 'black',
    border: { fg: 'cyan' },
    hover: { bg: 'blue' },
  },
  mouse: true,
  clickable: true,
});

let box1Clicks = 0;
box1.enableMouse();

box1.on('click', (data: any) => {
  box1Clicks++;
  box1.setContent(
    `{center}Click me!{/center}\n\n` +
    `{center}Clicks: ${box1Clicks}{/center}\n\n` +
    `{center}Position: ${data.x}, ${data.y}{/center}`
  );
  screen.render();
});

box1.on('mouseenter', () => {
  box1.style.bg = 'blue';
  screen.render();
});

box1.on('mouseleave', () => {
  box1.style.bg = 'black';
  screen.render();
});

// Create clickable box 2
const box2 = new Box({
  parent: screen,
  top: 5,
  left: 40,
  width: 30,
  height: 8,
  border: { type: 'line' },
  label: ' Box 2 (Draggable) ',
  content: '{center}Drag me!{/center}',
  tags: true,
  style: {
    fg: 'white',
    bg: 'black',
    border: { fg: 'green' },
  },
  mouse: true,
  draggable: true,
});

box2.enableDrag();

// Create a button
const button = new Button({
  parent: screen,
  top: 15,
  left: 5,
  width: 20,
  height: 3,
  content: 'Click Me!',
  align: 'center',
  valign: 'middle',
  style: {
    fg: 'white',
    bg: 'green',
    focus: {
      bg: 'yellow',
      fg: 'black',
    },
  },
  mouse: true,
});

button.on('press', () => {
  button.setContent('Pressed!');
  screen.render();
  setTimeout(() => {
    button.setContent('Click Me!');
    screen.render();
  }, 500);
});

// Create a list with mouse selection
const list = new List({
  parent: screen,
  top: 15,
  left: 40,
  width: 30,
  height: 8,
  border: { type: 'line' },
  label: ' List (Click to Select) ',
  items: ['Item 1', 'Item 2', 'Item 3', 'Item 4', 'Item 5'],
  keys: true,
  vi: true,
  mouse: true,
  style: {
    fg: 'white',
    bg: 'black',
    border: { fg: 'magenta' },
    selected: {
      bg: 'blue',
      fg: 'white',
    },
  },
});

list.on('select', (item: any, index: number) => {
  const msg = `Selected: ${item.content || item} (index ${index})`;
  title.setContent(
    '{center}{bold}Mouse Event Routing Test{/bold}{/center}\n\n' +
    `{center}${msg}{/center}`
  );
  screen.render();
});

// Create event log area
const eventLog = new Box({
  parent: screen,
  bottom: 3,
  left: 0,
  width: '100%',
  height: 2,
  content: 'Event Log: Waiting for mouse events...',
  style: {
    fg: 'yellow',
    bg: 'black',
  },
});

// Log all screen mouse events
let eventCount = 0;
screen.on('mouse', (data: any) => {
  eventCount++;
  eventLog.setContent(
    `Event #${eventCount}: ${data.action} at (${data.x}, ${data.y}) ` +
    `button: ${data.button || 'none'} shift: ${data.shift} ctrl: ${data.ctrl}`
  );
  screen.render();
});

// Create exit instruction
const exitBox = new Box({
  parent: screen,
  bottom: 0,
  left: 0,
  width: '100%',
  height: 1,
  content: '{center}Press q or Ctrl+C to exit{/center}',
  tags: true,
  style: {
    fg: 'white',
    bg: 'black',
  },
});

// Handle keyboard input
screen.key(['q', 'C-c'], () => {
  screen.destroy();
  process.exit(0);
});

// Initial render
screen.render();

console.log('Mouse routing test running...');
console.log('Try clicking on the boxes, button, and list!');
