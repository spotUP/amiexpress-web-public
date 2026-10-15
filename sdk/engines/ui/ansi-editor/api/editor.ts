/**
 * Main ANSI Editor API
 * Full-featured ANSI art editor with text and drawing modes
 */

import { screen, box, type Screen } from '../../blessed';
import type { EditorSession, EditorOptions, SearchOptions, DrawingTool, EditorMode } from '../types';
import { EditorState } from '../core/editor-state';
import { Viewport } from '../rendering/viewport';
import { StatusBar } from '../ui/status-bar';
import { Toolbar } from '../ui/toolbar';
import { KeyboardHandler } from '../input/keyboard-handler';
import { SearchManager } from '../core/search';
import { SearchDialog } from '../ui/search-dialog';
import { ColorPicker } from '../ui/color-picker';
import { CharacterPicker, ColorPicker as DrawColorPicker } from '../ui/character-picker';
import { handleDrawEvent, undoDrawing } from '../tools/drawing-tools';
import { loadFile, saveFile } from '../core/file-ops';

/**
 * Show ANSI editor
 * Returns edited content or null if cancelled
 */
export async function showANSIEditor(
  session: EditorSession,
  options: EditorOptions = {}
): Promise<string | null> {
  return new Promise((resolve) => {
    // Create neo-blessed screen
    const editorScreen = screen({
      smartCSR: true,
      title: options.title || 'ANSI Editor',
      fullUnicode: true,
    });

    // Create editor state
    const state = new EditorState(
      options.initialContent || '',
      options.maxLines,
      options.maxLineLength
    );

    // Create toolbar (optional)
    let toolbar: Toolbar | undefined;
    if (options.toolbar !== false) {
      toolbar = new Toolbar({
        parent: editorScreen,
      });
    }

    // Create viewport
    const viewport = new Viewport(state, {
      parent: editorScreen,
      top: toolbar ? toolbar.getHeight() : 0,
      bottom: 1,
      showLineNumbers: options.showLineNumbers ?? true,
    });

    // Create status bar
    const statusBar = new StatusBar(state, {
      parent: editorScreen,
      bottom: 0,
    });

    // Create search manager
    const searchManager = new SearchManager(state.getLines());

    let exitRequested = false;
    let saveRequested = false;
    let isDrawing = false;

    // Create keyboard handler
    const keyboard = new KeyboardHandler(state, {
      onExit: () => {
        exitRequested = true;
      },
      onSave: async () => {
        saveRequested = true;
        if (options.onSave) {
          const mode = state.getMode();
          const content = mode === 'draw' ? state.canvasToANSI() : state.getContent();
          const success = await options.onSave(content);
          if (success) {
            state.setModified(false);
          }
        }
      },
      onHelp: () => {
        showHelp(editorScreen, state.getMode());
      },
      onFind: () => {
        if (state.getMode() === 'text') {
          showFindDialog(editorScreen, state, searchManager, viewport, statusBar);
        }
      },
      onFindNext: () => {
        if (state.getMode() === 'text') {
          // Find next from current cursor position
          const result = searchManager.findNext(state.getCursor());
          if (result) {
            state.setCursor({ line: result.line, col: result.col });
            state.setSelection(
              { line: result.line, col: result.col },
              { line: result.line, col: result.col + result.length }
            );
            viewport.update();
            statusBar.update();
            editorScreen.render();
          }
        }
      },
      onReplace: () => {
        if (state.getMode() === 'text') {
          showReplaceDialog(editorScreen, state, searchManager, viewport, statusBar);
        }
      },
      onColorPicker: () => {
        if (state.getMode() === 'text') {
          showColorPicker(editorScreen, state, viewport, statusBar);
        } else {
          // In draw mode, show draw color picker
          showDrawColorPicker(editorScreen, state, viewport, statusBar);
        }
      },
    });

    // Handle keyboard input
    editorScreen.on('keypress', (ch: string, key: any) => {
      if (!key) return;

      const mode = state.getMode();
      const keyName = key.name || ch;
      const shift = key.shift || false;
      const ctrl = key.ctrl || false;
      const meta = key.meta || false;

      // Mode switching (Ctrl+M)
      if (ctrl && keyName === 'm') {
        toggleMode(state, viewport, statusBar, editorScreen);
        return;
      }

      // Drawing mode keyboard shortcuts
      if (mode === 'draw') {
        let handled = false;

        // Tool selection (number keys 1-9, 0)
        if (keyName >= '1' && keyName <= '9') {
          const tools: DrawingTool[] = ['draw', 'line', 'box', 'box-fill', 'ellipse', 'ellipse-fill', 'fill', 'pick', 'select'];
          const toolIndex = parseInt(keyName) - 1;
          if (toolIndex < tools.length) {
            state.setCurrentTool(tools[toolIndex]);
            handled = true;
          }
        }

        // Character picker (C)
        if (keyName === 'c' && !ctrl) {
          showCharacterPicker(editorScreen, state, viewport, statusBar);
          handled = true;
        }

        // Foreground color picker (F)
        if (keyName === 'f' && !ctrl) {
          showDrawColorPicker(editorScreen, state, viewport, statusBar, 'fg');
          handled = true;
        }

        // Background color picker (B)
        if (keyName === 'b' && !ctrl) {
          showDrawColorPicker(editorScreen, state, viewport, statusBar, 'bg');
          handled = true;
        }

        // Toggle iCE colors (I)
        if (keyName === 'i' && !ctrl) {
          state.toggleIceColors();
          handled = true;
        }

        // Undo (Ctrl+Z or U in draw mode)
        if ((ctrl && keyName === 'z') || keyName === 'u') {
          if (undoDrawing(state)) {
            handled = true;
          }
        }

        // Clear canvas (Ctrl+L)
        if (ctrl && keyName === 'l') {
          state.clearCanvas();
          handled = true;
        }

        if (handled) {
          viewport.update();
          statusBar.update();
          editorScreen.render();
          return;
        }
      }

      // Text mode or unhandled draw mode keys - use keyboard handler
      const handled = keyboard.handleKey(keyName, shift, ctrl, meta);

      if (handled) {
        viewport.update();
        statusBar.update();
        editorScreen.render();
      }

      // Check for exit
      if (exitRequested) {
        if (state.isModified()) {
          // Confirm exit with unsaved changes
          confirmExit(editorScreen, () => {
            cleanup();
            resolve(null);
          }, () => {
            exitRequested = false;
          });
        } else {
          cleanup();
          resolve(null);
        }
      }
    });

    // Initial render
    viewport.update();
    statusBar.update();
    editorScreen.render();

    // Cleanup function
    function cleanup() {
      editorScreen.destroy();
    }
  });
}

/**
 * Toggle between text and draw mode
 */
function toggleMode(
  state: EditorState,
  viewport: Viewport,
  statusBar: StatusBar,
  parentScreen: Screen
): void {
  const currentMode = state.getMode();
  const newMode: EditorMode = currentMode === 'text' ? 'draw' : 'text';

  if (newMode === 'draw') {
    // Switching to draw mode - initialize canvas if needed
    if (!state.getCanvas()) {
      state.initializeCanvas(80, 25);
    }
  } else {
    // Switching to text mode - convert canvas to text if needed
    if (state.getCanvas()) {
      const ansiText = state.canvasToANSI();
      state.setContent(ansiText);
    }
  }

  state.setMode(newMode);
  viewport.update();
  statusBar.update();
  parentScreen.render();
}

/**
 * Show character picker dialog
 */
function showCharacterPicker(
  parentScreen: Screen,
  state: EditorState,
  viewport: Viewport,
  statusBar: StatusBar
): void {
  const picker = new CharacterPicker({
    parent: parentScreen,
    state,
    mode: 'common',
    onSelect: (char: string) => {
      viewport.update();
      statusBar.update();
      parentScreen.render();
    },
    onCancel: () => {
      parentScreen.render();
    },
  });

  picker.show();
}

/**
 * Show draw color picker dialog
 */
function showDrawColorPicker(
  parentScreen: Screen,
  state: EditorState,
  viewport: Viewport,
  statusBar: StatusBar,
  mode: 'fg' | 'bg' = 'fg'
): void {
  const picker = new DrawColorPicker({
    parent: parentScreen,
    state,
    mode,
    iceColors: state.isIceColorsEnabled(),
    onSelect: (color: number) => {
      viewport.update();
      statusBar.update();
      parentScreen.render();
    },
    onCancel: () => {
      parentScreen.render();
    },
  });

  picker.show();
}

/**
 * Show help dialog
 */
function showHelp(parentScreen: Screen, mode: EditorMode = 'text'): void {
  const helpBox = box({
    parent: parentScreen,
    top: 'center',
    left: 'center',
    width: 60,
    height: 20,
    border: {
      type: 'line',
    },
    style: {
      fg: 'white',
      bg: 'black',
      border: {
        fg: 'cyan',
      },
    },
    tags: true,
    label: ' {cyan-fg}Help{/} ',
  });

  const helpText = mode === 'text' ? `
{cyan-fg}Navigation:{/}
  Arrow Keys    Move cursor
  Home/End      Line start/end
  Ctrl+Home     Document start
  Ctrl+End      Document end
  PgUp/PgDown   Page up/down

{cyan-fg}Editing:{/}
  Insert        Toggle insert/overwrite
  Backspace     Delete before cursor
  Delete        Delete after cursor
  Ctrl+D        Delete line
  Ctrl+Z        Undo
  Ctrl+Y        Redo
  Enter         New line
  Tab           Insert spaces

{cyan-fg}Clipboard:{/}
  Ctrl+C        Copy
  Ctrl+X        Cut
  Ctrl+V        Paste
  Ctrl+A        Select all

{cyan-fg}Search:{/}
  Ctrl+F        Find
  Ctrl+H        Replace

{cyan-fg}Colors:{/}
  F2            ANSI Color Picker

{cyan-fg}Mode:{/}
  Ctrl+M        Switch to Draw Mode

{cyan-fg}File:{/}
  Ctrl+S        Save
  ESC           Exit
  F1            Help

{yellow-fg}Press any key to close...{/}
  ` : `
{cyan-fg}Navigation:{/}
  Arrow Keys    Move cursor
  Home/End      Jump to edges
  PgUp/PgDown   Scroll canvas

{cyan-fg}Tools (Number Keys):{/}
  1             Freehand Draw
  2             Line
  3             Box (Outline)
  4             Box (Filled)
  5             Ellipse (Outline)
  6             Ellipse (Filled)
  7             Flood Fill
  8             Eyedropper/Pick
  9             Block Selection

{cyan-fg}Drawing:{/}
  C             Character Picker
  F             Foreground Color
  B             Background Color
  I             Toggle iCE Colors
  U / Ctrl+Z    Undo
  Ctrl+L        Clear Canvas

{cyan-fg}Mode:{/}
  Ctrl+M        Switch to Text Mode

{cyan-fg}File:{/}
  Ctrl+S        Save (.ANS format)
  ESC           Exit
  F1            Help

{yellow-fg}Press any key to close...{/}
  `;

  helpBox.setContent(helpText);

  helpBox.on('keypress', () => {
    helpBox.destroy();
    parentScreen.render();
  });

  helpBox.focus();
  parentScreen.render();
}

/**
 * Confirm exit dialog
 */
function confirmExit(
  parentScreen: Screen,
  onConfirm: () => void,
  onCancel: () => void
): void {
  const confirmBox = box({
    parent: parentScreen,
    top: 'center',
    left: 'center',
    width: 50,
    height: 7,
    border: {
      type: 'line',
    },
    style: {
      fg: 'white',
      bg: 'black',
      border: {
        fg: 'yellow',
      },
    },
    tags: true,
    label: ' {yellow-fg}Confirm{/} ',
  });

  const text = `
  {yellow-fg}You have unsaved changes.{/}

  Exit without saving?

  {green-fg}[Y]{/} Yes   {red-fg}[N]{/} No
  `;

  confirmBox.setContent(text);

  confirmBox.on('keypress', (ch: string, key: any) => {
    if (key.name === 'y') {
      confirmBox.destroy();
      onConfirm();
    } else if (key.name === 'n' || key.name === 'escape') {
      confirmBox.destroy();
      onCancel();
      parentScreen.render();
    }
  });

  confirmBox.focus();
  parentScreen.render();
}

/**
 * Show find dialog
 */
function showFindDialog(
  parentScreen: Screen,
  state: EditorState,
  searchManager: SearchManager,
  viewport: Viewport,
  statusBar: StatusBar
): void {
  const dialog = new SearchDialog({
    parent: parentScreen,
    mode: 'find',
    onSearch: (query: string, options: SearchOptions) => {
      // Update search manager with current lines
      searchManager.updateLines(state.getLines());

      // Perform search
      const results = searchManager.search(query, options);

      if (results.length > 0) {
        // Find next from current cursor position
        const result = searchManager.findNext(state.getCursor());

        if (result) {
          // Move cursor to match
          state.setCursor({ line: result.line, col: result.col });

          // Select the match
          state.setSelection(
            { line: result.line, col: result.col },
            { line: result.line, col: result.col + result.length }
          );

          viewport.update();
          statusBar.update();
          parentScreen.render();
        }
      }

      dialog.close();
    },
    onClose: () => {
      parentScreen.render();
    },
  });

  dialog.show();
}

/**
 * Show replace dialog
 */
function showReplaceDialog(
  parentScreen: Screen,
  state: EditorState,
  searchManager: SearchManager,
  viewport: Viewport,
  statusBar: StatusBar
): void {
  const dialog = new SearchDialog({
    parent: parentScreen,
    mode: 'replace',
    onReplace: (query: string, replacement: string, replaceAll: boolean) => {
      // Update search manager with current lines
      searchManager.updateLines(state.getLines());

      // Perform search
      const results = searchManager.search(query);

      if (results.length === 0) {
        dialog.close();
        return;
      }

      if (replaceAll) {
        // Replace all occurrences
        const replacements = searchManager.replaceAll(replacement);

        // Apply replacements in reverse order to maintain positions
        for (let i = replacements.length - 1; i >= 0; i--) {
          const { position, oldText } = replacements[i];

          // Move cursor to position
          state.setCursor(position);

          // Select the text to replace
          state.setSelection(
            position,
            { line: position.line, col: position.col + oldText.length }
          );

          // Delete selection and insert replacement
          state.deleteSelection();
          state.insertText(replacement);
        }
      } else {
        // Replace current match
        const replaceInfo = searchManager.replaceCurrent(replacement);

        if (replaceInfo) {
          const { position, oldText } = replaceInfo;

          // Move cursor to position
          state.setCursor(position);

          // Select the text to replace
          state.setSelection(
            position,
            { line: position.line, col: position.col + oldText.length }
          );

          // Delete selection and insert replacement
          state.deleteSelection();
          state.insertText(replacement);
        }
      }

      viewport.update();
      statusBar.update();
      parentScreen.render();

      dialog.close();
    },
    onClose: () => {
      parentScreen.render();
    },
  });

  dialog.show();
}

/**
 * Show color picker dialog
 */
function showColorPicker(
  parentScreen: Screen,
  state: EditorState,
  viewport: Viewport,
  statusBar: StatusBar
): void {
  const picker = new ColorPicker({
    parent: parentScreen,
    onColorSelect: (ansiCode: string) => {
      // Insert ANSI code at current cursor position
      state.insertText(ansiCode);

      // Update display
      viewport.update();
      statusBar.update();
      parentScreen.render();
    },
    onClose: () => {
      parentScreen.render();
    },
  });

  picker.show();
}
