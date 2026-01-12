/**
 * Mail Composer - Full-featured ANSI Message Editor
 *
 * Uses SDK's enhanced ansi-editor components for professional message composition
 * with ANSI color support, search/replace, clipboard operations, and more.
 */

import { CoreDoor as Door, type DoorContext, type KeyPress } from '@amiexpress/bbs-door-sdk';
import { Screen, Textbox, Box, Text, Autocomplete, AutocompleteTextbox, AutocompleteManager, UsernameProvider, BBSCodeProvider } from '@amiexpress/bbs-door-sdk';
import type { AutocompleteContext } from '@amiexpress/bbs-door-sdk';
import { PassThrough } from 'stream';
import {
  EditorState,
  Viewport,
  StatusBar,
  Toolbar,
  KeyboardHandler,
  SearchManager,
  SearchDialog,
  ColorPicker,
  type SearchOptions,
} from '@amiexpress/bbs-door-sdk/engines/ui/ansi-editor';

interface MessageDraft {
  to?: string;
  subject?: string;
  content: string;
  savedAt: Date;
}

const door = new Door({
  name: 'Mail Composer',
  version: '1.0.0',
  author: 'AmiExpress-Web',
  description: 'Full-featured ANSI editor for composing BBS messages',
});

let activeScreen: Screen | null = null;
let activeInput: PassThrough | null = null;

door.onStart(async (ctx: DoorContext) => {
  const { bbs, user, output, input } = ctx;
  const username = user?.username || 'Guest';

  if ((bbs as any)?.disableGameMode) {
    (bbs as any).disableGameMode();
  }

  // Create input stream to decouple from process.stdin
  // This prevents double/triple input handling (stdin + door.onInput)
  const inputThrough = new PassThrough();
  activeInput = inputThrough;

  // Create main screen
  const screen = new Screen({
    smartCSR: true,
    fullUnicode: true,
    input: inputThrough,
    title: 'Mail Composer',
    output: (data: string) => output.write(data),
  });

  activeScreen = screen;

  // Enable mouse events
  screen.enableMouse();
  if ((bbs as any)?.enableMouseEvents) {
    (bbs as any).enableMouseEvents();
  }

  // Clear screen to remove any previous BBS output
  output.write('\x1b[2J\x1b[H');

  const runComposer = async () => {
    try {
      await showComposer(screen, bbs, username, ctx);
    } finally {
      activeScreen = null;
      activeInput = null;
      screen.destroy();
    }
  };

  void runComposer();
});

door.onInput(async (_ctx: DoorContext, key: KeyPress) => {
  if (activeInput && key.raw) {
    activeInput.write(key.raw);
  }
});

/**
 * Show mail composer
 */
async function showComposer(screen: any, bbs: any, username: string, ctx: DoorContext): Promise<void> {
  // Parse command line params for recipient/subject
  const params = bbs?.getParams?.() || [];
  const recipient = params[0] || '';
  const subject = params[1] || '';

  // Load draft if exists
  const draft = await loadDraft(username, ctx);

  // Get usernames for autocomplete
  let usernames: string[] = [];
  try {
    if (bbs?.getUserList) {
      const users = await bbs.getUserList();
      usernames = users.map((u: any) => u.username || u.name || u).filter(Boolean);
    }
  } catch {
    // Silently fail - autocomplete will just be empty
  }

  // Show header editor first with username autocomplete
  const headerInfo = await showHeaderEditor(screen, recipient, subject, draft, usernames);
  if (!headerInfo) {
    // User cancelled
    ctx.close();
    return;
  }

  // Create editor state
  const state = new EditorState(
    draft?.content || '',
    undefined, // max lines
    79 // max line length (leave 1 for wrapping)
  );

  // Create toolbar
  const toolbar = new Toolbar({
    parent: screen,
  });

  // Create viewport with Panel-based rendering
  const viewport = new Viewport(state, {
    parent: screen,
    top: toolbar.getHeight(),
    bottom: 1,
    showLineNumbers: true,
    lineNumberWidth: 4,
  });

  // Create status bar
  const statusBar = new StatusBar(state, {
    parent: screen,
    bottom: 0,
  });

  // Create search manager
  const searchManager = new SearchManager(state.getLines());

  // Create autocomplete widget
  const ac = new Autocomplete({
    parent: screen,
    providers: [
      new UsernameProvider(usernames),
      new BBSCodeProvider()
    ]
  });

  let acClosedTimestamp = 0;

  ac.on('select', (suggestion) => {
    acClosedTimestamp = Date.now();
    state.insertText(suggestion.insertText);
    viewport.update();
    statusBar.update();
    screen.render();
  });

  ac.on('cancel', () => {
    acClosedTimestamp = Date.now();
    screen.render();
  });

  let exitRequested = false;

  // Autosave every 5 minutes
  const autosaveInterval = setInterval(async () => {
    const content = state.getContent();
    if (state.isModified() || content.trim()) {
      await saveDraft(username, {
        to: headerInfo.to,
        subject: headerInfo.subject,
        content,
        savedAt: new Date(),
      }, ctx);
      // Don't clear modified flag on autosave - user still needs to explicitly save
      statusBar.update();
      screen.render();
    }
  }, 5 * 60 * 1000); // 5 minutes

  // Create keyboard handler
  const keyboard = new KeyboardHandler(state, {
    onExit: () => {
      exitRequested = true;
    },
    onSave: async () => {
      const content = state.getContent();
      await saveDraft(username, {
        to: headerInfo.to,
        subject: headerInfo.subject,
        content,
        savedAt: new Date(),
      }, ctx);
      state.setModified(false);
      statusBar.update();
    },
    onHelp: () => showHelpDialog(screen),
    onFind: () => showFindDialog(screen, state, searchManager, viewport, statusBar),
    onFindNext: () => {
      const result = searchManager.findNext(state.getCursor());
      if (result) {
        state.setCursor({ line: result.line, col: result.col });
        state.setSelection(
          { line: result.line, col: result.col },
          { line: result.line, col: result.col + result.length }
        );
        viewport.update();
        statusBar.update();
        screen.render();
      }
    },
    onReplace: () => showReplaceDialog(screen, state, searchManager, viewport, statusBar),
    onColorPicker: () => showColorPickerDialog(screen, state, viewport, statusBar),
    onAutocomplete: async () => {
      const cursor = state.getCursor();
      const currentLine = state.getLine(cursor.line) || '';
      const context: AutocompleteContext = {
        currentLine,
        cursorPosition: cursor.col,
        documentContent: [...state.getLines()],
        lineNumber: cursor.line,
      };

      if (!ac.manager.shouldTrigger(context)) return;
      
      // Trigger suggestions
      await ac.suggest(context);
      
      if (ac.isVisible()) {
        // Automatically position relative to the cursor in the viewport
        const toolbarHeight = toolbar.getHeight();
        const lineNumberWidth = 4;
        const scroll = state.getScroll();
        const visualRow = toolbarHeight + (cursor.line - scroll.top);
        const visualCol = lineNumberWidth + cursor.col;

        // Position ac box
        ac.top = visualRow + 1;
        ac.left = visualCol;
        
        // Ensure it's on top and focused
        ac.setFront();
        ac.focus();
        screen.render();
      }
    },
  });

  // Initial render
  viewport.update();
  statusBar.update();
  screen.render();

  // Return a promise that resolves when the editor is closed
  return new Promise((resolve) => {
    // Handle exit logic
    async function handleExit() {
      // Clear autosave interval
      clearInterval(autosaveInterval);

      const content = state.getContent();
      if (state.isModified() || content.trim()) {
        const action = await confirmExitAction(screen);
        if (action === 'send') {
          const success = await sendMessage(bbs, {
            from: username,
            to: headerInfo.to,
            subject: headerInfo.subject,
            content,
          });
          if (success) {
            await showMessage(screen, 'Message Sent!', 'Your message has been sent successfully.');
            await clearDraft(username, ctx);
          } else {
            await showMessage(screen, 'Send Failed', 'Failed to send message. Draft has been saved.');
            await saveDraft(username, {
              to: headerInfo.to,
              subject: headerInfo.subject,
              content,
              savedAt: new Date(),
            }, ctx);
          }
          ctx.close();
          resolve();
        } else if (action === 'draft') {
          await saveDraft(username, {
            to: headerInfo.to,
            subject: headerInfo.subject,
            content,
            savedAt: new Date(),
          }, ctx);
          await showMessage(screen, 'Draft Saved', 'Your message has been saved as a draft.');
          ctx.close();
          resolve();
        } else if (action === 'discard') {
          await clearDraft(username, ctx);
          ctx.close();
          resolve();
        }
      } else {
        ctx.close();
        resolve();
      }
    }

    // Handle keyboard input
    screen.on('keypress', (ch: string, key: any) => {
      if (!key) return;

      // If autocomplete is visible OR was just closed (to prevent double Escape handling),
      // prevent editor from handling navigation keys.
      if (ac.isVisible() || (Date.now() - acClosedTimestamp < 50)) {
        if (['up', 'down', 'enter', 'tab', 'escape'].includes(key.name)) {
          return;
        }
      }

      const handled = keyboard.handleKey(
        key.name || ch,
        key.shift || false,
        key.ctrl || false,
        key.meta || false
      );

      if (handled) {
        // Auto-trigger or update autocomplete
        if (!key.ctrl && !key.meta && !key.alt) {
           const cursor = state.getCursor();
           const currentLine = state.getLine(cursor.line) || '';
           const context: AutocompleteContext = {
             currentLine,
             cursorPosition: cursor.col,
             documentContent: [...state.getLines()],
             lineNumber: cursor.line,
           };
           
           const isVisible = ac.isVisible();
           const shouldTrigger = ac.manager.shouldTrigger(context);

           if (isVisible || shouldTrigger) {
             ac.suggest(context).then(() => {
               if (ac.isVisible()) {
                 // Automatically position relative to the cursor in the viewport
                 const toolbarHeight = toolbar.getHeight();
                 const lineNumberWidth = 4;
                 const scroll = state.getScroll();
                 const visualRow = toolbarHeight + (cursor.line - scroll.top);
                 const visualCol = lineNumberWidth + cursor.col;

                 // Position ac box
                 ac.top = visualRow + 1;
                 ac.left = visualCol;
                 
                 ac.setFront();
                 ac.focus();
                 screen.render();
               } else if (isVisible) {
                 // It was visible but now isn't (filtered to 0 results), render to clear
                 screen.render();
               }
             });
           }
        }

        viewport.update();
        statusBar.update();
        screen.render();
      }

      if (exitRequested) {
        handleExit();
        exitRequested = false;
      }
    });
  });
}

/**
 * Show header editor (To, Subject)
 */
async function showHeaderEditor(
  screen: any,
  initialTo: string,
  initialSubject: string,
  draft?: MessageDraft,
  usernames: string[] = []
): Promise<{ to: string; subject: string } | null> {
  return new Promise((resolve) => {
    const container = new Box({
      parent: screen,
      top: 'center',
      left: 'center',
      width: 70,
      height: 12,
      border: 'line',
      style: {
        border: { fg: 'cyan' },
      },
      label: ' {cyan-fg}New Message{/} ',
      shadow: true,
    });

    new Text({
      parent: container,
      top: 1,
      left: 2,
      content: '{yellow-fg}To:{/}' + (usernames.length > 0 ? ' {gray-fg}(type to search users){/}' : ''),
    });

    // Use AutocompleteTextbox for the To field with username suggestions
    const toInput = new AutocompleteTextbox({
      parent: container,
      top: 2,
      left: 2,
      width: 64,
      height: 1,
      inputOnFocus: true,
      mouse: true,
      keys: true,
      value: draft?.to || initialTo,
      style: {
        fg: 'white',
        bg: 'blue',
        focus: { bg: 'green' },
      },
      // Autocomplete options
      suggestions: usernames,
      minLength: 1,
      maxSuggestions: 8,
      caseInsensitive: true,
      popupHeight: 10,
    });

    // Handle selection from autocomplete
    toInput.on('select', (suggestion: string) => {
      // Value is already set by the autocomplete, just render
      screen.render();
    });

    new Text({
      parent: container,
      top: 4,
      left: 2,
      content: '{yellow-fg}Subject:{/}',
    });

    const subjectInput = new Textbox({
      parent: container,
      top: 5,
      left: 2,
      width: 64,
      height: 1,
      inputOnFocus: true,
      mouse: true,
      keys: true,
      value: draft?.subject || initialSubject,
      style: {
        fg: 'white',
        bg: 'blue',
        focus: { bg: 'green' },
      },
    });

    new Text({
      parent: container,
      bottom: 1,
      left: 2,
      content: '{gray-fg}Tab{/}: Next field  {gray-fg}Enter{/}: Continue  {gray-fg}ESC{/}: Cancel',
      style: { fg: 'cyan' },
    });

    const inputs = [toInput, subjectInput];
    let currentIndex = 0;

    container.key(['tab'], () => {
      currentIndex = (currentIndex + 1) % inputs.length;
      inputs[currentIndex].focus();
      screen.render();
    });

    subjectInput.key(['enter'], () => {
      const to = toInput.getValue().trim();
      const subject = subjectInput.getValue().trim();
      if (!to) {
        toInput.focus();
        screen.render();
        return;
      }
      container.destroy();
      resolve({ to, subject: subject || '(no subject)' });
    });

    container.key(['escape'], () => {
      container.destroy();
      resolve(null);
    });

    if (toInput.getValue()) {
      subjectInput.focus();
    } else {
      toInput.focus();
    }
    screen.render();
  });
}

/**
 * Confirm exit action (send/draft/discard/cancel)
 */
async function confirmExitAction(
  screen: any,
): Promise<'send' | 'draft' | 'discard' | 'cancel'> {
  return new Promise((resolve) => {
    const box = new Box({
      parent: screen,
      top: 'center',
      left: 'center',
      width: 60,
      height: 12,
      border: 'line',
      style: {
        border: { fg: 'yellow' },
      },
      label: ' {yellow-fg}Exit Editor{/} ',
      shadow: true,
    });

    new Text({
      parent: box,
      top: 1,
      left: 2,
      right: 2,
      content: '{cyan-fg}What would you like to do?{/}',
    });

    const list = new (require('@amiexpress/bbs-door-sdk').List)({
      parent: box,
      top: 3,
      left: 2,
      right: 2,
      height: 4,
      items: [
        'Send message',
        'Save as draft',
        'Discard changes',
        'Cancel'
      ],
      keys: true,
      mouse: true,
      vi: true,
      style: {
        selected: {
          bg: 'blue',
          fg: 'white',
          bold: true
        },
        item: {
          fg: 'white'
        }
      }
    });

    list.on('select', (_item: any, index: number) => {
      box.destroy();
      screen.render();
      const actions = ['send', 'draft', 'discard', 'cancel'] as const;
      resolve(actions[index]);
    });

    list.key(['escape'], () => {
      box.destroy();
      screen.render();
      resolve('cancel');
    });

    box.focus();
    list.focus();
    screen.render();
  });
}

/**
 * Show help dialog
 */
function showHelpDialog(screen: any): void {
  const box = new (require('@amiexpress/bbs-door-sdk').ScrollableBox)({
    parent: screen,
    top: 'center',
    left: 'center',
    width: 60,
    height: 22,
    border: 'line',
    style: {
      border: { fg: 'cyan' },
      scrollbar: { bg: 'cyan' },
    },
    label: ' {cyan-fg}Mail Composer Help{/} ',
    shadow: true,
    content: [
      '{cyan-fg}Navigation:{/}',
      '  Arrow Keys    Move cursor',
      '  Home/End      Line start/end',
      '  PgUp/PgDown   Page up/down',
      '',
      '{cyan-fg}Editing:{/}',
      '  Backspace     Delete before cursor',
      '  Delete        Delete after cursor',
      '  Ctrl+Z        Undo',
      '  Ctrl+Y        Redo',
      '  Enter         New line',
      '',
      '{cyan-fg}Clipboard:{/}',
      '  Ctrl+C        Copy',
      '  Ctrl+X        Cut',
      '  Ctrl+V        Paste',
      '',
      '{cyan-fg}Other:{/}',
      '  F2            ANSI Color Picker',
      '  Ctrl+F        Find',
      '  Ctrl+H        Replace',
      '  Ctrl+Space    Autocomplete',
      '  Ctrl+S        Save draft',
      '  ESC           Exit/Send',
      '',
      '{yellow-fg}Press ESC to close...{/}',
    ].join('\n'),
    keys: true,
    mouse: true,
    vi: true,
    scrollable: true,
    alwaysScroll: true,
    scrollbar: {
      ch: ' '
    }
  });

  box.key(['escape', 'enter', 'space'], () => {
    box.destroy();
    screen.render();
  });

  box.focus();
  screen.render();
}

/**
 * Show find dialog
 */
function showFindDialog(
  screen: any,
  state: EditorState,
  searchManager: SearchManager,
  viewport: Viewport,
  statusBar: StatusBar
): void {
  const dialog = new SearchDialog({
    parent: screen,
    mode: 'find',
    onSearch: (query: string, options: SearchOptions) => {
      searchManager.updateLines(state.getLines());
      const results = searchManager.search(query, options);

      if (results.length > 0) {
        const result = searchManager.findNext(state.getCursor());
        if (result) {
          state.setCursor({ line: result.line, col: result.col });
          state.setSelection(
            { line: result.line, col: result.col },
            { line: result.line, col: result.col + result.length }
          );
          viewport.update();
          statusBar.update();
          screen.render();
        }
      }
      dialog.close();
    },
    onClose: () => {
      screen.render();
    },
  });

  dialog.show();
}

/**
 * Show replace dialog
 */
function showReplaceDialog(
  screen: any,
  state: EditorState,
  searchManager: SearchManager,
  viewport: Viewport,
  statusBar: StatusBar
): void {
  const dialog = new SearchDialog({
    parent: screen,
    mode: 'replace',
    onReplace: (query: string, replacement: string, replaceAll: boolean) => {
      searchManager.updateLines(state.getLines());
      const results = searchManager.search(query);

      if (results.length === 0) {
        dialog.close();
        return;
      }

      if (replaceAll) {
        const replacements = searchManager.replaceAll(replacement);
        for (let i = replacements.length - 1; i >= 0; i--) {
          const { position, oldText } = replacements[i];
          state.setCursor(position);
          state.setSelection(
            position,
            { line: position.line, col: position.col + oldText.length }
          );
          state.deleteSelection();
          state.insertText(replacement);
        }
      } else {
        const replaceInfo = searchManager.replaceCurrent(replacement);
        if (replaceInfo) {
          const { position, oldText } = replaceInfo;
          state.setCursor(position);
          state.setSelection(
            position,
            { line: position.line, col: position.col + oldText.length }
          );
          state.deleteSelection();
          state.insertText(replacement);
        }
      }

      viewport.update();
      statusBar.update();
      screen.render();
      dialog.close();
    },
    onClose: () => {
      screen.render();
    },
  });

  dialog.show();
}

/**
 * Show color picker dialog
 */
function showColorPickerDialog(
  screen: any,
  state: EditorState,
  viewport: Viewport,
  statusBar: StatusBar
): void {
  const picker = new ColorPicker({
    parent: screen,
    onColorSelect: (ansiCode: string) => {
      state.insertText(ansiCode);
      viewport.update();
      statusBar.update();
      screen.render();
    },
    onClose: () => {
      screen.render();
    },
  });

  picker.show();
}

/**
 * Show message dialog
 */
async function showMessage(
  screen: any,
  title: string,
  message: string
): Promise<void> {
  return new Promise((resolve) => {
    const msg = new (require('@amiexpress/bbs-door-sdk').Message)({
      parent: screen,
      top: 'center',
      left: 'center',
      width: '50%',
      height: 'shrink',
      border: 'line',
      style: {
        border: { fg: 'cyan' },
      },
      label: ` {cyan-fg}${title}{/} `,
      shadow: true,
    });

    msg.display(message + '\n\n{gray-fg}Press any key to continue...{/}', 0, () => {
      msg.destroy();
      screen.render();
      resolve();
    });
    
    screen.render();
  });
}

async function loadDraft(username: string, ctx: DoorContext): Promise<MessageDraft | null> {
  return ctx.storage.load<MessageDraft>(`draft_${username}.json`);
}

async function saveDraft(username: string, draft: MessageDraft, ctx: DoorContext): Promise<void> {
  await ctx.storage.save(`draft_${username}.json`, draft);
}

async function clearDraft(username: string, ctx: DoorContext): Promise<void> {
  if (await ctx.storage.exists(`draft_${username}.json`)) {
    await ctx.storage.delete(`draft_${username}.json`);
  }
}

async function sendMessage(
  bbs: any,
  message: {
    from: string;
    to: string;
    subject: string;
    content: string;
  }
): Promise<boolean> {
  try {
    await bbs.postMessage(message.to, message.subject, message.content);
    return true;
  } catch (error) {
    console.error('Failed to send message:', error);
    return false;
  }
}

export default door;
