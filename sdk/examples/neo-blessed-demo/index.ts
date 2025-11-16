/**
 * Neo-Blessed UI Demo - Comprehensive demonstration of UI capabilities
 *
 * This door showcases the power of the UIEngine and neo-blessed integration:
 * - Interactive menus
 * - Forms and input dialogs
 * - Lists and tables
 * - Progress bars
 * - Scrollable text viewers
 * - Dialog boxes
 *
 * Use this as a reference for building your own sophisticated BBS UIs!
 */

import { Door, UIEngine, UIHelpers } from '@amiexpress/bbs-door-sdk';
import { runDoorWithSession } from '../../tools/runDoorSession';

const door = new Door({
  name: 'Neo-Blessed UI Demo',
  version: '1.0.0',
  author: 'AmiExpress SDK',
  description: 'Comprehensive UI demonstration using neo-blessed',
});

door.onConnect(async (user: any) => {
  console.log(`User ${user.name} connected to UI demo`);

  // Create UI engine
  const ui = new UIEngine({
    width: 80,
    height: 24,
    smartCSR: true,
    enableMouse: true,
    enableKeys: true,
  });

  const helpers = new UIHelpers(ui);

  // Main menu
  const showMainMenu = () => {
    ui.clear();

    // Title bar
    helpers.createTitleBar('Neo-Blessed UI Demo', 'Showcase of Advanced Terminal UI');

    // Status bar
    const statusBar = helpers.createStatusBar({ position: 'bottom' });
    statusBar.setContent(` User: ${user.name} | Arrow keys to navigate | Enter to select | Q to quit `);

    // Main menu
    const menu = helpers.createMenu(
      {
        top: 4,
        left: 'center',
        width: 40,
        height: 15,
        title: 'Main Menu',
      },
      [
        {
          label: 'Interactive Forms',
          key: '1',
          action: () => showFormDemo(),
        },
        {
          label: 'List and Tables',
          key: '2',
          action: () => showListDemo(),
        },
        {
          label: 'Dialog Boxes',
          key: '3',
          action: () => showDialogDemo(),
        },
        {
          label: 'Progress Bars',
          key: '4',
          action: () => showProgressDemo(),
        },
        {
          label: 'Text Viewer',
          key: '5',
          action: () => showTextViewer(),
        },
        {
          label: 'About',
          key: 'a',
          action: async () => {
            await helpers.showAlert({
              title: 'About',
              message: 'Neo-Blessed UI Demo v1.0.0\n\nShowcases the power of neo-blessed\nfor creating professional BBS UIs.\n\nBuilt with AmiExpress SDK',
            });
            ui.render();
          },
        },
        {
          label: 'Exit',
          key: 'q',
          action: () => {
            ui.destroy();
            door.disconnect(user.id);
          },
        },
      ]
    );

    // Global quit handler
    ui.onKey(['q', 'escape'], () => {
      ui.destroy();
      door.disconnect(user.id);
    });

    ui.render();
  };

  // Form demo
  const showFormDemo = async () => {
    ui.clear();

    helpers.createTitleBar('Form Demo', 'Interactive input forms');

    const form = ui.createForm({
      top: 3,
      left: 'center',
      width: 60,
      height: 18,
      border: { type: 'line' },
      label: ' User Information ',
      keys: true,
      style: {
        border: { fg: 'cyan' },
      },
    });

    // Name input
    ui.createText({
      parent: form,
      top: 1,
      left: 2,
      content: 'Name:',
      style: { fg: 'yellow' },
    });

    const nameInput = ui.createTextbox({
      parent: form,
      top: 2,
      left: 2,
      width: 40,
      height: 3,
      border: { type: 'line' },
      value: user.name,
      name: 'name',
      style: {
        focus: {
          border: { fg: 'green' },
        },
      },
    });

    // Email input
    ui.createText({
      parent: form,
      top: 6,
      left: 2,
      content: 'Email:',
      style: { fg: 'yellow' },
    });

    const emailInput = ui.createTextbox({
      parent: form,
      top: 7,
      left: 2,
      width: 40,
      height: 3,
      border: { type: 'line' },
      name: 'email',
      style: {
        focus: {
          border: { fg: 'green' },
        },
      },
    });

    // Submit button
    const submitBtn = ui.createButton({
      parent: form,
      bottom: 2,
      left: 10,
      width: 12,
      height: 3,
      content: 'Submit',
      border: { type: 'line' },
      style: {
        fg: 'white',
        bg: 'green',
        focus: {
          bg: 'cyan',
        },
      },
    });

    // Cancel button
    const cancelBtn = ui.createButton({
      parent: form,
      bottom: 2,
      right: 10,
      width: 12,
      height: 3,
      content: 'Cancel',
      border: { type: 'line' },
      style: {
        fg: 'white',
        bg: 'red',
        focus: {
          bg: 'cyan',
        },
      },
    });

    submitBtn.on('press', async () => {
      await helpers.showAlert({
        title: 'Form Submitted',
        message: `Name: ${nameInput.getValue()}\nEmail: ${emailInput.getValue()}`,
      });
      showMainMenu();
    });

    cancelBtn.on('press', () => {
      showMainMenu();
    });

    cancelBtn.key(['escape'], () => {
      cancelBtn.press();
    });

    nameInput.focus();
    ui.render();
  };

  // List demo
  const showListDemo = () => {
    ui.clear();

    helpers.createTitleBar('List and Table Demo', 'Scrollable lists and data tables');

    // List
    const list = ui.createList({
      top: 3,
      left: 2,
      width: 35,
      height: 18,
      border: { type: 'line' },
      label: ' Items ',
      items: [
        'Apple',
        'Banana',
        'Cherry',
        'Date',
        'Elderberry',
        'Fig',
        'Grape',
        'Honeydew',
        'Kiwi',
        'Lemon',
        'Mango',
        'Nectarine',
        'Orange',
        'Papaya',
        'Quince',
      ],
      style: {
        selected: { bg: 'blue', fg: 'white' },
        border: { fg: 'cyan' },
      },
    });

    // Table
    const table = helpers.createDataTable({
      top: 3,
      left: 40,
      width: 38,
      height: 18,
      title: 'High Scores',
      data: [
        ['Rank', 'Name', 'Score'],
        ['1', 'Alice', '15000'],
        ['2', 'Bob', '12500'],
        ['3', 'Carol', '10000'],
        ['4', 'Dave', '9500'],
        ['5', 'Eve', '8000'],
        ['6', 'Frank', '7500'],
        ['7', 'Grace', '6000'],
      ],
    });

    list.on('select', async (item: any, index: number) => {
      await helpers.showAlert({
        title: 'Item Selected',
        message: `You selected: ${item.content}\nAt index: ${index}`,
      });
      ui.render();
    });

    list.key(['escape'], () => {
      showMainMenu();
    });

    list.focus();
    ui.render();
  };

  // Dialog demo
  const showDialogDemo = async () => {
    ui.clear();

    helpers.createTitleBar('Dialog Demo', 'Alert, confirm, and input dialogs');

    const menu = helpers.createMenu(
      {
        top: 4,
        left: 'center',
        width: 40,
        height: 12,
        title: 'Dialog Types',
      },
      [
        {
          label: 'Alert Dialog',
          key: '1',
          action: async () => {
            await helpers.showAlert({
              title: 'Alert',
              message: 'This is an alert dialog!\n\nPress OK to continue.',
            });
            ui.render();
          },
        },
        {
          label: 'Confirm Dialog',
          key: '2',
          action: async () => {
            const confirmed = await helpers.showConfirm({
              title: 'Confirm',
              message: 'Are you sure you want to proceed?',
            });
            await helpers.showAlert({
              title: 'Result',
              message: confirmed ? 'You clicked Yes!' : 'You clicked No!',
            });
            ui.render();
          },
        },
        {
          label: 'Input Dialog',
          key: '3',
          action: async () => {
            const name = await helpers.showInput({
              title: 'Input',
              label: 'Enter your name:',
              defaultValue: user.name,
            });
            if (name) {
              await helpers.showAlert({
                title: 'Input Received',
                message: `Hello, ${name}!`,
              });
            }
            ui.render();
          },
        },
        {
          label: 'Back to Main Menu',
          key: 'b',
          action: () => showMainMenu(),
        },
      ]
    );

    ui.render();
  };

  // Progress demo
  const showProgressDemo = () => {
    ui.clear();

    helpers.createTitleBar('Progress Bar Demo', 'Animated progress indicators');

    const { bar: bar1, label: label1 } = helpers.createProgressIndicator({
      top: 4,
      left: 10,
      width: 60,
      label: 'Download Progress:',
    });

    const { bar: bar2, label: label2 } = helpers.createProgressIndicator({
      top: 9,
      left: 10,
      width: 60,
      label: 'Upload Progress:',
    });

    const { bar: bar3, label: label3 } = helpers.createProgressIndicator({
      top: 14,
      left: 10,
      width: 60,
      label: 'Processing:',
    });

    const statusText = ui.createText({
      top: 19,
      left: 'center',
      content: '{cyan-fg}Press ESC to return to menu{/cyan-fg}',
      tags: true,
    });

    ui.render();

    // Animate progress bars
    let progress1 = 0;
    let progress2 = 0;
    let progress3 = 0;

    const interval = setInterval(() => {
      progress1 += 2;
      progress2 += 1.5;
      progress3 += 1;

      if (progress1 <= 100) bar1.setProgress(progress1);
      if (progress2 <= 100) bar2.setProgress(progress2);
      if (progress3 <= 100) bar3.setProgress(progress3);

      ui.render();

      if (progress1 >= 100 && progress2 >= 100 && progress3 >= 100) {
        clearInterval(interval);
        statusText.setContent('{green-fg}{bold}All operations complete! Press ESC to continue.{/bold}{/green-fg}');
        ui.render();
      }
    }, 100);

    ui.onKey(['escape'], () => {
      clearInterval(interval);
      showMainMenu();
    });
  };

  // Text viewer demo
  const showTextViewer = () => {
    ui.clear();

    helpers.createTitleBar('Text Viewer Demo', 'Scrollable text with vi-style navigation');

    const longText = `
=== Neo-Blessed UI Engine ===

The UIEngine provides a powerful ncurses-like widget system for creating
sophisticated ASCII/ANSI user interfaces in BBS doors.

Key Features:
- Rich widget library (20+ widgets)
- Efficient rendering (only redraws changes)
- Mouse + keyboard support
- Focus management
- Scrolling and navigation
- Styling and theming

Available Widgets:
* Box - Fundamental building block
* Text - Simple text display
* Line - Horizontal/vertical dividers
* List - Scrollable, selectable lists
* Form - Input containers
* Textbox - Single-line input
* Textarea - Multi-line input
* Button - Clickable buttons
* Checkbox - Boolean selection
* Table - Data tables
* ProgressBar - Progress indicators
* Message - Alert dialogs
* Prompt - Input prompts
* Log - Scrollable output logs

Navigation:
- Arrow keys: Scroll up/down
- j/k: Vi-style scrolling
- Page Up/Down: Fast scrolling
- g/G: Jump to top/bottom
- ESC: Return to menu

This text viewer demonstrates scrolling capabilities. Try scrolling through
this content using the arrow keys or vi-style navigation (j/k).

The viewer supports:
- Automatic word wrapping
- Scrollbar indicators
- Mouse wheel scrolling
- Keyboard navigation
- Tag-based markup

You can use this for:
- Help text
- Documentation
- File viewing
- Log displays
- News bulletins
- Any long-form text

=== Building Your Own UIs ===

To create your own sophisticated UIs:

1. Import the UIEngine and UIHelpers:
   import { UIEngine, UIHelpers } from '@amiexpress/bbs-door-sdk';

2. Create a UI instance:
   const ui = new UIEngine({ width: 80, height: 24 });
   const helpers = new UIHelpers(ui);

3. Create widgets:
   const box = ui.createBox({ ... });
   const list = ui.createList({ ... });
   const form = ui.createForm({ ... });

4. Handle events:
   list.on('select', (item, index) => { ... });
   button.on('press', () => { ... });

5. Render the screen:
   ui.render();

6. Clean up when done:
   ui.destroy();

Check out the SDK documentation for more details and examples!

=== Performance Tips ===

- Enable smartCSR and fastCSR for optimal rendering
- Call render() after multiple changes, not each change
- Use useBCE for faster background color fills
- Destroy unused elements to free memory
- Batch updates when possible

=== Styling ===

Widgets support comprehensive styling:

style: {
  fg: 'white',        // Foreground color
  bg: 'blue',         // Background color
  bold: true,         // Text attributes
  border: {           // Border styling
    fg: 'cyan'
  },
  focus: {            // Focus state
    bg: 'cyan'
  },
  hover: {            // Hover state
    fg: 'yellow'
  }
}

Supported colors: black, red, green, yellow, blue, magenta, cyan, white,
brightred, brightgreen, brightyellow, brightblue, brightmagenta,
brightcyan, brightwhite

=== Content Markup ===

Use tags for inline styling:

{bold}Bold text{/bold}
{red-fg}Red text{/red-fg}
{center}Centered{/center}
{right}Right-aligned{/right}

=== Events ===

All elements support events:

- Mouse: click, mousedown, mouseup, mousemove, wheelup, wheeldown
- Focus: focus, blur
- Visibility: show, hide
- Layout: move, resize
- Rendering: prerender, render

=== Conclusion ===

Neo-blessed provides professional-grade terminal UI capabilities for BBS doors.
Use it to create interactive menus, forms, file browsers, games, and more!

Happy coding! 🚀

(Press ESC to return to main menu)
`;

    const viewer = helpers.createTextViewer({
      top: 3,
      left: 2,
      width: 76,
      height: 19,
      title: 'Neo-Blessed Documentation',
      content: longText,
    });

    viewer.key(['escape'], () => {
      showMainMenu();
    });

    viewer.focus();
    ui.render();
  };

  // Start with main menu
  showMainMenu();
});

door.onDisconnect((user: any) => {
  console.log(`User ${user.name} disconnected from UI demo`);
});

export async function runDoor(doorSession: any): Promise<void> {
  await runDoorWithSession(door, doorSession);
}
