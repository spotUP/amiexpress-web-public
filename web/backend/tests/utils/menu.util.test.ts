/**
 * Unit tests for menu.util.ts
 * Tests arrow-key navigable menu utilities for BBS interfaces
 */

import { MenuUtil, MenuState, MenuItem } from '../../src/utils/menu.util';

describe('menu.util', () => {
  describe('renderMenu', () => {
    const basicMenuState: MenuState = {
      title: 'Main Menu',
      items: [
        { label: 'Option 1', action: 'action1' },
        { label: 'Option 2', action: 'action2' },
        { label: 'Option 3', action: 'action3' },
      ],
      selectedIndex: 0,
    };

    it('should render menu with title', () => {
      const result = MenuUtil.renderMenu(basicMenuState);

      expect(result).toContain('Main Menu');
    });

    it('should render all menu items', () => {
      const result = MenuUtil.renderMenu(basicMenuState);

      expect(result).toContain('Option 1');
      expect(result).toContain('Option 2');
      expect(result).toContain('Option 3');
    });

    it('should highlight selected item', () => {
      const result = MenuUtil.renderMenu(basicMenuState);

      // Selected item should have reverse video (\x1b[7m)
      expect(result).toContain('\x1b[7m');
      // Should have selection marker
      expect(result).toContain(' > ');
    });

    it('should render selected item with colors', () => {
      const result = MenuUtil.renderMenu(basicMenuState);

      // Should contain cyan color (\x1b[36m)
      expect(result).toContain('\x1b[36m');
      // Should contain yellow color (\x1b[33m)
      expect(result).toContain('\x1b[33m');
    });

    it('should render non-selected items without highlight', () => {
      const stateWithSecondSelected: MenuState = {
        ...basicMenuState,
        selectedIndex: 1,
      };

      const result = MenuUtil.renderMenu(stateWithSecondSelected);

      // Should still contain all items
      expect(result).toContain('Option 1');
      expect(result).toContain('Option 2');
      expect(result).toContain('Option 3');
    });

    it('should include item descriptions when provided', () => {
      const menuWithDescriptions: MenuState = {
        title: 'Test Menu',
        items: [
          { label: 'List', action: 'list', description: 'List all files' },
          { label: 'Upload', action: 'upload', description: 'Upload a file' },
        ],
        selectedIndex: 0,
      };

      const result = MenuUtil.renderMenu(menuWithDescriptions);

      expect(result).toContain('List all files');
      expect(result).toContain('Upload a file');
    });

    it('should render custom footer when provided', () => {
      const menuWithFooter: MenuState = {
        ...basicMenuState,
        footer: 'Press X for help',
      };

      const result = MenuUtil.renderMenu(menuWithFooter);

      expect(result).toContain('Press X for help');
    });

    it('should render default footer when not provided', () => {
      const result = MenuUtil.renderMenu(basicMenuState);

      expect(result).toContain('↑↓ arrows');
      expect(result).toContain('ENTER');
      expect(result).toContain('to select');
    });

    it('should clear screen at start', () => {
      const result = MenuUtil.renderMenu(basicMenuState);

      // Should start with clear screen code
      expect(result).toContain('\x1b[2J');
    });

    it('should include separator lines', () => {
      const result = MenuUtil.renderMenu(basicMenuState);

      // Should have unicode box drawing characters
      expect(result).toContain('━');
    });

    it('should handle empty menu items', () => {
      const emptyMenuState: MenuState = {
        title: 'Empty Menu',
        items: [],
        selectedIndex: 0,
      };

      const result = MenuUtil.renderMenu(emptyMenuState);

      expect(result).toContain('Empty Menu');
      expect(result).toBeTruthy();
    });

    it('should handle single item', () => {
      const singleItemMenu: MenuState = {
        title: 'Single',
        items: [{ label: 'Only Option', action: 'only' }],
        selectedIndex: 0,
      };

      const result = MenuUtil.renderMenu(singleItemMenu);

      expect(result).toContain('Only Option');
      expect(result).toContain(' > ');
    });

    it('should handle long menu with many items', () => {
      const longMenu: MenuState = {
        title: 'Long Menu',
        items: Array.from({ length: 20 }, (_, i) => ({
          label: `Option ${i + 1}`,
          action: `action${i + 1}`,
        })),
        selectedIndex: 10,
      };

      const result = MenuUtil.renderMenu(longMenu);

      expect(result).toContain('Option 1');
      expect(result).toContain('Option 20');
      expect(result).toContain('Option 11'); // Selected item (index 10)
    });

    it('should reset ANSI codes properly', () => {
      const result = MenuUtil.renderMenu(basicMenuState);

      // Should contain reset codes
      expect(result).toContain('\x1b[0m');
    });

    it('should handle hotkeys when provided', () => {
      const menuWithHotkeys: MenuState = {
        title: 'Hotkey Menu',
        items: [
          { label: 'List', key: 'L', action: 'list' },
          { label: 'Upload', key: 'U', action: 'upload' },
          { label: 'Download', key: 'D', action: 'download' },
        ],
        selectedIndex: 0,
      };

      const result = MenuUtil.renderMenu(menuWithHotkeys);

      expect(result).toContain('List');
      expect(result).toContain('Upload');
      expect(result).toContain('Download');
    });
  });

  describe('handleMenuInput', () => {
    const itemCount = 5;

    describe('Arrow Up navigation', () => {
      it('should move up from middle position', () => {
        const result = MenuUtil.handleMenuInput('\x1b[A', 2, itemCount);

        expect(result.action).toBeNull();
        expect(result.newIndex).toBe(1);
      });

      it('should wrap to bottom when at top', () => {
        const result = MenuUtil.handleMenuInput('\x1b[A', 0, itemCount);

        expect(result.action).toBeNull();
        expect(result.newIndex).toBe(4); // Wraps to last item
      });

      it('should move up from last position', () => {
        const result = MenuUtil.handleMenuInput('\x1b[A', 4, itemCount);

        expect(result.action).toBeNull();
        expect(result.newIndex).toBe(3);
      });
    });

    describe('Arrow Down navigation', () => {
      it('should move down from middle position', () => {
        const result = MenuUtil.handleMenuInput('\x1b[B', 2, itemCount);

        expect(result.action).toBeNull();
        expect(result.newIndex).toBe(3);
      });

      it('should wrap to top when at bottom', () => {
        const result = MenuUtil.handleMenuInput('\x1b[B', 4, itemCount);

        expect(result.action).toBeNull();
        expect(result.newIndex).toBe(0); // Wraps to first item
      });

      it('should move down from first position', () => {
        const result = MenuUtil.handleMenuInput('\x1b[B', 0, itemCount);

        expect(result.action).toBeNull();
        expect(result.newIndex).toBe(1);
      });
    });

    describe('Enter/Select', () => {
      it('should select on carriage return', () => {
        const result = MenuUtil.handleMenuInput('\r', 2, itemCount);

        expect(result.action).toBe('select');
        expect(result.newIndex).toBe(2);
      });

      it('should select on newline', () => {
        const result = MenuUtil.handleMenuInput('\n', 2, itemCount);

        expect(result.action).toBe('select');
        expect(result.newIndex).toBe(2);
      });

      it('should select at first position', () => {
        const result = MenuUtil.handleMenuInput('\r', 0, itemCount);

        expect(result.action).toBe('select');
        expect(result.newIndex).toBe(0);
      });

      it('should select at last position', () => {
        const result = MenuUtil.handleMenuInput('\r', 4, itemCount);

        expect(result.action).toBe('select');
        expect(result.newIndex).toBe(4);
      });
    });

    describe('Quit/Escape', () => {
      it('should quit on Q key', () => {
        const result = MenuUtil.handleMenuInput('Q', 2, itemCount);

        expect(result.action).toBe('quit');
        expect(result.newIndex).toBe(2);
      });

      it('should quit on lowercase q', () => {
        const result = MenuUtil.handleMenuInput('q', 2, itemCount);

        expect(result.action).toBe('quit');
        expect(result.newIndex).toBe(2);
      });

      it('should quit on ESC key', () => {
        const result = MenuUtil.handleMenuInput('\x1b', 2, itemCount);

        expect(result.action).toBe('quit');
        expect(result.newIndex).toBe(2);
      });
    });

    describe('Hotkey handling', () => {
      it('should return hotkey action for single letter', () => {
        const result = MenuUtil.handleMenuInput('L', 0, itemCount);

        expect(result.action).toBe('hotkey:L');
        expect(result.newIndex).toBe(0);
      });

      it('should uppercase hotkey input', () => {
        const result = MenuUtil.handleMenuInput('l', 0, itemCount);

        expect(result.action).toBe('hotkey:L');
        expect(result.newIndex).toBe(0);
      });

      it('should handle digit hotkeys', () => {
        const result = MenuUtil.handleMenuInput('1', 0, itemCount);

        expect(result.action).toBe('hotkey:1');
        expect(result.newIndex).toBe(0);
      });

      it('should handle special character hotkeys', () => {
        const result = MenuUtil.handleMenuInput('?', 0, itemCount);

        expect(result.action).toBe('hotkey:?');
        expect(result.newIndex).toBe(0);
      });

      it('should not trigger hotkey for multi-character input', () => {
        const result = MenuUtil.handleMenuInput('AB', 0, itemCount);

        expect(result.action).toBeNull();
        expect(result.newIndex).toBe(0);
      });
    });

    describe('Edge cases', () => {
      it('should handle single item menu', () => {
        const result = MenuUtil.handleMenuInput('\x1b[B', 0, 1);

        expect(result.newIndex).toBe(0); // Wraps to itself
      });

      it('should handle two item menu wrapping', () => {
        const upResult = MenuUtil.handleMenuInput('\x1b[A', 0, 2);
        expect(upResult.newIndex).toBe(1);

        const downResult = MenuUtil.handleMenuInput('\x1b[B', 1, 2);
        expect(downResult.newIndex).toBe(0);
      });

      it('should preserve index for unknown input', () => {
        const result = MenuUtil.handleMenuInput('XYZ', 3, itemCount);

        expect(result.action).toBeNull();
        expect(result.newIndex).toBe(3);
      });

      it('should handle empty input', () => {
        const result = MenuUtil.handleMenuInput('', 2, itemCount);

        expect(result.action).toBeNull();
        expect(result.newIndex).toBe(2);
      });

      it('should handle control characters', () => {
        const result = MenuUtil.handleMenuInput('\x03', 2, itemCount); // Ctrl+C

        expect(result.newIndex).toBe(2);
      });
    });

    describe('State preservation', () => {
      it('should not modify index for non-navigation input', () => {
        const currentIndex = 3;
        const result = MenuUtil.handleMenuInput('X', currentIndex, itemCount);

        expect(result.newIndex).toBe(currentIndex);
      });

      it('should preserve index on select', () => {
        const currentIndex = 2;
        const result = MenuUtil.handleMenuInput('\r', currentIndex, itemCount);

        expect(result.newIndex).toBe(currentIndex);
      });

      it('should preserve index on quit', () => {
        const currentIndex = 4;
        const result = MenuUtil.handleMenuInput('Q', currentIndex, itemCount);

        expect(result.newIndex).toBe(currentIndex);
      });
    });
  });

  describe('renderListSelection', () => {
    it('should render list with numbers', () => {
      const result = MenuUtil.renderListSelection(
        'Select File',
        ['file1.txt', 'file2.txt', 'file3.txt'],
        0
      );

      expect(result).toContain('[1] file1.txt');
      expect(result).toContain('[2] file2.txt');
      expect(result).toContain('[3] file3.txt');
    });

    it('should render title', () => {
      const result = MenuUtil.renderListSelection(
        'Choose Option',
        ['Option A', 'Option B'],
        0
      );

      expect(result).toContain('Choose Option');
    });

    it('should highlight selected item', () => {
      const result = MenuUtil.renderListSelection(
        'Select',
        ['Item 1', 'Item 2', 'Item 3'],
        1 // Select second item
      );

      // Should have selection marker
      expect(result).toContain(' > ');
      expect(result).toContain('[2] Item 2');
    });

    it('should render custom footer', () => {
      const result = MenuUtil.renderListSelection(
        'Select',
        ['A', 'B'],
        0,
        'Custom footer text'
      );

      expect(result).toContain('Custom footer text');
    });

    it('should handle empty list', () => {
      const result = MenuUtil.renderListSelection('Empty', [], 0);

      expect(result).toContain('Empty');
      expect(result).toBeTruthy();
    });

    it('should handle single item list', () => {
      const result = MenuUtil.renderListSelection('Single', ['Only'], 0);

      expect(result).toContain('[1] Only');
    });

    it('should number items sequentially', () => {
      const items = Array.from({ length: 10 }, (_, i) => `Item ${i}`);
      const result = MenuUtil.renderListSelection('Numbered', items, 0);

      for (let i = 1; i <= 10; i++) {
        expect(result).toContain(`[${i}]`);
      }
    });

    it('should handle long item labels', () => {
      const longLabel = 'A'.repeat(100);
      const result = MenuUtil.renderListSelection('Long', [longLabel], 0);

      expect(result).toContain(longLabel);
    });

    it('should include selection marker for first item', () => {
      const result = MenuUtil.renderListSelection(
        'Test',
        ['First', 'Second'],
        0
      );

      expect(result).toContain(' > ');
      expect(result).toContain('[1] First');
    });

    it('should include selection marker for last item', () => {
      const result = MenuUtil.renderListSelection(
        'Test',
        ['First', 'Second', 'Third'],
        2
      );

      expect(result).toContain(' > ');
      expect(result).toContain('[3] Third');
    });
  });

  describe('Integration tests', () => {
    it('should render menu and handle navigation consistently', () => {
      const menuState: MenuState = {
        title: 'Test Menu',
        items: [
          { label: 'Option 1', action: 'opt1' },
          { label: 'Option 2', action: 'opt2' },
          { label: 'Option 3', action: 'opt3' },
        ],
        selectedIndex: 0,
      };

      // Render initial state
      const render1 = MenuUtil.renderMenu(menuState);
      expect(render1).toContain('Option 1');

      // Navigate down
      const navDown = MenuUtil.handleMenuInput('\x1b[B', 0, 3);
      expect(navDown.newIndex).toBe(1);

      // Render with new selection
      const render2 = MenuUtil.renderMenu({ ...menuState, selectedIndex: 1 });
      expect(render2).toContain('Option 2');

      // Select current item
      const select = MenuUtil.handleMenuInput('\r', 1, 3);
      expect(select.action).toBe('select');
      expect(select.newIndex).toBe(1);
    });

    it('should handle full navigation cycle', () => {
      const itemCount = 3;
      let currentIndex = 0;

      // Down -> 1
      currentIndex = MenuUtil.handleMenuInput('\x1b[B', currentIndex, itemCount).newIndex;
      expect(currentIndex).toBe(1);

      // Down -> 2
      currentIndex = MenuUtil.handleMenuInput('\x1b[B', currentIndex, itemCount).newIndex;
      expect(currentIndex).toBe(2);

      // Down -> 0 (wrap)
      currentIndex = MenuUtil.handleMenuInput('\x1b[B', currentIndex, itemCount).newIndex;
      expect(currentIndex).toBe(0);

      // Up -> 2 (wrap)
      currentIndex = MenuUtil.handleMenuInput('\x1b[A', currentIndex, itemCount).newIndex;
      expect(currentIndex).toBe(2);
    });

    it('should render list and handle selection', () => {
      const items = ['File A', 'File B', 'File C'];

      // Render initial list
      const render = MenuUtil.renderListSelection('Files', items, 0);
      expect(render).toContain('[1] File A');

      // Navigate and select
      let index = 0;
      index = MenuUtil.handleMenuInput('\x1b[B', index, items.length).newIndex;
      expect(index).toBe(1);

      const selectResult = MenuUtil.handleMenuInput('\r', index, items.length);
      expect(selectResult.action).toBe('select');
      expect(selectResult.newIndex).toBe(1); // Selected File B
    });
  });

  describe('ANSI rendering', () => {
    it('should use proper ANSI escape codes', () => {
      const menuState: MenuState = {
        title: 'ANSI Test',
        items: [{ label: 'Item', action: 'test' }],
        selectedIndex: 0,
      };

      const result = MenuUtil.renderMenu(menuState);

      // Reverse video
      expect(result).toContain('\x1b[7m');
      // Reset
      expect(result).toContain('\x1b[0m');
      // Cyan
      expect(result).toContain('\x1b[36m');
      // Yellow
      expect(result).toContain('\x1b[33m');
      // White
      expect(result).toContain('\x1b[37m');
      // Blue
      expect(result).toContain('\x1b[34m');
    });

    it('should end with CRLF line endings', () => {
      const menuState: MenuState = {
        title: 'Test',
        items: [{ label: 'Item', action: 'test' }],
        selectedIndex: 0,
      };

      const result = MenuUtil.renderMenu(menuState);

      expect(result).toContain('\r\n');
    });
  });
});
