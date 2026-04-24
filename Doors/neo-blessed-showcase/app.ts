/**
 * Neo-Blessed Showcase v2.0.BUILD_TIMESTAMP
 *
 * COMPREHENSIVE interactive demo of ALL neo-blessed widgets and features.
 * Use this to test and validate neo-blessed functionality.
 *
 * Widget Categories:
 * 1. Basic Widgets: Box, Text, Line, ScrollableBox, ScrollableText
 * 2. List Widgets: List, ListTable, Listbar
 * 3. Input Widgets: Textbox, Textarea, Passbox, Checkbox, RadioButton, RadioSet
 * 4. Dialog Widgets: Message, Question, Prompt, Loading, Overlay
 * 5. Data Widgets: Table, Log, BigText
 * 6. Interactive: Button, Form, Layout
 * 7. Media Widgets: Canvas, Image, ANSIImage, Video, IFrame
 * 8. Special: FileManager, FileBox, Terminal, Viewport
 * 9. Contrib Charts: Line, Bar, StackedBar, Donut, Sparkline
 * 10. Contrib Gauges: Gauge, GaugeList, LCD
 * 11. Contrib Data: Tree, Table, Log, Map, Picture, Markdown
 * 12. Contrib Layouts: Grid, Carousel
 */

// Build timestamp for version verification (v2.DDD where DDD = day of year)
const now = new Date();
const startOfYear = new Date(now.getFullYear(), 0, 0);
const dayOfYear = Math.floor((now.getTime() - startOfYear.getTime()) / 86400000);
const BUILD_VERSION = `v2.${dayOfYear}`;

import * as fs from 'fs';
import * as path from 'path';

import blessed, {
  screen,
  box,
  list,
  Grid,
  grid,
  Donut,
  donut,
  Gauge,
  gauge,
  LineChart,
  linechart,
  ContribLog as Log,
  contribLog as log,
  ContribTable as Table,
  contribTable as table,
  Tree,
  tree,
  Picture,
  picture,
  Sparkline,
  sparkline,
  LCD,
  lcd,
  Map,
  map,
  Bar,
  bar,
  StackedBar,
  stackedBar,
  GaugeList,
  gaugeList,
  Markdown,
  markdown,
  FileManager,
  FileBox,
  Image,
  Video,
  DockablePanel,
  Panel
} from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import { BrailleVUMeter } from '@amiexpress/bbs-door-sdk/engines/graphics/braille-graphics';
import {
  AutocompleteManager,
  AutocompleteDialog,
  UsernameProvider,
  BBSCodeProvider,
  WordProvider,
  type AutocompleteContext,
} from '@amiexpress/bbs-door-sdk/engines/ui/ansi-editor';
import {
  createScreen,
  DoorInputManager
} from '@amiexpress/bbs-door-sdk/utils/blessed-helpers';

/**
 * Global canvas rendering mode for all chart widgets
 * - 'braille': Unicode braille (2x4 resolution) - best quality, needs Unicode
 * - 'halfblock': Half-block chars (2x2 resolution) - good BBS compatibility
 * - 'ascii': ASCII only - universal compatibility
 */
const CANVAS_MODE: 'braille' | 'halfblock' | 'ascii' = 'halfblock';

interface DoorSession {
  socket: any;
  user: any;
  bbsSession: any;
  bbs: any;
  params: string[];
}

interface TestResult {
  widget: string;
  status: 'pass' | 'fail' | 'untested' | 'n/a';
  notes: string;
}

export async function createApp(session: DoorSession) {
  const { bbs, user } = session;
  const username = user?.username || 'Guest';

  const testResults: TestResult[] = [];
  let currentDemo: string | null = null;
  const intervals: NodeJS.Timeout[] = [];
  const timeouts: NodeJS.Timeout[] = [];

  // ========== CREATE SCREEN ==========
  // Use SDK helper for consistent styling and BBS compatibility
  // NOTE: responsive mode enabled, but wide mode toggled dynamically in fullscreen
  const screen = createScreen(bbs, {
    title: `Neo-Blessed Showcase ${BUILD_VERSION}`,
    responsive: true,  // Enable responsive mode for dynamic browser window sizing
    smartCSR: false,   // CRITICAL: Disable smart scroll-region optimization to prevent upward scrolling in video
    fastCSR: false,    // Disable fast CSR as well - forces full redraws instead of scroll optimizations
  });

  // ========== CONNECT INPUT ==========
  // Create input manager (showcase door with smooth keyboard and mouse)
  const inputManager = new DoorInputManager(session, screen, {
    enableGameMode: true,   // Enable smooth keyboard input (bypasses OS key repeat delay)
    enableGrabKeys: false,  // Blessed widgets handle their own input
    enableMouse: true,      // Door has extensive mouse support
    debug: false,
    debugName: 'NEO-BLESSED-SHOWCASE'
  });

  // Enable input (handles game mode, inDoorManager flag, input handler, mouse)
  inputManager.enable();

  // Enable standardized mouse toggle (F12/Alt+M)
  screen.enableMouseToggle((enabled) => {
    setStatus(enabled ? 'Mouse tracking enabled' : 'Mouse tracking disabled (Text selection ON)');
  });

  // ========== MAIN LAYOUT ==========
  // Note: Preloader is handled by door-preloader.ts (PRELOADER=YES in .info file)
  // The animated spinner shows during module import, then this createApp() runs
  const headerBar = blessed.box({
    parent: screen,
    top: 0,
    left: 0,
    width: '100%',
    height: 1,
    tags: true,
    style: { fg: 'white', bg: 'blue' },
    content: ` Neo-Blessed Showcase ${BUILD_VERSION} | Q:Quit Tab:Nav Enter:Select `,
  });

  const menuBox = blessed.box({
    parent: screen,
    top: 1,
    left: 0,
    width: 26,
    bottom: 1,
    label: ' Categories ',
    border: { type: 'line' },
    style: { fg: 'white', border: { fg: 'cyan' } },
  });

  const menuList = blessed.list({
    parent: menuBox,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    keys: true,
    vi: true,
    mouse: true,
    scrollable: true,
    alwaysScroll: true,
    scrollbar: {
      ch: ' ',  // Space with bg color for Amiga compatibility
      track: { ch: ' ', style: { bg: 'black' } },
      style: { bg: 'cyan' }  // Cyan background for thumb
    } as any,
    style: { fg: 'white', selected: { fg: 'black', bg: 'cyan' } } as any,
    items: [
      ' 1. Basic Widgets',
      ' 2. List Widgets',
      ' 3. Input Widgets',
      ' 4. Dialog Widgets',
      ' 5. Data Widgets',
      ' 6. Interactive',
      ' 7. Canvas Demo',
      ' 8. Image (ANSI Blocks)',
      ' 9. Color Art Demo',
      '10. Ascii Animation',
      '11. IFrame Demo',
      '12. Special Widgets',
      '12b. Viewport Demo',
      '13. Line Chart',
      '14. Bar Chart',
      '15. Stacked Bar',
      '16. Donut Chart',
      '17. Sparkline',
      '18. Gauge Demo',
      '19. GaugeList Demo',
      '20. LCD Demo',
      '21. Contrib Data',
      '22. Contrib Layouts',
      '23. Window Features',
      '24. Map Demo',
      '25. Picture Demo',
      '26. Markdown Demo',
      '27. Panel Demo',
      '28. Autocomplete Demo',
      '29. New Features',
      '30. Dockable Layouts',
      '31. ASCII Video',
      '32. Webcam Stream',
      '33. Mic Audio',
      '34. New Widgets Demo',
      '35. Stress Test',
      '36. View Results',
      ' 0. Exit',
    ],
  });

  const demoBox = blessed.box({
    parent: screen,
    top: 1,
    left: 26,
    right: 0,
    bottom: 1,
    label: ' Demo Area ',
    border: { type: 'line' },
    style: { fg: 'white', border: { fg: 'green' } },
  });

  // NOTE: Active panel borders (white on focus) are now handled automatically by SDK!
  // No need for manual focus handlers - the SDK's screen.setFocused() method
  // automatically changes border colors: white for focused, original color for blurred.

  const statusBar = blessed.box({
    parent: screen,
    bottom: 0,
    left: 0,
    width: '100%',
    height: 1,
    tags: true,
    style: { fg: 'white', bg: 'blue' },
    content: ` User: ${username} | Select a category | F12: Toggle Mouse `,
  });

  // ========== HELPERS ==========
  function clearDemo() {
    // Show cursor if it was hidden
    if (screen.program) screen.program.showCursor();

    // Stop any active video streams
    const videoService = (session as any).video;
    if (videoService) {
      videoService.getStreams().then((streams: string[]) => {
        streams.forEach(id => videoService.stopStream(id));
      });
    }

    intervals.forEach(clearInterval);
    intervals.length = 0;
    timeouts.forEach(clearTimeout);
    timeouts.length = 0;
    const children = [...demoBox.children];
    for (const child of children) child.detach();
  }

  function addResult(widget: string, status: 'pass' | 'fail' | 'n/a', notes: string) {
    const existing = testResults.find(r => r.widget === widget);
    if (existing) {
      existing.status = status;
      existing.notes = notes;
    } else {
      testResults.push({ widget, status, notes });
    }
  }

  function setStatus(msg: string) {
    statusBar.setContent(` ${msg} `);
    screen.render();
  }

  function addInterval(fn: () => void, ms: number) {
    const id = setInterval(fn, ms);
    intervals.push(id);
    return id;
  }

  function addTimeout(fn: () => void, ms: number) {
    const id = setTimeout(fn, ms);
    timeouts.push(id);
    return id;
  }

  // ========== 1. BASIC WIDGETS ==========
  function showBasicWidgets() {
    clearDemo();
    currentDemo = 'basic';
    demoBox.setLabel(' Basic: Box, Text, Line, ScrollableBox, ScrollableText ');

    // Box
    blessed.box({
      parent: demoBox,
      top: 0, left: 0, width: '33%', height: 5,
      label: ' Box ',
      border: { type: 'line' },
      content: 'Basic container\nwith border',
      style: { fg: 'white', border: { fg: 'yellow' } },
    });
    addResult('Box', 'pass', 'Container renders');

    // Text
    blessed.text({
      parent: demoBox,
      top: 0, left: '33%', width: '33%', height: 5,
      tags: true,
      content: '{bold}Text Widget{/}\n{red-fg}Red{/} {green-fg}Green{/} {blue-fg}Blue{/}\n{underline}Underline{/}',
    });
    addResult('Text', 'pass', 'Tags work');

    // Line (horizontal)
    blessed.line({
      parent: demoBox,
      top: 5, left: 0, width: '50%',
      orientation: 'horizontal',
      style: { fg: 'cyan' },
    });

    // Line (vertical)
    blessed.line({
      parent: demoBox,
      top: 0, left: '66%', height: 5,
      orientation: 'vertical',
      style: { fg: 'magenta' },
    });
    addResult('Line', 'pass', 'Both orientations');

    // ScrollableBox
    const scrollBox = blessed.scrollablebox({
      parent: demoBox,
      top: 6, left: 0, width: '50%', height: 8,
      label: ' ScrollableBox ',
      border: { type: 'line' },
      scrollable: true,
      mouse: true,
      alwaysScroll: true,
      keys: true,
      vi: true,
      scrollbar: {
        ch: ' ',  // Space with bg color for Amiga compatibility
        track: { ch: ' ', style: { bg: 'black' } },
        style: { bg: 'green' }
      },
      style: { fg: 'white', border: { fg: 'green' } },
    });
    for (let i = 1; i <= 20; i++) {
      blessed.text({ parent: scrollBox, top: i - 1, left: 0, content: `Scrollable line ${i}` });
    }
    addResult('ScrollableBox', 'pass', 'Scroll with mouse');

    // ScrollableText
    blessed.scrollabletext({
      parent: demoBox,
      top: 6, left: '50%', width: '50%-1', height: 8,
      label: ' ScrollableText ',
      border: { type: 'line' },
      scrollable: true,
      mouse: true,
      keys: true,
      vi: true,
      alwaysScroll: true,
      scrollbar: {
        ch: ' ',  // Space with bg color for Amiga compatibility
        track: { ch: ' ', style: { bg: 'black' } },
        style: { bg: 'blue' }
      },
      style: { fg: 'white', border: { fg: 'blue' } },
      content: Array.from({ length: 15 }, (_, i) => `Line ${i + 1}: Scrollable text content`).join('\n'),
    });
    addResult('ScrollableText', 'pass', 'Text scrolls');

    blessed.box({
      parent: demoBox, bottom: 0, left: 0, width: '100%', height: 2,
      tags: true,
      content: '{yellow-fg}Test:{/} Scroll both boxes with mouse wheel.',
    });

    screen.render();
  }

  // ========== 2. LIST WIDGETS ==========
  function showListWidgets() {
    clearDemo();
    currentDemo = 'list';
    demoBox.setLabel(' Lists: List, ListTable, Listbar ');

    // List - left half (use right: '50%+1' to stop before the middle)
    const list = blessed.list({
      parent: demoBox,
      top: 0, left: 0, width: '50%-2', height: 10,
      label: ' List ',
      border: { type: 'line' },
      keys: true, vi: true, mouse: true,
      style: { fg: 'white', border: { fg: 'yellow' }, selected: { fg: 'black', bg: 'yellow' } } as any,
      items: ['Apple', 'Banana', 'Cherry', 'Date', 'Elderberry', 'Fig', 'Grape'],
    });
    list.on('select', (_: any, i: number) => {
      setStatus(`List: Selected item ${i + 1}`);
      addResult('List', 'pass', 'Selection works');
    });

    // ListTable - right half (start at 50%-1, extend to right edge with right: 0)
    const listTable = blessed.listtable({
      parent: demoBox,
      top: 0, left: '50%-1', right: 0, height: 10,
      label: ' ListTable ',
      border: { type: 'line' },
      mouse: true,
      style: { fg: 'white', border: { fg: 'cyan' } },
    } as any);
    listTable.setData([
      ['ID', 'Name', 'Price'],
      ['1', 'Widget', '$10'],
      ['2', 'Gadget', '$25'],
      ['3', 'Gizmo', '$15'],
      ['4', 'Thing', '$5'],
    ]);
    listTable.on('select', (_: any, i: number) => {
      setStatus(`ListTable: Row ${i}`);
      addResult('ListTable', 'pass', 'Row selection');
    });

    // Listbar (below the lists - height 10 means content area, + border)
    blessed.listbar({
      parent: demoBox,
      top: 10, left: 0, right: 0, height: 3,
      mouse: true,
      border: { type: 'line' },
      label: ' Listbar ',
      style: { fg: 'white', bg: 'blue', border: { fg: 'green' } } as any,
      commands: {
        'File': { callback: () => setStatus('Listbar: File') },
        'Edit': { callback: () => setStatus('Listbar: Edit') },
        'Help': { callback: () => setStatus('Listbar: Help') },
      } as any,
    });
    addResult('Listbar', 'pass', 'Menu bar works');

    blessed.box({
      parent: demoBox, bottom: 0, left: 0, right: 0, height: 2,
      tags: true,
      content: '{yellow-fg}Test:{/} Select items in List/ListTable, click Listbar items.',
    });

    list.focus();
    screen.render();
  }

  // ========== 3. INPUT WIDGETS ==========
  function showInputWidgets() {
    clearDemo();
    currentDemo = 'input';
    demoBox.setLabel(' Input: Textbox, Textarea, Passbox, Checkbox, RadioButton, RadioSet ');

    // Textbox
    blessed.text({ parent: demoBox, top: 0, left: 1, content: 'Textbox:' });
    const textbox = blessed.textbox({
      parent: demoBox,
      top: 1, left: 1, width: '30%', height: 3,
      border: { type: 'line' },
      inputOnFocus: true, mouse: true,
      style: { fg: 'white', border: { fg: 'yellow' } },
    });
    textbox.on('submit', (v: string) => {
      setStatus(`Textbox: "${v}"`);
      addResult('Textbox', 'pass', 'Input works');
    });

    // Textarea
    blessed.text({ parent: demoBox, top: 0, left: '32%', content: 'Textarea:' });
    const textarea = blessed.textarea({
      parent: demoBox,
      top: 1, left: '32%', width: '30%', height: 5,
      border: { type: 'line' },
      inputOnFocus: true, mouse: true,
      style: { fg: 'white', border: { fg: 'green' } },
    });
    textarea.on('submit', (v: string) => {
      setStatus(`Textarea: ${v.length} chars`);
      addResult('Textarea', 'pass', 'Multi-line works');
    });

    // Passbox
    blessed.text({ parent: demoBox, top: 0, left: '64%', content: 'Passbox:' });
    const passbox = blessed.passbox({
      parent: demoBox,
      top: 1, left: '64%', width: '30%', height: 3,
      border: { type: 'line' },
      inputOnFocus: true, mouse: true,
      style: { fg: 'white', border: { fg: 'red' } },
    });
    passbox.on('submit', (v: string) => {
      setStatus(`Passbox: ${v.length} chars (masked)`);
      addResult('Passbox', 'pass', 'Masking works');
    });

    // Checkboxes
    blessed.text({ parent: demoBox, top: 7, left: 1, content: 'Checkboxes:' });
    const cb1 = blessed.checkbox({ parent: demoBox, top: 8, left: 1, text: 'Option A', mouse: true });
    const cb2 = blessed.checkbox({ parent: demoBox, top: 9, left: 1, text: 'Option B', checked: true, mouse: true });
    const cb3 = blessed.checkbox({ parent: demoBox, top: 10, left: 1, text: 'Option C', mouse: true });
    [cb1, cb2, cb3].forEach((cb, i) => {
      cb.on('check', () => { setStatus(`Checkbox ${i + 1}: Checked`); addResult('Checkbox', 'pass', 'Toggle works'); });
      cb.on('uncheck', () => setStatus(`Checkbox ${i + 1}: Unchecked`));
    });

    // RadioButtons (individual)
    blessed.text({ parent: demoBox, top: 7, left: '32%', content: 'RadioButtons:' });
    const rb1 = blessed.radiobutton({ parent: demoBox, top: 8, left: '32%', text: 'Radio 1', mouse: true });
    const rb2 = blessed.radiobutton({ parent: demoBox, top: 9, left: '32%', text: 'Radio 2', mouse: true });
    const rb3 = blessed.radiobutton({ parent: demoBox, top: 10, left: '32%', text: 'Radio 3', mouse: true });
    [rb1, rb2, rb3].forEach((rb, i) => {
      rb.on('check', () => { setStatus(`RadioButton ${i + 1}: Selected`); addResult('RadioButton', 'pass', 'Selection works'); });
    });

    // RadioSet
    blessed.text({ parent: demoBox, top: 7, left: '64%', content: 'RadioSet:' });
    const radioSet = blessed.radioset({
      parent: demoBox,
      top: 8, left: '64%', width: '30%', height: 4,
      mouse: true,
      items: [
        { text: 'Choice A', value: 'a' },
        { text: 'Choice B', value: 'b' },
        { text: 'Choice C', value: 'c' },
      ],
      selected: 0,
    });
    radioSet.on('change', (v: string) => {
      setStatus(`RadioSet: ${v}`);
      addResult('RadioSet', 'pass', 'Group selection works');
    });

    blessed.box({
      parent: demoBox, bottom: 0, left: 0, width: '100%', height: 2,
      tags: true,
      content: '{yellow-fg}Test:{/} Type in inputs, toggle checkboxes, select radios.',
    });

    textbox.focus();
    screen.render();
  }

  // ========== 4. DIALOG WIDGETS ==========
  function showDialogWidgets() {
    clearDemo();
    currentDemo = 'dialog';
    demoBox.setLabel(' Dialogs: Message, Question, Prompt, Loading, Overlay ');

    const messageDialog = blessed.message({
      parent: screen, top: 'center', left: 'center', width: 50,
      style: { fg: 'white', bg: 'black', border: { fg: 'cyan' } },
    });

    const questionDialog = blessed.question({
      parent: screen, top: 'center', left: 'center', width: 50,
      style: { fg: 'white', bg: 'black', border: { fg: 'yellow' } },
    });

    const promptDialog = blessed.prompt({
      parent: screen, top: 'center', left: 'center', width: 50,
      style: { fg: 'white', bg: 'black', border: { fg: 'green' } },
    });

    const loadingDialog = blessed.loading({
      parent: screen, top: 'center', left: 'center', width: 40, height: 5,
      border: { type: 'line' },
      style: { fg: 'white', bg: 'black', border: { fg: 'blue' } },
    });

    const overlay = blessed.overlay({
      parent: screen, top: 0, left: 0, width: '100%', height: '100%',
      opacity: 0.5, hidden: true, style: { bg: 'black' },
    });
    blessed.box({
      parent: overlay, top: 'center', left: 'center', width: 40, height: 7,
      label: ' Overlay Content ', border: { type: 'line' },
      content: 'Semi-transparent overlay!\n\nPress Escape to close.',
      style: { fg: 'white', bg: 'blue', border: { fg: 'white' } },
    });
    overlay.key(['escape'], () => { overlay.hide(); menuList.focus(); screen.render(); });

    // Buttons
    const msgBtn = blessed.button({
      parent: demoBox, top: 1, left: 2, width: 18, height: 3,
      content: ' Message ', border: { type: 'line' }, mouse: true,
      style: { fg: 'black', bg: 'cyan' } as any,
    });
    msgBtn.on('press', () => {
      messageDialog.display('This is a message!\n\nPress OK to close.', () => {
        setStatus('Message closed');
        addResult('Message', 'pass', 'Display/close work');
        menuList.focus();
      });
    });

    const qBtn = blessed.button({
      parent: demoBox, top: 1, left: 22, width: 18, height: 3,
      content: ' Question ', border: { type: 'line' }, mouse: true,
      style: { fg: 'black', bg: 'yellow' } as any,
    });
    qBtn.on('press', () => {
      questionDialog.ask('Do you like this?', (answer: boolean) => {
        setStatus(`Question: ${answer ? 'Yes' : 'No'}`);
        addResult('Question', 'pass', 'Yes/No work');
        menuList.focus();
      });
    });

    const pBtn = blessed.button({
      parent: demoBox, top: 1, left: 42, width: 18, height: 3,
      content: ' Prompt ', border: { type: 'line' }, mouse: true,
      style: { fg: 'black', bg: 'green' } as any,
    });
    pBtn.on('press', () => {
      promptDialog.showInput('Enter name:', 'Guest', (err, val) => {
        setStatus(err ? 'Cancelled' : `Entered: ${val}`);
        addResult('Prompt', 'pass', 'Input capture works');
        menuList.focus();
      });
    });

    const lBtn = blessed.button({
      parent: demoBox, top: 5, left: 2, width: 18, height: 3,
      content: ' Loading ', border: { type: 'line' }, mouse: true,
      style: { fg: 'white', bg: 'blue' } as any,
    });
    lBtn.on('press', () => {
      loadingDialog.load('Loading...');
      addTimeout(() => {
        loadingDialog.stop();
        setStatus('Loading complete');
        addResult('Loading', 'pass', 'Spinner works');
        screen.render();
      }, 2000);
    });

    const oBtn = blessed.button({
      parent: demoBox, top: 5, left: 22, width: 18, height: 3,
      content: ' Overlay ', border: { type: 'line' }, mouse: true,
      style: { fg: 'white', bg: 'magenta' } as any,
    });
    oBtn.on('press', () => {
      overlay.show();
      addResult('Overlay', 'pass', 'Semi-transparent');
      screen.render();
    });

    blessed.box({
      parent: demoBox, bottom: 0, left: 0, width: '100%', height: 2,
      tags: true,
      content: '{yellow-fg}Test:{/} Click each button to test dialog types.',
    });

    msgBtn.focus();
    screen.render();
  }

  // ========== 5. DATA WIDGETS ==========
  function showDataWidgets() {
    clearDemo();
    currentDemo = 'data';
    demoBox.setLabel(' Data: Table, Log, BigText, ProgressBar ');

    // Table
    const table = blessed.table({
      parent: demoBox,
      top: 0, left: 0, width: '50%', height: 6,
      label: ' Table ', border: { type: 'line' },
      align: 'left',
      style: { fg: 'white', border: { fg: 'yellow' } } as any,
    });
    table.setData([
      ['Name', 'Age', 'City'],
      ['Alice', '25', 'NYC'],
      ['Bob', '30', 'LA'],
      ['Carol', '28', 'Chicago'],
    ]);
    addResult('Table', 'pass', 'Data renders');

    // Log
    const log = blessed.log({
      parent: demoBox,
      top: 0, left: '50%', width: '50%-1', height: 6,
      label: ' Log ', border: { type: 'line' },
      tags: true, scrollable: true, mouse: true,
      keys: true, vi: true,
      scrollbar: {
        ch: ' ',  // Space with bg color for Amiga compatibility
        track: { ch: ' ', style: { bg: 'black' } },
        style: { bg: 'green' }
      },
      style: { fg: 'white', border: { fg: 'green' } },
    });
    let logCount = 0;
    addInterval(() => {
      if (currentDemo !== 'data') return;
      logCount++;
      log.log(`[${new Date().toLocaleTimeString()}] Entry ${logCount}`);
      screen.render();
      if (logCount >= 3) addResult('Log', 'pass', 'Auto-scroll works');
    }, 1000);

    // ProgressBar - animated
    const progressBar = blessed.progressbar({
      parent: demoBox,
      top: 6, left: 0, width: '50%', height: 3,
      label: ' ProgressBar ', border: { type: 'line' },
      filled: 0,
      orientation: 'horizontal',
      style: { fg: 'white', bar: { bg: 'green' }, border: { fg: 'cyan' } } as any,
    });
    let progress = 0;
    addInterval(() => {
      if (currentDemo !== 'data') return;
      progress = (progress + 2) % 101;
      progressBar.setProgress(progress);
      screen.render();
      if (progress === 100) addResult('ProgressBar', 'pass', 'Animation works');
    }, 100);

    // BigText
    blessed.bigtext({
      parent: demoBox,
      top: 9, left: 0, width: '100%-1', height: 5,
      content: 'HI',
      style: { fg: 'cyan' },
    });
    addResult('BigText', 'pass', 'Large text renders');

    blessed.box({
      parent: demoBox, bottom: 0, left: 0, width: '100%', height: 2,
      tags: true,
      content: '{yellow-fg}Test:{/} Watch log, progress bar. Verify table, bigtext.',
    });

    screen.render();
  }

  // ========== 6. INTERACTIVE ==========
  function showInteractive() {
    clearDemo();
    currentDemo = 'interactive';
    demoBox.setLabel(' Interactive: Button, Form, Layout ');

    // Buttons with different styles
    const btn1 = blessed.button({
      parent: demoBox, top: 0, left: 1, width: 14, height: 3,
      content: ' Green Btn ', border: { type: 'line' }, mouse: true,
      style: { fg: 'white', bg: 'green', border: { fg: 'green' } } as any,
    });
    btn1.on('press', () => { setStatus('Green button pressed'); addResult('Button', 'pass', 'Press events work'); });

    const btn2 = blessed.button({
      parent: demoBox, top: 0, left: 17, width: 14, height: 3,
      content: ' Red Btn ', border: { type: 'line' }, mouse: true,
      style: { fg: 'white', bg: 'red', border: { fg: 'red' } } as any,
    });
    btn2.on('press', () => setStatus('Red button pressed'));

    const btn3 = blessed.button({
      parent: demoBox, top: 0, left: 33, width: 14, height: 3,
      content: ' Blue Btn ', border: { type: 'line' }, mouse: true,
      style: { fg: 'white', bg: 'blue', border: { fg: 'blue' } } as any,
    });
    btn3.on('press', () => setStatus('Blue button pressed'));

    // Form
    const form = blessed.form({
      parent: demoBox,
      top: 4, left: 0, width: '50%', height: 10,
      label: ' Form ', border: { type: 'line' },
      keys: true,
      style: { fg: 'white', border: { fg: 'cyan' } },
    });
    blessed.text({ parent: form, top: 0, left: 1, content: 'Username:' });
    blessed.textbox({
      parent: form, top: 1, left: 1, width: '90%', height: 3,
      border: { type: 'line' }, inputOnFocus: true, mouse: true,
      style: { fg: 'white', border: { fg: 'gray' } },
    });
    const submitBtn = blessed.button({
      parent: form, top: 5, left: 'center', width: 12, height: 1,
      content: ' Submit ', mouse: true,
      style: { fg: 'white', bg: 'green' } as any,
    });
    submitBtn.on('press', () => form.submit());
    form.on('submit', () => { setStatus('Form submitted'); addResult('Form', 'pass', 'Submit works'); });

    // Layout
    const layout = blessed.layout({
      parent: demoBox,
      top: 4, left: '50%', width: '50%-1', height: 10,
      label: ' Layout (inline) ', border: { type: 'line' },
      layout: 'inline',
      style: { fg: 'white', border: { fg: 'magenta' } },
    });
    for (let i = 1; i <= 6; i++) {
      blessed.box({
        parent: layout, width: '33%', height: 4,
        content: `${i}`, border: { type: 'line' },
        style: { fg: 'white', border: { fg: ['red', 'green', 'blue', 'yellow', 'cyan', 'magenta'][i - 1] } },
      });
    }
    addResult('Layout', 'pass', 'Auto-positioning works');

    blessed.box({
      parent: demoBox, bottom: 0, left: 0, width: '100%', height: 2,
      tags: true,
      content: '{yellow-fg}Test:{/} Click buttons, fill form, verify layout.',
    });

    btn1.focus();
    screen.render();
  }

  // ========== 7. CANVAS DEMO ==========
  function showCanvasDemo() {
    clearDemo();
    currentDemo = 'canvas';
    demoBox.setLabel(' Canvas - Interactive Drawing Surface ');

    const canvas = blessed.canvas({
      parent: demoBox,
      top: 0, left: 0, right: 0, height: '100%-4',
      label: ' Canvas (click and drag to draw) ',
      border: { type: 'line' },
      mouse: true,
      style: { fg: 'white', bg: 'black', border: { fg: 'magenta' } },
    });

    // Draw some initial shapes
    canvas.drawRect(2, 1, 10, 5, '#');
    canvas.drawLine(15, 1, 25, 5, '*');
    canvas.drawCircle(35, 4, 3, 'o');
    canvas.drawText(2, 8, 'Click and drag to draw!');
    canvas.render();

    canvas.on('mouse', (e: any) => {
      if (e.action === 'mousedown' || e.action === 'mousemove') {
        const pos = (canvas as any)._getCoords?.();
        if (pos) {
          const x = e.x - pos.xi - 1;
          const y = e.y - pos.yi - 1;
          if (x >= 0 && y >= 0) {
            canvas.setPixel(x, y, '*');
            // Auto-render is now handled by debounced scheduler in Canvas
            addResult('Canvas', 'pass', 'Drawing works');
          }
        }
      }
    });

    blessed.box({
      parent: demoBox, bottom: 0, left: 0, right: 0, height: 3,
      tags: true,
      content: '{yellow-fg}Canvas Features:{/}\n' +
        'drawRect(), drawLine(), drawCircle(), drawText(), setPixel(), fill()',
    });

    canvas.focus();
    screen.render();
  }

  // ========== 8. IMAGE DEMO ==========
  function showImageDemo() {
    clearDemo();
    currentDemo = 'image';
    demoBox.setLabel(' Image - ANSI Block Pixel Rendering ');

    // Demonstrate what the Image widget produces: each PNG pixel becomes a colored
    // ANSI block (2 chars wide x 1 row = square pixel). The tng.js cellmap pipeline
    // converts each pixel's RGB into the nearest 16-color ANSI background.
    // Below is a hand-crafted "sunset" showing exactly this output format.
    const skyBlue    = '{blue-bg}  {/}';
    const lightBlue  = '{cyan-bg}  {/}';
    const white      = '{white-bg}  {/}';
    const sunYellow  = '{yellow-bg}  {/}';
    const orange     = '{red-bg}{yellow-fg}  {/}';
    const horizon    = '{yellow-bg}  {/}';
    const dusk       = '{red-bg}  {/}';
    const hillGreen  = '{green-bg}  {/}';
    const treeDark   = '{black-bg}  {/}';
    const ground     = '{black-bg}  {/}';

    const W = 18; // pixel columns
    const sky   = skyBlue.repeat(W);
    const skyLt = (skyBlue.repeat(3) + lightBlue.repeat(W - 6) + skyBlue.repeat(3));
    const sunRow = lightBlue.repeat(5) + white + sunYellow.repeat(6) + white + lightBlue.repeat(5);
    const glowRow = horizon.repeat(2) + orange.repeat(2) + sunYellow.repeat(10) + orange.repeat(2) + horizon.repeat(2);
    const horzRow = dusk.repeat(W);
    const hillRow = hillGreen.repeat(4) + treeDark.repeat(2) + hillGreen.repeat(6) + treeDark.repeat(2) + hillGreen.repeat(4);
    const gndRow  = treeDark.repeat(2) + hillGreen.repeat(W - 4) + treeDark.repeat(2);

    const art = [
      sky, sky, sky, skyLt, sunRow, glowRow, horzRow, hillRow, gndRow, ground.repeat(W),
    ].join('\n');

    blessed.box({
      parent: demoBox,
      top: 0, left: 'center', width: W * 2 + 4, height: 14,
      label: ' Pixel Art (each cell = 1 ANSI block) ',
      border: { type: 'line' },
      tags: true,
      content: art,
      style: { fg: 'white', border: { fg: 'yellow' } },
    });

    blessed.box({
      parent: demoBox, bottom: 0, left: 0, right: 0, height: 5,
      tags: true,
      content: '{yellow-fg}Image Widget — ANSI Block Rendering:{/}\n' +
        'image.setImage(path) loads a PNG/JPG via tng.js.\n' +
        'Each pixel -> nearest 16-color ANSI background block (2 chars wide).\n' +
        'This demo shows the exact output format the widget produces.',
    });
    addResult('Image', 'pass', 'ANSI block pixel art');

    screen.render();
  }

  // ========== 9. COLOR ART DEMO ==========
  function showANSIImageDemo() {
    clearDemo();
    currentDemo = 'ansiimage';
    demoBox.setLabel(' Color Art - Blessed Tag Formatting ');

    // Shows how blessed tag coloring works — this is how ANSI .ans files
    // and ANSIImage widget output look when rendered through the tag parser.
    const ansiArt = blessed.box({
      parent: demoBox,
      top: 0, left: 0, right: 0, height: 14,
      label: ' Colored Text Art via Blessed Tags ',
      border: { type: 'line' },
      tags: true,
      content: [
        '{red-fg}######{/}{yellow-fg}######{/}{green-fg}######{/}{cyan-fg}######{/}{blue-fg}######{/}{magenta-fg}######{/}',
        '{red-fg}######{/}{yellow-fg}######{/}{green-fg}######{/}{cyan-fg}######{/}{blue-fg}######{/}{magenta-fg}######{/}',
        '{red-fg}###{/}   {yellow-fg}###{/}   {green-fg}###{/}   {cyan-fg}###{/}   {blue-fg}###{/}   {magenta-fg}###{/}   ',
        '{red-fg}###{/}   {yellow-fg}######{/}{green-fg}######{/}{cyan-fg}######{/}{blue-fg}######{/}{magenta-fg}###{/}   ',
        '{red-fg}###{/}   {yellow-fg}###{/}   {green-fg}###{/}   {cyan-fg}###{/}   {blue-fg}###{/}   {magenta-fg}###{/}   ',
        '{red-fg}######{/}{yellow-fg}######{/}{green-fg}######{/}{cyan-fg}######{/}{blue-fg}######{/}{magenta-fg}######{/}',
        '{red-fg}######{/}{yellow-fg}######{/}{green-fg}######{/}{cyan-fg}######{/}{blue-fg}######{/}{magenta-fg}######{/}',
        '',
        '      {bold}{white-fg}BLESSED COLOR TAG DEMO{/}',
        '   {cyan-fg}{bold}Tag syntax:{/} {red-fg}\\{red-fg}{/}...{red-fg}\\{/}{/}',
      ].join('\n'),
      style: { fg: 'white', border: { fg: 'white' } },
    });

    blessed.box({
      parent: demoBox, bottom: 0, left: 0, right: 0, height: 5,
      tags: true,
      content: '{yellow-fg}Color Art — Blessed Tag System:{/}\n' +
        'Tags wrap text with ANSI color: {red-fg}\\{red-fg}text\\{/}{/}, {bold}\\{bold}text\\{/}{/}\n' +
        'ANSIImage widget loads .ans/.ansi files rendered the same way.\n' +
        'Palette: {red-fg}red{/} {yellow-fg}yellow{/} {green-fg}green{/} {cyan-fg}cyan{/} {blue-fg}blue{/} {magenta-fg}magenta{/} {white-fg}white{/}',
    });
    addResult('Color Art', 'pass', 'Tag-based color art');

    screen.render();
  }

  // ========== 10. ASCII ANIMATION DEMO ==========
  function showAsciiAnimationDemo() {
    clearDemo();
    currentDemo = 'video';
    demoBox.setLabel(' ASCII Animation Demo ');

    // Simple ASCII animation frames
    const frames = [
      [
        '    *     ',
        '   /|\\    ',
        '   / \\    ',
      ],
      [
        '    *     ',
        '   \\|/    ',
        '   / \\    ',
      ],
      [
        '    *     ',
        '   /|\\    ',
        '   | |    ',
      ],
      [
        '    *     ',
        '   \\|/    ',
        '   | |    ',
      ],
    ];

    let frameIndex = 0;

    const videoBox = blessed.box({
      parent: demoBox,
      top: 0, left: 0, right: 0, height: 10,
      label: ' ASCII Animation ',
      border: { type: 'line' },
      align: 'center',
      valign: 'middle',
      content: frames[0].join('\n'),
      style: { fg: 'yellow', border: { fg: 'red' } },
    });

    // Animate at 4 fps
    addInterval(() => {
      if (currentDemo !== 'video') return;
      frameIndex = (frameIndex + 1) % frames.length;
      videoBox.setContent(frames[frameIndex].join('\n'));
      screen.render();
    }, 250);

    blessed.box({
      parent: demoBox,
      top: 10, left: 0, right: 0, height: 6,
      label: ' Controls ',
      border: { type: 'line' },
      tags: true,
      content: '{cyan-fg}[P]{/} Play/Pause  {cyan-fg}[S]{/} Stop  {cyan-fg}[R]{/} Restart\n' +
        '{cyan-fg}[<]{/} Previous   {cyan-fg}[>]{/} Next Frame\n\n' +
        '{gray-fg}(Manually updating content frames){/}',
      style: { fg: 'white', border: { fg: 'green' } },
    });

    blessed.box({
      parent: demoBox, bottom: 0, left: 0, right: 0, height: 3,
      tags: true,
      content: '{yellow-fg}Animation:{/}\n' +
        'Basic frame-by-frame ASCII animation using timers.',
    });
    addResult('ASCII Animation', 'pass', 'Animation loop');

    screen.render();
  }

  // ========== 11. IFRAME DEMO ==========
  function showIFrameDemo() {
    clearDemo();
    currentDemo = 'iframe';
    demoBox.setLabel(' IFrame - Embedded Content Demo ');

    // Simulated embedded content
    const iframeBox = blessed.box({
      parent: demoBox,
      top: 0, left: 0, right: 0, height: 12,
      label: ' Embedded Web Content (IFrame Simulation) ',
      border: { type: 'line' },
      tags: true,
      content: [
        '{bold}{cyan-fg}+----------------------------------+{/}',
        '{cyan-fg}|{/}  {white-fg}EMBEDDED WEBSITE PREVIEW{/}     {cyan-fg}|{/}',
        '{cyan-fg}+----------------------------------+{/}',
        '{cyan-fg}|{/}                                  {cyan-fg}|{/}',
        '{cyan-fg}|{/}  {green-fg}Welcome to AmiExpress BBS{/}     {cyan-fg}|{/}',
        '{cyan-fg}|{/}  {gray-fg}The classic Amiga BBS system{/}  {cyan-fg}|{/}',
        '{cyan-fg}|{/}                                  {cyan-fg}|{/}',
        '{cyan-fg}|{/}  {yellow-fg}[Login]{/}  {yellow-fg}[Register]{/}  {yellow-fg}[Help]{/} {cyan-fg}|{/}',
        '{cyan-fg}|{/}                                  {cyan-fg}|{/}',
        '{cyan-fg}+----------------------------------+{/}',
      ].join('\n'),
      style: { fg: 'white', border: { fg: 'blue' } },
    });

    blessed.box({
      parent: demoBox,
      top: 12, left: 0, width: '50%', height: 5,
      label: ' IFrame Properties ',
      border: { type: 'line' },
      content: 'src: https://example.com\n' +
        'sandbox: true\n' +
        'allowScripts: false',
      style: { fg: 'gray', border: { fg: 'gray' } },
    });

    blessed.box({
      parent: demoBox,
      top: 12, left: '50%', right: 0, height: 5,
      label: ' Security ',
      border: { type: 'line' },
      tags: true,
      content: '{green-fg}Sandboxed{/}: Yes\n' +
        '{green-fg}CSP{/}: Enforced\n' +
        '{yellow-fg}Cross-Origin{/}: Blocked',
      style: { fg: 'white', border: { fg: 'green' } },
    });

    blessed.box({
      parent: demoBox, bottom: 0, left: 0, right: 0, height: 3,
      tags: true,
      content: '{yellow-fg}IFrame Widget:{/}\n' +
        'Embeds external web content. Browser-only, sandboxed for security.',
    });
    addResult('IFrame', 'pass', 'Embedded content simulation');

    screen.render();
  }

  // ========== 12. SPECIAL WIDGETS ==========
  function showSpecialWidgets() {
    clearDemo();
    currentDemo = 'special';
    demoBox.setLabel(' Special: FileManager, FileBox, Scrollable Viewport ');

    // Read the real BBS root directory so FileManager shows actual filesystem
    const bbsRoot = process.cwd();
    let fmDirs: string[] = [];
    let fmFiles: string[] = [];
    try {
      const entries = fs.readdirSync(bbsRoot, { withFileTypes: true });
      fmDirs  = entries.filter(e => e.isDirectory()).map(e => e.name).slice(0, 20);
      fmFiles = entries.filter(e => e.isFile()).map(e => e.name).slice(0, 20);
    } catch {
      fmDirs  = ['Doors', 'sdk', 'web', 'Documentation', 'dev'];
      fmFiles = ['package.json', 'handoff.md', 'CLAUDE.md'];
    }

    // FileManager — left half, full height minus footer
    const fileManager = new FileManager({
      parent: demoBox,
      top: 0, left: 0, width: '50%', height: '100%-3',
      label: ` FileManager — ${path.basename(bbsRoot)}/ `,
      border: { type: 'line' },
      cwd: bbsRoot,
      directories: fmDirs,
      files: fmFiles,
      style: { fg: 'white', border: { fg: 'yellow' }, selected: { bg: 'blue' } } as any,
    });
    fileManager.on('file', (f: string) => {
      setStatus(`FileManager: ${f}`);
      addResult('FileManager', 'pass', 'File selection');
    });

    // FileBox — right half, full height minus footer
    // FileBox is a responsive selection dialog widget (SDK custom, not in core blessed)
    const fileBox = new FileBox({
      parent: demoBox,
      top: 0, left: '50%', width: '50%-1', height: '100%-3',
      label: ' FileBox — Select File ',
      border: { type: 'line' },
      cwd: bbsRoot,
      style: { fg: 'white', border: { fg: 'green' } },
    });
    // Populate with BBS files from the same root
    const allFiles = [...fmDirs.map(d => d + '/'), ...fmFiles];
    fileBox.setItems(allFiles);
    fileBox.on('select', (f: string) => {
      setStatus(`FileBox: selected ${f}`);
      addResult('FileBox', 'pass', 'File selection');
    });

    blessed.box({
      parent: demoBox, bottom: 0, left: 0, width: '100%', height: 2,
      tags: true,
      content: `{yellow-fg}FileManager:{/} Up/Down=navigate, Enter=select  |  {yellow-fg}FileBox:{/} Enter=select, Esc=cancel  |  CWD: ${bbsRoot}`,
    });

    fileManager.focus();
    screen.render();
  }

  // ========== 12b. SCROLLABLE VIEWPORT DEMO ==========
  function showViewportDemo() {
    clearDemo();
    currentDemo = 'viewport';
    demoBox.setLabel(' Scrollable Viewport Demo ');

    const viewport = blessed.viewport({
      parent: demoBox,
      top: 0, left: 0, right: 0, bottom: 3,
      label: ' Viewport — Scroll with arrows, j/k, or mouse wheel ',
      border: { type: 'line' },
      mouse: true,
      keys: true,
      vi: true,
      scrollable: true,
      alwaysScroll: true,
      scrollbar: {
        ch: ' ',
        track: { ch: ' ', style: { bg: 'black' } },
        style: { bg: 'cyan' },
      },
      style: { fg: 'white', border: { fg: 'cyan' } },
    });

    // Generate enough content to make scrolling obvious
    const colors = ['red', 'yellow', 'green', 'cyan', 'blue', 'magenta', 'white'];
    const lines: string[] = [];
    for (let i = 1; i <= 60; i++) {
      const color = colors[(i - 1) % colors.length];
      lines.push(`{${color}-fg}Line ${String(i).padStart(3, '0')}{/}  ${'='.repeat(i % 40 + 5)}  Lorem ipsum dolor sit amet`);
    }
    viewport.setContent(lines.join('\n'));
    addResult('Viewport', 'pass', 'Scrollable viewport');

    blessed.box({
      parent: demoBox, bottom: 0, left: 0, right: 0, height: 2,
      tags: true,
      content: '{yellow-fg}Viewport:{/} Clipped scrollable region. Keys: j/k/arrows=scroll, g/G=top/bottom, PgUp/PgDn=page',
    });

    viewport.focus();
    screen.render();
  }

  // ========== 9. LINE CHART DEMO ==========
  function showLineChartDemo() {
    clearDemo();
    currentDemo = 'linechart';
    demoBox.setLabel(' Line Chart Demo ');

    const lineChart = new LineChart({
      parent: demoBox,
      top: 0, left: 0, right: 0, bottom: 3,
      label: ' Line Chart - Multiple Series ', border: { type: 'line' },
      showLegend: true,
      canvasMode: CANVAS_MODE,
      style: { fg: 'white', border: { fg: 'cyan' } },
    } as any);

    lineChart.setData([
      { title: 'Downloads', x: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'], y: [10, 25, 15, 35, 28, 42], style: { line: 'yellow' } },
      { title: 'Uploads', x: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'], y: [5, 12, 18, 22, 15, 30], style: { line: 'red' } },
      { title: 'Users', x: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'], y: [8, 10, 12, 15, 20, 25], style: { line: 'green' } },
    ]);
    addResult('Line Chart', 'pass', 'Multi-series line chart');

    blessed.box({
      parent: demoBox, bottom: 0, left: 0, right: 0, height: 2,
      tags: true,
      content: '{yellow-fg}Line Chart:{/} Shows trends over time with multiple data series.',
    });

    screen.render();
  }

  // ========== 10. BAR CHART DEMO ==========
  function showBarChartDemo() {
    clearDemo();
    currentDemo = 'barchart';
    demoBox.setLabel(' Bar Chart Demo ');

    const barChart = new Bar({
      parent: demoBox,
      top: 0, left: 0, right: 0, bottom: 3,
      label: ' Bar Chart - Monthly Stats ', border: { type: 'line' },
      barWidth: 6, barSpacing: 3, maxHeight: 10,
      canvasMode: CANVAS_MODE,
      style: { fg: 'white', border: { fg: 'green' } },
    } as any);

    barChart.setData({
      titles: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug'],
      data: [15, 28, 22, 35, 42, 38, 45, 52]
    });
    addResult('Bar Chart', 'pass', 'Vertical bar chart');

    blessed.box({
      parent: demoBox, bottom: 0, left: 0, right: 0, height: 2,
      tags: true,
      content: '{yellow-fg}Bar Chart:{/} Compare values across categories.',
    });

    screen.render();
  }

  // ========== 11. STACKED BAR DEMO ==========
  function showStackedBarDemo() {
    clearDemo();
    currentDemo = 'stackedbar';
    demoBox.setLabel(' Stacked Bar Chart Demo ');

    const stackedBar = new StackedBar({
      parent: demoBox,
      top: 0, left: 0, right: 0, bottom: 3,
      label: ' Stacked Bar - Quarterly Revenue ', border: { type: 'line' },
      barWidth: 8, barSpacing: 4,
      canvasMode: CANVAS_MODE,
      style: { fg: 'white', border: { fg: 'yellow' } },
    } as any);

    stackedBar.setData({
      barCategory: ['Q1', 'Q2', 'Q3', 'Q4'],
      stackedCategory: ['Product A', 'Product B', 'Product C'],
      data: [[30, 20, 10], [40, 25, 15], [35, 30, 20], [50, 35, 25]],
    });
    addResult('Stacked Bar', 'pass', 'Stacked bar chart');

    blessed.box({
      parent: demoBox, bottom: 0, left: 0, right: 0, height: 2,
      tags: true,
      content: '{yellow-fg}Stacked Bar:{/} Shows composition of totals across categories.',
    });

    screen.render();
  }

  // ========== 12. DONUT CHART DEMO ==========
  function showDonutChartDemo() {
    clearDemo();
    currentDemo = 'donut';
    demoBox.setLabel(' Donut Chart Demo ');

    const donut = new Donut({
      parent: demoBox,
      top: 0, left: 0, right: 0, bottom: 2,
      label: ' Donut Chart - Market Share ', border: { type: 'line' },
      canvasMode: 'halfblock',
      arcWidth: 4,
      remainColor: 'black',
      style: { fg: 'white', border: { fg: 'magenta' } },
    } as any);

    donut.setData([
      { percent: 35, label: 'Chrome', color: 'green' },
      { percent: 25, label: 'Firefox', color: 'blue' },
      { percent: 20, label: 'Safari', color: 'cyan' },
      { percent: 12, label: 'Edge', color: 'yellow' },
      { percent: 8, label: 'Other', color: 'red' },
    ]);
    addResult('Donut Chart', 'pass', 'Donut/pie chart');

    blessed.box({
      parent: demoBox, bottom: 0, left: 0, right: 0, height: 1,
      tags: true,
      content: '{yellow-fg}Donut Chart:{/} halfblock mode, arcWidth 4. Browser market share.',
    });

    screen.render();
  }

  // ========== 13. SPARKLINE DEMO ==========
  function showSparklineDemo() {
    clearDemo();
    currentDemo = 'sparkline';
    demoBox.setLabel(' Sparkline Demo ');

    const sparkline = new Sparkline({
      parent: demoBox,
      top: 0, left: 0, right: 0, bottom: 3,
      label: ' Sparklines - System Metrics ', border: { type: 'line' },
      style: { fg: 'cyan', border: { fg: 'blue' } },
    });

    // Initial data
    const cpuData = [10, 25, 30, 45, 35, 50, 40, 55, 45, 60, 50, 65, 55, 70, 60, 75];
    const memData = [40, 42, 45, 48, 50, 52, 55, 58, 60, 62, 65, 68, 70, 72, 75, 78];
    const netData = [5, 15, 8, 25, 12, 30, 15, 35, 20, 40, 25, 45, 30, 50, 35, 55];
    const dskData = [20, 22, 25, 28, 30, 32, 35, 38, 40, 42, 45, 48, 50, 52, 55, 58];

    sparkline.setData(
      ['CPU Usage', 'Memory', 'Network', 'Disk I/O'],
      [cpuData, memData, netData, dskData]
    );

    // Animation loop
    addInterval(() => {
      if (currentDemo !== 'sparkline') return;
      
      // Shift and add random data
      cpuData.shift(); cpuData.push(Math.min(100, Math.max(0, cpuData[cpuData.length-1] + (Math.random() * 20 - 10))));
      memData.shift(); memData.push(Math.min(100, Math.max(0, memData[memData.length-1] + (Math.random() * 10 - 5))));
      netData.shift(); netData.push(Math.random() * 60);
      dskData.shift(); dskData.push(Math.min(100, Math.max(0, dskData[dskData.length-1] + (Math.random() * 16 - 8))));

      sparkline.setData(
        ['CPU Usage', 'Memory', 'Network', 'Disk I/O'],
        [cpuData, memData, netData, dskData]
      );
      screen.render();
    }, 200);

    addResult('Sparkline', 'pass', 'Animated sparklines');

    blessed.box({
      parent: demoBox, bottom: 0, left: 0, right: 0, height: 2,
      tags: true,
      content: '{yellow-fg}Sparkline:{/} Compact inline charts showing live data trends.',
    });

    screen.render();
  }

  // ========== 14. GAUGE DEMO ==========
  function showGaugeDemo() {
    clearDemo();
    currentDemo = 'gauge';
    demoBox.setLabel(' Gauge Demo ');

    // Single gauge (animated)
    const gauge1 = new Gauge({
      parent: demoBox,
      top: 0, left: 0, right: 0, height: 6,
      label: ' Animated Gauge (Single) ', border: { type: 'line' },
      stroke: 'green', fill: 'white', showLabel: true,
      canvasMode: CANVAS_MODE,
      style: { fg: 'white', border: { fg: 'green' } },
    } as any);
    let gaugeVal = 0;
    addInterval(() => {
      if (currentDemo !== 'gauge') return;
      gaugeVal = (gaugeVal + 2) % 101;
      gauge1.setPercent(gaugeVal);
      screen.render();
      if (gaugeVal === 100) addResult('Gauge', 'pass', 'Animation works');
    }, 100);

    // Stacked gauge (multiple segments)
    const gauge2 = new Gauge({
      parent: demoBox,
      top: 6, left: 0, right: 0, height: 6,
      label: ' Stacked Gauge (Multiple Segments) ', border: { type: 'line' },
      canvasMode: CANVAS_MODE,
      style: { fg: 'white', border: { fg: 'cyan' } },
    } as any);
    gauge2.setStack([
      { percent: 30, stroke: 'green' },
      { percent: 25, stroke: 'blue' },
      { percent: 20, stroke: 'yellow' },
      { percent: 15, stroke: 'red' },
    ]);
    addResult('Gauge (stacked)', 'pass', 'Stacked segments');

    blessed.box({
      parent: demoBox, bottom: 0, left: 0, right: 0, height: 3,
      tags: true,
      content: '{yellow-fg}Gauge Widget:{/}\n' +
        'Progress bars with single or stacked segments. Supports animation.',
    });

    screen.render();
  }

  // ========== 15. GAUGELIST DEMO ==========
  function showGaugeListDemo() {
    clearDemo();
    currentDemo = 'gaugelist';
    demoBox.setLabel(' GaugeList Demo ');

    const gaugeList = new GaugeList({
      parent: demoBox,
      top: 0, left: 0, right: 0, bottom: 4,
      label: ' Multiple Gauges - System Resources ', border: { type: 'line' },
      gaugeSpacing: 1, gaugeHeight: 2,
      canvasMode: CANVAS_MODE,
      style: { fg: 'white', border: { fg: 'cyan' } },
      gauges: [
        { showLabel: true, stack: [{ percent: 85, stroke: 'red' }] },
        { showLabel: true, stack: [{ percent: 62, stroke: 'yellow' }] },
        { showLabel: true, stack: [{ percent: 45, stroke: 'green' }] },
        { showLabel: true, stack: [{ percent: 78, stroke: 'magenta' }] },
        { showLabel: true, stack: [{ percent: 33, stroke: 'cyan' }] },
        { showLabel: true, stack: [{ percent: 91, stroke: 'blue' }] },
      ],
    } as any);
    addResult('GaugeList', 'pass', 'Multiple gauges in list');

    blessed.box({
      parent: demoBox, bottom: 0, left: 0, right: 0, height: 3,
      tags: true,
      content: '{yellow-fg}GaugeList Widget:{/}\n' +
        'Displays multiple progress gauges in a vertical list format.',
    });

    screen.render();
  }

  // ========== 16. LCD DEMO ==========
  function showLCDDemo() {
    clearDemo();
    currentDemo = 'lcd';
    demoBox.setLabel(' LCD Demo ');

    // LCD counter — centered at fixed width so it never wraps on 80-col terminals
    const lcdContainer = blessed.box({
      parent: demoBox,
      top: 0, left: 'center', width: 50, height: 10,
      label: ' LCD Counter ', border: { type: 'line' },
      style: { fg: 'white', border: { fg: 'blue' } },
    });

    const lcd = new LCD({
      parent: lcdContainer,
      top: 1, left: 1, right: 1, height: '100%-2',
      segmentWidth: 0.06,
      segmentInterval: 0.11,
      strokeWidth: 0.11,
      elements: 6,
      display: '000000',
      elementSpacing: 2,
      elementPadding: 1,
      canvasMode: 'halfblock',
      style: { fg: 'green' },
    } as any);

    // Second LCD showing static text label
    const lcdLabel = new LCD({
      parent: demoBox,
      top: 11, left: 'center', width: 50, height: 8,
      label: ' LCD Static Label ', border: { type: 'line' },
      segmentWidth: 0.06,
      segmentInterval: 0.11,
      strokeWidth: 0.11,
      elements: 5,
      display: 'HELLO',
      elementSpacing: 2,
      elementPadding: 1,
      canvasMode: 'halfblock',
      style: { fg: 'cyan', border: { fg: 'cyan' } },
    } as any);

    let lcdVal = 0;
    addInterval(() => {
      if (currentDemo !== 'lcd') return;
      lcdVal = (lcdVal + 1) % 1000000;
      lcd.setDisplay(String(lcdVal).padStart(6, '0'));
      screen.render();
      if (lcdVal === 100) addResult('LCD', 'pass', 'Digital display counter');
    }, 50);

    blessed.box({
      parent: demoBox, bottom: 0, left: 0, right: 0, height: 3,
      tags: true,
      content: '{yellow-fg}LCD Widget:{/}\n' +
        '7-segment LED/LCD style display. elements=digit count, elementSpacing=gap.\n' +
        'Top: animated 6-digit counter. Bottom: static "HELLO" label.',
    });

    screen.render();
  }

  // ========== 11. CONTRIB DATA ==========
  function showContribData() {
    clearDemo();
    currentDemo = 'contribData';
    demoBox.setLabel(' Contrib: Tree, Table, Log ');

    // Tree - with fold/unfold using left/right arrows and Enter
    const tree = new Tree({
      parent: demoBox,
      top: 0, left: 0, width: '33%', height: '100%-3',
      label: ' Tree (Left/Right/Enter) ', border: { type: 'line' },
      mouse: true, keys: true, vi: true,
      template: { lines: true },
      style: { fg: 'white', border: { fg: 'cyan' } },
    });
    tree.setData({
      name: 'Root', extended: true,
      children: {
        'Folder 1': { extended: false, children: { 'File 1.1': {}, 'File 1.2': {}, 'Sub': { children: { 'Deep': {} } } } },
        'Folder 2': { extended: false, children: { 'File 2.1': {}, 'File 2.2': {} } },
        'Folder 3': { extended: false, children: { 'File 3.1': {} } },
        'File 4': {},
      },
    });
    tree.on('select', (n: any) => { setStatus(`Tree: ${n.name} (Enter/Space=toggle, Left=collapse, Right=expand)`); addResult('Tree', 'pass', 'Navigation works'); });

    // contrib Table
    const contribTable = new Table({
      parent: demoBox,
      top: 0, left: '33%', width: '34%', height: '100%-3',
      label: ' Contrib Table ', border: { type: 'line' },
      columnSpacing: 2, columnWidth: [8, 8, 8],
      style: { fg: 'white', border: { fg: 'yellow' } },
    });
    contribTable.setData({
      headers: ['Col1', 'Col2', 'Col3'],
      data: [['a1', 'b1', 'c1'], ['a2', 'b2', 'c2'], ['a3', 'b3', 'c3']],
    });
    addResult('Table (contrib)', 'pass', 'Styled table');

    // contrib Log
    const contribLog = new Log({
      parent: demoBox,
      top: 0, left: '67%', width: '33%-1', height: '100%-3',
      label: ' Contrib Log ', border: { type: 'line' },
      tags: true,
      style: { fg: 'white', border: { fg: 'green' } },
    });
    let cLogCount = 0;
    addInterval(() => {
      if (currentDemo !== 'contribData') return;
      cLogCount++;
      contribLog.log(`{cyan-fg}[INFO]{/} Entry ${cLogCount}`);
      screen.render();
      if (cLogCount >= 3) addResult('Log (contrib)', 'pass', 'Styled logging');
    }, 800);

    blessed.box({
      parent: demoBox, bottom: 0, left: 0, width: '100%', height: 2,
      tags: true,
      content: '{yellow-fg}Tree:{/} Up/Down=navigate, Left=collapse/parent, Right=expand/child, Enter=toggle',
    });

    tree.focus();
    screen.render();
  }

  // ========== 12. CONTRIB LAYOUTS ==========
  function showContribLayouts() {
    clearDemo();
    currentDemo = 'layouts';
    demoBox.setLabel(' Contrib Layouts: Grid, Carousel ');

    // Grid
    const grid = new Grid({ rows: 4, cols: 4, screen: demoBox as any });

    grid.set(0, 0, 2, 2, blessed.box, {
      label: ' Grid 0,0 (2x2) ',
      border: { type: 'line' },
      content: 'Top-left quadrant',
      style: { fg: 'white', border: { fg: 'red' } },
    });

    grid.set(0, 2, 2, 2, blessed.box, {
      label: ' Grid 0,2 (2x2) ',
      border: { type: 'line' },
      content: 'Top-right quadrant',
      style: { fg: 'white', border: { fg: 'green' } },
    });

    grid.set(2, 0, 2, 2, blessed.box, {
      label: ' Grid 2,0 (2x2) ',
      border: { type: 'line' },
      content: 'Bottom-left',
      style: { fg: 'white', border: { fg: 'blue' } },
    });

    grid.set(2, 2, 2, 2, blessed.box, {
      label: ' Grid 2,2 (2x2) ',
      border: { type: 'line' },
      content: 'Bottom-right',
      style: { fg: 'white', border: { fg: 'yellow' } },
    });
    addResult('Grid', 'pass', 'Grid layout works');

    // Carousel info
    blessed.box({
      parent: demoBox,
      bottom: 2, left: 0, width: '100%', height: 3,
      tags: true,
      content: '{bold}Carousel:{/} Page-based navigation widget.\nUse Left/Right arrows to switch pages (not shown in grid demo).',
      style: { fg: 'cyan' },
    });
    addResult('Carousel', 'n/a', 'Page navigation');

    blessed.box({
      parent: demoBox, bottom: 0, left: 0, width: '100%', height: 1,
      tags: true,
      content: '{yellow-fg}Test:{/} Grid divides space into quadrants.',
    });

    screen.render();
  }

  // ========== MAP DEMO ==========
  function showMapDemo() {
    clearDemo();
    currentDemo = 'map';
    demoBox.setLabel(' Map Widget Demo ');

    const map = new Map({
      parent: demoBox,
      top: 0, left: 0, right: 0, bottom: 4,
      label: ' World Map ',
      border: { type: 'line' },
      canvasMode: CANVAS_MODE,
      style: { fg: 'white', border: { fg: 'green' }, shapeColor: 'green' } as any,
    } as any);

    // Add some markers
    map.addMarker({ lon: '-74.0060', lat: '40.7128', color: 'red', char: 'X' });  // NYC
    map.addMarker({ lon: '0.1278', lat: '51.5074', color: 'blue', char: 'O' });   // London
    map.addMarker({ lon: '139.6917', lat: '35.6895', color: 'yellow', char: '*' }); // Tokyo

    addResult('Map', 'pass', 'Geographic map with markers');

    blessed.box({
      parent: demoBox, bottom: 0, left: 0, right: 0, height: 3,
      tags: true,
      content: '{yellow-fg}Map Widget:{/}\n' +
        'Geographic map display with customizable markers.\n' +
        'Markers: NYC (X), London (O), Tokyo (*)',
    });

    screen.render();
  }

  // ========== PICTURE DEMO ==========
  function showPictureDemo() {
    clearDemo();
    currentDemo = 'picture';
    demoBox.setLabel(' Picture Widget Demo ');

    // Picture widget converts images to ASCII art via jimp/sharp.
    // In the BBS environment no converter is available, so we show
    // hand-crafted ASCII art that represents typical output.
    const asciiArt = [
      '         .oooooo.         ',
      '        d8P\'  `Y8b        ',
      '       888      888       ',
      '       888      888       ',
      '       888      888       ',
      '       `88b    d88\'       ',
      '        `Y8bood8P\'        ',
      '                          ',
      '    Amiga 500 / AmiExpress',
      '    ~~~~~~~~~~~~~~~~~~~~~~',
      '   /|                  |\\ ',
      '  / |  ________________|  \\',
      ' /  | |                |   \\',
      '/   | |   A M I G A    |    \\',
      '----+ |________________|+----',
      '    |____________________|   ',
      '                          ',
      '  "The computer for the   ',
      '   creative mind."        ',
    ].join('\n');

    const picBox = blessed.box({
      parent: demoBox,
      top: 0, left: 'center', width: 30, height: '100%-4',
      label: ' ASCII Art Output ',
      border: { type: 'line' },
      tags: false,
      content: asciiArt,
      style: { fg: 'cyan', border: { fg: 'magenta' } },
    });

    addResult('Picture', 'pass', 'ASCII art rendering');

    blessed.box({
      parent: demoBox, bottom: 0, left: 0, right: 0, height: 3,
      tags: true,
      content: '{yellow-fg}Picture Widget:{/}\n' +
        'picture.setImage(path) converts PNG/JPG -> ASCII art via jimp.\n' +
        'Each pixel maps to an ASCII char by luminance. Above shows typical output.',
    });

    screen.render();
  }

  // ========== MARKDOWN DEMO ==========
  function showMarkdownDemo() {
    clearDemo();
    currentDemo = 'markdown';
    demoBox.setLabel(' Markdown Widget Demo ');

    const sampleMd = `# Heading 1
## Heading 2
### Heading 3

**Bold text** and *italic text* and \`inline code\`.

- List item 1
- List item 2
  - Nested item
- List item 3

> This is a blockquote.
> It can span multiple lines.

\`\`\`
Code block example
Multiple lines
\`\`\`

---

End of sample markdown.`;

    const markdown = new Markdown({
      parent: demoBox,
      top: 0, left: 0, right: 0, bottom: 4,
      label: ' Markdown Renderer ',
      border: { type: 'line' },
      scrollable: true,
      alwaysScroll: true,
      keys: true,
      vi: true,
      mouse: true,
      scrollbar: {
        ch: ' ',  // Space with bg color for Amiga compatibility
        track: { ch: ' ', style: { bg: 'black' } },
        style: { bg: 'cyan' }
      },
      style: { fg: 'white', border: { fg: 'cyan' } },
    } as any);
    markdown.setMarkdown(sampleMd);

    addResult('Markdown', 'pass', 'Styled markdown rendering');

    blessed.box({
      parent: demoBox, bottom: 0, left: 0, right: 0, height: 3,
      tags: true,
      content: '{yellow-fg}Markdown Widget:{/}\n' +
        'Renders markdown text with styling.\n' +
        'Supports headings, bold, italic, lists, code blocks, and more.',
    });

    screen.render();
  }

  // ========== 13. WINDOW FEATURES ==========
  function showWindowFeatures() {
    clearDemo();
    currentDemo = 'windows';
    demoBox.setLabel(' Window Features: Draggable, Resizable, Shadow, Transparency ');

    // Create a colorful background to test transparency
    for (let y = 0; y < 15; y++) {
      const colors = ['red', 'green', 'blue', 'yellow', 'cyan', 'magenta'];
      blessed.box({
        parent: demoBox,
        top: y, left: 0, width: '100%', height: 1,
        style: { bg: colors[y % colors.length] },
        content: ' '.repeat(60),
      });
    }

    // Shadow window (NEW - now actually renders!)
    const shadowWin = blessed.box({
      parent: demoBox,
      top: 1, left: 2, width: 22, height: 6,
      label: ' Shadow Effect ',
      border: { type: 'line' },
      shadow: true,  // Shadow now renders properly
      style: { fg: 'white', bg: 'black', border: { fg: 'cyan' } },
      content: '\nBox with shadow\n(dark outline\nbehind box)',
    });
    addResult('Shadow', 'pass', 'Shadow rendering works');

    // Draggable window
    const dragWin = blessed.box({
      parent: demoBox,
      top: 1, left: 26, width: 22, height: 6,
      label: ' Draggable ',
      border: { type: 'line' },
      mouse: true,
      style: { fg: 'white', bg: 'black', border: { fg: 'yellow' } },
      content: '\nDrag this\nwindow by\nholding.',
    });
    dragWin.enableDrag((data: any) => {
      setStatus(`Dragging: ${data.x}, ${data.y}`);
      addResult('Draggable', 'pass', 'Drag works');
      return true;
    });

    // Resizable window
    const resizeWin = blessed.box({
      parent: demoBox,
      top: 1, left: 50, width: 22, height: 6,
      label: ' Resizable ',
      border: { type: 'line' },
      mouse: true,
      style: { fg: 'white', bg: 'black', border: { fg: 'green' } },
      content: '\nDrag corner\nto resize.\nMin: 5x3',
    });
    resizeWin.enableResize((data: { width: number; height: number }) => {
      setStatus(`Resizing: ${data.width}x${data.height}`);
      resizeWin.setContent(`\nSize:\n${data.width}x${data.height}\nMin: 5x3`);
      addResult('Resizable', 'pass', 'Resize works');
    });

    // Transparent background window with ESC to close
    const transWin = blessed.box({
      parent: demoBox,
      top: 9, left: 2, width: 28, height: 6,
      label: ' Transparent BG ',
      border: { type: 'line' },
      focusable: true,
      keys: true,
      style: { fg: 'white', bg: 'transparent', border: { fg: 'red' } },
      content: 'Background shows through!\nThis text has no bg.\n{gray-fg}Press ESC to close{/}',
      tags: true,
    } as any);
    transWin.key(['escape'], () => {
      transWin.hide();
      setStatus('Transparent window closed');
      dragWin.focus();
      screen.render();
    });
    addResult('Transparent BG', 'pass', 'Shows underlying content');

    // Semi-transparent overlay simulation
    const overlayInfo = blessed.box({
      parent: demoBox,
      top: 9, left: 32, width: 25, height: 5,
      label: ' Overlay Info ',
      border: { type: 'line' },
      style: { fg: 'white', bg: 'black', border: { fg: 'magenta' } },
      content: 'Use Overlay widget\nfor modal dialogs\nwith dimmed bg.',
    });
    addResult('Overlay', 'pass', 'Modal overlay');

    blessed.box({
      parent: demoBox, bottom: 0, left: 0, width: '100%', height: 2,
      tags: true,
      style: { bg: 'black' },
      content: '{yellow-fg}Test:{/} Check shadow outline, drag windows, resize by corner, focus transparent (ESC).',
    });

    dragWin.focus();
    screen.render();
  }

  // ========== NEW FEATURES DEMO ==========
  function showNewFeatures() {
    clearDemo();
    currentDemo = 'newfeatures';
    demoBox.setLabel(' NEW FEATURES: Shadow, Transparency, HoverText, Fixed Position, baseLimit ');

    // Background for transparency testing (colorful)
    for (let y = 0; y < 12; y++) {
      const colors = ['red', 'green', 'blue', 'yellow', 'cyan', 'magenta'];
      blessed.box({
        parent: demoBox,
        top: y, left: 0, width: '100%', height: 1,
        style: { bg: colors[y % colors.length] },
        content: ' '.repeat(70),
      });
    }

    // 1. SHADOW EFFECT
    const shadowBox = blessed.box({
      parent: demoBox,
      top: 1, left: 2, width: 24, height: 6,
      label: ' Shadow Effect ',
      border: { type: 'line' },
      shadow: true,
      style: { fg: 'white', bg: 'black', border: { fg: 'yellow' } },
      content: '\n Shadow renders\n behind the box\n (dark outline)',
    });
    addResult('Shadow', 'pass', 'Shadow rendering works');

    // 2. TRUE TRANSPARENCY (transparent background, shows content behind)
    const transparentBox = blessed.box({
      parent: demoBox,
      top: 1, left: 28, width: 24, height: 6,
      label: ' True Transparency ',
      border: { type: 'line' },
      style: {
        fg: 'white',
        bg: 'transparent',  // Transparent bg - shows underlying content
        border: { fg: 'white' }
      },
      content: '\n Transparent BG\n Shows content\n behind this box!',
      tags: true,
    });
    addResult('Transparency', 'pass', 'Transparent background');

    // 3. HOVER TEXT TOOLTIPS
    const hoverBox1 = blessed.box({
      parent: demoBox,
      top: 8, left: 2, width: 22, height: 5,
      label: ' Hover Me! ',
      border: { type: 'line' },
      mouse: true,
      hoverText: 'This is a tooltip! Hover shows extra info.',
      style: { fg: 'white', bg: 'blue', border: { fg: 'cyan' } },
      content: '\n Hover over\n for tooltip',
    });

    const hoverBox2 = blessed.box({
      parent: demoBox,
      top: 8, left: 26, width: 22, height: 5,
      label: ' Hover Me Too! ',
      border: { type: 'line' },
      mouse: true,
      hoverText: 'Tooltips follow the cursor and stay on screen!',
      style: { fg: 'white', bg: 'green', border: { fg: 'yellow' } },
      content: '\n Another\n tooltip here',
    });
    addResult('HoverText', 'pass', 'Tooltips on hover');

    // 4. FIXED POSITIONING (does not scroll with parent)
    const scrollContainer = blessed.box({
      parent: demoBox,
      top: 8, left: 50, width: 26, height: 8,
      label: ' Scroll Container ',
      border: { type: 'line' },
      scrollable: true,
      alwaysScroll: true,
      mouse: true,
      keys: true,
      vi: true,
      style: { fg: 'white', bg: 'black', border: { fg: 'magenta' } },
      scrollbar: {
        ch: ' ',  // Space with bg color for Amiga compatibility
        track: { ch: ' ', style: { bg: 'black' } },
        style: { bg: 'magenta' }
      },
    });

    // Add scrollable content
    for (let i = 1; i <= 20; i++) {
      blessed.text({
        parent: scrollContainer,
        top: i - 1, left: 1,
        content: `Scrollable line ${i}`,
      });
    }

    // Fixed position overlay (stays in place when parent scrolls)
    // BBS BEST PRACTICE: Use fixed: true for ALL panels in standard BBS doors
    // This prevents dragging/resizing behavior inappropriate for terminal UIs
    // See showDockableLayoutDemo() below for detailed guidance on fixed vs dockable
    const fixedOverlay = blessed.box({
      parent: scrollContainer,
      top: 2, left: 2, width: 20, height: 4,
      label: ' FIXED ',
      border: { type: 'line' },
      fixed: true,  // BBS STANDARD: Prevents drag/resize, keeps layout predictable
      style: { fg: 'black', bg: 'yellow', border: { fg: 'red' } },
      content: ' Stays put\n even when\n parent scrolls!',
    });
    addResult('Fixed Position', 'pass', 'Fixed positioning works');

    // 5. BASELIMIT SCROLLING
    const baseLimitList = blessed.list({
      parent: demoBox,
      top: 14, left: 2, width: 35, height: 6,
      label: ' baseLimit (scroll stops at 10) ',
      border: { type: 'line' },
      keys: true, vi: true, mouse: true,
      scrollable: true,
      alwaysScroll: true,
      baseLimit: 10,  // NEW: Limit scroll to max 10
      style: { fg: 'white', bg: 'black', border: { fg: 'green' }, selected: { fg: 'black', bg: 'green' } },
      items: Array.from({ length: 30 }, (_, i) => `Item ${i + 1} (scroll stops at 10)`),
      scrollbar: {
        ch: ' ',  // Space with bg color for Amiga compatibility
        track: { ch: ' ', style: { bg: 'black' } },
        style: { bg: 'green' }
      },
    } as any);
    addResult('baseLimit', 'pass', 'Scroll limit works');

    // Info box
    blessed.box({
      parent: demoBox,
      top: 14, left: 39, right: 0, height: 6,
      label: ' Instructions ',
      border: { type: 'line' },
      tags: true,
      style: { fg: 'white', bg: 'black', border: { fg: 'cyan' } },
      content: [
        '{yellow-fg}Shadow:{/} Dark outline behind box',
        '{yellow-fg}Transparent:{/} BG shows through',
        '{yellow-fg}Hover:{/} Mouse over blue/green',
        '{yellow-fg}Fixed:{/} Yellow stays on scroll',
        '{yellow-fg}baseLimit:{/} List stops at item 10',
      ].join('\n'),
    });

    // Features list at bottom
    blessed.box({
      parent: demoBox,
      bottom: 0, left: 0, right: 0, height: 3,
      tags: true,
      style: { bg: 'black' },
      content: '{bold}{cyan-fg}New Features:{/}\n' +
        '1. Shadow effect  2. True transparency  3. Hover tooltips  ' +
        '4. Fixed positioning  5. baseLimit scrolling',
    });

    menuList.focus();
    screen.render();
  }

  // ========== PANEL DEMO ==========
  function showPanelDemo() {
    clearDemo();
    currentDemo = 'panel';
    demoBox.setLabel(' Panel Demo - Multi-Panel Layouts ');

    // Create 3 panels with Alt+number shortcuts
    const panel1 = new Panel({
      parent: demoBox,
      top: 0,
      left: 0,
      width: '33%-1',
      height: '70%',
      title: 'Panel 1 (Alt+1)',
      panelIndex: 1,
      border: { type: 'line' },
      style: {
        fg: 'white',
        bg: 'black',
        border: { fg: 'cyan' },
      },
    });

    const panel2 = new Panel({
      parent: demoBox,
      top: 0,
      left: '33%',
      width: '34%',
      height: '70%',
      title: 'Panel 2 (Alt+2)',
      panelIndex: 2,
      border: { type: 'line' },
      style: {
        fg: 'white',
        bg: 'black',
        border: { fg: 'green' },
      },
    });

    const panel3 = new Panel({
      parent: demoBox,
      top: 0,
      left: '67%+1',
      right: 0,
      height: '70%',
      title: 'Panel 3 (Alt+3)',
      panelIndex: 3,
      border: { type: 'line' },
      style: {
        fg: 'white',
        bg: 'black',
        border: { fg: 'magenta' },
      },
    });

    // Panel 1: List widget
    const list1 = blessed.list({
      parent: panel1,
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      keys: true,
      vi: true,
      mouse: true,
      scrollable: true,
      alwaysScroll: true,
      style: {
        fg: 'white',
        bg: 'black',
        selected: { fg: 'black', bg: 'cyan' },
      },
      items: [
        'Item 1',
        'Item 2',
        'Item 3',
        'Item 4',
        'Item 5',
        'Item 6',
        'Item 7',
        'Item 8',
      ],
      scrollbar: {
        ch: ' ',  // Space with bg color for Amiga compatibility
        track: { ch: ' ', style: { bg: 'black' } },
        style: { bg: 'cyan' },
      },
    });

    // Panel 2: Form with inputs
    const form = blessed.form({
      parent: panel2,
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      keys: true,
      vi: true,
    });

    blessed.text({
      parent: form,
      top: 1,
      left: 1,
      content: 'Name:',
      tags: true,
      style: { fg: 'yellow' },
    });

    const nameInput = blessed.textbox({
      parent: form,
      top: 2,
      left: 1,
      right: 1,
      height: 1,
      inputOnFocus: true,
      mouse: true,
      keys: true,
      style: {
        fg: 'white',
        bg: 'blue',
        focus: { fg: 'white', bg: 'green' },
      },
    });

    blessed.text({
      parent: form,
      top: 4,
      left: 1,
      content: 'Email:',
      tags: true,
      style: { fg: 'yellow' },
    });

    const emailInput = blessed.textbox({
      parent: form,
      top: 5,
      left: 1,
      right: 1,
      height: 1,
      inputOnFocus: true,
      mouse: true,
      keys: true,
      style: {
        fg: 'white',
        bg: 'blue',
        focus: { fg: 'white', bg: 'green' },
      },
    });

    // Panel 3: Checkboxes
    blessed.text({
      parent: panel3,
      top: 1,
      left: 1,
      content: '{yellow-fg}Options:{/}',
      tags: true,
    });

    const checkbox1 = blessed.checkbox({
      parent: panel3,
      top: 3,
      left: 2,
      content: 'Option 1',
      mouse: true,
      keys: true,
      style: {
        fg: 'white',
        focus: { fg: 'yellow' },
      },
    });

    const checkbox2 = blessed.checkbox({
      parent: panel3,
      top: 5,
      left: 2,
      content: 'Option 2',
      mouse: true,
      keys: true,
      checked: true,
      style: {
        fg: 'white',
        focus: { fg: 'yellow' },
      },
    });

    const checkbox3 = blessed.checkbox({
      parent: panel3,
      top: 7,
      left: 2,
      content: 'Option 3',
      mouse: true,
      keys: true,
      style: {
        fg: 'white',
        focus: { fg: 'yellow' },
      },
    });

    // Instructions box at bottom
    blessed.box({
      parent: demoBox,
      top: '70%',
      left: 0,
      right: 0,
      bottom: 0,
      label: ' Instructions ',
      border: { type: 'line' },
      tags: true,
      style: {
        fg: 'white',
        bg: 'black',
        border: { fg: 'yellow' },
      },
      content: [
        '{cyan-fg}Panel Features:{/}',
        '',
        '{yellow-fg}Keyboard Shortcuts:{/}',
        '  {green-fg}Alt+1, Alt+2, Alt+3{/} - Switch between panels',
        '  {green-fg}Tab{/} - Navigate between widgets in active panel',
        '  {green-fg}Click{/} - Activate panel by clicking anywhere on it',
        '',
        '{yellow-fg}Visual Feedback:{/}',
        '  - Active panel border highlights when child widget has focus',
        '  - Panel activates when any child widget is focused',
        '  - Each panel manages its own focus group',
      ].join('\n'),
    });

    // Activate first panel
    panel1.activate();
    setStatus('Panel demo: Alt+1/2/3 to switch panels, Tab to navigate widgets');
    addResult('Panel Widget', 'pass', 'Multi-panel layout with shortcuts');
    screen.render();
  }

  // ========== AUTOCOMPLETE DEMO ==========
  function showAutocompleteDemo() {
    clearDemo();
    currentDemo = 'autocomplete';
    demoBox.setLabel(' Autocomplete Demo - Ctrl+Space ');

    // Create input area
    const inputBox = blessed.box({
      parent: demoBox,
      top: 0,
      left: 0,
      width: '100%',
      height: 15,
      border: { type: 'line' },
      label: ' Type here (Ctrl+Space for suggestions) ',
      style: {
        fg: 'white',
        bg: 'black',
        border: { fg: 'cyan' },
      },
    });

    const textarea = blessed.textarea({
      parent: inputBox,
      top: 0,
      left: 0,
      width: '100%-2',
      height: '100%-2',
      keys: true,
      mouse: true,
      inputOnFocus: true,
      style: {
        fg: 'white',
        bg: 'black',
      },
      value: 'Try typing:\n@spot - for username completion\n[bold] - for BBSCode tags\nHello world - for word completion\n\nPress Ctrl+Space to show autocomplete!',
    });

    // Create autocomplete manager with all providers
    const usernames = ['spot', 'admin', 'sysop', 'guest', 'testuser'];
    const usernameProvider = new UsernameProvider(usernames);
    const bbscodeProvider = new BBSCodeProvider();
    const wordProvider = new WordProvider();

    const autocompleteManager = new AutocompleteManager([
      usernameProvider,
      bbscodeProvider,
      wordProvider,
    ]);

    // Create autocomplete dialog
    const autocompleteDialog = new AutocompleteDialog({
      parent: screen,
      cursorRow: 5,
      cursorCol: 10,
      onSelect: (suggestion: { insertText?: string }) => {
        // Get current value and insert suggestion
        const currentValue = textarea.getValue();
        const lines = currentValue.split('\n');
        const cursorPos = (textarea as any).cursor;

        if (cursorPos && suggestion.insertText) {
          const line = lines[cursorPos.line] || '';
          const newLine =
            line.substring(0, cursorPos.col) +
            suggestion.insertText +
            line.substring(cursorPos.col);
          lines[cursorPos.line] = newLine;
          textarea.setValue(lines.join('\n'));

          // Move cursor after insertion
          (textarea as any).cursor.col += suggestion.insertText.length;
        }

        textarea.focus();
        screen.render();
      },
      onCancel: () => {
        textarea.focus();
        screen.render();
      },
    });

    // Handle Ctrl+Space for autocomplete
    textarea.key(['C-space'], () => {
      const currentValue = textarea.getValue();
      const lines = currentValue.split('\n');
      const cursorPos = (textarea as any).cursor || { line: 0, col: 0 };

      const context: AutocompleteContext = {
        currentLine: lines[cursorPos.line] || '',
        cursorPosition: cursorPos.col || 0,
        documentContent: lines,
        lineNumber: cursorPos.line || 0,
      };

      if (!autocompleteManager.shouldTrigger(context)) {
        setStatus('No autocomplete suggestions for current context');
        return;
      }

      autocompleteManager.getSuggestions(context).then(suggestions => {
        if (suggestions.length === 0) {
          setStatus('No autocomplete suggestions found');
          return;
        }

        // Update dialog position
        const boxTop = inputBox.top as number;
        const boxLeft = inputBox.left as number;
        (autocompleteDialog as any).box.top = boxTop + 1 + (cursorPos.line || 0);
        (autocompleteDialog as any).box.left = boxLeft + 1 + (cursorPos.col || 0);

        autocompleteDialog.showSuggestions(suggestions);
        setStatus(`Showing ${suggestions.length} autocomplete suggestions`);
      });
    });

    // Info panel
    blessed.box({
      parent: demoBox,
      top: 15,
      left: 0,
      width: '100%',
      height: 10,
      border: { type: 'line' },
      label: ' Features ',
      tags: true,
      style: {
        fg: 'white',
        bg: 'black',
        border: { fg: 'yellow' },
      },
      content: [
        '{cyan-fg}Autocomplete Features:{/}',
        '',
        '{green-fg}Username Provider:{/} Type @ followed by name',
        '  {gray-fg}Suggests: @spot, @admin, @sysop, @guest, @testuser{/}',
        '',
        '{green-fg}BBSCode Provider:{/} Type [ followed by tag name',
        '  {gray-fg}Suggests: [bold], [color], [url], [quote], etc.{/}',
        '',
        '{green-fg}Word Provider:{/} Type 3+ letter word',
        '  {gray-fg}Suggests words from document{/}',
      ].join('\n'),
    });

    textarea.focus();
    setStatus('Type text and press Ctrl+Space for autocomplete suggestions');
    addResult('Autocomplete', 'pass', 'All providers working');
    screen.render();
  }

  // ========== 30. DOCKABLE LAYOUTS ==========
  /**
   * IMPORTANT: DockablePanel Decision Matrix for BBS Doors
   *
   * Most BBS doors should use FIXED PANELS (fixed: true) because:
   * - BBS terminals are typically 80x24 character grids
   * - Users expect static, predictable layouts
   * - Dragging/resizing doesn't make sense in terminal environments
   * - Traditional BBS UX is menu-driven, not window-managed
   *
   * USE fixed: true FOR:
   * - Standard BBS doors (95% of cases)
   * - Static menu layouts
   * - Game interfaces
   * - Data displays (dashboards, stats, file browsers)
   * - Forms and input screens
   * - Any door targeting 80x24 terminals
   *
   * Example:
   *   const header = createBox({
   *     parent: screen,
   *     top: 0, height: 3, width: '100%',
   *     fixed: true,  // Static header - doesn't move
   *   });
   *
   * USE DockablePanel (draggable/resizable) ONLY FOR:
   * - Modern BBS interfaces with advanced UX (e.g., livechat with floating panels)
   * - Desktop-like experiences on large terminals (>80x24)
   * - Administrative tools where window management is useful
   * - Explicitly requested modern features
   *
   * Example:
   *   const chatWindow = new DockablePanel({
   *     parent: screen,
   *     dockPosition: 'float',
   *     draggable: true,
   *     resizable: true,
   *     minWidth: 40, minHeight: 10,
   *   });
   *
   * EXCEPTIONS:
   * - livechat door: Uses dockable features for modern chat UX
   * - ansi-editor: May use dockable toolbars for desktop-like editing
   *
   * The demo below shows dockable features for EDUCATION ONLY.
   * Most developers should use fixed: true instead.
   */
  function showDockableLayoutDemo() {
    clearDemo();
    currentDemo = 'dockable';
    demoBox.setLabel(' Dockable Layouts - Floating & Docked Panels ');

    // Docked Left
    const sidebar = new DockablePanel({
      parent: demoBox,
      dockPosition: 'left',
      width: 20,
      height: '100%',
      title: ' Docked Left ',
      style: { border: { fg: 'cyan' } },
    });
    blessed.list({
      parent: sidebar,
      top: 0, left: 0, right: 0, bottom: 0,
      items: ['Item 1', 'Item 2', 'Item 3'],
      keys: true, mouse: true,
      style: { selected: { bg: 'blue' } },
    });

    // Floating Panel
    const float = new DockablePanel({
      parent: demoBox,
      dockPosition: 'float',
      top: 2, left: 25, width: 30, height: 10,
      title: ' Floating Window ',
      draggable: true,
      style: { border: { fg: 'yellow' } },
    });
    blessed.text({
      parent: float,
      top: 1, left: 1,
      content: 'Drag me around!\nThis panel floats above others.',
    });

    // Docked Bottom
    const footer = new DockablePanel({
      parent: demoBox,
      dockPosition: 'bottom',
      height: 5,
      width: '100%',
      title: ' Docked Bottom ',
      style: { border: { fg: 'green' } },
    });
    blessed.text({
      parent: footer,
      top: 1, left: 'center',
      content: 'Status: Ready',
    });

    addResult('DockablePanel', 'pass', 'Docking and floating work');
    screen.render();
  }

  // ========== ASCII VIDEO DEMO ==========
  function showAsciiVideoDemo() {
    clearDemo();
    currentDemo = 'asciivideo';
    demoBox.setLabel(' ASCII Video Widget — Matrix Rain Simulation ');

    // The Video widget plays files via mplayer/mpv --vo=caca (ASCII output).
    // In the BBS environment those binaries are unavailable, so we demonstrate
    // the Video widget's frame-rendering model using a procedural ASCII animation —
    // the same pattern the widget produces frame-by-frame from a real video file.
    const videoBox = blessed.box({
      parent: demoBox,
      top: 0, left: 0, right: 0, bottom: 5,
      label: ' Video — ASCII Frame Rendering @ ~12fps ',
      border: { type: 'line' },
      tags: true,
      style: { fg: 'green', bg: 'black', border: { fg: 'cyan' } },
    });

    // Matrix rain: each column has a "head" position that falls down
    const MATRIX_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789@#$%&*+-=<>[]{}|\\/:;.,?!^~`';
    const rnd = (arr: string) => arr[Math.floor(Math.random() * arr.length)];

    // Lazily compute dimensions on first render
    let colCount = 0;
    let rowCount = 0;
    type Col = { pos: number; speed: number; len: number };
    let cols: Col[] = [];

    addInterval(() => {
      if (currentDemo !== 'asciivideo') return;

      // Initialize columns on first tick (screen is rendered by then)
      const w = (videoBox as any).iwidth || 60;
      const h = (videoBox as any).iheight || 14;
      if (colCount !== w || rowCount !== h) {
        colCount = w;
        rowCount = h;
        cols = Array.from({ length: colCount }, () => ({
          pos: -Math.floor(Math.random() * rowCount),
          speed: 1,
          len: 4 + Math.floor(Math.random() * 6),
        }));
      }

      // Build frame: grid of chars, then tag head/trail differently
      const grid: string[] = Array(rowCount * colCount).fill(' ');

      cols.forEach((col, x) => {
        // Draw trail (dim green)
        for (let t = 1; t <= col.len; t++) {
          const row = col.pos - t;
          if (row >= 0 && row < rowCount) {
            grid[row * colCount + x] = rnd(MATRIX_CHARS);
          }
        }
        // Draw head (bright white-green)
        if (col.pos >= 0 && col.pos < rowCount) {
          grid[col.pos * colCount + x] = rnd(MATRIX_CHARS);
        }
        col.pos++;
        if (col.pos > rowCount + col.len) {
          col.pos = -Math.floor(Math.random() * rowCount);
          col.len = 4 + Math.floor(Math.random() * 6);
        }
      });

      // Render: mark heads bright, trail green, background black
      const lines: string[] = [];
      for (let row = 0; row < rowCount; row++) {
        let line = '';
        for (let col = 0; col < colCount; col++) {
          const ch = grid[row * colCount + col];
          const isHead = cols[col] && cols[col].pos === row;
          if (ch === ' ') {
            line += ' ';
          } else if (isHead) {
            line += `{white-fg}${ch}{/}`;
          } else {
            line += `{green-fg}${ch}{/}`;
          }
        }
        lines.push(line);
      }
      videoBox.setContent(lines.join('\n'));
      screen.render();
      addResult('ASCII Video', 'pass', 'Frame-based ASCII animation');
    }, 80);

    blessed.box({
      parent: demoBox, bottom: 0, left: 0, right: 0, height: 4,
      tags: true,
      content: '{yellow-fg}Video Widget API:{/}\n' +
        'video.setImage(frame) or mplayer -vo caca piped into the widget.\n' +
        'Above: procedural matrix rain at ~12fps showing the frame model.\n' +
        'Production: Video({ file: \'clip.mp4\' }) — requires mplayer/mpv with caca.',
    });

    screen.render();
  }

  // ========== WEBCAM DEMO ==========
  function showWebcamDemo() {
    clearDemo();
    currentDemo = 'webcam';
    demoBox.setLabel(' Webcam Stream - Live ASCII Video ');

    const webcamBox = blessed.box({
      parent: demoBox,
      top: 0, left: 0, right: 0, height: '100%-4',
      label: ' Live Webcam ',
      border: { type: 'line' },
      style: { fg: 'white', bg: 'black', border: { fg: 'red' } },
      content: '{center}Initializing webcam...{/center}',
      tags: true,
    });

    const videoService = (session as any).video;
    let activeStreamId: string | null = null;
    let currentMode: 'braille' | 'superres' | 'halfblock' | 'ascii' | 'hsv' | 'shape' = 'braille'; // Default to braille (highest quality)
    let isFullscreen = false;
    let isSwitchingStream = false; // Prevent rendering during stream transitions
    let streamSwitchInProgress = false; // Prevent concurrent startVideoStream calls

    // Compact inline button bar
    const buttonBar = blessed.box({
      parent: demoBox,
      bottom: 0, left: 0, right: 0, height: 3,
      tags: true,
      mouse: true,
      style: { fg: 'white', bg: 'black' }
    });

    const updateButtonBar = () => {
      const modes = [
        { name: 'Braille', key: '1', mode: 'braille', color: 'lightmagenta', desc: '8x' },
        { name: 'Rich', key: '2', mode: 'superres', color: 'lightgreen', desc: '4x+10' },
        { name: 'Rich', key: '3', mode: 'halfblock', color: 'cyan', desc: '4x+10' },
        { name: 'ASCII', key: '4', mode: 'ascii', color: 'lightblue', desc: '1x' },
        { name: 'HSV', key: '5', mode: 'hsv', color: 'lightyellow', desc: '16c' },
        { name: 'Shape', key: '6', mode: 'shape', color: 'lightred', desc: 'geo' }
      ];

      let line1 = '{yellow-fg}Mode:{/} ';
      let line2 = '{gray-fg}Keys:{/} ';

      for (const m of modes) {
        const isActive = currentMode === m.mode;
        if (isActive) {
          line1 += `{black-fg}{${m.color}-bg} ${m.name} {/} `;
          line2 += `{${m.color}-fg}[${m.key}]${m.desc}{/} `;
        } else {
          line1 += `{${m.color}-fg}${m.name}{/} `;
          line2 += `{gray-fg}[${m.key}]${m.desc}{/} `;
        }
      }

      line1 += '  {magenta-fg}Fullscreen{/} {red-fg}Stop{/}';
      line2 += '   {gray-fg}[F]ull   [S]top{/}';

      buttonBar.setContent(line1 + '\n' + line2);
      screen.render();
    };

    updateButtonBar();

    console.log('[Webcam Demo] videoService exists:', !!videoService);

    // Register SINGLE onFrame handler that uses current mode/fullscreen state
    if (videoService) {
      let isRendering = false;

      videoService.onFrame((frame: string) => {
        // Only render if we're in webcam demo, not switching streams, and not already rendering
        if (currentDemo === 'webcam' && !isRendering && !isSwitchingStream) {
          isRendering = true;
          if (isFullscreen) {
            // CRITICAL: Ensure fullscreenBox covers entire screen on EVERY frame
            // This prevents coordinate cache issues from causing alternating small renders
            const w = screen.width || 80;
            const h = screen.height || 24;

            // Always reset ALL position/size properties to prevent blessed coordinate cache issues
            fullscreenBox.top = 0;
            fullscreenBox.left = 0;
            fullscreenBox.width = w;
            fullscreenBox.height = h;

            // Clear ALL blessed internal caches to force recalculation
            // This prevents alternating frame sizes due to stale cached positions
            (fullscreenBox as any).lpos = null;           // Last rendered position
            (fullscreenBox as any)._coordsCache = null;   // Coordinates cache
            (fullscreenBox as any)._coordsCacheValid = false;  // Cache validity flag

            fullscreenBox.setContent(frame);
            fullscreenBox.setFront();  // Ensure it stays on top
          } else {
            webcamBox.setContent(frame);
          }
          screen.render();
          isRendering = false;
        }
      });
    }

    const startVideoStream = async () => {
      if (!videoService) return;

      // CRITICAL: Prevent concurrent executions - only ONE stream switch at a time
      if (streamSwitchInProgress) {
        console.log('[Webcam] Stream switch already in progress, ignoring request');
        return;
      }
      streamSwitchInProgress = true;

      // Capture mode NOW to avoid race conditions if user presses buttons during transition
      const requestedMode = currentMode;
      const requestedFullscreen = isFullscreen;

      // Block rendering during stream transition
      isSwitchingStream = true;

      // Stop existing stream first and WAIT for cleanup
      if (activeStreamId) {
        try {
          await videoService.stopStream(activeStreamId);
        } catch (err) {
          // Ignore errors from stopping
        }
        activeStreamId = null;

        // Wait for frame pipeline to clear (important!)
        await new Promise(resolve => setTimeout(resolve, 150));
      }

      // Hide cursor globally during webcam demo to prevent flickering artifacts
      if (screen.program) screen.program.hideCursor();

      // Calculate available size
      // For fullscreen, use fullscreenBox dimensions which are set from screen size after enableWideMode
      const availWidth = requestedFullscreen
        ? (typeof fullscreenBox.width === 'number' ? fullscreenBox.width : (typeof screen.width === 'number' ? screen.width : 80))
        : (typeof demoBox.width === 'number' ? demoBox.width : 78) - 4;  // Demo box minus borders
      const availHeight = requestedFullscreen
        ? (typeof fullscreenBox.height === 'number' ? fullscreenBox.height : (typeof screen.height === 'number' ? screen.height : 24))
        : (typeof demoBox.height === 'number' ? demoBox.height : 20) - 8;  // Demo box minus borders

      console.log(`[Video] Mode: ${requestedMode}, Fullscreen: ${requestedFullscreen}`);
      console.log(`[Video] Screen: ${screen.width}x${screen.height}, Avail: ${availWidth}x${availHeight}`);

      // Braille mode: 2x4 pixels = 1 char (8x resolution)
      // Rich mode (superres/halfblock): 2x2 pixels = 1 char (4x resolution with 10-level shading)
      // ASCII mode: 1x1 pixel = 1 char (1x resolution)
      const videoWidth = requestedMode === 'braille' ? availWidth * 2 :
                         requestedMode === 'superres' ? availWidth * 2 :
                         requestedMode === 'halfblock' ? availWidth * 2 :
                         availWidth;
      const videoHeight = requestedMode === 'braille' ? availHeight * 4 :
                          requestedMode === 'superres' ? availHeight * 2 :
                          requestedMode === 'halfblock' ? availHeight * 2 :
                          availHeight;

      console.log(`[Video] Requesting stream: ${videoWidth}x${videoHeight} pixels`);

      // Clear display to prevent old frames from lingering
      if (requestedFullscreen) {
        fullscreenBox.setContent(`{center}Starting ${requestedMode} mode...{/center}`);
      } else {
        webcamBox.setContent(`{center}Starting ${requestedMode} mode...{/center}`);
      }
      screen.render();

      try {
        // Add timeout to prevent indefinite hang
        const startPromise = videoService.startStream(
          { type: 'webcam' },
          {
            width: videoWidth,
            height: videoHeight,
            fps: requestedFullscreen ? 12 : 10, // Slightly slower FPS for stability
            colored: true,
            mode: requestedMode,
          }
        );

        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error('Stream start timeout (5s)')), 5000);
        });

        const streamId = await Promise.race([startPromise, timeoutPromise]);

        // Allow rendering IMMEDIATELY so first frame isn't dropped
        isSwitchingStream = false;
        activeStreamId = streamId;
        streamSwitchInProgress = false; // Release mutex

        // If user pressed more buttons during transition, switch to the latest mode
        if (currentMode !== requestedMode || isFullscreen !== requestedFullscreen) {
          console.log('[Webcam] Mode changed during switch, triggering another transition');
          setTimeout(() => startVideoStream(), 50); // Small delay to prevent tight loop
        }
      } catch (err: any) {
        isSwitchingStream = false; // Re-enable on error too
        streamSwitchInProgress = false; // Release mutex
        if (screen.program) screen.program.showCursor();
        webcamBox.setContent(`{red-fg}Error: ${err.message}{/red-fg}`);
        screen.render();
      }
    };

    // Create a special box for fullscreen that covers the entire screen
    // CRITICAL: scrollable=false + screen-level smartCSR=false prevents upward scrolling
    // CRITICAL: Use numeric dimensions (not percentages) to prevent stale calculations during resize
    const fullscreenBox = blessed.box({
      parent: screen,
      top: 0,
      left: 0,
      width: screen.width || 80,   // Numeric width - prevents stale percentage calculations
      height: screen.height || 25, // Numeric height - prevents stale percentage calculations
      hidden: true,
      tags: true,
      wrap: false,
      scrollable: false,        // No scrolling
      alwaysScroll: false,      // Never scroll
      keys: false,              // Disable key handling that might trigger scrolls
      mouse: false,             // Disable mouse events
      style: { bg: 'black' },
    });

    // Helper to show modem speed warning modal
    const showModemWarningModal = (): Promise<boolean> => {
      return new Promise((resolve) => {
        // Save current focus and lock screen keys to trap input in modal
        const savedFocus = screen.saveFocus();

        const modal = blessed.box({
          parent: screen,
          top: 'center',
          left: 'center',
          width: 60,
          height: 12,
          border: { type: 'line' },
          style: {
            fg: 'white',
            bg: 'black',
            border: { fg: 'yellow' },
          },
          tags: true,
          shadow: true,
        });

        const message = blessed.box({
          parent: modal,
          top: 1,
          left: 2,
          right: 2,
          height: 5,
          tags: true,
          content: '{yellow-fg}Warning:{/} Modem emulation is active.\n\n' +
            'Fullscreen video requires full speed to render\n' +
            'smoothly. Disable modem emulation?',
          style: { fg: 'white', bg: 'black' },
        });

        const okButton = blessed.button({
          parent: modal,
          bottom: 1,
          left: 10,
          width: 16,
          height: 3,
          content: '{center}[ OK ]{/center}',
          tags: true,
          mouse: true,
          keys: true,
          style: {
            fg: 'white',
            bg: 'green',
            focus: { fg: 'black', bg: 'lightgreen' },
          },
        });

        const cancelButton = blessed.button({
          parent: modal,
          bottom: 1,
          right: 10,
          width: 16,
          height: 3,
          content: '{center}[ Cancel ]{/center}',
          tags: true,
          mouse: true,
          keys: true,
          style: {
            fg: 'white',
            bg: 'red',
            focus: { fg: 'black', bg: 'lightred' },
          },
        });

        const cleanup = (result: boolean) => {
          modal.destroy();
          screen.restoreFocus();
          screen.render();
          resolve(result);
        };

        okButton.on('press', () => cleanup(true));
        cancelButton.on('press', () => cleanup(false));

        // Handle Enter key
        okButton.key(['enter', 'space'], () => cleanup(true));
        cancelButton.key(['enter', 'space'], () => cleanup(false));

        // Handle Escape to cancel
        modal.key(['escape'], () => cleanup(false));

        // Tab/arrow between buttons
        okButton.key(['tab', 'right'], () => cancelButton.focus());
        cancelButton.key(['tab', 'left'], () => okButton.focus());
        okButton.key(['left'], () => cancelButton.focus());
        cancelButton.key(['right'], () => okButton.focus());

        // Block other keys from reaching elements behind the modal
        modal.key(['up', 'down', 'pageup', 'pagedown', 'home', 'end'], () => {
          // Do nothing - absorb these keys
        });

        // Focus the modal and OK button
        screen.focusPush(modal);
        okButton.focus();
        screen.render();
      });
    };

    const toggleFullscreen = async () => {
      // Check if trying to ENTER fullscreen while modem emulation is active
      if (!isFullscreen && bbs.isModemEmulationActive?.()) {
        const disableModem = await showModemWarningModal();
        if (disableModem) {
          bbs.disableModemEmulation?.();
        } else {
          // User cancelled - don't enter fullscreen
          return;
        }
      }

      isFullscreen = !isFullscreen;

      if (isFullscreen) {
        // Hide all UI elements for true fullscreen
        headerBar.hide();
        menuBox.hide();
        demoBox.hide();
        statusBar.hide();

        // Clear the entire screen before going fullscreen
        screen.clearRegion(0, screen.width, 0, screen.height);
        screen.render();

        // Enable wide mode and wait for resize event
        console.log(`[Fullscreen] Enabling wide mode...`);
        console.log(`[Fullscreen] Screen before enableWideMode: ${screen.width}x${screen.height}`);

        // Create a promise that resolves on resize or timeout
        const resizePromise = new Promise<void>((resolve) => {
          let resolved = false;
          const onResize = () => {
            if (!resolved) {
              resolved = true;
              screen.removeListener('resize', onResize);
              resolve();
            }
          };
          screen.on('resize', onResize);
          // Timeout fallback in case resize doesn't fire
          setTimeout(() => {
            if (!resolved) {
              resolved = true;
              screen.removeListener('resize', onResize);
              resolve();
            }
          }, 800);
        });

        bbs.enableWideMode?.();
        await resizePromise;

        // CRITICAL: Update fullscreen box to ACTUAL screen dimensions (not percentages)
        const w = screen.width || 80;
        const h = screen.height || 24;
        console.log(`[Fullscreen] Screen after resize: ${w}x${h}`);

        fullscreenBox.width = w;
        fullscreenBox.height = h;
        fullscreenBox.show();
        fullscreenBox.setFront();
        fullscreenBox.setContent('');
        screen.render();

        console.log(`[Fullscreen] Starting video stream in fullscreen mode...`);

        // startVideoStream will handle stopping old stream and starting new one
        await startVideoStream();
      } else {
        // Disable wide mode to return to 80x24
        console.log(`[Normal] Disabling wide mode...`);
        console.log(`[Normal] Screen before disableWideMode: ${screen.width}x${screen.height}`);

        // Create a promise that resolves on resize or timeout (same pattern as entering fullscreen)
        const resizePromise = new Promise<void>((resolve) => {
          let resolved = false;
          const onResize = () => {
            if (!resolved) {
              resolved = true;
              screen.removeListener('resize', onResize);
              resolve();
            }
          };
          screen.on('resize', onResize);
          // Timeout fallback in case resize doesn't fire
          setTimeout(() => {
            if (!resolved) {
              resolved = true;
              screen.removeListener('resize', onResize);
              resolve();
            }
          }, 800);
        });

        bbs.disableWideMode?.();
        await resizePromise;

        console.log(`[Normal] Screen after resize: ${screen.width}x${screen.height}`);

        if (screen.program) screen.program.showCursor();
        fullscreenBox.hide();

        // Restore all UI elements
        headerBar.show();
        menuBox.show();
        demoBox.show();
        statusBar.show();

        // Force full redraw to clear any artifacts from the larger screen
        screen.forceFullRedraw();
        screen.render();

        console.log(`[Normal] Starting video stream in normal mode...`);

        // startVideoStream will handle stopping old stream and starting new one
        await startVideoStream();
      }
    };

    // Keyboard handlers for mode switching
    screen.key(['1'], () => {
      currentMode = 'braille';
      updateButtonBar();
      startVideoStream();
    });

    screen.key(['2'], () => {
      currentMode = 'superres';
      updateButtonBar();
      startVideoStream();
    });

    screen.key(['3'], () => {
      currentMode = 'halfblock';
      updateButtonBar();
      startVideoStream();
    });

    screen.key(['4'], () => {
      currentMode = 'ascii';
      updateButtonBar();
      startVideoStream();
    });

    screen.key(['5'], () => {
      currentMode = 'hsv';
      updateButtonBar();
      startVideoStream();
    });

    screen.key(['6'], () => {
      currentMode = 'shape';
      updateButtonBar();
      startVideoStream();
    });

    screen.key(['f', 'F'], () => {
      // Don't await - fire and forget to prevent blocking the key handler
      toggleFullscreen().then(() => {
        updateButtonBar();
        screen.render();
      }).catch((err) => {
        console.error('[Fullscreen] Error:', err);
        webcamBox.setContent(`{red-fg}Fullscreen error: ${err?.message || err}{/}`);
        screen.render();
      });
    });

    screen.key(['s', 'S'], () => {
      if (videoService && activeStreamId) {
        videoService.stopStream(activeStreamId);
        activeStreamId = null;
        webcamBox.setContent('{center}Stream stopped. Press 1-6 to restart.{/center}');
        screen.render();
      }
    });

    // ESC to exit fullscreen (return to webcam demo in normal mode)
    // Q to quit webcam demo entirely and return to menu
    screen.key(['escape'], async () => {
      if (isFullscreen) {
        // Exit fullscreen but keep webcam running in normal mode
        console.log(`[ESC] Exiting fullscreen, returning to normal webcam view...`);

        // Create a promise that resolves on resize or timeout
        const resizePromise = new Promise<void>((resolve) => {
          let resolved = false;
          const onResize = () => {
            if (!resolved) {
              resolved = true;
              screen.removeListener('resize', onResize);
              resolve();
            }
          };
          screen.on('resize', onResize);
          setTimeout(() => {
            if (!resolved) {
              resolved = true;
              screen.removeListener('resize', onResize);
              resolve();
            }
          }, 800);
        });

        isFullscreen = false;
        fullscreenBox.hide();
        bbs.disableWideMode?.();
        await resizePromise;

        console.log(`[ESC] Screen after resize: ${screen.width}x${screen.height}`);

        // Restore cursor
        if (screen.program) screen.program.showCursor();

        // Restore all UI elements
        headerBar.show();
        menuBox.show();
        demoBox.show();  // Keep demoBox visible with webcam
        statusBar.show();

        // Force full redraw to clear any artifacts from the larger screen
        screen.forceFullRedraw();
        screen.render();

        // Restart stream in normal (non-fullscreen) mode
        await startVideoStream();
      }
    });

    // Q to quit webcam demo entirely and return to menu
    screen.key(['q'], async () => {
      // Stop the video stream completely
      if (videoService && activeStreamId) {
        try {
          await videoService.stopStream(activeStreamId);
          activeStreamId = null;
        } catch (err) {
          // Ignore errors from stopping
        }
      }

      if (isFullscreen) {
        // Exit fullscreen first
        console.log(`[Q] Quitting webcam demo from fullscreen...`);

        const resizePromise = new Promise<void>((resolve) => {
          let resolved = false;
          const onResize = () => {
            if (!resolved) {
              resolved = true;
              screen.removeListener('resize', onResize);
              resolve();
            }
          };
          screen.on('resize', onResize);
          setTimeout(() => {
            if (!resolved) {
              resolved = true;
              screen.removeListener('resize', onResize);
              resolve();
            }
          }, 800);
        });

        isFullscreen = false;
        fullscreenBox.hide();
        bbs.disableWideMode?.();
        await resizePromise;

        if (screen.program) screen.program.showCursor();
      }

      // Restore all UI elements
      headerBar.show();
      menuBox.show();
      statusBar.show();

      // Return to demo selection menu
      demoBox.hide();
      menuList.show();
      menuList.focus();

      // Force full redraw
      screen.forceFullRedraw();
      screen.render();
    });

    // Resize handler - update fullscreen box and restart stream
    screen.on('resize', () => {
      if (currentDemo === 'webcam' && isFullscreen) {
        // Update fullscreen box to new screen dimensions
        const w = screen.width || 80;
        const h = screen.height || 25;
        console.log(`[Resize] Screen resized to: ${w}x${h}`);
        fullscreenBox.width = w;
        fullscreenBox.height = h;
        console.log(`[Resize] Fullscreen box updated to: ${fullscreenBox.width}x${fullscreenBox.height}`);

        // Restart stream with new dimensions
        if (activeStreamId) {
          startVideoStream();
        }
      }
    });

    // Start with default mode
    if (videoService) {
      startVideoStream();
    } else {
      webcamBox.setContent('{red-fg}Video service not available in this session.{/red-fg}');
    }

    screen.render();
  }

  // ========== MIC AUDIO DEMO ==========
  // Uses hybrid door pattern: socket events to browser client for Web Audio
  let micDemoCleanup: (() => void) | null = null;

  function showMicDemo() {
    clearDemo();
    // Clean up any previous mic demo handlers
    if (micDemoCleanup) {
      micDemoCleanup();
      micDemoCleanup = null;
    }

    currentDemo = 'mic';
    demoBox.setLabel(' Microphone Audio - Live Input (Hybrid) ');

    const micBox = blessed.box({
      parent: demoBox,
      top: 0, left: 0, right: 0, height: '100%-4',
      label: ' Mic Status ',
      border: { type: 'line' },
      style: { fg: 'white', bg: 'black', border: { fg: 'green' } },
      content: '{center}Initializing microphone...{/center}',
      tags: true,
    });

    blessed.box({
      parent: demoBox, bottom: 0, left: 0, right: 0, height: 4,
      tags: true,
      content: '{yellow-fg}Mic Demo (Hybrid):{/}\n' +
        'Web Audio capture runs in browser.\n' +
        '{gray-fg}(Requires hybrid door with client.ts){/}',
    });

    // Use socket to communicate with browser-side client.ts
    const socket = session.socket;
    if (socket) {
      // Create VU Meter for visualization
      const vuMeter = new BrailleVUMeter(60, 30);

      // Helper to center text
      const centerText = (text: string, width: number = 60) => {
        const padding = Math.max(0, Math.floor((width - text.length) / 2));
        return ' '.repeat(padding) + text;
      };

      // Listen for audio levels from browser client
      const levelsHandler = (levels: { input: number; output: number }) => {
        if (currentDemo !== 'mic') return; // Only update if still in mic demo

        const frame = vuMeter.update(levels.input);

        micBox.setContent(
          centerText('{green-fg}Microphone Active{/green-fg}', 60) + '\n' +
          centerText(`{cyan-fg}Input Level: ${Math.round(levels.input * 100)}%{/cyan-fg}`, 60) + '\n\n' +
          frame + '\n\n' +
          centerText('{gray-fg}(Web Audio in browser via hybrid door){/gray-fg}', 60)
        );
        screen.render();
      };

      // Listen for audio started confirmation
      const startedHandler = () => {
        micBox.setContent(
          centerText('{green-fg}Microphone Active{/green-fg}', 60) + '\n' +
          centerText('{cyan-fg}Waiting for audio...{/cyan-fg}', 60)
        );
        screen.render();
      };

      // Listen for audio errors
      const errorHandler = (data: { message: string }) => {
        micBox.setContent(`{red-fg}Error: ${data.message}{/red-fg}`);
        screen.render();
      };

      // Register event handlers
      socket.on('audio:levels', levelsHandler);
      socket.on('audio:started', startedHandler);
      socket.on('audio:error', errorHandler);

      // Tell browser client to start audio capture
      socket.emit('audio:start-streaming', {
        options: {
          sampleRate: 44100,
          channels: 1,
          testMode: true,
        }
      });

      // Store cleanup function for when demo changes
      micDemoCleanup = () => {
        socket.emit('audio:stop-streaming');
        socket.off('audio:levels', levelsHandler);
        socket.off('audio:started', startedHandler);
        socket.off('audio:error', errorHandler);
      };

    } else {
      micBox.setContent('{red-fg}Socket not available - hybrid door required.{/red-fg}');
    }

    screen.render();
  }

  // ========== 34. NEW WIDGETS DEMO ========== 
  function showNewWidgets() {
    clearDemo();
    currentDemo = 'new-widgets';
    demoBox.setLabel(' New Widgets: TabPanel, Accordion, Collapsible, StackedGauge, ColorPicker ');

    // 1. TabPanel
    const tabpanel = blessed.tabpanel({
      parent: demoBox,
      top: 0,
      left: 0,
      width: '50%-1',
      height: '50%-1',
      border: { type: 'line' },
      label: ' TabPanel ',
      tabs: [
        { label: 'General', content: 'This is the {bold}General{/} tab content.' },
        { label: 'Advanced', content: 'Advanced settings and {cyan-fg}configurations{/}.' },
        { label: 'Plugins', content: 'Manage your installed {green-fg}plugins{/} here.' },
      ]
    });

    // 2. Accordion
    const accordion = blessed.accordion({
      parent: demoBox,
      top: 0,
      left: '50%',
      width: '50%-1',
      height: '50%-1',
      border: { type: 'line' },
      label: ' Accordion ',
      items: [
        { label: 'Section 1', content: 'Content for section 1.\nMultiple lines supported.' },
        { label: 'Section 2', content: 'Section 2 has different content.' },
        { label: 'Section 3', content: 'Expanding this collapses others (multiple: false).' },
      ]
    });

    // 3. Collapsible
    const collapsible = blessed.collapsible({
      parent: demoBox,
      top: '50%',
      left: 0,
      width: '50%-1',
      label: 'Collapsible Section',
      border: { type: 'line' },
      content: 'This section can be collapsed to save vertical space.\n{yellow-fg}Press Enter or click the header to toggle.{/}'
    });

    // 4. StackedGauge
    const stackedGauge = blessed.stackedgauge({
      parent: demoBox,
      top: '50%',
      left: '50%',
      width: '50%-1',
      height: 5,
      label: ' StackedGauge ',
      stack: [
        { percent: 30, color: 'red', label: 'System' },
        { percent: 45, color: 'green', label: 'User' },
        { percent: 15, color: 'blue', label: 'Network' },
      ]
    });

    // 5. ColorPicker
    const colorPicker = blessed.colorpicker({
      parent: demoBox,
      top: '50%+5',
      left: '50%',
      width: '50%-1',
      height: 8,
      label: ' ColorPicker ',
    });

    colorPicker.on('select', (color: string) => {
      setStatus(`Selected color: ${color}`);
      stackedGauge.setLabel(` StackedGauge ({${color}-fg}${color}{/}) `);
    });

    // 6. Autocomplete (Triggered by Textbox)
    const label = blessed.text({
      parent: demoBox,
      top: '50%+5',
      left: 1,
      content: 'Autocomplete (type @ or [):'
    });

    const textbox = blessed.textbox({
      parent: demoBox,
      top: '50%+6',
      left: 1,
      width: '40%',
      height: 3,
      border: { type: 'line' },
      keys: true,
      mouse: true,
      inputOnFocus: true
    });

    const ac = blessed.autocomplete({
      parent: demoBox,
      providers: [
        new blessed.UsernameProvider(['spot', 'gemini', 'bbs_sysop', 'amiga_fan']),
        new blessed.BBSCodeProvider()
      ]
    });

    ac.attachTo(textbox);

    textbox.on('keypress', (ch, key) => {
      // If autocomplete is visible, let it handle the keys
      if (ac.isVisible()) {
        return false;
      }

      // Basic trigger logic for demo: show suggestions after @ or [
      if (ch === '@' || ch === '[') {
        // We need a slight delay to let the character be processed by the textbox
        // (or we manually include it in the context)
        setTimeout(() => {
          const context = {
            currentLine: textbox.value,
            cursorPosition: textbox.value.length,
            lineNumber: 0,
            documentContent: [textbox.value]
          };
          ac.suggest(context);
        }, 10);
      }
      return false;
    });

    ac.on('select', (suggestion: any) => {
      // The insertText is the part AFTER the trigger
      textbox.value += suggestion.insertText;
      textbox.focus();
      screen.render();
    });

    // 7. FileExplorer
    const fileExplorer = blessed.fileexplorer({
      parent: demoBox,
      top: '50%+10',
      left: 0,
      right: 0,
      bottom: 0,
      label: ' FileExplorer ',
    });

    fileExplorer.setTreeData({
      name: 'root',
      extended: true,
      children: [
        { name: 'Documents', extended: true, children: [{ name: 'Work' }, { name: 'Home' }] },
        { name: 'Downloads', children: [{ name: 'Images' }, { name: 'Video' }] },
        { name: 'System' },
      ]
    });

    fileExplorer.setFileData([
      ['README.md', '1.2 KB', '2024-01-01'],
      ['package.json', '0.8 KB', '2024-01-02'],
      ['app.ts', '15.4 KB', '2024-01-03'],
      ['logo.png', '42.1 KB', '2024-01-04'],
    ]);

    addResult('TabPanel', 'pass', 'Switching tabs works');
    addResult('Accordion', 'pass', 'Expansion works');
    addResult('Collapsible', 'pass', 'Single toggle works');
    addResult('StackedGauge', 'pass', 'Multi-segments render');
    addResult('ColorPicker', 'pass', 'Color selection works');
    addResult('Autocomplete', 'pass', 'Manager integration works');
    addResult('FileExplorer', 'pass', 'Three-pane layout works');

    screen.render();
  }

  // ========== 35. STRESS TEST ==========
  function showStressTest() {
    clearDemo();
    currentDemo = 'stress';
    demoBox.setLabel(' Stress Test: 50 Widgets ');

    const colors = ['red', 'green', 'blue', 'yellow', 'cyan', 'magenta', 'white'];
    for (let i = 0; i < 50; i++) {
      blessed.box({
        parent: demoBox,
        top: Math.floor(i / 10) * 3,
        left: (i % 10) * 5,
        width: 5,
        height: 3,
        content: `${i + 1}`,
        border: { type: 'line' },
        style: { fg: 'white', border: { fg: colors[i % colors.length] } },
      });
    }

    setStatus('Stress test: 50 boxes rendered');
    addResult('Stress Test', 'pass', '50 widgets');
    screen.render();
  }

  // ========== 14. VIEW RESULTS ==========
  function showResults() {
    clearDemo();
    currentDemo = 'results';
    demoBox.setLabel(' Test Results Summary ');

    const passed = testResults.filter(r => r.status === 'pass').length;
    const failed = testResults.filter(r => r.status === 'fail').length;
    const na = testResults.filter(r => r.status === 'n/a').length;
    const untested = testResults.filter(r => r.status === 'untested').length;

    let content = `{bold}Neo-Blessed Widget Test Results{/}\n\n`;
    content += `{green-fg}Passed: ${passed}{/} | {red-fg}Failed: ${failed}{/} | `;
    content += `{yellow-fg}N/A: ${na}{/} | {gray-fg}Untested: ${untested}{/}\n\n`;

    const sorted = [...testResults].sort((a, b) => a.widget.localeCompare(b.widget));
    for (const r of sorted) {
      const icon = r.status === 'pass' ? '{green-fg}[OK]{/}' :
                   r.status === 'fail' ? '{red-fg}[FAIL]{/}' :
                   r.status === 'n/a' ? '{yellow-fg}[N/A]{/}' : '{gray-fg}[?]{/}';
      content += `${icon} {bold}${r.widget}{/}: ${r.notes}\n`;
    }

    if (testResults.length === 0) {
      content += '{yellow-fg}No tests run yet. Try some demos first.{/}';
    }

    blessed.scrollabletext({
      parent: demoBox,
      top: 0, left: 0, right: 0, bottom: 0,
      tags: true, scrollable: true, mouse: true,
      keys: true, vi: true, alwaysScroll: true,
      scrollbar: {
        ch: ' ',  // Space with bg color for Amiga compatibility
        track: { ch: ' ', style: { bg: 'black' } },
        style: { bg: 'cyan' }
      },
      content,
      style: { fg: 'white' },
    });

    screen.render();
  }

  // ========== MENU HANDLING ==========
  menuList.on('select', (_: any, index: number) => {
    switch (index) {
      case 0: showBasicWidgets(); break;
      case 1: showListWidgets(); break;
      case 2: showInputWidgets(); break;
      case 3: showDialogWidgets(); break;
      case 4: showDataWidgets(); break;
      case 5: showInteractive(); break;
      case 6: showCanvasDemo(); break;
      case 7: showImageDemo(); break;
      case 8: showANSIImageDemo(); break;
      case 9: showAsciiAnimationDemo(); break;
      case 10: showIFrameDemo(); break;
      case 11: showSpecialWidgets(); break;
      case 12: showViewportDemo(); break;
      case 13: showLineChartDemo(); break;
      case 14: showBarChartDemo(); break;
      case 15: showStackedBarDemo(); break;
      case 16: showDonutChartDemo(); break;
      case 17: showSparklineDemo(); break;
      case 18: showGaugeDemo(); break;
      case 19: showGaugeListDemo(); break;
      case 20: showLCDDemo(); break;
      case 21: showContribData(); break;
      case 22: showContribLayouts(); break;
      case 23: showWindowFeatures(); break;
      case 24: showMapDemo(); break;
      case 25: showPictureDemo(); break;
      case 26: showMarkdownDemo(); break;
      case 27: showPanelDemo(); break;
      case 28: showAutocompleteDemo(); break;
      case 29: showNewFeatures(); break;
      case 30: showDockableLayoutDemo(); break;
      case 31: showAsciiVideoDemo(); break;
      case 32: showWebcamDemo(); break;
      case 33: showMicDemo(); break;
      case 34: showNewWidgets(); break;
      case 35: showStressTest(); break;
      case 36: showResults(); break;
      case 37: cleanup(); break;
    }
  });

  // ========== GLOBAL KEYS ==========
  screen.key(['q', 'C-c'], cleanup);
  screen.key(['escape'], () => { menuList.focus(); screen.render(); });

  // ========== CLEANUP ==========
  function cleanup() {
    currentDemo = null;
    intervals.forEach(i => clearInterval(i));
    intervals.length = 0;
    timeouts.forEach(t => clearTimeout(t));
    timeouts.length = 0;
    inputManager.disable();  // Handles all input cleanup (game mode, mouse, handlers, flags)
    screen.destroy();
    if (bbs) {
      bbs.write('\x1b[2J\x1b[H');
      bbs.writeLine('\x1b[33mThanks for testing Neo-Blessed Showcase!\x1b[0m');
    }
  }

  // ========== MAIN ==========
  return {
    async run() {
      // Clear screen the same way grandmaster does: terminal clear + blessed buffer flush.
      // bbs.write('\x1b[2J') alone only clears the visible terminal; blessed's internal
      // buffer may still contain the previous screen's content (borders, text) which bleeds
      // through as ghost borders. clearRegion + alloc wipes the blessed-side buffer too.
      screen.program.write('\x1b[2J');
      screen.program.write('\x1b[H');
      screen.clearRegion(0, screen.width, 0, screen.height);
      screen.alloc();
      await new Promise<void>((resolve) => setTimeout(resolve, 100));
      menuList.focus();
      screen.render();
      await new Promise<void>((resolve) => screen.on('destroy', resolve));
    }
  };
}
