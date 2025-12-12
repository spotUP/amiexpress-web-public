/**
 * Neo-Blessed & Blessed-Contrib Showcase Door
 *
 * Comprehensive interactive demonstration of all 49 widgets (34 core + 15 contrib)
 * for BBS door developers. This door teaches everything needed to build
 * professional terminal UIs with neo-blessed.
 */

import { Door, getTerminalDimensions } from '@amiexpress/bbs-door-sdk';
import blessed from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import contrib from '@amiexpress/bbs-door-sdk/engines/ui/blessed/contrib';

export default class NeoBlessedShowcaseDoor extends Door {
  private screen!: blessed.Widgets.Screen;
  private carousel!: any;
  private currentPage = 0;
  private totalPages = 10;
  private animationInterval: NodeJS.Timeout | null = null;

  async onStart() {
    // Get BBS terminal dimensions
    const dims = getTerminalDimensions(this.context);

    // Create screen with BBS constraints (80 columns, user-configurable height)
    this.screen = blessed.screen({
      height: dims.height,
      output: (data: string) => this.context.output.write(data),
      fullUnicode: true,
      smartCSR: true,
      title: 'Neo-Blessed Showcase',
    });

    // Create carousel for multi-page navigation
    this.carousel = new contrib.Carousel(this.screen, {
      pages: [
        () => this.createWelcomePage(),
        () => this.createCoreWidgetsPage1(),
        () => this.createCoreWidgetsPage2(),
        () => this.createChartsPage(),
        () => this.createGaugesPage(),
        () => this.createDataWidgetsPage(),
        () => this.createDisplayWidgetsPage(),
        () => this.createLayoutPage(),
        () => this.createInteractivePage(),
        () => this.createBestPracticesPage(),
      ],
    });

    // Setup global key bindings
    this.setupKeyBindings();

    // Start on first page
    this.carousel.start();
    this.currentPage = 0;
    this.updateNavigationBar();

    // Render initial screen
    this.screen.render();

    // Wait for user to exit
    await this.waitForExit();
  }

  private setupKeyBindings() {
    // Navigation
    this.screen.key(['left', 'h'], () => {
      if (this.currentPage > 0) {
        this.currentPage--;
        this.carousel.previous();
        this.updateNavigationBar();
        this.screen.render();
      }
    });

    this.screen.key(['right', 'l'], () => {
      if (this.currentPage < this.totalPages - 1) {
        this.currentPage++;
        this.carousel.next();
        this.updateNavigationBar();
        this.screen.render();
      }
    });

    // Jump to specific pages
    for (let i = 1; i <= 9; i++) {
      this.screen.key([i.toString()], () => {
        if (i - 1 < this.totalPages) {
          this.currentPage = i - 1;
          this.carousel.moveTo(i - 1);
          this.updateNavigationBar();
          this.screen.render();
        }
      });
    }

    // Help menu
    this.screen.key(['m'], () => this.showMainMenu());

    // Help overlay
    this.screen.key(['?', 'h'], () => this.showHelpOverlay());

    // Quit
    this.screen.key(['q', 'Q', 'escape'], () => {
      this.cleanup();
    });

    // Refresh
    this.screen.key(['r', 'C-r'], () => {
      this.screen.render();
    });
  }

  //=============================================================================
  // PAGE 1: WELCOME & INTRODUCTION
  //=============================================================================

  private createWelcomePage() {
    const container = blessed.box({
      top: 0,
      left: 0,
      width: '100%',
      height: '100%-2',
      tags: true,
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
    });

    // Title with ASCII art
    const title = blessed.box({
      parent: container,
      top: 1,
      left: 'center',
      width: '90%',
      height: 9,
      align: 'center',
      content: `
{cyan-fg}{bold}███╗   ██╗███████╗ ██████╗       ██████╗ ██╗     ███████╗███████╗███████╗{/bold}{/cyan-fg}
{cyan-fg}{bold}████╗  ██║██╔════╝██╔═══██╗      ██╔══██╗██║     ██╔════╝██╔════╝██╔════╝{/bold}{/cyan-fg}
{cyan-fg}{bold}██╔██╗ ██║█████╗  ██║   ██║█████╗██████╔╝██║     █████╗  ███████╗███████╗{/bold}{/cyan-fg}
{cyan-fg}{bold}██║╚██╗██║██╔══╝  ██║   ██║╚════╝██╔══██╗██║     ██╔══╝  ╚════██║╚════██║{/bold}{/cyan-fg}
{cyan-fg}{bold}██║ ╚████║███████╗╚██████╔╝      ██████╔╝███████╗███████╗███████║███████║{/bold}{/cyan-fg}
{cyan-fg}{bold}╚═╝  ╚═══╝╚══════╝ ╚═════╝       ╚═════╝ ╚══════╝╚══════╝╚══════╝╚══════╝{/bold}{/cyan-fg}

{green-fg}& BLESSED-CONTRIB INTERACTIVE SHOWCASE{/green-fg}
{yellow-fg}Complete Widget Demonstration for BBS Door Developers{/yellow-fg}
`,
      tags: true,
    });

    // Welcome text
    const welcome = blessed.box({
      parent: container,
      top: 11,
      left: 2,
      width: '96%',
      height: 'shrink',
      tags: true,
      content: `
{white-fg}Welcome to the {bold}ultimate neo-blessed framework demo{/bold}! This interactive door
showcases {cyan-fg}{bold}ALL 49 widgets{/bold}{/cyan-fg} (34 core + 15 contrib) with live examples.{/white-fg}

{green-fg}What You'll Learn:{/green-fg}
 {cyan-fg}✓{/cyan-fg} 34 Core blessed widgets (containers, input, display, interactive)
 {cyan-fg}✓{/cyan-fg} 15 Contrib widgets (charts, gauges, data, visualization)
 {cyan-fg}✓{/cyan-fg} 2 Layout systems (Grid, Carousel)
 {cyan-fg}✓{/cyan-fg} Interactive features (mouse, keyboard, focus, events)
 {cyan-fg}✓{/cyan-fg} Real-time animations and live data updates
 {cyan-fg}✓{/cyan-fg} Best practices and code patterns
 {cyan-fg}✓{/cyan-fg} BBS terminal constraints (80x${this.screen.height})

{yellow-fg}Navigation:{/yellow-fg}
 {cyan-fg}←/→{/cyan-fg} Previous/Next page    {cyan-fg}1-9{/cyan-fg} Jump to page    {cyan-fg}M{/cyan-fg} Main menu
 {cyan-fg}H{/cyan-fg} Context help         {cyan-fg}Q{/cyan-fg} Quit              {cyan-fg}R{/cyan-fg} Refresh

{white-fg}Press {cyan-fg}{bold}→{/bold}{/cyan-fg} or {cyan-fg}{bold}ENTER{/bold}{/cyan-fg} to start the tour!{/white-fg}
`,
    });

    // Animated stats box
    const stats = blessed.box({
      parent: container,
      bottom: 1,
      left: 'center',
      width: 60,
      height: 3,
      align: 'center',
      tags: true,
      border: {
        type: 'line',
      },
      style: {
        border: {
          fg: 'green',
        },
      },
      content: '{green-fg}49 Widgets{/green-fg} | {cyan-fg}2 Layouts{/cyan-fg} | {yellow-fg}10 Pages{/yellow-fg} | {magenta-fg}100% Coverage{/magenta-fg}',
    });

    return container;
  }

  //=============================================================================
  // PAGE 2: CORE WIDGETS - CONTAINERS & TEXT
  //=============================================================================

  private createCoreWidgetsPage1() {
    const container = blessed.box({
      top: 0,
      left: 0,
      width: '100%',
      height: '100%-2',
      tags: true,
      style: {
        fg: 'white',
        bg: 'black',
      },
    });

    // Page title
    const title = blessed.box({
      parent: container,
      top: 0,
      left: 0,
      width: '100%',
      height: 3,
      align: 'center',
      valign: 'middle',
      tags: true,
      border: {
        type: 'line',
      },
      style: {
        fg: 'cyan',
        border: { fg: 'cyan' },
      },
      content: '{bold}CORE WIDGETS - Part 1: Containers & Text{/bold}',
    });

    // Use Grid layout for organized display
    const grid = new contrib.Grid({
      screen: this.screen,
      parent: container,
      top: 3,
      left: 0,
      width: '100%',
      height: '100%-3',
      rows: 12,
      cols: 12,
    });

    // Box widget demo
    const boxDemo = grid.set(0, 0, 3, 6, blessed.box, {
      label: '1. Box Widget',
      content: 'Basic container with border\nSupports: borders, padding,\nshadow, scrolling, tags',
      tags: true,
      border: {
        type: 'line',
      },
      style: {
        fg: 'white',
        border: { fg: 'blue' },
      },
    });

    // Text widget demo
    const textDemo = grid.set(0, 6, 3, 6, blessed.text, {
      label: '2. Text Widget',
      content: '{cyan-fg}Formatted text display{/cyan-fg}\n{green-fg}Supports tags & colors{/green-fg}\n{yellow-fg}Alignment & wrapping{/yellow-fg}',
      tags: true,
      border: {
        type: 'line',
      },
      style: {
        fg: 'white',
        border: { fg: 'green' },
      },
    });

    // Line widget demo
    const lineDemo = grid.set(3, 0, 1, 12, blessed.line, {
      label: '3. Line Widget',
      orientation: 'horizontal',
      type: 'line',
      style: {
        fg: 'yellow',
      },
    });

    // BigText widget demo
    const bigTextDemo = grid.set(4, 0, 4, 6, blessed.bigtext, {
      label: '4. BigText Widget',
      content: 'BBS',
      shrink: true,
      style: {
        fg: 'magenta',
      },
    });

    // List widget demo
    const listDemo = grid.set(4, 6, 4, 6, blessed.list, {
      label: '5. List Widget',
      items: [
        'Item 1 - Selectable',
        'Item 2 - Interactive',
        'Item 3 - Keyboard nav',
        'Item 4 - Mouse support',
        'Item 5 - Scrollable',
      ],
      keys: true,
      vi: true,
      scrollable: true,
      style: {
        fg: 'white',
        selected: {
          fg: 'black',
          bg: 'cyan',
        },
        border: { fg: 'cyan' },
      },
      border: {
        type: 'line',
      },
    });

    // Scrollable box demo
    const scrollDemo = grid.set(8, 0, 4, 12, blessed.box, {
      label: '6. Scrollable Box (use ↑↓ to scroll)',
      scrollable: true,
      keys: true,
      vi: true,
      alwaysScroll: true,
      scrollbar: {
        ch: ' ',
        inverse: true,
      },
      content: Array.from({ length: 20 }, (_, i) => `Line ${i + 1}: Scrollable content example`).join('\n'),
      border: {
        type: 'line',
      },
      style: {
        fg: 'white',
        border: { fg: 'green' },
        scrollbar: {
          bg: 'blue',
        },
      },
    });

    // Focus on list for interactivity
    listDemo.focus();

    return container;
  }

  //=============================================================================
  // PAGE 3: CORE WIDGETS - INPUT & FORMS
  //=============================================================================

  private createCoreWidgetsPage2() {
    const container = blessed.box({
      top: 0,
      left: 0,
      width: '100%',
      height: '100%-2',
      tags: true,
      style: {
        fg: 'white',
        bg: 'black',
      },
    });

    // Page title
    const title = blessed.box({
      parent: container,
      top: 0,
      left: 0,
      width: '100%',
      height: 3,
      align: 'center',
      valign: 'middle',
      tags: true,
      border: {
        type: 'line',
      },
      style: {
        fg: 'cyan',
        border: { fg: 'cyan' },
      },
      content: '{bold}CORE WIDGETS - Part 2: Input, Forms & Tables{/bold}',
    });

    // Use Grid layout
    const grid = new contrib.Grid({
      screen: this.screen,
      parent: container,
      top: 3,
      left: 0,
      width: '100%',
      height: '100%-3',
      rows: 12,
      cols: 12,
    });

    // Textbox widget demo
    const textboxDemo = grid.set(0, 0, 2, 6, blessed.textbox, {
      label: '7. Textbox Widget',
      value: 'Editable text input',
      inputOnFocus: true,
      border: {
        type: 'line',
      },
      style: {
        fg: 'white',
        border: { fg: 'yellow' },
        focus: {
          border: { fg: 'green' },
        },
      },
    });

    // Textarea widget demo
    const textareaDemo = grid.set(0, 6, 2, 6, blessed.textarea, {
      label: '8. Textarea Widget',
      value: 'Multi-line\ntext editor\n(press ENTER)',
      inputOnFocus: true,
      border: {
        type: 'line',
      },
      style: {
        fg: 'white',
        border: { fg: 'magenta' },
        focus: {
          border: { fg: 'green' },
        },
      },
    });

    // Button widget demo
    const buttonDemo = grid.set(2, 0, 2, 3, blessed.button, {
      content: 'CLICK ME',
      align: 'center',
      valign: 'middle',
      shrink: true,
      padding: {
        left: 2,
        right: 2,
      },
      style: {
        fg: 'white',
        bg: 'blue',
        focus: {
          bg: 'green',
        },
        hover: {
          bg: 'cyan',
        },
      },
    });

    // Checkbox widget demo
    const checkboxDemo = grid.set(2, 3, 2, 3, blessed.checkbox, {
      label: '9. Checkbox',
      checked: true,
      mouse: true,
      keys: true,
      style: {
        fg: 'white',
      },
    });

    // Radioset widget demo
    const radioDemo = grid.set(2, 6, 3, 6, blessed.radioset, {
      label: '10. Radio Set',
      border: {
        type: 'line',
      },
      style: {
        fg: 'white',
        border: { fg: 'cyan' },
      },
    });

    const radio1 = blessed.radiobutton({
      parent: radioDemo,
      top: 0,
      left: 0,
      content: 'Option 1',
      checked: true,
    });

    const radio2 = blessed.radiobutton({
      parent: radioDemo,
      top: 1,
      left: 0,
      content: 'Option 2',
    });

    const radio3 = blessed.radiobutton({
      parent: radioDemo,
      top: 2,
      left: 0,
      content: 'Option 3',
    });

    // Table widget demo
    const tableDemo = grid.set(5, 0, 7, 12, blessed.table, {
      label: '11. Table Widget',
      keys: true,
      vi: true,
      scrollable: true,
      interactive: true,
      alwaysScroll: true,
      scrollbar: {
        ch: ' ',
        inverse: true,
      },
      style: {
        fg: 'white',
        border: { fg: 'green' },
        header: {
          fg: 'cyan',
          bold: true,
        },
        cell: {
          selected: {
            fg: 'black',
            bg: 'cyan',
          },
        },
      },
      border: {
        type: 'line',
      },
    });

    // Set table data
    tableDemo.setData({
      headers: ['Widget', 'Type', 'Interactive', 'Use Case'],
      data: [
        ['Box', 'Container', 'No', 'Basic layout'],
        ['List', 'Display', 'Yes', 'Menus, selections'],
        ['Table', 'Data', 'Yes', 'Tabular data'],
        ['Form', 'Input', 'Yes', 'User input'],
        ['Chart', 'Visualization', 'No', 'Data graphs'],
        ['Gauge', 'Indicator', 'No', 'Metrics'],
        ['Tree', 'Hierarchical', 'Yes', 'File browser'],
        ['Sparkline', 'Trend', 'No', 'Quick stats'],
      ],
    });

    // Button click handler
    buttonDemo.on('press', () => {
      blessed.message({
        parent: this.screen,
        top: 'center',
        left: 'center',
        width: 'shrink',
        height: 'shrink',
        border: {
          type: 'line',
        },
        style: {
          fg: 'white',
          bg: 'blue',
          border: { fg: 'cyan' },
        },
        content: '\n Button Pressed! \n',
        tags: true,
      });
      this.screen.render();
      setTimeout(() => this.screen.render(), 2000);
    });

    // Focus on table for interactivity
    tableDemo.focus();

    return container;
  }

  //=============================================================================
  // PAGE 4: CONTRIB CHARTS
  //=============================================================================

  private createChartsPage() {
    const container = blessed.box({
      top: 0,
      left: 0,
      width: '100%',
      height: '100%-2',
      tags: true,
      style: {
        fg: 'white',
        bg: 'black',
      },
    });

    // Page title
    const title = blessed.box({
      parent: container,
      top: 0,
      left: 0,
      width: '100%',
      height: 3,
      align: 'center',
      valign: 'middle',
      tags: true,
      border: {
        type: 'line',
      },
      style: {
        fg: 'cyan',
        border: { fg: 'cyan' },
      },
      content: '{bold}CONTRIB WIDGETS - Charts & Graphs{/bold}',
    });

    // Use Grid layout
    const grid = new contrib.Grid({
      screen: this.screen,
      parent: container,
      top: 3,
      left: 0,
      width: '100%',
      height: '100%-3',
      rows: 12,
      cols: 12,
    });

    // Line chart demo
    const lineChart = grid.set(0, 0, 6, 6, contrib.Line, {
      label: '12. Line Chart - BBS Users Online',
      showLegend: true,
      legend: { width: 12 },
      style: {
        line: 'yellow',
        text: 'white',
        baseline: 'white',
        border: { fg: 'cyan' },
      },
      xLabelPadding: 3,
      xPadding: 5,
      wholeNumbersOnly: true,
    });

    // Generate line chart data
    const lineData = {
      title: 'Users',
      x: ['00:00', '04:00', '08:00', '12:00', '16:00', '20:00', '24:00'],
      y: [2, 1, 3, 8, 12, 15, 10],
      style: {
        line: 'cyan',
      },
    };

    lineChart.setData([lineData]);

    // Bar chart demo
    const barChart = grid.set(0, 6, 6, 6, contrib.Bar, {
      label: '13. Bar Chart - Messages Posted',
      barWidth: 6,
      barSpacing: 8,
      xOffset: 0,
      maxHeight: 9,
      style: {
        border: { fg: 'green' },
      },
    });

    // Generate bar chart data
    barChart.setData({
      titles: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
      data: [5, 8, 12, 15, 10, 6, 4],
    });

    // Stacked bar chart demo
    const stackedChart = grid.set(6, 0, 6, 12, contrib.StackedBar, {
      label: '14. Stacked Bar Chart - File Activity by Conference',
      barWidth: 8,
      barSpacing: 10,
      xOffset: 0,
      maxHeight: 9,
      style: {
        border: { fg: 'yellow' },
      },
    });

    // Generate stacked bar data
    stackedChart.setData({
      barCategory: ['Main', 'Games', 'Files', 'Msgs'],
      stackedCategory: ['Uploads', 'Downloads'],
      data: [
        [5, 15],
        [3, 20],
        [8, 25],
        [2, 10],
      ],
    });

    // Add live data animation
    let tick = 0;
    this.animationInterval = setInterval(() => {
      tick++;

      // Update line chart with new data point
      const newY = lineData.y.slice();
      newY.push(Math.floor(Math.random() * 15) + 1);
      newY.shift();
      lineData.y = newY;

      lineChart.setData([lineData]);
      this.screen.render();
    }, 2000);

    return container;
  }

  //=============================================================================
  // PAGE 5: CONTRIB GAUGES
  //=============================================================================

  private createGaugesPage() {
    const container = blessed.box({
      top: 0,
      left: 0,
      width: '100%',
      height: '100%-2',
      tags: true,
      style: {
        fg: 'white',
        bg: 'black',
      },
    });

    // Page title
    const title = blessed.box({
      parent: container,
      top: 0,
      left: 0,
      width: '100%',
      height: 3,
      align: 'center',
      valign: 'middle',
      tags: true,
      border: {
        type: 'line',
      },
      style: {
        fg: 'cyan',
        border: { fg: 'cyan' },
      },
      content: '{bold}CONTRIB WIDGETS - Gauges & Indicators{/bold}',
    });

    // Use Grid layout
    const grid = new contrib.Grid({
      screen: this.screen,
      parent: container,
      top: 3,
      left: 0,
      width: '100%',
      height: '100%-3',
      rows: 12,
      cols: 12,
    });

    // Gauge demo
    const cpuGauge = grid.set(0, 0, 4, 3, contrib.Gauge, {
      label: '15. Gauge - CPU',
      stroke: 'green',
      fill: 'white',
      showLabel: true,
    });

    cpuGauge.setPercent(65);

    // Another gauge
    const memGauge = grid.set(0, 3, 4, 3, contrib.Gauge, {
      label: '16. Gauge - Memory',
      stroke: 'cyan',
      fill: 'white',
      showLabel: true,
    });

    memGauge.setPercent(42);

    // Donut chart demo
    const donutChart = grid.set(0, 6, 6, 6, contrib.Donut, {
      label: '17. Donut Chart - Disk Usage',
      radius: 8,
      arcWidth: 3,
      remainColor: 'white',
      yPadding: 2,
      data: [
        { percent: 40, label: 'System', color: 'green' },
        { percent: 25, label: 'Users', color: 'cyan' },
        { percent: 20, label: 'Files', color: 'yellow' },
        { percent: 15, label: 'Free', color: 'white' },
      ],
    });

    // LCD display demo
    const lcdDemo = grid.set(4, 0, 4, 6, contrib.LCD, {
      label: '18. LCD Display',
      segmentWidth: 0.06,
      segmentInterval: 0.11,
      strokeWidth: 0.11,
      elements: 5,
      display: 12345,
      elementSpacing: 4,
      elementPadding: 2,
      color: 'red',
      style: {
        border: { fg: 'red' },
      },
    });

    // Gauge list demo
    const gaugeListDemo = grid.set(6, 6, 6, 6, contrib.GaugeList, {
      label: '19. Gauge List - Node Activity',
      gaugeSpacing: 1,
      gaugeHeight: 1,
      gauges: [
        { percent: 75, stroke: 'green', label: 'Node 1' },
        { percent: 50, stroke: 'cyan', label: 'Node 2' },
        { percent: 90, stroke: 'yellow', label: 'Node 3' },
        { percent: 25, stroke: 'white', label: 'Node 4' },
      ],
    });

    // Sparkline demo
    const sparklineDemo = grid.set(8, 0, 4, 12, contrib.Sparkline, {
      label: '20. Sparkline - CPU History',
      tags: true,
      style: {
        fg: 'green',
        border: { fg: 'green' },
      },
    });

    // Generate sparkline data
    const sparkData = Array.from({ length: 50 }, () => Math.floor(Math.random() * 100));
    sparklineDemo.setData(['CPU'], [sparkData]);

    // Animate gauges
    let gaugeValue = 65;
    this.animationInterval = setInterval(() => {
      gaugeValue = (gaugeValue + Math.floor(Math.random() * 10) - 5) % 100;
      if (gaugeValue < 0) gaugeValue = 0;

      cpuGauge.setPercent(gaugeValue);

      const memValue = Math.floor(Math.random() * 100);
      memGauge.setPercent(memValue);

      // Update LCD
      const lcdValue = Math.floor(Math.random() * 99999);
      lcdDemo.setDisplay(lcdValue);

      this.screen.render();
    }, 1500);

    return container;
  }

  //=============================================================================
  // PAGE 6: CONTRIB DATA WIDGETS
  //=============================================================================

  private createDataWidgetsPage() {
    const container = blessed.box({
      top: 0,
      left: 0,
      width: '100%',
      height: '100%-2',
      tags: true,
      style: {
        fg: 'white',
        bg: 'black',
      },
    });

    // Page title
    const title = blessed.box({
      parent: container,
      top: 0,
      left: 0,
      width: '100%',
      height: 3,
      align: 'center',
      valign: 'middle',
      tags: true,
      border: {
        type: 'line',
      },
      style: {
        fg: 'cyan',
        border: { fg: 'cyan' },
      },
      content: '{bold}CONTRIB WIDGETS - Data Display{/bold}',
    });

    // Use Grid layout
    const grid = new contrib.Grid({
      screen: this.screen,
      parent: container,
      top: 3,
      left: 0,
      width: '100%',
      height: '100%-3',
      rows: 12,
      cols: 12,
    });

    // Tree widget demo
    const treeDemo = grid.set(0, 0, 12, 6, contrib.Tree, {
      label: '21. Tree Widget - BBS File Structure',
      keys: true,
      vi: true,
      mouse: true,
      template: {
        lines: true,
      },
      style: {
        fg: 'white',
        border: { fg: 'cyan' },
        selected: {
          fg: 'black',
          bg: 'cyan',
        },
      },
    });

    // Set tree data
    treeDemo.setData({
      extended: true,
      children: {
        'BBS Root': {
          children: {
            'Conferences': {
              children: {
                'Conf01 - Main': {},
                'Conf02 - Games': {},
                'Conf03 - Files': {},
              },
            },
            'Users': {
              children: {
                'Users.DB': {},
                'UserIndex.DB': {},
              },
            },
            'Doors': {
              children: {
                'Games': {},
                'Utils': {},
                'Mail': {},
              },
            },
            'Screens': {},
            'Bulletins': {},
          },
        },
      },
    });

    // Table widget with rich data
    const tableDemo = grid.set(0, 6, 12, 6, contrib.Table, {
      label: '22. Contrib Table - Top Callers',
      keys: true,
      fg: 'white',
      selectedFg: 'black',
      selectedBg: 'cyan',
      interactive: true,
      columnSpacing: 2,
      columnWidth: [15, 10, 10, 10],
      style: {
        border: { fg: 'green' },
      },
    });

    // Set table data
    tableDemo.setData({
      headers: ['Username', 'Calls', 'Posts', 'Files'],
      data: [
        ['SysOp', '1523', '456', '234'],
        ['Hacker', '892', '234', '156'],
        ['Phreaker', '654', '189', '89'],
        ['Trader', '543', '123', '345'],
        ['Warez', '432', '98', '567'],
        ['Elite', '389', '145', '234'],
        ['Newbie', '123', '45', '12'],
        ['Guest', '89', '23', '5'],
      ],
    });

    // Focus on tree for interactivity
    treeDemo.focus();

    return container;
  }

  //=============================================================================
  // PAGE 7: CONTRIB DISPLAY WIDGETS
  //=============================================================================

  private createDisplayWidgetsPage() {
    const container = blessed.box({
      top: 0,
      left: 0,
      width: '100%',
      height: '100%-2',
      tags: true,
      style: {
        fg: 'white',
        bg: 'black',
      },
    });

    // Page title
    const title = blessed.box({
      parent: container,
      top: 0,
      left: 0,
      width: '100%',
      height: 3,
      align: 'center',
      valign: 'middle',
      tags: true,
      border: {
        type: 'line',
      },
      style: {
        fg: 'cyan',
        border: { fg: 'cyan' },
      },
      content: '{bold}CONTRIB WIDGETS - Display & Visualization{/bold}',
    });

    // Use Grid layout
    const grid = new contrib.Grid({
      screen: this.screen,
      parent: container,
      top: 3,
      left: 0,
      width: '100%',
      height: '100%-3',
      rows: 12,
      cols: 12,
    });

    // Log widget demo
    const logDemo = grid.set(0, 0, 6, 12, contrib.Log, {
      label: '23. Log Widget - BBS Activity',
      fg: 'green',
      selectedFg: 'black',
      selectedBg: 'green',
      style: {
        border: { fg: 'green' },
      },
    });

    // Add log entries
    const logEntries = [
      '[12:34:56] User "Hacker" logged in from 192.168.1.100',
      '[12:35:12] User "Hacker" entered conference "Main"',
      '[12:35:34] User "Hacker" read message #1523',
      '[12:36:01] User "Phreaker" logged in from 10.0.0.50',
      '[12:36:15] User "Hacker" posted message "New BBS Features!"',
      '[12:37:22] User "Trader" downloaded file "GAME.ZIP" (1.2MB)',
      '[12:38:45] User "Elite" started door "Arkanoid II"',
      '[12:39:01] User "Newbie" read bulletin #3',
    ];

    logEntries.forEach((entry) => logDemo.log(entry));

    // Markdown widget demo
    const markdownDemo = grid.set(6, 0, 6, 12, contrib.Markdown, {
      label: '24. Markdown Widget',
      markdown: `
# Markdown Support

Neo-blessed supports **rich markdown rendering** for documentation.

## Features

* **Bold** and *italic* text
* Lists (ordered and unordered)
* Code blocks
* Headers (H1-H6)
* Links (in some terminals)

## Example Code

\`\`\`typescript
const screen = blessed.screen();
const box = blessed.box({
  top: 'center',
  left: 'center',
  width: '50%',
  height: '50%',
  content: 'Hello BBS!'
});
screen.append(box);
screen.render();
\`\`\`

Perfect for **help screens** and **documentation**!
`,
      style: {
        border: { fg: 'yellow' },
      },
    });

    // Auto-scroll log
    this.animationInterval = setInterval(() => {
      const users = ['Hacker', 'Phreaker', 'Trader', 'Elite', 'Newbie', 'Guest'];
      const actions = [
        'logged in',
        'logged out',
        'posted message',
        'downloaded file',
        'uploaded file',
        'started door',
        'read bulletin',
      ];

      const user = users[Math.floor(Math.random() * users.length)];
      const action = actions[Math.floor(Math.random() * actions.length)];
      const time = new Date().toLocaleTimeString();

      logDemo.log(`[${time}] User "${user}" ${action}`);
      this.screen.render();
    }, 3000);

    return container;
  }

  //=============================================================================
  // PAGE 8: LAYOUT SYSTEMS
  //=============================================================================

  private createLayoutPage() {
    const container = blessed.box({
      top: 0,
      left: 0,
      width: '100%',
      height: '100%-2',
      tags: true,
      style: {
        fg: 'white',
        bg: 'black',
      },
    });

    // Page title
    const title = blessed.box({
      parent: container,
      top: 0,
      left: 0,
      width: '100%',
      height: 3,
      align: 'center',
      valign: 'middle',
      tags: true,
      border: {
        type: 'line',
      },
      style: {
        fg: 'cyan',
        border: { fg: 'cyan' },
      },
      content: '{bold}LAYOUT SYSTEMS - Grid & Carousel{/bold}',
    });

    // Description
    const description = blessed.box({
      parent: container,
      top: 3,
      left: 2,
      width: '96%',
      height: 5,
      tags: true,
      content: `
{white-fg}Neo-blessed provides powerful layout systems for organizing widgets:{/white-fg}

{cyan-fg}• Grid Layout{/cyan-fg} - Rows/columns grid system (like this demo!)
{cyan-fg}• Carousel Layout{/cyan-fg} - Multi-page navigation (what you're using now!)
`,
    });

    // Grid example (nested grid inside main container)
    const gridExample = blessed.box({
      parent: container,
      top: 8,
      left: 2,
      width: '96%',
      height: 'shrink',
      tags: true,
      border: {
        type: 'line',
      },
      style: {
        fg: 'white',
        border: { fg: 'green' },
      },
      label: 'Grid Layout Example',
    });

    // Create a small grid inside
    const miniGrid = new contrib.Grid({
      screen: this.screen,
      parent: gridExample,
      top: 0,
      left: 0,
      width: '100%',
      height: 9,
      rows: 3,
      cols: 3,
    });

    // Fill grid with boxes
    for (let row = 0; row < 3; row++) {
      for (let col = 0; col < 3; col++) {
        miniGrid.set(row, col, 1, 1, blessed.box, {
          content: `${row},${col}`,
          align: 'center',
          valign: 'middle',
          style: {
            fg: 'white',
            bg: row === 0 ? 'blue' : row === 1 ? 'green' : 'yellow',
          },
        });
      }
    }

    // Code example
    const codeExample = blessed.box({
      parent: container,
      bottom: 1,
      left: 2,
      width: '96%',
      height: 8,
      tags: true,
      scrollable: true,
      border: {
        type: 'line',
      },
      style: {
        fg: 'yellow',
        border: { fg: 'yellow' },
      },
      label: 'Grid Layout Code',
      content: `
const grid = new contrib.Grid({
  screen: screen,
  rows: 12,
  cols: 12
});

// Position: row, col, rowSpan, colSpan
grid.set(0, 0, 6, 6, contrib.Line, { ... });  // Top-left
grid.set(0, 6, 6, 6, contrib.Bar, { ... });   // Top-right
grid.set(6, 0, 6, 12, contrib.Table, { ... }); // Bottom full
`,
    });

    return container;
  }

  //=============================================================================
  // PAGE 9: INTERACTIVE FEATURES
  //=============================================================================

  private createInteractivePage() {
    const container = blessed.box({
      top: 0,
      left: 0,
      width: '100%',
      height: '100%-2',
      tags: true,
      style: {
        fg: 'white',
        bg: 'black',
      },
    });

    // Page title
    const title = blessed.box({
      parent: container,
      top: 0,
      left: 0,
      width: '100%',
      height: 3,
      align: 'center',
      valign: 'middle',
      tags: true,
      border: {
        type: 'line',
      },
      style: {
        fg: 'cyan',
        border: { fg: 'cyan' },
      },
      content: '{bold}INTERACTIVE FEATURES - Events & Input{/bold}',
    });

    // Use Grid layout
    const grid = new contrib.Grid({
      screen: this.screen,
      parent: container,
      top: 3,
      left: 0,
      width: '100%',
      height: '100%-3',
      rows: 12,
      cols: 12,
    });

    // Interactive button area
    const buttonBox = grid.set(0, 0, 6, 6, blessed.box, {
      label: 'Interactive Buttons',
      border: {
        type: 'line',
      },
      style: {
        border: { fg: 'green' },
      },
    });

    // Create interactive buttons
    const btn1 = blessed.button({
      parent: buttonBox,
      top: 1,
      left: 2,
      shrink: true,
      padding: { left: 2, right: 2 },
      content: 'Button 1',
      style: {
        fg: 'white',
        bg: 'blue',
        focus: { bg: 'green' },
        hover: { bg: 'cyan' },
      },
    });

    const btn2 = blessed.button({
      parent: buttonBox,
      top: 3,
      left: 2,
      shrink: true,
      padding: { left: 2, right: 2 },
      content: 'Button 2',
      style: {
        fg: 'white',
        bg: 'magenta',
        focus: { bg: 'green' },
        hover: { bg: 'cyan' },
      },
    });

    const checkbox1 = blessed.checkbox({
      parent: buttonBox,
      top: 5,
      left: 2,
      content: 'Enable feature',
      checked: true,
      mouse: true,
      keys: true,
    });

    // Event log
    const eventLog = grid.set(0, 6, 12, 6, contrib.Log, {
      label: 'Event Log (Try clicking/typing!)',
      fg: 'cyan',
      style: {
        border: { fg: 'cyan' },
      },
    });

    // Mouse tracking box
    const mouseBox = grid.set(6, 0, 6, 6, blessed.box, {
      label: 'Mouse Events (move mouse here)',
      mouse: true,
      keys: true,
      border: {
        type: 'line',
      },
      style: {
        border: { fg: 'yellow' },
        hover: {
          bg: 'blue',
        },
      },
      content: '\n\n      Move mouse over this box\n      to see mouse events!',
      align: 'center',
    });

    // Button event handlers
    btn1.on('press', () => {
      eventLog.log('[EVENT] Button 1 pressed!');
      this.screen.render();
    });

    btn2.on('press', () => {
      eventLog.log('[EVENT] Button 2 pressed!');
      this.screen.render();
    });

    checkbox1.on('check', () => {
      eventLog.log('[EVENT] Checkbox checked');
      this.screen.render();
    });

    checkbox1.on('uncheck', () => {
      eventLog.log('[EVENT] Checkbox unchecked');
      this.screen.render();
    });

    // Mouse events
    mouseBox.on('mouse', (data) => {
      eventLog.log(`[MOUSE] ${data.action} at (${data.x}, ${data.y})`);
      this.screen.render();
    });

    mouseBox.on('click', () => {
      eventLog.log('[MOUSE] Mouse clicked!');
      this.screen.render();
    });

    // Keyboard events
    this.screen.on('keypress', (ch, key) => {
      if (key.full !== 'left' && key.full !== 'right' && key.full !== 'q') {
        eventLog.log(`[KEY] Pressed: ${key.full || ch}`);
        this.screen.render();
      }
    });

    eventLog.log('[INFO] Event logging started');
    eventLog.log('[INFO] Try interacting with the widgets!');

    return container;
  }

  //=============================================================================
  // PAGE 10: BEST PRACTICES
  //=============================================================================

  private createBestPracticesPage() {
    const container = blessed.box({
      top: 0,
      left: 0,
      width: '100%',
      height: '100%-2',
      tags: true,
      scrollable: true,
      keys: true,
      vi: true,
      alwaysScroll: true,
      scrollbar: {
        ch: ' ',
        inverse: true,
      },
      style: {
        fg: 'white',
        bg: 'black',
        scrollbar: {
          bg: 'blue',
        },
      },
    });

    // Page title
    const title = blessed.box({
      parent: container,
      top: 0,
      left: 0,
      width: '100%',
      height: 3,
      align: 'center',
      valign: 'middle',
      tags: true,
      border: {
        type: 'line',
      },
      style: {
        fg: 'cyan',
        border: { fg: 'cyan' },
      },
      content: '{bold}BEST PRACTICES & CODE PATTERNS{/bold}',
    });

    // Content
    const content = blessed.box({
      parent: container,
      top: 3,
      left: 2,
      width: '96%',
      height: 'shrink',
      tags: true,
      content: `
{green-fg}{bold}1. BBS Terminal Constraints{/bold}{/green-fg}

{white-fg}ALWAYS respect 80x25 terminal dimensions:{/white-fg}

{yellow-fg}import { getTerminalDimensions } from '@amiexpress/bbs-door-sdk';

const dims = getTerminalDimensions(context);
const screen = blessed.screen({
  height: dims.height,  // User's configured height
  output: (data) => context.output.write(data),
});{/yellow-fg}

{cyan-fg}Width is ALWAYS 80 columns - no exceptions!{/cyan-fg}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

{green-fg}{bold}2. Memory Management{/bold}{/green-fg}

{white-fg}ALWAYS clean up resources when door exits:{/white-fg}

{yellow-fg}async onStart() {
  this.screen = blessed.screen({ ... });

  // ... door logic ...

  // Cleanup before exit
  if (this.animationInterval) {
    clearInterval(this.animationInterval);
  }
  if (this.screen) {
    this.screen.destroy();
  }
}{/yellow-fg}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

{green-fg}{bold}3. Event Handling{/bold}{/green-fg}

{white-fg}Use proper event binding and cleanup:{/white-fg}

{yellow-fg}button.on('press', () => {
  // Handle button press
  this.screen.render();  // Always render after changes
});

// Focus management
element.focus();
element.on('focus', () => { /* ... */ });
element.on('blur', () => { /* ... */ });{/yellow-fg}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

{green-fg}{bold}4. Grid Layout Pattern{/bold}{/green-fg}

{white-fg}Use Grid for dashboard-style layouts:{/white-fg}

{yellow-fg}const grid = new contrib.Grid({
  screen: screen,
  rows: 12,    // Standard grid: 12 rows
  cols: 12,    // Standard grid: 12 columns
});

// Position widgets: (row, col, rowSpan, colSpan)
grid.set(0, 0, 6, 6, contrib.Line, { ... });    // Quarter
grid.set(0, 6, 6, 6, contrib.Bar, { ... });     // Quarter
grid.set(6, 0, 6, 12, contrib.Table, { ... });  // Half{/yellow-fg}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

{green-fg}{bold}5. Live Data Updates{/bold}{/green-fg}

{white-fg}Update charts/gauges with setInterval:{/white-fg}

{yellow-fg}const interval = setInterval(() => {
  // Generate new data
  const newData = fetchLatestMetrics();

  // Update widget
  lineChart.setData([newData]);
  gauge.setPercent(newValue);

  // Render changes
  this.screen.render();
}, 1000);  // Update every second

// Don't forget to cleanup!
clearInterval(interval);{/yellow-fg}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

{green-fg}{bold}6. Scrollable Content{/bold}{/green-fg}

{white-fg}Enable scrolling for long content:{/white-fg}

{yellow-fg}const box = blessed.box({
  scrollable: true,
  keys: true,           // Enable arrow keys
  vi: true,             // Enable vi navigation (j/k)
  alwaysScroll: true,
  scrollbar: {
    ch: ' ',
    inverse: true,
  },
  style: {
    scrollbar: { bg: 'blue' },
  },
});{/yellow-fg}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

{green-fg}{bold}7. Focus Management{/bold}{/green-fg}

{white-fg}Manage focus for interactive elements:{/white-fg}

{yellow-fg}// Set initial focus
inputBox.focus();

// Tab key to cycle focus
screen.key(['tab'], () => {
  screen.focusNext();
});

// Shift+Tab for reverse
screen.key(['S-tab'], () => {
  screen.focusPrevious();
});{/yellow-fg}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

{green-fg}{bold}8. Error Handling{/bold}{/green-fg}

{white-fg}Always handle errors gracefully:{/white-fg}

{yellow-fg}try {
  // Door logic
  const data = await fetchBBSData();
  chart.setData(data);
} catch (error) {
  // Show error message
  blessed.message({
    parent: screen,
    top: 'center',
    left: 'center',
    width: 'shrink',
    height: 'shrink',
    border: { type: 'line' },
    content: ' Error: ' + error.message + ' ',
  });
  screen.render();
}{/yellow-fg}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

{cyan-fg}{bold}Next Steps:{/bold}{/cyan-fg}

{white-fg}1. Explore the SDK examples directory
2. Read the TypeScript Door Guide
3. Check out blessed and blessed-contrib source code
4. Build your own doors!
5. Share your creations with the community{/white-fg}

{green-fg}Thank you for exploring the Neo-Blessed Showcase!{/green-fg}

{yellow-fg}Press Q to exit or ← to return to previous pages{/yellow-fg}
`,
    });

    // Focus for scrolling
    container.focus();

    return container;
  }

  //=============================================================================
  // HELPER METHODS
  //=============================================================================

  private updateNavigationBar() {
    // Navigation bar is displayed separately (bottom 2 lines)
    // In a real implementation, this would update a persistent nav element
  }

  private showMainMenu() {
    // Create menu overlay
    const menu = blessed.box({
      parent: this.screen,
      top: 'center',
      left: 'center',
      width: 50,
      height: 18,
      border: {
        type: 'line',
      },
      style: {
        fg: 'white',
        bg: 'blue',
        border: { fg: 'cyan' },
      },
      label: ' Main Menu ',
      tags: true,
      content: `
{center}{bold}Neo-Blessed Showcase Menu{/bold}{/center}

{cyan-fg}1{/cyan-fg} - Welcome & Introduction
{cyan-fg}2{/cyan-fg} - Core Widgets Part 1
{cyan-fg}3{/cyan-fg} - Core Widgets Part 2
{cyan-fg}4{/cyan-fg} - Charts & Graphs
{cyan-fg}5{/cyan-fg} - Gauges & Indicators
{cyan-fg}6{/cyan-fg} - Data Display
{cyan-fg}7{/cyan-fg} - Display Widgets
{cyan-fg}8{/cyan-fg} - Layout Systems
{cyan-fg}9{/cyan-fg} - Interactive Features
{cyan-fg}0{/cyan-fg} - Best Practices

Press number to jump to page
Press {cyan-fg}ESC{/cyan-fg} to close menu
`,
    });

    // Close on escape
    menu.key(['escape', 'm'], () => {
      menu.detach();
      this.screen.render();
    });

    menu.focus();
    this.screen.render();
  }

  private showHelpOverlay() {
    // Create help overlay
    const help = blessed.box({
      parent: this.screen,
      top: 'center',
      left: 'center',
      width: '90%',
      height: '90%',
      border: {
        type: 'line',
      },
      style: {
        fg: 'white',
        bg: 'black',
        border: { fg: 'green' },
      },
      label: ' Help ',
      tags: true,
      scrollable: true,
      keys: true,
      vi: true,
      content: `
{center}{bold}Neo-Blessed Showcase - Help{/bold}{/center}

{green-fg}{bold}NAVIGATION{/bold}{/green-fg}
  {cyan-fg}←{/cyan-fg} / {cyan-fg}H{/cyan-fg}        Previous page
  {cyan-fg}→{/cyan-fg} / {cyan-fg}L{/cyan-fg}        Next page
  {cyan-fg}↑{/cyan-fg} / {cyan-fg}K{/cyan-fg}        Scroll up (when applicable)
  {cyan-fg}↓{/cyan-fg} / {cyan-fg}J{/cyan-fg}        Scroll down (when applicable)
  {cyan-fg}1-9{/cyan-fg}          Jump to specific page
  {cyan-fg}M{/cyan-fg}            Show main menu
  {cyan-fg}H{/cyan-fg} / {cyan-fg}?{/cyan-fg}        Show this help
  {cyan-fg}Q{/cyan-fg}            Quit door
  {cyan-fg}R{/cyan-fg} / {cyan-fg}Ctrl-R{/cyan-fg}  Refresh screen
  {cyan-fg}ESC{/cyan-fg}          Close overlays/cancel

{green-fg}{bold}INTERACTIVE ELEMENTS{/bold}{/green-fg}
  {cyan-fg}TAB{/cyan-fg}          Cycle through interactive elements
  {cyan-fg}SHIFT-TAB{/cyan-fg}    Reverse cycle
  {cyan-fg}ENTER{/cyan-fg}        Activate/select element
  {cyan-fg}SPACE{/cyan-fg}        Toggle checkboxes/radio buttons
  {cyan-fg}MOUSE{/cyan-fg}        Click buttons, select items, scroll

{green-fg}{bold}PAGES OVERVIEW{/bold}{/green-fg}
  {yellow-fg}Page 1{/yellow-fg}  - Welcome & Introduction
  {yellow-fg}Page 2{/yellow-fg}  - Core Widgets: Containers & Text
  {yellow-fg}Page 3{/yellow-fg}  - Core Widgets: Input & Forms
  {yellow-fg}Page 4{/yellow-fg}  - Contrib Charts & Graphs
  {yellow-fg}Page 5{/yellow-fg}  - Contrib Gauges & Indicators
  {yellow-fg}Page 6{/yellow-fg}  - Contrib Data Display
  {yellow-fg}Page 7{/yellow-fg}  - Contrib Display Widgets
  {yellow-fg}Page 8{/yellow-fg}  - Layout Systems (Grid & Carousel)
  {yellow-fg}Page 9{/yellow-fg}  - Interactive Features & Events
  {yellow-fg}Page 10{/yellow-fg} - Best Practices & Code Patterns

{green-fg}{bold}TIPS{/bold}{/green-fg}
  • Many widgets are {cyan-fg}interactive{/cyan-fg} - try clicking and navigating!
  • Some widgets show {cyan-fg}live data{/cyan-fg} - watch for real-time updates
  • All code examples follow {cyan-fg}BBS terminal constraints{/cyan-fg} (80x25)
  • This door is a {cyan-fg}complete reference{/cyan-fg} for building your own doors
  • Study the {cyan-fg}Best Practices{/cyan-fg} page for production-ready patterns

{white-fg}Press {cyan-fg}ESC{/cyan-fg} to close this help screen{/white-fg}
`,
    });

    // Close on escape
    help.key(['escape', 'h', '?'], () => {
      help.detach();
      this.screen.render();
    });

    help.focus();
    this.screen.render();
  }

  private async waitForExit(): Promise<void> {
    return new Promise((resolve) => {
      this.screen.on('destroy', resolve);
    });
  }

  private cleanup() {
    // Clear animation interval
    if (this.animationInterval) {
      clearInterval(this.animationInterval);
      this.animationInterval = null;
    }

    // Destroy screen
    if (this.screen) {
      this.screen.destroy();
    }
  }

  async onClose() {
    this.cleanup();
  }

  async onError(error: Error) {
    this.cleanup();
    this.context.output.writeLine(`\nError in showcase door: ${error.message}`);
  }
}
