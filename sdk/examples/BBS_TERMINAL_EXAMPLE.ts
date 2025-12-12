/**
 * BBS Terminal Constraints Example
 *
 * Shows how to properly handle BBS terminal dimensions
 * in doors using the blessed UI engine
 */

import { Door, getTerminalDimensions, centerText, wrapText } from '@amiexpress/bbs-door-sdk';
import blessed from '@amiexpress/bbs-door-sdk/engines/ui/blessed';

export default class TerminalExampleDoor extends Door {
  async onStart() {
    // Get user's terminal dimensions
    const dims = getTerminalDimensions(this.context);
    console.log(`User terminal: ${dims.width}x${dims.height}`);
    console.log(`Content area: ${dims.contentHeight} lines`);

    // Create screen with proper BBS constraints
    const screen = blessed.screen({
      height: dims.height,  // Includes prompt lines
      output: (data: string) => this.context.output.write(data),
    });

    // Screen is automatically 80 columns wide
    console.log(`Screen: ${screen.width}x${screen.height}`); // "80x25" (typical)

    // Create a box that respects content area
    const box = blessed.box({
      top: 0,
      left: 0,
      width: '100%',
      height: dims.contentHeight,  // Reserve 2 lines for prompts
      border: {
        type: 'line',
      },
      style: {
        fg: 'white',
        bg: 'blue',
        border: {
          fg: 'cyan',
        },
      },
    });

    screen.append(box);

    // Example: Display centered welcome message
    const welcome = centerText('Welcome to BBS Terminal Example!');
    box.pushLine(welcome);
    box.pushLine('');

    // Example: Display wrapped long text
    const longText =
      'This is a very long line of text that exceeds 80 columns and demonstrates how text wrapping works in the BBS terminal environment.';
    const wrappedLines = wrapText(longText);
    wrappedLines.forEach((line) => box.pushLine(line));

    box.pushLine('');
    box.pushLine(centerText('Press any key to continue'));

    // Render screen
    screen.render();

    // Wait for key
    await this.context.input.getKey();

    // Update screen dimensions dynamically (if user changes settings)
    const newLines = 20; // Minimum lines
    screen.setDimensions(newLines);
    console.log(`Updated to: ${screen.width}x${screen.getDimensions().height}`);

    // Cleanup
    screen.destroy();
  }
}

/**
 * Additional Examples
 */

// Example 1: Create scrollable list that respects dimensions
function createScrollableList(context: any, screen: any) {
  const dims = getTerminalDimensions(context);

  const list = blessed.list({
    top: 0,
    left: 0,
    width: '100%',
    height: dims.contentHeight, // Use content area only
    scrollable: true,
    keys: true,
    vi: true,
    border: {
      type: 'line',
    },
  });

  // Add many items (will scroll automatically)
  for (let i = 1; i <= 100; i++) {
    list.addItem(`Item ${i}`);
  }

  screen.append(list);
  return list;
}

// Example 2: Create menu that fits in 80 columns
function createMenu(screen: any) {
  const { centerText } = require('@amiexpress/bbs-door-sdk');

  const menu = blessed.box({
    top: 'center',
    left: 'center',
    width: 78, // Leave 1 column margin on each side
    height: 10,
    border: {
      type: 'line',
    },
  });

  // All lines fit in 80 columns (78 + 2 for border)
  menu.pushLine(centerText('=== MAIN MENU ===', 76));
  menu.pushLine('');
  menu.pushLine('  1. Option One');
  menu.pushLine('  2. Option Two');
  menu.pushLine('  3. Option Three');
  menu.pushLine('  Q. Quit');
  menu.pushLine('');
  menu.pushLine(centerText('Select an option:', 76));

  screen.append(menu);
  return menu;
}

// Example 3: Create table that respects 80-column limit
function createTable(screen: any) {
  const { padRight } = require('@amiexpress/bbs-door-sdk');

  const table = blessed.box({
    top: 2,
    left: 2,
    width: 76,
    height: 15,
    border: {
      type: 'line',
    },
  });

  // Create table with fixed-width columns (total = 76)
  const col1Width = 20;
  const col2Width = 25;
  const col3Width = 29; // 20 + 25 + 29 + 2 spaces = 76

  // Header
  const header = `${padRight('Name', col1Width)} ${padRight('Email', col2Width)} ${padRight('Phone', col3Width)}`;
  table.pushLine(header);
  table.pushLine('─'.repeat(76));

  // Data rows
  const data = [
    { name: 'John Doe', email: 'john@example.com', phone: '555-1234' },
    { name: 'Jane Smith', email: 'jane@example.com', phone: '555-5678' },
  ];

  data.forEach((row) => {
    const line = `${padRight(row.name, col1Width)} ${padRight(row.email, col2Width)} ${padRight(row.phone, col3Width)}`;
    table.pushLine(line);
  });

  screen.append(table);
  return table;
}
