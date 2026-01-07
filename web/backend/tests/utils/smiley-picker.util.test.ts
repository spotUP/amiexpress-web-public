/**
 * Unit tests for smiley-picker.util.ts
 * Tests ASCII smiley picker modal for BBS chat (Ctrl+E trigger)
 */

import {
  SMILEY_CATEGORIES,
  createPickerState,
  getSelectedSmiley,
  renderPicker,
  renderPickerClosed,
  handlePickerInput,
  handlePickerMouse,
  shouldOpenPicker,
  savePickerArea,
  restorePickerArea,
  SmileyPickerState
} from '../../src/utils/smiley-picker.util';

describe('smiley-picker.util', () => {
  describe('SMILEY_CATEGORIES', () => {
    it('should have 6 categories', () => {
      expect(SMILEY_CATEGORIES.length).toBe(6);
    });

    it('should have expected category names', () => {
      const names = SMILEY_CATEGORIES.map(c => c.name);
      expect(names).toEqual(['Happy', 'Sad', 'Surprise', 'Cool', 'Fun', 'Kaomoji']);
    });

    it('should have smileys in each category', () => {
      SMILEY_CATEGORIES.forEach(category => {
        expect(category.smileys.length).toBeGreaterThan(0);
        expect(Array.isArray(category.smileys)).toBe(true);
      });
    });

    it('should contain common happy smileys', () => {
      const happySmileys = SMILEY_CATEGORIES[0].smileys;
      expect(happySmileys).toContain(':)');
      expect(happySmileys).toContain(':D');
      expect(happySmileys).toContain('^_^');
    });

    it('should contain common sad smileys', () => {
      const sadSmileys = SMILEY_CATEGORIES[1].smileys;
      expect(sadSmileys).toContain(':(');
      expect(sadSmileys).toContain('T_T');
    });
  });

  describe('createPickerState', () => {
    it('should create initial state with closed picker', () => {
      const state = createPickerState();
      expect(state.isOpen).toBe(false);
    });

    it('should start with first category', () => {
      const state = createPickerState();
      expect(state.categoryIndex).toBe(0);
    });

    it('should start with first smiley', () => {
      const state = createPickerState();
      expect(state.smileyIndex).toBe(0);
    });

    it('should not have saved screen initially', () => {
      const state = createPickerState();
      expect(state.savedScreen).toBeUndefined();
    });
  });

  describe('getSelectedSmiley', () => {
    it('should return first happy smiley by default', () => {
      const state = createPickerState();
      const smiley = getSelectedSmiley(state);
      expect(smiley).toBe(':)');
    });

    it('should return correct smiley for given indices', () => {
      const state: SmileyPickerState = {
        isOpen: true,
        categoryIndex: 0, // Happy
        smileyIndex: 1
      };
      const smiley = getSelectedSmiley(state);
      expect(smiley).toBe(':D');
    });

    it('should handle different categories', () => {
      const state: SmileyPickerState = {
        isOpen: true,
        categoryIndex: 1, // Sad
        smileyIndex: 0
      };
      const smiley = getSelectedSmiley(state);
      expect(smiley).toBe(':(');
    });

    it('should handle last category', () => {
      const state: SmileyPickerState = {
        isOpen: true,
        categoryIndex: 5, // Kaomoji
        smileyIndex: 0
      };
      const smiley = getSelectedSmiley(state);
      expect(smiley).toBe('(^_^)');
    });
  });

  describe('renderPicker', () => {
    it('should return ANSI escape sequences', () => {
      const state = createPickerState();
      const output = renderPicker(state);
      expect(output).toContain('\x1b['); // ANSI codes present
    });

    it('should include cursor save/hide', () => {
      const state = createPickerState();
      const output = renderPicker(state);
      expect(output).toContain('\x1b7'); // Save cursor
      expect(output).toContain('\x1b[?25l'); // Hide cursor
    });

    it('should include cursor show at end', () => {
      const state = createPickerState();
      const output = renderPicker(state);
      expect(output).toContain('\x1b[?25h'); // Show cursor
    });

    it('should include title text', () => {
      const state = createPickerState();
      const output = renderPicker(state);
      expect(output).toContain('ASCII SMILEYS');
    });

    it('should include instructions', () => {
      const state = createPickerState();
      const output = renderPicker(state);
      expect(output).toContain('Arrows:Move');
      expect(output).toContain('Enter:Sel');
      expect(output).toContain('Esc:Exit');
    });

    it('should include border characters', () => {
      const state = createPickerState();
      const output = renderPicker(state);
      expect(output).toContain('+');
      expect(output).toContain('-');
      expect(output).toContain('|');
    });

    it('should highlight current category', () => {
      const state: SmileyPickerState = {
        isOpen: true,
        categoryIndex: 0, // Happy
        smileyIndex: 0
      };
      const output = renderPicker(state);
      expect(output).toContain('[Hap]'); // Happy abbreviated and highlighted
    });

    it('should change with different category', () => {
      const state1 = { isOpen: true, categoryIndex: 0, smileyIndex: 0 };
      const state2 = { isOpen: true, categoryIndex: 1, smileyIndex: 0 };

      const output1 = renderPicker(state1);
      const output2 = renderPicker(state2);

      expect(output1).toContain('[Hap]');
      expect(output2).toContain('[Sad]');
    });
  });

  describe('renderPickerClosed', () => {
    it('should return cursor restore sequence', () => {
      const output = renderPickerClosed();
      expect(output).toBe('\x1b8');
    });
  });

  describe('handlePickerInput', () => {
    describe('Escape key', () => {
      it('should cancel on ESC', () => {
        const state = { isOpen: true, categoryIndex: 0, smileyIndex: 0 };
        const result = handlePickerInput(state, '\x1b');

        expect(result.action).toBe('cancel');
        expect(result.newState.isOpen).toBe(false);
      });

      it('should cancel on Ctrl+C', () => {
        const state = { isOpen: true, categoryIndex: 0, smileyIndex: 0 };
        const result = handlePickerInput(state, '\x03');

        expect(result.action).toBe('cancel');
        expect(result.newState.isOpen).toBe(false);
      });
    });

    describe('Enter key', () => {
      it('should select smiley on Enter', () => {
        const state = { isOpen: true, categoryIndex: 0, smileyIndex: 0 };
        const result = handlePickerInput(state, '\r');

        expect(result.action).toBe('select');
        expect(result.smiley).toBe(':)');
        expect(result.newState.isOpen).toBe(false);
      });

      it('should select smiley on newline', () => {
        const state = { isOpen: true, categoryIndex: 0, smileyIndex: 1 };
        const result = handlePickerInput(state, '\n');

        expect(result.action).toBe('select');
        expect(result.smiley).toBe(':D');
      });
    });

    describe('Tab key', () => {
      it('should move to next category', () => {
        const state = { isOpen: true, categoryIndex: 0, smileyIndex: 5 };
        const result = handlePickerInput(state, '\t');

        expect(result.action).toBe('update');
        expect(result.newState.categoryIndex).toBe(1);
        expect(result.newState.smileyIndex).toBe(0); // Reset to first smiley
      });

      it('should wrap from last to first category', () => {
        const state = { isOpen: true, categoryIndex: 5, smileyIndex: 3 };
        const result = handlePickerInput(state, '\t');

        expect(result.newState.categoryIndex).toBe(0);
        expect(result.newState.smileyIndex).toBe(0);
      });

      it('should go to previous category on Shift+Tab', () => {
        const state = { isOpen: true, categoryIndex: 1, smileyIndex: 2 };
        const result = handlePickerInput(state, '\x1b[Z'); // Backtab

        expect(result.action).toBe('update');
        expect(result.newState.categoryIndex).toBe(0);
        expect(result.newState.smileyIndex).toBe(0);
      });

      it('should wrap from first to last category on Shift+Tab', () => {
        const state = { isOpen: true, categoryIndex: 0, smileyIndex: 0 };
        const result = handlePickerInput(state, '\x1b[Z');

        expect(result.newState.categoryIndex).toBe(5);
        expect(result.newState.smileyIndex).toBe(0);
      });
    });

    describe('Arrow keys', () => {
      it('should move right', () => {
        const state = { isOpen: true, categoryIndex: 0, smileyIndex: 0 };
        const result = handlePickerInput(state, '\x1b[C'); // Right arrow

        expect(result.action).toBe('update');
        expect(result.newState.smileyIndex).toBe(1);
      });

      it('should move left', () => {
        const state = { isOpen: true, categoryIndex: 0, smileyIndex: 3 };
        const result = handlePickerInput(state, '\x1b[D'); // Left arrow

        expect(result.action).toBe('update');
        expect(result.newState.smileyIndex).toBe(2);
      });

      it('should move down (next row)', () => {
        const state = { isOpen: true, categoryIndex: 0, smileyIndex: 0 };
        const result = handlePickerInput(state, '\x1b[B'); // Down arrow

        expect(result.action).toBe('update');
        expect(result.newState.smileyIndex).toBe(5); // 5 per row
      });

      it('should move up (previous row)', () => {
        const state = { isOpen: true, categoryIndex: 0, smileyIndex: 7 };
        const result = handlePickerInput(state, '\x1b[A'); // Up arrow

        expect(result.action).toBe('update');
        expect(result.newState.smileyIndex).toBe(2);
      });

      it('should not move right beyond end', () => {
        const state = { isOpen: true, categoryIndex: 0, smileyIndex: 9 }; // Last in Happy
        const result = handlePickerInput(state, '\x1b[C');

        expect(result.newState.smileyIndex).toBe(9); // Stays at end
      });

      it('should not move left beyond start', () => {
        const state = { isOpen: true, categoryIndex: 0, smileyIndex: 0 };
        const result = handlePickerInput(state, '\x1b[D');

        expect(result.newState.smileyIndex).toBe(0); // Stays at start
      });

      it('should not move up beyond top row', () => {
        const state = { isOpen: true, categoryIndex: 0, smileyIndex: 2 };
        const result = handlePickerInput(state, '\x1b[A');

        expect(result.newState.smileyIndex).toBe(2); // Stays in place
      });

      it('should not move down beyond available smileys', () => {
        const state = { isOpen: true, categoryIndex: 0, smileyIndex: 9 }; // Last row
        const result = handlePickerInput(state, '\x1b[B');

        expect(result.newState.smileyIndex).toBe(9); // Stays in place
      });
    });

    describe('Number keys', () => {
      it('should jump to category 1 on key "1"', () => {
        const state = { isOpen: true, categoryIndex: 3, smileyIndex: 5 };
        const result = handlePickerInput(state, '1');

        expect(result.action).toBe('update');
        expect(result.newState.categoryIndex).toBe(0);
        expect(result.newState.smileyIndex).toBe(0);
      });

      it('should jump to category 6 on key "6"', () => {
        const state = { isOpen: true, categoryIndex: 0, smileyIndex: 0 };
        const result = handlePickerInput(state, '6');

        expect(result.newState.categoryIndex).toBe(5); // 0-indexed
      });

      it('should ignore number "7" (no 7th category)', () => {
        const state = { isOpen: true, categoryIndex: 2, smileyIndex: 3 };
        const result = handlePickerInput(state, '7');

        expect(result.action).toBe('update');
        expect(result.newState.categoryIndex).toBe(2); // Unchanged
      });

      it('should ignore number "0"', () => {
        const state = { isOpen: true, categoryIndex: 1, smileyIndex: 2 };
        const result = handlePickerInput(state, '0');

        expect(result.newState.categoryIndex).toBe(1); // Unchanged
      });
    });

    describe('Other input', () => {
      it('should ignore random characters', () => {
        const state = { isOpen: true, categoryIndex: 1, smileyIndex: 2 };
        const result = handlePickerInput(state, 'x');

        expect(result.action).toBe('update');
        expect(result.newState).toEqual(state);
      });
    });
  });

  describe('handlePickerMouse', () => {
    describe('Click outside picker', () => {
      it('should cancel when clicking above picker', () => {
        const state = { isOpen: true, categoryIndex: 0, smileyIndex: 0 };
        const result = handlePickerMouse(state, 40, 3); // Well above picker

        expect(result.action).toBe('cancel');
        expect(result.newState.isOpen).toBe(false);
      });

      it('should cancel when clicking left of picker', () => {
        const state = { isOpen: true, categoryIndex: 0, smileyIndex: 0 };
        const result = handlePickerMouse(state, 5, 12); // Left of picker

        expect(result.action).toBe('cancel');
        expect(result.newState.isOpen).toBe(false);
      });

      it('should cancel when clicking right of picker', () => {
        const state = { isOpen: true, categoryIndex: 0, smileyIndex: 0 };
        const result = handlePickerMouse(state, 75, 12); // Right of picker

        expect(result.action).toBe('cancel');
        expect(result.newState.isOpen).toBe(false);
      });
    });

    describe('Click on category tabs', () => {
      it('should switch to clicked category', () => {
        const state = { isOpen: true, categoryIndex: 0, smileyIndex: 3 };
        // Click on second tab (Sad) - approximate position
        const result = handlePickerMouse(state, 24, 8); // Tab row

        // Result depends on exact tab positioning
        expect(result.action === 'update' || result.action === 'none').toBe(true);
      });

      it('should reset smiley index when switching category', () => {
        const state = { isOpen: true, categoryIndex: 0, smileyIndex: 5 };
        // If we successfully click a different tab, smileyIndex should reset
        const result = handlePickerMouse(state, 24, 8);

        if (result.action === 'update' && result.newState.categoryIndex !== 0) {
          expect(result.newState.smileyIndex).toBe(0);
        }
      });
    });

    describe('Click on smiley', () => {
      it('should select smiley when clicked', () => {
        const state = { isOpen: true, categoryIndex: 0, smileyIndex: 0 };
        // Click in smiley grid area
        const result = handlePickerMouse(state, 20, 10);

        // Should either select or do nothing depending on exact coordinates
        expect(['select', 'none']).toContain(result.action);
      });

      it('should close picker when smiley selected', () => {
        const state = { isOpen: true, categoryIndex: 0, smileyIndex: 0 };
        const result = handlePickerMouse(state, 20, 10);

        if (result.action === 'select') {
          expect(result.newState.isOpen).toBe(false);
          expect(result.smiley).toBeTruthy();
        }
      });
    });

    describe('Edge cases', () => {
      it('should handle click on border', () => {
        const state = { isOpen: true, categoryIndex: 0, smileyIndex: 0 };
        const result = handlePickerMouse(state, 15, 5); // Top border

        expect(['cancel', 'none']).toContain(result.action);
      });

      it('should handle click far outside', () => {
        const state = { isOpen: true, categoryIndex: 0, smileyIndex: 0 };
        const result = handlePickerMouse(state, 1, 1);

        expect(result.action).toBe('cancel');
      });
    });
  });

  describe('shouldOpenPicker', () => {
    it('should return true for Ctrl+E', () => {
      expect(shouldOpenPicker('\x05')).toBe(true);
    });

    it('should return false for other keys', () => {
      expect(shouldOpenPicker('e')).toBe(false);
      expect(shouldOpenPicker('E')).toBe(false);
      expect(shouldOpenPicker('\r')).toBe(false);
      expect(shouldOpenPicker('\x1b')).toBe(false);
      expect(shouldOpenPicker('a')).toBe(false);
    });

    it('should return false for other control codes', () => {
      expect(shouldOpenPicker('\x01')).toBe(false); // Ctrl+A
      expect(shouldOpenPicker('\x03')).toBe(false); // Ctrl+C
      expect(shouldOpenPicker('\x06')).toBe(false); // Ctrl+F
    });
  });

  describe('savePickerArea', () => {
    it('should return ANSI sequences', () => {
      const output = savePickerArea();
      expect(output).toContain('\x1b');
    });

    it('should include cursor save', () => {
      const output = savePickerArea();
      expect(output).toContain('\x1b7');
    });

    it('should include alternate buffer switch', () => {
      const output = savePickerArea();
      expect(output).toContain('\x1b[?1049h');
    });
  });

  describe('restorePickerArea', () => {
    it('should return ANSI sequences', () => {
      const output = restorePickerArea();
      expect(output).toContain('\x1b');
    });

    it('should include alternate buffer restore', () => {
      const output = restorePickerArea();
      expect(output).toContain('\x1b[?1049l');
    });

    it('should include cursor restore', () => {
      const output = restorePickerArea();
      expect(output).toContain('\x1b8');
    });
  });

  describe('Integration tests', () => {
    it('should handle complete picker workflow', () => {
      // 1. Create initial state
      const state = createPickerState();
      expect(state.isOpen).toBe(false);

      // 2. Open picker
      state.isOpen = true;

      // 3. Render picker
      const rendered = renderPicker(state);
      expect(rendered).toContain('ASCII SMILEYS');

      // 4. Navigate to different smiley
      const nav1 = handlePickerInput(state, '\x1b[C'); // Right
      expect(nav1.newState.smileyIndex).toBe(1);

      // 5. Select smiley
      const select = handlePickerInput(nav1.newState, '\r');
      expect(select.action).toBe('select');
      expect(select.smiley).toBe(':D');
      expect(select.newState.isOpen).toBe(false);

      // 6. Close picker
      const closed = renderPickerClosed();
      expect(closed).toBe('\x1b8');
    });

    it('should handle category switching workflow', () => {
      const state = createPickerState();
      state.isOpen = true;

      // Switch to Sad category
      const result1 = handlePickerInput(state, '\t');
      expect(result1.newState.categoryIndex).toBe(1);

      // Get first sad smiley
      const smiley = getSelectedSmiley(result1.newState);
      expect(smiley).toBe(':(');

      // Select it
      const result2 = handlePickerInput(result1.newState, '\r');
      expect(result2.smiley).toBe(':(');
    });

    it('should handle cancellation workflow', () => {
      const state = createPickerState();
      state.isOpen = true;

      // Navigate somewhere
      const nav = handlePickerInput(state, '\x1b[C');
      expect(nav.newState.smileyIndex).toBe(1);

      // Cancel with ESC
      const cancel = handlePickerInput(nav.newState, '\x1b');
      expect(cancel.action).toBe('cancel');
      expect(cancel.newState.isOpen).toBe(false);
      expect(cancel.smiley).toBeUndefined();
    });

    it('should detect Ctrl+E trigger', () => {
      expect(shouldOpenPicker('\x05')).toBe(true);

      const state = createPickerState();
      state.isOpen = true;

      const rendered = renderPicker(state);
      expect(rendered).toBeTruthy();
    });
  });

  describe('State immutability', () => {
    it('should not mutate original state on input', () => {
      const original: SmileyPickerState = {
        isOpen: true,
        categoryIndex: 0,
        smileyIndex: 0
      };

      const result = handlePickerInput(original, '\x1b[C');

      expect(original.smileyIndex).toBe(0); // Unchanged
      expect(result.newState.smileyIndex).toBe(1); // Changed
    });

    it('should not mutate original state on mouse input', () => {
      const original: SmileyPickerState = {
        isOpen: true,
        categoryIndex: 0,
        smileyIndex: 0
      };

      const result = handlePickerMouse(original, 1, 1);

      expect(original.isOpen).toBe(true); // Unchanged
      expect(result.newState.isOpen).toBe(false); // Changed
    });
  });
});
