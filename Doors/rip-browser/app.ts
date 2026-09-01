import {
  blessed,
  UIHelpers,
  AnsiColor,
  convertUnicodeBoxToACS,
  DoorInputManager
} from '@amiexpress/bbs-door-sdk';
import * as fs from 'fs';
import * as path from 'path';
import { ripGraphicsDir } from './paths';

const RIP_DIR = ripGraphicsDir();

export async function execute(session: any) {
  const { socket, bbsSession, user, params } = session;
  console.log(`[RIP Browser] Starting for user: ${user?.username || 'unknown'}`);
  console.log(`[RIP Browser] Working directory: ${process.cwd()}`);

  // Check if terminal supports Unicode (web terminals do, telnet/Amiga don't)
  const unicodeCapable = bbsSession?.unicodeCapable ?? true; // Default true for web

  // Initialize screen
  const screen = blessed.screen({
    smartCSR: true,
    fullUnicode: unicodeCapable,
    terminal: 'xterm',
    title: 'RIP Graphics Browser',
    width: 80,
    height: 24,
    output: (data: string) => {
      // Only apply ACS conversion for non-Unicode terminals (Amiga/telnet)
      const output = unicodeCapable ? data : convertUnicodeBoxToACS(data);
      socket.emit('ansi-output', output);
    }
  });

  console.log('[RIP Browser] Screen initialized');

  // Clear terminal and blessed buffer to wipe previous screen content
  screen.program.write('\x1b[2J');
  screen.program.write('\x1b[H');
  screen.clearRegion(0, screen.width, 0, screen.height);
  screen.alloc();

  // Create input manager (browser door, no game mode needed)
  const inputManager = new DoorInputManager(session, screen, {
    enableGameMode: false,  // Browser UI, not a game
    enableGrabKeys: false,  // Blessed widgets handle their own input
    enableMouse: true,      // List has mouse support
  });

  // Enable input
  inputManager.enable();

  // ========== UI COMPONENTS ========== 
  // ... (rest of the component setup code)

  const mainBox = blessed.box({
    parent: screen,
    width: '100%',
    height: '100%',
    style: {
      bg: 'black',
      fg: 'white'
    }
  });

  const header = blessed.box({
    parent: mainBox,
    top: 0,
    left: 0,
    width: '100%',
    height: 3,
    content: '{center}{yellow-fg}RIP Graphics Browser{/yellow-fg}{/center}\n{center}Use arrows to browse, ENTER to view, Q to quit{/center}',
    tags: true,
    border: { type: 'ascii' },  // Use ASCII borders to avoid Unicode issues
    style: {
      border: { fg: 'cyan' }
    }
  });

  const list = blessed.list({
    parent: mainBox,
    top: 3,
    left: 0,
    width: '100%',
    height: '100%-6',
    keys: true,
    mouse: true,
    vi: true,
    scrollbar: {
      ch: '█',
      track: { ch: '│' },
      style: { fg: 'cyan' }
    },
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

  const footer = blessed.box({
    parent: mainBox,
    bottom: 0,
    left: 0,
    width: '100%',
    height: 3,
    content: '{yellow-fg}Arrows:{/yellow-fg} Navigate  {yellow-fg}Enter:{/yellow-fg} View  {yellow-fg}F5:{/yellow-fg} Force View  {yellow-fg}Q:{/yellow-fg} Quit',
    tags: true,
    border: { type: 'ascii' },  // Use ASCII borders to avoid Unicode issues
    style: {
      border: { fg: 'cyan' }
    }
  });

  // ========== FILE LOADING ========== 

  const loadFiles = async () => {
    console.log(`[RIP Browser] Scanning directory: ${RIP_DIR}`);
    try {
      if (!fs.existsSync(RIP_DIR)) {
        console.error(`[RIP Browser] Directory not found: ${RIP_DIR}`);
        list.setItems(['Error: RIPgraphics directory not found']);
        screen.render();
        return;
      }

      const allFiles = fs.readdirSync(RIP_DIR);
      console.log(`[RIP Browser] Found ${allFiles.length} total files in directory`);

      const ripFiles = allFiles
        .filter(f => f.toLowerCase().endsWith('.rip'))
        .sort();

      console.log(`[RIP Browser] Found ${ripFiles.length} .RIP files`);

      if (ripFiles.length === 0) {
        list.setItems(['No .RIP files found']);
      } else {
        list.setItems(ripFiles);
      }
      
      // Ensure the first item is selected and UI is refreshed
      list.select(0);
      screen.render();
      console.log('[RIP Browser] File list updated and rendered');
    } catch (err: any) {
      console.error(`[RIP Browser] Error loading files: ${err.message}`);
      list.setItems([`Error: ${err.message}`]);
      screen.render();
    }
  };

  // ========== VIEW LOGIC ========== 

  const viewRip = async (filename: string) => {
    try {
      const filePath = path.join(RIP_DIR, filename);
      const content = fs.readFileSync(filePath, 'utf8');

      // 1. Enter RIP mode AND send content in one go
      // We do NOT call screen.render() here because it would send ANSI text 
      // that the terminal would try to interpret as RIP commands.
      socket.emit('ansi-output', '\x1b[1!' + content);
      
      // 2. Wait for any keypress to return
      // The RIP graphics are an overlay on the client, so the user just needs to press a key
      await new Promise<void>(resolve => {
        screen.once('keypress', () => resolve());
      });

      // 3. Exit RIP mode
      socket.emit('ansi-output', '\x1b[2!');
      
      // 4. Force a full redraw of the browser UI now that we are back in text mode
      screen.render();
    } catch (err: any) {
      footer.setContent(`{red-fg}Error: ${err.message}{/red-fg}`);
      screen.render();
    }
  };

  // ========== EVENT HANDLERS ========== 

  list.on('select item', (item: any) => {
    // Handle both string items and objects with content
    const filename = (typeof item === 'string' ? item : item.content || '').trim();
    footer.setContent(` Selected: {yellow-fg}${filename}{/yellow-fg} `);
    screen.render();
  });

  list.on('select', (item: any) => {
    const filename = (typeof item === 'string' ? item : item.content || '').trim();
    console.log(`[RIP Browser] Item selected: "${filename}"`);
    if (filename.toLowerCase().endsWith('.rip')) {
      console.log(`[RIP Browser] Opening RIP viewer for: ${filename}`);
      viewRip(filename);
    } else {
      console.log(`[RIP Browser] Ignored selection (not a .rip file)`);
    }
  });

  screen.key(['f5'], () => {
    const item = list.getItem(list.selected);
    const filename = (typeof item === 'string' ? item : (item as any)?.content || '').trim();
    if (filename.toLowerCase().endsWith('.rip')) {
      console.log(`[RIP Browser] Force View triggered for: ${filename}`);
      // Manually notify terminal to enter RIP mode via dedicated event
      socket.emit('rip-mode', { enabled: true });
      viewRip(filename);
    }
  });

  screen.key(['q', 'C-c', 'escape'], () => {
    screen.destroy();
    if (session.close) {
      session.close();
    }
  });

  // ========== INITIALIZATION ========== 

  // Use a slight delay to ensure screen dimensions are ready before loading
  setTimeout(() => {
    loadFiles();
    list.focus();
    console.log('[RIP Browser] Initial layout complete, rendering...');
    screen.render();
  }, 100);

  // Return promise that resolves when screen is destroyed
  return new Promise<void>((resolve) => {
    console.log('[RIP Browser] Entering event loop promise');
    screen.on('destroy', () => {
      console.log('[RIP Browser] Screen destroyed, resolving promise');
      inputManager.disable();
      resolve();
    });
  });
}
