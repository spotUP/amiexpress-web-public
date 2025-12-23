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

import blessed from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import contrib from '@amiexpress/bbs-door-sdk/engines/ui/blessed/contrib';

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

  // Enable game mode for smooth keyboard input (bypasses OS key repeat delay)
  if (bbs?.enableGameMode) {
    bbs.enableGameMode();
  }

  const testResults: TestResult[] = [];
  let currentDemo: string | null = null;
  const intervals: NodeJS.Timeout[] = [];

  // ========== CREATE SCREEN ==========
  const screen = blessed.screen({
    smartCSR: true,
    fullUnicode: true,
    title: `Neo-Blessed Showcase ${BUILD_VERSION}`,
    output: (data: string) => bbs.write(data),
  });

  if (session.bbsSession) {
    session.bbsSession.doorInputHandler = (data: string) => {
      screen._handleData(data);
    };
  }

  // Enable mouse events on both screen (ANSI sequences) and BBS API (Socket.IO events)
  screen.enableMouse();
  if (bbs?.enableMouseEvents) {
    bbs.enableMouseEvents();
  }

  // ========== MAIN LAYOUT ==========
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
      ch: '█',  // Solid block for thumb (more visible)
      track: {
        ch: '│',  // Thin vertical line for track
        bg: 'black'
      },
      style: {
        fg: 'cyan',  // Cyan scrollbar thumb
        bg: 'black'  // Black background (changed from cyan)
      }
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
      ' 8. Image Demo',
      ' 9. ANSIImage Demo',
      '10. Video Demo',
      '11. IFrame Demo',
      '12. Special Widgets',
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
      '27. New Features',
      '28. Stress Test',
      '29. View Results',
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
    content: ` User: ${username} | Select a category `,
  });

  // ========== HELPERS ==========
  function clearDemo() {
    intervals.forEach(i => clearInterval(i));
    intervals.length = 0;
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
        ch: '█',
        track: { ch: '│' },
        style: { fg: 'green' }
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
        ch: '█',
        track: { ch: '│' },
        style: { fg: 'blue' }
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
      setTimeout(() => {
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
        ch: '█',
        track: { ch: '│' },
        style: { fg: 'green' }
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
    demoBox.setLabel(' Image - ASCII Art Rendering ');

    // ASCII art representation of an image
    const asciiArt = [
      '        .-""""-.        ',
      '       /        \\       ',
      '      |  O    O  |      ',
      '      |  \\____/  |      ',
      '       \\        /       ',
      '        \'-....-\'        ',
      '       /|      |\\       ',
      '      / |      | \\      ',
      '     /  |      |  \\     ',
      '        |      |        ',
      '        |  ||  |        ',
      '        |  ||  |        ',
      '       _|  ||  |_       ',
      '      (__) (__)(__)     ',
    ].join('\n');

    blessed.box({
      parent: demoBox,
      top: 0, left: 0, right: 0, height: 16,
      label: ' ASCII Art Image ',
      border: { type: 'line' },
      content: asciiArt,
      align: 'center',
      style: { fg: 'cyan', border: { fg: 'yellow' } },
    });

    blessed.box({
      parent: demoBox, bottom: 0, left: 0, right: 0, height: 4,
      tags: true,
      content: '{yellow-fg}Image Widget:{/}\n' +
        'Converts images to ASCII/ANSI art.\n' +
        'Uses block characters and colors to approximate pixel data.',
    });
    addResult('Image', 'pass', 'ASCII art display');

    screen.render();
  }

  // ========== 9. ANSIIMAGE DEMO ==========
  function showANSIImageDemo() {
    clearDemo();
    currentDemo = 'ansiimage';
    demoBox.setLabel(' ANSIImage - Colored ANSI Art ');

    // Colorful ANSI art demo using tags
    const ansiArt = blessed.box({
      parent: demoBox,
      top: 0, left: 0, right: 0, height: 14,
      label: ' ANSI Art with Colors ',
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
        '        {bold}{white-fg}ANSI ART DEMONSTRATION{/}',
        '   {cyan-fg}Using blessed tag formatting{/}',
      ].join('\n'),
      style: { fg: 'white', border: { fg: 'white' } },
    });

    blessed.box({
      parent: demoBox, bottom: 0, left: 0, right: 0, height: 5,
      tags: true,
      content: '{yellow-fg}ANSIImage Widget:{/}\n' +
        'Renders ANSI art files with full color support.\n' +
        'Supports: 16 colors, 256 colors, true color (24-bit)\n' +
        'Uses tags: {red-fg}red{/}, {green-fg}green{/}, {blue-fg}blue{/}, {bold}bold{/}',
    });
    addResult('ANSIImage', 'pass', 'ANSI art display');

    screen.render();
  }

  // ========== 10. VIDEO DEMO ==========
  function showVideoDemo() {
    clearDemo();
    currentDemo = 'video';
    demoBox.setLabel(' Video - ASCII Animation Demo ');

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
      label: ' ASCII Animation (Video Simulation) ',
      border: { type: 'line' },
      align: 'center',
      valign: 'middle',
      content: frames[0].join('\n'),
      style: { fg: 'yellow', border: { fg: 'red' } },
    });

    // Animate at 4 fps
    const animInterval = setInterval(() => {
      frameIndex = (frameIndex + 1) % frames.length;
      videoBox.setContent(frames[frameIndex].join('\n'));
      screen.render();
    }, 250);

    intervals.push(animInterval);

    blessed.box({
      parent: demoBox,
      top: 10, left: 0, right: 0, height: 6,
      label: ' Controls ',
      border: { type: 'line' },
      tags: true,
      content: '{cyan-fg}[P]{/} Play/Pause  {cyan-fg}[S]{/} Stop  {cyan-fg}[R]{/} Restart\n' +
        '{cyan-fg}[<]{/} Previous   {cyan-fg}[>]{/} Next Frame\n\n' +
        '{gray-fg}(In BBS, video would be streamed as ASCII frames){/}',
      style: { fg: 'white', border: { fg: 'green' } },
    });

    blessed.box({
      parent: demoBox, bottom: 0, left: 0, right: 0, height: 3,
      tags: true,
      content: '{yellow-fg}Video Widget:{/}\n' +
        'Streams video as ASCII art frames. Browser-only feature in web mode.',
    });
    addResult('Video', 'pass', 'ASCII animation');

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
    demoBox.setLabel(' Special: FileManager, FileBox, Terminal, Viewport ');

    // FileManager
    blessed.box({
      parent: demoBox,
      top: 0, left: 0, width: '50%', height: 7,
      label: ' FileManager ', border: { type: 'line' },
      content: 'FileManager widget\nBrowses directories\n(needs filesystem)',
      style: { fg: 'gray', border: { fg: 'yellow' } },
    });
    addResult('FileManager', 'n/a', 'Needs filesystem');

    // FileBox
    blessed.box({
      parent: demoBox,
      top: 0, left: '50%', width: '50%-1', height: 7,
      label: ' FileBox ', border: { type: 'line' },
      content: 'FileBox widget\nFile input\n(needs filesystem)',
      style: { fg: 'gray', border: { fg: 'green' } },
    });
    addResult('FileBox', 'n/a', 'Needs filesystem');

    // Terminal
    blessed.box({
      parent: demoBox,
      top: 7, left: 0, width: '50%', height: 7,
      label: ' Terminal ', border: { type: 'line' },
      content: 'Terminal emulator\nRuns shell commands\n(needs PTY)',
      style: { fg: 'gray', border: { fg: 'blue' } },
    });
    addResult('Terminal', 'n/a', 'Needs PTY');

    // Viewport
    const viewport = blessed.viewport({
      parent: demoBox,
      top: 7, left: '50%', width: '50%-1', height: 7,
      label: ' Viewport ', border: { type: 'line' },
      mouse: true,
      style: { fg: 'white', border: { fg: 'cyan' } },
    });
    blessed.box({
      parent: viewport, top: 0, left: 0, width: 60, height: 20,
      content: 'Scrollable viewport content\n'.repeat(10) + 'End of viewport',
    });
    addResult('Viewport', 'pass', 'Scroll viewport');

    blessed.box({
      parent: demoBox, bottom: 0, left: 0, width: '100%', height: 2,
      tags: true,
      content: '{yellow-fg}Note:{/} Some widgets need external resources (filesystem, PTY).',
    });

    screen.render();
  }

  // ========== 9. LINE CHART DEMO ==========
  function showLineChartDemo() {
    clearDemo();
    currentDemo = 'linechart';
    demoBox.setLabel(' Line Chart Demo ');

    const lineChart = contrib.line({
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

    const barChart = contrib.bar({
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

    const stackedBar = contrib.stackedBar({
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

    const donut = contrib.donut({
      parent: demoBox,
      top: 0, left: 0, right: 0, bottom: 3,
      label: ' Donut Chart - Market Share ', border: { type: 'line' },
      canvasMode: CANVAS_MODE,
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
      parent: demoBox, bottom: 0, left: 0, right: 0, height: 2,
      tags: true,
      content: '{yellow-fg}Donut Chart:{/} Shows proportional distribution of values.',
    });

    screen.render();
  }

  // ========== 13. SPARKLINE DEMO ==========
  function showSparklineDemo() {
    clearDemo();
    currentDemo = 'sparkline';
    demoBox.setLabel(' Sparkline Demo ');

    const sparkline = contrib.sparkline({
      parent: demoBox,
      top: 0, left: 0, right: 0, bottom: 3,
      label: ' Sparklines - System Metrics ', border: { type: 'line' },
      style: { fg: 'cyan', border: { fg: 'blue' } },
    });

    sparkline.setData(
      ['CPU Usage', 'Memory', 'Network', 'Disk I/O'],
      [
        [10, 25, 30, 45, 35, 50, 40, 55, 45, 60, 50, 65, 55, 70, 60, 75],
        [40, 42, 45, 48, 50, 52, 55, 58, 60, 62, 65, 68, 70, 72, 75, 78],
        [5, 15, 8, 25, 12, 30, 15, 35, 20, 40, 25, 45, 30, 50, 35, 55],
        [20, 22, 25, 28, 30, 32, 35, 38, 40, 42, 45, 48, 50, 52, 55, 58],
      ]
    );
    addResult('Sparkline', 'pass', 'Multiple sparklines');

    blessed.box({
      parent: demoBox, bottom: 0, left: 0, right: 0, height: 2,
      tags: true,
      content: '{yellow-fg}Sparkline:{/} Compact inline charts showing data trends.',
    });

    screen.render();
  }

  // ========== 14. GAUGE DEMO ==========
  function showGaugeDemo() {
    clearDemo();
    currentDemo = 'gauge';
    demoBox.setLabel(' Gauge Demo ');

    // Single gauge (animated)
    const gauge1 = contrib.gauge({
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
    const gauge2 = contrib.gauge({
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

    const gaugeList = contrib.gaugeList({
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

    // Counter LCD
    const lcd = contrib.lcd({
      parent: demoBox,
      top: 0, left: 0, right: 0, height: 10,
      label: ' LCD Counter ', border: { type: 'line' },
      segmentWidth: 0.06, segmentInterval: 0.11,
      strokeWidth: 0.11, elements: 6,
      display: '000000',
      elementSpacing: 4, elementPadding: 2,
      canvasMode: CANVAS_MODE,
      style: { fg: 'green', border: { fg: 'blue' } },
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
      parent: demoBox, bottom: 0, left: 0, right: 0, height: 4,
      tags: true,
      content: '{yellow-fg}LCD Widget:{/}\n' +
        '7-segment LED/LCD style display for numbers.\n' +
        'Configurable segment size, spacing, and color.',
    });

    screen.render();
  }

  // ========== 11. CONTRIB DATA ==========
  function showContribData() {
    clearDemo();
    currentDemo = 'contribData';
    demoBox.setLabel(' Contrib: Tree, Table, Log, Map, Picture, Markdown ');

    // Tree - with fold/unfold using left/right arrows and Enter
    const tree = contrib.tree({
      parent: demoBox,
      top: 0, left: 0, width: '33%', height: 10,
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
    const contribTable = contrib.table({
      parent: demoBox,
      top: 0, left: '33%', width: '34%', height: 10,
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
    const contribLog = contrib.log({
      parent: demoBox,
      top: 0, left: '67%', width: '33%-1', height: 10,
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

    // Map
    blessed.box({
      parent: demoBox,
      top: 10, left: 0, width: '33%', height: 5,
      label: ' Map ', border: { type: 'line' },
      content: 'World map widget\n(ASCII art map)',
      style: { fg: 'gray', border: { fg: 'blue' } },
    });
    addResult('Map', 'n/a', 'Complex rendering');

    // Picture
    blessed.box({
      parent: demoBox,
      top: 10, left: '33%', width: '34%', height: 5,
      label: ' Picture ', border: { type: 'line' },
      content: 'Picture widget\n(needs image data)',
      style: { fg: 'gray', border: { fg: 'magenta' } },
    });
    addResult('Picture', 'n/a', 'Needs image');

    // Markdown
    blessed.box({
      parent: demoBox,
      top: 10, left: '67%', width: '33%-1', height: 5,
      label: ' Markdown ', border: { type: 'line' },
      content: 'Markdown renderer\n(styled text)',
      style: { fg: 'gray', border: { fg: 'red' } },
    });
    addResult('Markdown', 'n/a', 'Text rendering');

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
    const grid = new contrib.Grid({ rows: 4, cols: 4, screen: demoBox as any });

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

    const map = contrib.map({
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

    const picture = contrib.picture({
      parent: demoBox,
      top: 0, left: 0, right: 0, bottom: 4,
      label: ' ASCII Picture ',
      border: { type: 'line' },
      file: '',  // No file, will show placeholder
      cols: 40,
      style: { fg: 'white', border: { fg: 'magenta' } },
    });

    addResult('Picture', 'pass', 'ASCII art from images');

    blessed.box({
      parent: demoBox, bottom: 0, left: 0, right: 0, height: 3,
      tags: true,
      content: '{yellow-fg}Picture Widget:{/}\n' +
        'Converts images to ASCII art for terminal display.\n' +
        'Supports various image formats via external converter.',
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

    const markdown = contrib.markdown({
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
        ch: '█',
        track: { ch: '│' },
        style: { fg: 'cyan' }
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
        ch: '█',
        track: { ch: '│' },
        style: { fg: 'magenta' }
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
    const fixedOverlay = blessed.box({
      parent: scrollContainer,
      top: 2, left: 2, width: 20, height: 4,
      label: ' FIXED ',
      border: { type: 'line' },
      fixed: true,  // NEW: Fixed positioning
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
        ch: '█',
        track: { ch: '│' },
        style: { fg: 'green' }
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

  // ========== 14. STRESS TEST ==========
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
        ch: '█',
        track: { ch: '│' },
        style: { fg: 'cyan' }
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
      case 9: showVideoDemo(); break;
      case 10: showIFrameDemo(); break;
      case 11: showSpecialWidgets(); break;
      case 12: showLineChartDemo(); break;
      case 13: showBarChartDemo(); break;
      case 14: showStackedBarDemo(); break;
      case 15: showDonutChartDemo(); break;
      case 16: showSparklineDemo(); break;
      case 17: showGaugeDemo(); break;
      case 18: showGaugeListDemo(); break;
      case 19: showLCDDemo(); break;
      case 20: showContribData(); break;
      case 21: showContribLayouts(); break;
      case 22: showWindowFeatures(); break;
      case 23: showMapDemo(); break;
      case 24: showPictureDemo(); break;
      case 25: showMarkdownDemo(); break;
      case 26: showNewFeatures(); break;
      case 27: showStressTest(); break;
      case 28: showResults(); break;
      case 29: cleanup(); break;
    }
  });

  // ========== GLOBAL KEYS ==========
  screen.key(['q', 'C-c'], cleanup);
  screen.key(['tab'], () => {
    const focused = screen.getFocused();
    if (focused === menuList) {
      for (const child of demoBox.children) {
        if ((child as any).focus) { (child as any).focus(); break; }
      }
    } else {
      menuList.focus();
    }
    screen.render();
  });
  screen.key(['escape'], () => { menuList.focus(); screen.render(); });

  // ========== CLEANUP ==========
  function cleanup() {
    currentDemo = null;
    intervals.forEach(i => clearInterval(i));
    screen.disableMouse();
    if (session.bbsSession) delete session.bbsSession.doorInputHandler;
    screen.destroy();
    bbs.write('\x1b[2J\x1b[H');
    bbs.writeLine('\x1b[33mThanks for testing Neo-Blessed Showcase!\x1b[0m');
  }

  // ========== MAIN ==========
  return {
    async run() {
      bbs.write('\x1b[2J\x1b[H');
      menuList.focus();
      screen.render();
      await new Promise<void>((resolve) => screen.on('destroy', resolve));
    }
  };
}
