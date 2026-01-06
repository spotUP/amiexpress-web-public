import {
  blessed,
  UIHelpers,
  AnsiColor
} from '@amiexpress/bbs-door-sdk';
import * as fs from 'fs';
import * as path from 'path';

const RIP_DIR = '~/Code/amiexpress-web/RIPgraphics';

export async function execute(session: any) {
  const { socket, bbsSession, user, params } = session;
  console.log(`[RIP Browser] Starting for user: ${user?.username || 'unknown'}`);

  // Initialize screen
  const screen = blessed.screen({
    smartCSR: true,
    title: 'RIP Graphics Browser',
    width: 80,
    height: 24,
    output: (data: string) => {
      socket.emit('ansi-output', data);
    }
  });

  console.log('[RIP Browser] Screen initialized');

  // Clear screen to wipe preloader
  screen.clear();

  // Connect input
  if (bbsSession) {
    bbsSession.doorInputHandler = (data: string) => {
      screen._handleData(data);
      return true;
    };
  }

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
    border: { type: 'line' },
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
    content: ' Selected: None ',
    border: { type: 'line' },
    style: {
      border: { fg: 'cyan' }
    }
  });

  // ========== FILE LOADING ========== 

  const loadFiles = () => {
    try {
      if (!fs.existsSync(RIP_DIR)) {
        list.addItem('Error: RIPgraphics directory not found');
        return;
      }

      const files = fs.readdirSync(RIP_DIR)
        .filter(f => f.toLowerCase().endsWith('.rip'))
        .sort();

      if (files.length === 0) {
        list.addItem('No .RIP files found');
      } else {
        files.forEach(f => list.addItem(f));
      }
    } catch (err: any) {
      list.addItem(`Error: ${err.message}`);
    }
  };

  // ========== VIEW LOGIC ========== 

  const viewRip = async (filename: string) => {
    try {
      const filePath = path.join(RIP_DIR, filename);
      const content = fs.readFileSync(filePath, 'utf8');

      // 1. Enter RIP mode
      socket.emit('ansi-output', '\x1b[1!');
      
      // 2. Send RIP content
      // We send it in chunks to avoid overwhelming the socket if it's large
      socket.emit('ansi-output', content);
      
      // 3. Keep the display up until user presses a key
      // We use a temporary transparent overlay or just listen for any key
      const overlay = blessed.box({
        parent: screen,
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        content: '{center}{inverse} PRESS ANY KEY TO RETURN TO BROWSER {/inverse}{/center}',
        tags: true,
        style: {
          bg: 'transparent',
          fg: 'white'
        }
      });
      
      screen.append(overlay);
      screen.render();

      await new Promise<void>(resolve => {
        const handler = () => {
          screen.remove(overlay);
          resolve();
        };
        screen.once('keypress', handler);
      });

      // 4. Exit RIP mode
      socket.emit('ansi-output', '\x1b[2!');
      
      // 5. Force a full redraw of the browser UI
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

  screen.key(['q', 'C-c', 'escape'], () => {
    screen.destroy();
    if (session.close) {
      session.close();
    }
  });

  // ========== INITIALIZATION ========== 

  loadFiles();
  list.focus();
  console.log('[RIP Browser] Initial layout complete, rendering...');
  screen.render();

  // Return promise that resolves when screen is destroyed
  return new Promise<void>((resolve) => {
    console.log('[RIP Browser] Entering event loop promise');
    screen.on('destroy', () => {
      console.log('[RIP Browser] Screen destroyed, resolving promise');
      if (bbsSession) {
        bbsSession.doorInputHandler = null;
      }
      resolve();
    });
  });
}
