import {
  blessed,
  UIHelpers,
  AnsiColor,
  convertUnicodeBoxToACS,
  DoorInputManager
} from '@amiexpress/bbs-door-sdk';
import * as fs from 'fs';
import * as path from 'path';
import { themeStyles, themeById, attachMasthead, footerHints, footerStyle, type Theme, type ThemeTokens, type ThemeStyles } from '@amiexpress/bbs-door-sdk/engines/ui/theme';
import { ripGraphicsDir } from './paths';

/** The caller's colours; every literal here was one of these tokens. */
let T: ThemeTokens = themeById('classic').tokens;
let S: ThemeStyles = themeStyles(themeById('classic'));
let THEME: Theme = themeById('classic');

const RIP_DIR = ripGraphicsDir();

export async function execute(session: any) {
  const { socket, bbsSession, user, params } = session;

  // This door predates the bbs API object - it is handed a socket and a
  // session, not a `bbs`, so `session.bbs.getTheme()` found nothing and it
  // silently stayed on classic while every other door followed the user's
  // choice. Reported as "rip looks totally unstyled".
  //
  // The preference is on the user either way; getTheme() in the backend
  // does exactly this (themeById(user?.themePreference)) and themeById
  // falls back to classic for an absent or unknown value.
  const host: any = session?.bbs;
  const theme: Theme = typeof host?.getTheme === 'function'
    ? host.getTheme()
    : themeById((user as any)?.themePreference ?? (user as any)?.themepreference);
  T = theme.tokens;
  S = themeStyles(theme);
  THEME = theme;
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
      bg: T.ground,
      fg: T.ink
    }
  });

  const header = blessed.box({
    parent: mainBox,
    top: 0,
    left: 0,
    width: '100%',
    height: 3,
    content: `\n{center}Use arrows to browse, ENTER to view, Q to quit{/center}`,
    tags: true,
    border: { type: 'ascii' },  // Use ASCII borders to avoid Unicode issues
    style: {
      border: { fg: T.accent }
    }
  });

  // The animated slash rail, on the header's first row. A child box keeps
  // it out of the outer geometry - nothing below moves, and a theme with no
  // rail (classic) gets the plain title it always had.
  const mastheadRow = blessed.box({
    parent: header,
    top: 0,
    left: 0,
    width: '100%-2',
    height: 1,
    tags: true,
    content: '',
    style: S.bar.style,
  });
  const stopMasthead = attachMasthead(mastheadRow as any, THEME, {
    title: 'RIP GRAPHICS BROWSER',
    // One column short: writing a row's last cell leaves the terminal in a
    // pending-wrap state and clips the final character.
    width: Math.max(1, ((screen as any).width || 80) - 3),
    rail: S.accent,
    ink: S.ink,
    render: () => screen.render(),
  });

  const list = blessed.list({
    parent: mainBox,
    top: 3,
    left: 0,
    width: '100%',
    height: '100%-4',   // header 3 + footer 1
    keys: true,
    mouse: true,
    vi: true,
    scrollbar: {
      ch: '█',
      track: { ch: '│' },
      style: { fg: T.accent }
    },
    style: {
      selected: {
        bg: T.bar,
        fg: T.ink,
        bold: true
      },
      item: {
        fg: T.ink
      }
    }
  });

  // One row, no frame. A bordered footer reads as a separate panel parked
  // at the bottom; a hint line is the same surface with some text on it.
  const footer = blessed.box({
    parent: mainBox,
    bottom: 0,
    left: 0,
    width: '100%',
    height: 1,
    content: ' ' + footerHints(
      [
        { key: 'Arrows', does: 'Navigate' },
        { key: 'Enter', does: 'View' },
        { key: 'F5', does: 'Force View' },
        { key: 'Q', does: 'Quit' },
      ],
      { key: S.key, dim: S.dim },
      S.rail
    ),
    tags: true,
    border: undefined,
    style: footerStyle(THEME),
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
      footer.setContent(`{${T.alert}-fg}Error: ${err.message}{/${T.alert}-fg}`);
      screen.render();
    }
  };

  // ========== EVENT HANDLERS ========== 

  list.on('select item', (item: any) => {
    // Handle both string items and objects with content
    const filename = (typeof item === 'string' ? item : item.content || '').trim();
    footer.setContent(` Selected: {${T.warn}-fg}${filename}{/${T.warn}-fg} `);
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
    // Stop the masthead first: a timer writing to a destroyed screen is how
    // a door takes the session with it.
    try { stopMasthead(); } catch { /* leaving anyway */ }
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
