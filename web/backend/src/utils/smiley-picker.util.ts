/**
 * ASCII Smiley Picker Utility
 *
 * Renders an ANSI-based smiley picker modal for BBS chat interfaces.
 * Uses cursor navigation and Enter to select, Escape to cancel.
 *
 * Triggered by Ctrl+E in chat modes.
 */

export interface SmileyCategory {
  name: string;
  smileys: string[];
}

export const SMILEY_CATEGORIES: SmileyCategory[] = [
  {
    name: 'Happy',
    smileys: [':)', ':D', ':-)', ';)', ':P', 'XD', '^_^', '=)', '=D', ':3']
  },
  {
    name: 'Sad',
    smileys: [':(', ':-(', ":'(", 'T_T', '>.<', '-_-', '._.', 'D:']
  },
  {
    name: 'Surprise',
    smileys: [':O', ':-O', ':o', 'O_O', 'O.O', 'o.o', '0_0', 'D:']
  },
  {
    name: 'Cool',
    smileys: ['B)', '8)', '8-)', 'B-)', '<3', ':*', ';*', 'xoxo']
  },
  {
    name: 'Fun',
    smileys: [':|', ':/', ':\\', '>:)', '>:D', '>:(', 'o/', '\\o/', '\\m/']
  },
  {
    name: 'Kaomoji',
    smileys: ['(^_^)', '(T_T)', '(*^_^*)', '(o_o)', '(-_-)', '(@_@)', '(;_;)', '\\(^o^)/']
  }
];

export interface SmileyPickerState {
  isOpen: boolean;
  categoryIndex: number;
  smileyIndex: number;
  savedScreen?: string;
}

/**
 * Create initial picker state
 */
export function createPickerState(): SmileyPickerState {
  return {
    isOpen: false,
    categoryIndex: 0,
    smileyIndex: 0
  };
}

/**
 * Get the currently selected smiley
 */
export function getSelectedSmiley(state: SmileyPickerState): string {
  const category = SMILEY_CATEGORIES[state.categoryIndex];
  return category.smileys[state.smileyIndex];
}

/**
 * Calculate picker dimensions
 */
function getPickerDimensions() {
  const maxSmileysPerRow = 5;
  const pickerWidth = 50;
  const pickerHeight = 14;
  const startX = Math.floor((80 - pickerWidth) / 2);
  const startY = Math.floor((24 - pickerHeight) / 2);
  return { pickerWidth, pickerHeight, startX, startY, maxSmileysPerRow };
}

/**
 * Render the smiley picker modal as ANSI escape sequences
 */
export function renderPicker(state: SmileyPickerState): string {
  const { pickerWidth, pickerHeight, startX, startY, maxSmileysPerRow } = getPickerDimensions();
  const category = SMILEY_CATEGORIES[state.categoryIndex];

  let output = '';

  // Save cursor and screen state
  output += '\x1b7'; // Save cursor
  output += '\x1b[?25l'; // Hide cursor

  // Draw box border
  const topBorder = '+' + '-'.repeat(pickerWidth - 2) + '+';
  const emptyLine = '|' + ' '.repeat(pickerWidth - 2) + '|';

  // Position and draw top border
  output += `\x1b[${startY};${startX}H`;
  output += `\x1b[44m\x1b[37m${topBorder}\x1b[0m`;

  // Title line
  output += `\x1b[${startY + 1};${startX}H`;
  const title = ' ASCII SMILEYS ';
  const titlePadding = Math.floor((pickerWidth - 2 - title.length) / 2);
  output += `\x1b[44m\x1b[37m|${' '.repeat(titlePadding)}\x1b[1;33m${title}\x1b[0m\x1b[44m\x1b[37m${' '.repeat(pickerWidth - 2 - titlePadding - title.length)}|\x1b[0m`;

  // Separator
  output += `\x1b[${startY + 2};${startX}H`;
  output += `\x1b[44m\x1b[37m|${'-'.repeat(pickerWidth - 2)}|\x1b[0m`;

  // Category tabs
  output += `\x1b[${startY + 3};${startX}H`;
  output += `\x1b[44m\x1b[37m| `;

  let visibleTabLen = 2;
  for (let i = 0; i < SMILEY_CATEGORIES.length; i++) {
    const cat = SMILEY_CATEGORIES[i];
    const shortName = cat.name.substring(0, 3);
    if (i === state.categoryIndex) {
      output += `\x1b[43m\x1b[30m[${shortName}]\x1b[0m\x1b[44m\x1b[37m `;
      visibleTabLen += 6;
    } else {
      output += `\x1b[40m${shortName}\x1b[44m `;
      visibleTabLen += 4;
    }
  }
  output += ' '.repeat(Math.max(0, pickerWidth - 1 - visibleTabLen));
  output += `|\x1b[0m`;

  // Empty line
  output += `\x1b[${startY + 4};${startX}H`;
  output += `\x1b[44m\x1b[37m${emptyLine}\x1b[0m`;

  // Smiley grid
  const smileys = category.smileys;
  
  for (let row = 0; row < 5; row++) {
    output += `\x1b[${startY + 5 + row};${startX}H`;
    output += `\x1b[44m\x1b[37m| `;

    let lineContent = '';
    for (let col = 0; col < maxSmileysPerRow; col++) {
      const idx = row * maxSmileysPerRow + col;
      if (idx < smileys.length) {
        const smiley = smileys[idx];
        const padded = smiley.padEnd(8);
        if (idx === state.smileyIndex) {
          lineContent += `\x1b[43m\x1b[30m${padded}\x1b[0m\x1b[44m\x1b[37m `;
        } else {
          lineContent += `\x1b[33m${padded}\x1b[37m `;
        }
      } else {
        lineContent += '         ';
      }
    }
    output += lineContent;
    // Add padding to reach the right border (pickerWidth - 2 inner space - 45 smiley space - 1 extra from '| ')
    output += ' '.repeat(pickerWidth - 2 - 45 - 1) + `|\x1b[0m`;
  }

  // Empty line before instructions
  output += `\x1b[${startY + 10};${startX}H`;
  output += `\x1b[44m\x1b[37m${emptyLine}\x1b[0m`;

  // Instructions
  output += `\x1b[${startY + 11};${startX}H`;
  const instructions = ' Arrows:Move Tab:Cat Enter:Sel Esc:Exit ';
  const instrPadding = Math.floor((pickerWidth - 2 - instructions.length) / 2);
  output += `\x1b[44m\x1b[37m|${' '.repeat(instrPadding)}\x1b[36m${instructions}\x1b[37m${' '.repeat(pickerWidth - 2 - instrPadding - instructions.length)}|\x1b[0m`;

  // Bottom border
  output += `\x1b[${startY + 12};${startX}H`;
  output += `\x1b[44m\x1b[37m${topBorder}\x1b[0m`;

  // Show cursor again
  output += '\x1b[?25h';

  return output;
}

/**
 * Render the picker closed (restore screen)
 */
export function renderPickerClosed(): string {
  // Restore cursor position
  return '\x1b8';
}

/**
 * Handle keyboard input for the picker
 * Returns: { action: 'select' | 'cancel' | 'update', smiley?: string }
 */
export function handlePickerInput(
  state: SmileyPickerState,
  input: string
): { action: 'select' | 'cancel' | 'update'; smiley?: string; newState: SmileyPickerState } {
  const category = SMILEY_CATEGORIES[state.categoryIndex];
  const maxSmileysPerRow = 5;
  const newState = { ...state };

  // Escape - cancel
  if (input === '\x1b' || input === '\x03') { // ESC or Ctrl+C
    newState.isOpen = false;
    return { action: 'cancel', newState };
  }

  // Enter - select
  if (input === '\r' || input === '\n') {
    newState.isOpen = false;
    return { action: 'select', smiley: getSelectedSmiley(state), newState };
  }

  // Tab - next category
  if (input === '\t') {
    newState.categoryIndex = (state.categoryIndex + 1) % SMILEY_CATEGORIES.length;
    newState.smileyIndex = 0;
    return { action: 'update', newState };
  }

  // Shift+Tab (backtab) - previous category
  if (input === '\x1b[Z') {
    newState.categoryIndex = (state.categoryIndex - 1 + SMILEY_CATEGORIES.length) % SMILEY_CATEGORIES.length;
    newState.smileyIndex = 0;
    return { action: 'update', newState };
  }

  // Arrow keys
  if (input.startsWith('\x1b[') || input.startsWith('\x1bO')) {
    const code = input.substring(2);

    // Up arrow
    if (code === 'A') {
      const newIdx = state.smileyIndex - maxSmileysPerRow;
      if (newIdx >= 0) {
        newState.smileyIndex = newIdx;
      }
      return { action: 'update', newState };
    }

    // Down arrow
    if (code === 'B') {
      const newIdx = state.smileyIndex + maxSmileysPerRow;
      if (newIdx < category.smileys.length) {
        newState.smileyIndex = newIdx;
      }
      return { action: 'update', newState };
    }

    // Right arrow
    if (code === 'C') {
      const newIdx = state.smileyIndex + 1;
      if (newIdx < category.smileys.length) {
        newState.smileyIndex = newIdx;
      }
      return { action: 'update', newState };
    }

    // Left arrow
    if (code === 'D') {
      const newIdx = state.smileyIndex - 1;
      if (newIdx >= 0) {
        newState.smileyIndex = newIdx;
      }
      return { action: 'update', newState };
    }
  }

  // Number keys 1-6 for quick category selection
  if (input >= '1' && input <= '6') {
    const catIdx = parseInt(input) - 1;
    if (catIdx < SMILEY_CATEGORIES.length) {
      newState.categoryIndex = catIdx;
      newState.smileyIndex = 0;
      return { action: 'update', newState };
    }
  }

  return { action: 'update', newState };
}

/**
 * Handle mouse input for the picker
 */
export function handlePickerMouse(
  state: SmileyPickerState,
  x: number, // 1-based
  y: number  // 1-based
): { action: 'select' | 'cancel' | 'update' | 'none'; smiley?: string; newState: SmileyPickerState } {
  const { pickerWidth, pickerHeight, startX, startY, maxSmileysPerRow } = getPickerDimensions();
  const newState = { ...state };

  // Check if click is outside the picker
  if (x < startX || x >= startX + pickerWidth || y < startY || y >= startY + pickerHeight) {
    // Click outside -> Cancel
    newState.isOpen = false;
    return { action: 'cancel', newState };
  }

  const relX = x - startX;
  const relY = y - startY;

  // Category Tabs (Line 3 relative to startY - 0-indexed offset from startY)
  // Render uses startY + 3 for tabs
  if (relY === 3) {
    let currentX = 2; // "| " offset
    for (let i = 0; i < SMILEY_CATEGORIES.length; i++) {
      const isSelected = i === state.categoryIndex;
      const width = isSelected ? 6 : 4; // "[XXX] " vs "XXX "
      
      if (relX >= currentX && relX < currentX + width) {
        // Clicked on this tab
        if (i !== state.categoryIndex) {
          newState.categoryIndex = i;
          newState.smileyIndex = 0;
          return { action: 'update', newState };
        }
        return { action: 'none', newState };
      }
      currentX += width;
    }
  }

  // Smiley Grid (Lines 5-9 relative to startY)
  if (relY >= 5 && relY < 10) {
    const row = relY - 5;
    
    if (relX >= 2) {
      const gridX = relX - 2; // Skip "| "
      const col = Math.floor(gridX / 9); // 9 chars per smiley
      
      if (col >= 0 && col < maxSmileysPerRow) {
        const idx = row * maxSmileysPerRow + col;
        const category = SMILEY_CATEGORIES[state.categoryIndex];
        
        if (idx < category.smileys.length) {
          newState.smileyIndex = idx;
          // Click on smiley -> Select it immediately
          newState.isOpen = false;
          return { action: 'select', smiley: category.smileys[idx], newState };
        }
      }
    }
  }

  return { action: 'none', newState };
}

/**
 * Check if a keystroke should open the smiley picker (Ctrl+E)
 */
export function shouldOpenPicker(input: string): boolean {
  return input === '\x05'; // Ctrl+E
}

/**
 * Generate ANSI to save the area where picker will be drawn
 * (For future enhancement - proper screen save/restore)
 */
export function savePickerArea(): string {
  // For now, we'll just use the cursor save/restore
  // A more sophisticated version would read the screen contents
  return '\x1b7\x1b[?1049h'; // Save cursor and switch to alternate screen buffer
}

/**
 * Generate ANSI to restore the area after picker closes
 */
export function restorePickerArea(): string {
  return '\x1b[?1049l\x1b8'; // Switch back from alternate buffer and restore cursor
}
