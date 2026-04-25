// Bug Tracker Door - AmiExpress BBS


// index.ts
import { ServerDoor } from "@amiexpress/bbs-door-sdk";

// app.ts
import {
  createScreen,
  createBox,
  createList,
  createTextbox,
  DoorInputManager
} from "@amiexpress/bbs-door-sdk/utils/blessed-helpers";
import * as fs from "fs";
import * as path from "path";
var CATEGORIES = [
  { value: "system-commands", label: "System Commands" },
  { value: "doors", label: "Doors/Games" },
  { value: "general", label: "General System" },
  { value: "ui", label: "User Interface" },
  { value: "network", label: "Network/Connectivity" },
  { value: "security", label: "Security" }
];
var PRIORITIES = [
  { value: "low", label: "Low", color: "gray" },
  { value: "medium", label: "Medium", color: "yellow" },
  { value: "high", label: "High", color: "red" },
  { value: "critical", label: "Critical", color: "magenta" }
];
var STATUSES = [
  { value: "new", label: "New", color: "white" },
  { value: "acknowledged", label: "Acknowledged", color: "cyan" },
  { value: "in-progress", label: "In Progress", color: "yellow" },
  { value: "fixed", label: "Fixed", color: "green" },
  { value: "closed", label: "Closed", color: "gray" },
  { value: "wont-fix", label: "Won't Fix", color: "red" }
];
var BugStorage = class {
  dataPath;
  data;
  constructor(doorPath) {
    this.dataPath = path.join(doorPath, "data", "bugs.json");
    this.data = this.load();
  }
  load() {
    try {
      if (fs.existsSync(this.dataPath)) {
        const content = fs.readFileSync(this.dataPath, "utf-8");
        return JSON.parse(content);
      }
    } catch (err) {
      console.error("[BugTracker] Error loading data:", err);
    }
    return {
      bugs: [],
      nextBugId: 1,
      nextCommentId: 1,
      webhooks: [],
      settings: {
        allowAnonymous: false,
        requireApproval: false,
        notifyOnNew: true
      }
    };
  }
  save() {
    try {
      const dir = path.dirname(this.dataPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(this.dataPath, JSON.stringify(this.data, null, 2));
    } catch (err) {
      console.error("[BugTracker] Error saving data:", err);
    }
  }
  getBugs() {
    return this.data.bugs;
  }
  getBug(id) {
    return this.data.bugs.find((b) => b.id === id);
  }
  createBug(bug) {
    const newBug = {
      ...bug,
      id: this.data.nextBugId++,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      closedAt: null,
      comments: [],
      votes: []
    };
    this.data.bugs.push(newBug);
    this.save();
    return newBug;
  }
  updateBug(id, updates) {
    const bug = this.data.bugs.find((b) => b.id === id);
    if (bug) {
      Object.assign(bug, updates, { updatedAt: Date.now() });
      if (updates.status === "closed" || updates.status === "fixed") {
        bug.closedAt = Date.now();
      }
      this.save();
    }
    return bug;
  }
  deleteBug(id) {
    const idx = this.data.bugs.findIndex((b) => b.id === id);
    if (idx !== -1) {
      this.data.bugs.splice(idx, 1);
      this.save();
      return true;
    }
    return false;
  }
  addComment(bugId, comment) {
    const bug = this.data.bugs.find((b) => b.id === bugId);
    if (bug) {
      const newComment = {
        ...comment,
        id: this.data.nextCommentId++,
        bugId,
        timestamp: Date.now()
      };
      bug.comments.push(newComment);
      bug.updatedAt = Date.now();
      this.save();
      return newComment;
    }
    return void 0;
  }
  voteBug(bugId, username) {
    const bug = this.data.bugs.find((b) => b.id === bugId);
    if (bug && !bug.votes.includes(username)) {
      bug.votes.push(username);
      this.save();
      return true;
    }
    return false;
  }
  unvoteBug(bugId, username) {
    const bug = this.data.bugs.find((b) => b.id === bugId);
    if (bug) {
      const idx = bug.votes.indexOf(username);
      if (idx !== -1) {
        bug.votes.splice(idx, 1);
        this.save();
        return true;
      }
    }
    return false;
  }
  getStats() {
    const now = Date.now();
    const weekAgo = now - 7 * 24 * 60 * 60 * 1e3;
    const stats = {
      total: this.data.bugs.length,
      byStatus: {},
      byPriority: {},
      byCategory: {},
      recentlyCreated: 0,
      recentlyClosed: 0
    };
    STATUSES.forEach((s) => stats.byStatus[s.value] = 0);
    PRIORITIES.forEach((p) => stats.byPriority[p.value] = 0);
    CATEGORIES.forEach((c) => stats.byCategory[c.value] = 0);
    for (const bug of this.data.bugs) {
      stats.byStatus[bug.status]++;
      stats.byPriority[bug.priority]++;
      stats.byCategory[bug.category]++;
      if (bug.createdAt >= weekAgo) {
        stats.recentlyCreated++;
      }
      if (bug.closedAt && bug.closedAt >= weekAgo) {
        stats.recentlyClosed++;
      }
    }
    return stats;
  }
  getWebhooks() {
    return this.data.webhooks;
  }
  addWebhook(webhook) {
    this.data.webhooks.push(webhook);
    this.save();
  }
  removeWebhook(index) {
    this.data.webhooks.splice(index, 1);
    this.save();
  }
};
async function sendWebhook(storage, event, bug) {
  const webhooks = storage.getWebhooks();
  for (const webhook of webhooks) {
    if (!webhook.enabled)
      continue;
    if (!webhook.events.includes(event))
      continue;
    try {
      let payload;
      if (webhook.type === "discord") {
        payload = {
          embeds: [{
            title: `[${event.toUpperCase()}] Bug #${bug.id}: ${bug.title}`,
            description: bug.description.substring(0, 200),
            color: bug.priority === "critical" ? 16711680 : bug.priority === "high" ? 16746496 : bug.priority === "medium" ? 16776960 : 8947848,
            fields: [
              { name: "Status", value: bug.status, inline: true },
              { name: "Priority", value: bug.priority, inline: true },
              { name: "Category", value: bug.category, inline: true },
              { name: "Reporter", value: bug.reporter, inline: true }
            ],
            timestamp: (/* @__PURE__ */ new Date()).toISOString()
          }]
        };
      } else if (webhook.type === "slack") {
        payload = {
          text: `*[${event.toUpperCase()}]* Bug #${bug.id}: ${bug.title}`,
          attachments: [{
            color: bug.priority === "critical" ? "danger" : bug.priority === "high" ? "warning" : "good",
            fields: [
              { title: "Status", value: bug.status, short: true },
              { title: "Priority", value: bug.priority, short: true },
              { title: "Reporter", value: bug.reporter, short: true }
            ]
          }]
        };
      } else {
        payload = { event, bug };
      }
      const response = await fetch(webhook.url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      if (!response.ok) {
        console.error(`[BugTracker] Webhook failed: ${response.status}`);
      }
    } catch (err) {
      console.error("[BugTracker] Webhook error:", err);
    }
  }
}
var BugTrackerApp = class {
  session;
  screen;
  inputManager;
  storage;
  username;
  isSysop;
  // UI elements
  headerBox;
  mainContainer;
  footerBox;
  currentView = "menu";
  currentFilter = "all";
  keyHandlers = [];
  constructor(session) {
    this.session = session;
    this.username = session.user?.username || "Anonymous";
    this.isSysop = (session.user?.securityLevel || 0) >= 255;
    const doorPath = path.dirname(new URL(import.meta.url).pathname);
    this.storage = new BugStorage(doorPath);
    this.screen = this.createAppScreen();
    this.inputManager = new DoorInputManager(session, this.screen, {
      enableGameMode: false,
      // Menu-based, not game
      enableGrabKeys: true,
      enableMouse: true,
      debug: false,
      debugName: "BugTracker"
    });
  }
  createAppScreen() {
    const screen = createScreen(this.session.bbs, {
      title: "Bug Tracker v1.0.0",
      fullUnicode: false,
      smartCSR: false,
      fastCSR: false,
      mouse: true
    });
    screen.program.write("\x1B[2J");
    screen.program.write("\x1B[H");
    screen.clearRegion(0, screen.width, 0, screen.height);
    screen.alloc();
    return screen;
  }
  // Key handler management to prevent accumulation
  registerKey(keys, handler) {
    const keyArray = Array.isArray(keys) ? keys : [keys];
    this.keyHandlers.push({ keys: keyArray, handler });
    this.screen.key(keyArray, handler);
  }
  clearKeyHandlers() {
    for (const kh of this.keyHandlers) {
      this.screen.unkey(kh.keys, kh.handler);
    }
    this.keyHandlers = [];
  }
  async run(mode) {
    this.inputManager.enable();
    this.createLayout();
    if (mode === "NEW") {
      this.showCreateBug();
    } else if (mode === "LIST") {
      this.showBugList();
    } else if (mode === "SEARCH") {
      this.showBugList(true);
    } else {
      this.showMainMenu();
    }
    this.screen.render();
    return new Promise((resolve) => {
      this.screen.key(["q", "Q"], () => {
        if (this.currentView === "menu") {
          this.quit();
          resolve();
        }
      });
      this.screen.key(["escape"], () => {
        if (this.currentView === "menu") {
          this.quit();
          resolve();
        }
      });
    });
  }
  createLayout() {
    this.headerBox = createBox({
      parent: this.screen,
      top: 0,
      left: 0,
      width: "100%",
      height: 3,
      style: {
        fg: "white",
        bg: "blue"
      },
      content: "{center}{bold}BUG TRACKER{/bold} - AmiExpress BBS Issue Management{/center}",
      tags: true,
      focusable: false,
      mouse: false,
      clickable: false
    });
    this.mainContainer = createBox({
      parent: this.screen,
      top: 3,
      left: 0,
      width: "100%",
      bottom: 3,
      style: {
        fg: "white",
        bg: "black"
      },
      focusable: false,
      mouse: false,
      clickable: false
    });
    this.footerBox = createBox({
      parent: this.screen,
      bottom: 0,
      left: 0,
      width: "100%",
      height: 3,
      style: {
        fg: "white",
        bg: "blue"
      },
      content: "{center}Q=Quit | ESC=Back | Arrow Keys=Navigate | Enter=Select{/center}",
      tags: true,
      focusable: false,
      mouse: false,
      clickable: false
    });
  }
  clearMain() {
    this.clearKeyHandlers();
    const children = [...this.mainContainer.children];
    for (const child of children) {
      child.detach();
    }
  }
  // ============================================================================
  // Main Menu
  // ============================================================================
  showMainMenu() {
    this.currentView = "menu";
    this.clearMain();
    const stats = this.storage.getStats();
    const openBugs = stats.byStatus.new + stats.byStatus.acknowledged + stats.byStatus["in-progress"];
    createBox({
      parent: this.mainContainer,
      top: 0,
      left: 1,
      width: "98%",
      height: 3,
      border: { type: "line" },
      label: " Bug Tracker ",
      style: {
        fg: "white",
        bg: "black",
        border: { fg: "cyan" }
      },
      content: ` Welcome, ${this.username}! | ${stats.total} total bugs | ${openBugs} open`,
      tags: true,
      focusable: false,
      mouse: false,
      clickable: false
    });
    const menuActions = [
      () => this.showCreateBug(),
      () => this.showBugList(),
      () => this.showBugList(false, this.username),
      () => this.showBugList(true),
      () => this.showAnalytics()
    ];
    const menuLabels = [
      "[N] New Bug Report",
      "[L] List All Bugs",
      "[M] My Bug Reports",
      "[S] Search Bugs",
      "[A] Analytics Dashboard"
    ];
    if (this.isSysop) {
      menuLabels.push("[T] Sysop Tools");
      menuActions.push(() => this.showSysopTools());
      menuLabels.push("[W] Webhook Settings");
      menuActions.push(() => this.showWebhookSettings());
    }
    menuLabels.push("[Q] Quit");
    menuActions.push(() => this.quit());
    const menuList = createList({
      parent: this.mainContainer,
      top: 3,
      left: 1,
      width: "48%",
      height: "100%-6",
      border: { type: "line" },
      label: " Menu ",
      items: menuLabels,
      mouse: true,
      keys: true,
      vi: false,
      style: {
        fg: "white",
        bg: "black",
        border: { fg: "cyan" },
        selected: {
          fg: "black",
          bg: "cyan"
        },
        item: {
          fg: "white",
          bg: "black"
        }
      },
      padding: { left: 1 }
    });
    menuList.focus();
    menuList.on("select", (_item, index) => {
      if (this.currentView === "menu" && menuActions[index]) {
        menuActions[index]();
      }
    });
    this.registerKey(["n", "N"], () => {
      if (this.currentView === "menu")
        this.showCreateBug();
    });
    this.registerKey(["l", "L"], () => {
      if (this.currentView === "menu")
        this.showBugList();
    });
    this.registerKey(["m", "M"], () => {
      if (this.currentView === "menu")
        this.showBugList(false, this.username);
    });
    this.registerKey(["s", "S"], () => {
      if (this.currentView === "menu")
        this.showBugList(true);
    });
    this.registerKey(["a", "A"], () => {
      if (this.currentView === "menu")
        this.showAnalytics();
    });
    if (this.isSysop) {
      this.registerKey(["t", "T"], () => {
        if (this.currentView === "menu")
          this.showSysopTools();
      });
      this.registerKey(["w", "W"], () => {
        if (this.currentView === "menu")
          this.showWebhookSettings();
      });
    }
    const statsContent = [
      "{bold}Quick Stats:{/bold}",
      "",
      `Total Bugs: ${stats.total}`,
      `Open: ${openBugs}`,
      `Fixed: ${stats.byStatus.fixed}`,
      `Closed: ${stats.byStatus.closed}`,
      "",
      "{bold}This Week:{/bold}",
      `Created: ${stats.recentlyCreated}`,
      `Resolved: ${stats.recentlyClosed}`,
      "",
      "{bold}By Priority:{/bold}",
      `{magenta-fg}Critical: ${stats.byPriority.critical}{/}`,
      `{red-fg}High: ${stats.byPriority.high}{/}`,
      `{yellow-fg}Medium: ${stats.byPriority.medium}{/}`,
      `{gray-fg}Low: ${stats.byPriority.low}{/}`
    ];
    createBox({
      parent: this.mainContainer,
      top: 3,
      right: 1,
      width: "48%",
      height: "100%-6",
      border: { type: "line" },
      label: " Statistics ",
      style: {
        fg: "white",
        bg: "black",
        border: { fg: "green" }
      },
      content: statsContent.join("\n"),
      tags: true,
      scrollable: true,
      mouse: true,
      padding: { left: 1, right: 1 },
      focusable: false,
      mouse: false,
      clickable: false
    });
    createBox({
      parent: this.mainContainer,
      bottom: 0,
      left: 1,
      width: "98%",
      height: 3,
      border: { type: "line" },
      style: {
        fg: "gray",
        bg: "black",
        border: { fg: "gray" }
      },
      content: " {cyan-fg}[Enter]{/} Select   {cyan-fg}[Hotkey]{/} Quick Action   {red-fg}[Q]{/} Quit",
      tags: true,
      focusable: false,
      mouse: false,
      clickable: false
    });
    this.screen.render();
  }
  // ============================================================================
  // Bug List
  // ============================================================================
  showBugList(showSearch = false, filterReporter) {
    this.currentView = "list";
    this.clearMain();
    let bugs = this.storage.getBugs();
    if (filterReporter) {
      this.currentFilter = "mine";
    }
    switch (this.currentFilter) {
      case "mine":
        bugs = bugs.filter((b) => b.reporter === this.username || b.assignee === this.username);
        break;
      case "open":
        bugs = bugs.filter((b) => !["closed", "fixed", "wont-fix"].includes(b.status));
        break;
      case "critical":
        bugs = bugs.filter((b) => b.priority === "critical" || b.priority === "high");
        break;
    }
    const priorityOrder = {
      critical: 0,
      high: 1,
      medium: 2,
      low: 3
    };
    bugs.sort((a, b) => {
      const pDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
      if (pDiff !== 0)
        return pDiff;
      return b.createdAt - a.createdAt;
    });
    const filterLabels = {
      "all": "All Bugs",
      "mine": "My Bugs",
      "open": "Open Bugs",
      "critical": "Critical/High"
    };
    createBox({
      parent: this.mainContainer,
      top: 0,
      left: 1,
      width: "98%",
      height: 3,
      border: { type: "line" },
      label: ` ${filterLabels[this.currentFilter]} `,
      style: {
        fg: "white",
        bg: "black",
        border: { fg: "cyan" }
      },
      content: ` Showing ${bugs.length} bug(s) | Filter: ${filterLabels[this.currentFilter]} | Press F to cycle filters`,
      tags: true,
      focusable: false,
      mouse: false,
      clickable: false
    });
    const listItems = bugs.map((bug) => {
      const priorityColor = PRIORITIES.find((p) => p.value === bug.priority)?.color || "white";
      const statusColor = STATUSES.find((s) => s.value === bug.status)?.color || "white";
      const voteCount = bug.votes.length > 0 ? ` [+${bug.votes.length}]` : "";
      return `{${priorityColor}-fg}#${bug.id.toString().padStart(4, "0")}{/} {${statusColor}-fg}[${bug.status.toUpperCase().substring(0, 3)}]{/} ${bug.title.substring(0, 50)}${voteCount}`;
    });
    if (listItems.length === 0) {
      listItems.push("{gray-fg}No bugs found - press N to create one{/}");
    }
    const bugList = createList({
      parent: this.mainContainer,
      top: 3,
      left: 1,
      width: "98%",
      height: "100%-6",
      border: { type: "line" },
      label: " Bugs ",
      style: {
        fg: "white",
        bg: "black",
        border: { fg: "cyan" },
        selected: {
          fg: "black",
          bg: "cyan"
        },
        item: {
          fg: "white",
          bg: "black"
        }
      },
      items: listItems,
      tags: true,
      keys: true,
      vi: true,
      mouse: true,
      scrollbar: {
        ch: " ",
        style: { bg: "cyan" }
      },
      padding: { left: 1 }
    });
    createBox({
      parent: this.mainContainer,
      bottom: 0,
      left: 1,
      width: "98%",
      height: 3,
      border: { type: "line" },
      style: {
        fg: "gray",
        bg: "black",
        border: { fg: "gray" }
      },
      content: " {cyan-fg}[Enter]{/} View Bug   {cyan-fg}[N]{/} New Bug   {cyan-fg}[F]{/} Filter   {red-fg}[ESC]{/} Back",
      tags: true,
      focusable: false,
      mouse: false,
      clickable: false
    });
    bugList.focus();
    bugList.on("select", (item, index) => {
      if (bugs[index]) {
        this.showBugDetail(bugs[index].id);
      }
    });
    this.registerKey(["n", "N"], () => {
      if (this.currentView === "list")
        this.showCreateBug();
    });
    this.registerKey(["f", "F"], () => {
      if (this.currentView === "list") {
        const filters = ["all", "mine", "open", "critical"];
        const idx = filters.indexOf(this.currentFilter);
        this.currentFilter = filters[(idx + 1) % filters.length];
        this.showBugList();
      }
    });
    this.registerKey(["escape"], () => {
      if (this.currentView === "list") {
        setImmediate(() => this.showMainMenu());
      }
    });
    this.screen.render();
  }
  // ============================================================================
  // Bug Detail
  // ============================================================================
  showBugDetail(bugId) {
    const bug = this.storage.getBug(bugId);
    if (!bug) {
      this.showMainMenu();
      return;
    }
    this.currentView = "detail";
    this.clearMain();
    const priorityInfo = PRIORITIES.find((p) => p.value === bug.priority);
    const statusInfo = STATUSES.find((s) => s.value === bug.status);
    const categoryInfo = CATEGORIES.find((c) => c.value === bug.category);
    const createdDate = new Date(bug.createdAt).toLocaleDateString();
    const updatedDate = new Date(bug.updatedAt).toLocaleDateString();
    createBox({
      parent: this.mainContainer,
      top: 0,
      left: 1,
      width: "98%",
      height: 3,
      border: { type: "line" },
      label: ` Bug #${bug.id} `,
      style: {
        fg: "white",
        bg: "black",
        border: { fg: priorityInfo?.color || "cyan" }
      },
      content: ` {bold}${bug.title}{/} | {${statusInfo?.color}-fg}${statusInfo?.label}{/} | {${priorityInfo?.color}-fg}${priorityInfo?.label}{/}`,
      tags: true,
      focusable: false,
      mouse: false,
      clickable: false
    });
    const detailContent = [
      `{cyan-fg}Category:{/} ${categoryInfo?.label || bug.category}`,
      `{cyan-fg}Reporter:{/} ${bug.reporter}`,
      `{cyan-fg}Assignee:{/} ${bug.assignee || "Unassigned"}`,
      `{cyan-fg}Votes:{/} ${bug.votes.length}`,
      `{cyan-fg}Created:{/} ${createdDate} | {cyan-fg}Updated:{/} ${updatedDate}`,
      "",
      "{bold}Description:{/bold}",
      bug.description || "N/A",
      "",
      "{bold}Steps to Reproduce:{/bold}",
      bug.stepsToReproduce || "N/A",
      "",
      "{bold}Expected Behavior:{/bold}",
      bug.expectedBehavior || "N/A",
      "",
      "{bold}Actual Behavior:{/bold}",
      bug.actualBehavior || "N/A"
    ];
    if (bug.tags.length > 0) {
      detailContent.push("", `{cyan-fg}Tags:{/} ${bug.tags.join(", ")}`);
    }
    const detailBox = createBox({
      parent: this.mainContainer,
      top: 3,
      left: 1,
      width: "68%",
      height: 12,
      border: { type: "line" },
      label: " Details ",
      style: {
        fg: "white",
        bg: "black",
        border: { fg: "cyan" }
      },
      content: detailContent.join("\n"),
      tags: true,
      scrollable: true,
      alwaysScroll: true,
      keys: true,
      vi: true,
      mouse: true,
      padding: { left: 1, right: 1 }
    });
    const isOwner = bug.reporter === this.username;
    const actionLabels = ["[V] Vote", "[C] Add Comment"];
    const actionHandlers = [
      () => this.toggleVote(bugId),
      () => this.showAddComment(bugId)
    ];
    if (isOwner || this.isSysop) {
      actionLabels.push("[E] Edit Bug");
      actionHandlers.push(() => this.showEditBug(bugId));
    }
    if (this.isSysop) {
      actionLabels.push("[S] Change Status");
      actionHandlers.push(() => this.showChangeStatus(bugId));
      actionLabels.push("[A] Assign");
      actionHandlers.push(() => this.showAssignBug(bugId));
      actionLabels.push("[D] Delete");
      actionHandlers.push(() => this.confirmDeleteBug(bugId));
    }
    actionLabels.push("[ESC] Back");
    actionHandlers.push(() => this.showBugList());
    const actionList = createList({
      parent: this.mainContainer,
      top: 3,
      right: 1,
      width: "28%",
      height: 12,
      border: { type: "line" },
      label: " Actions ",
      items: actionLabels,
      mouse: true,
      keys: true,
      vi: false,
      style: {
        fg: "white",
        bg: "black",
        border: { fg: "yellow" },
        selected: { fg: "black", bg: "yellow" },
        item: { fg: "white", bg: "black" }
      },
      padding: { left: 1 }
    });
    actionList.on("select", (_item, index) => {
      if (this.currentView === "detail" && actionHandlers[index]) {
        actionHandlers[index]();
      }
    });
    const commentItems = bug.comments.filter((c) => !c.isInternal || this.isSysop).map((c) => {
      const date = new Date(c.timestamp).toLocaleDateString();
      const prefix = c.isInternal ? "{magenta-fg}[INTERNAL]{/} " : "";
      return `${prefix}{cyan-fg}${c.author}{/} (${date}):
  ${c.content}`;
    });
    if (commentItems.length === 0) {
      commentItems.push("{gray-fg}No comments yet - press C to add one{/}");
    }
    createBox({
      parent: this.mainContainer,
      top: 15,
      left: 1,
      width: "98%",
      height: "100%-18",
      border: { type: "line" },
      label: ` Comments (${bug.comments.length}) `,
      style: {
        fg: "white",
        bg: "black",
        border: { fg: "green" }
      },
      content: commentItems.join("\n\n"),
      tags: true,
      scrollable: true,
      alwaysScroll: true,
      keys: true,
      vi: true,
      mouse: true,
      padding: { left: 1, right: 1 }
    });
    createBox({
      parent: this.mainContainer,
      bottom: 0,
      left: 1,
      width: "98%",
      height: 3,
      border: { type: "line" },
      style: {
        fg: "gray",
        bg: "black",
        border: { fg: "gray" }
      },
      content: " {cyan-fg}[Enter]{/} Select Action   {cyan-fg}[Hotkey]{/} Quick Action   {red-fg}[ESC]{/} Back",
      tags: true,
      focusable: false,
      mouse: false,
      clickable: false
    });
    this.registerKey(["v", "V"], () => {
      if (this.currentView === "detail") {
        this.toggleVote(bugId);
      }
    });
    this.registerKey(["c", "C"], () => {
      if (this.currentView === "detail") {
        this.showAddComment(bugId);
      }
    });
    if (isOwner || this.isSysop) {
      this.registerKey(["e", "E"], () => {
        if (this.currentView === "detail") {
          this.showEditBug(bugId);
        }
      });
    }
    if (this.isSysop) {
      this.registerKey(["s", "S"], () => {
        if (this.currentView === "detail") {
          this.showChangeStatus(bugId);
        }
      });
      this.registerKey(["a", "A"], () => {
        if (this.currentView === "detail") {
          this.showAssignBug(bugId);
        }
      });
      this.registerKey(["d", "D"], () => {
        if (this.currentView === "detail") {
          this.confirmDeleteBug(bugId);
        }
      });
    }
    this.registerKey(["escape"], () => {
      if (this.currentView === "detail") {
        setImmediate(() => this.showBugList());
      }
    });
    actionList.focus();
    this.screen.render();
  }
  // ============================================================================
  // Create Bug
  // ============================================================================
  showCreateBug() {
    this.currentView = "create";
    this.clearMain();
    const fields = [
      { name: "Title", value: "" },
      { name: "Category", value: "general" },
      { name: "Priority", value: "medium" },
      { name: "Description", value: "", multiline: true },
      { name: "Steps to Reproduce", value: "", multiline: true },
      { name: "Expected Behavior", value: "" },
      { name: "Actual Behavior", value: "" }
    ];
    createBox({
      parent: this.mainContainer,
      top: 0,
      left: 1,
      width: "98%",
      height: 3,
      border: { type: "line" },
      label: " New Bug Report ",
      style: {
        fg: "white",
        bg: "black",
        border: { fg: "yellow" }
      },
      content: " Use arrows/mouse to select field. Enter to edit. F10 to submit. ESC to cancel.",
      tags: true,
      focusable: false,
      mouse: false,
      clickable: false
    });
    const generateItems = () => {
      return fields.map((field) => {
        let displayValue = field.value || "{gray-fg}(empty){/}";
        if (field.name === "Category") {
          const cat = CATEGORIES.find((c) => c.value === field.value);
          displayValue = cat?.label || field.value;
        } else if (field.name === "Priority") {
          const pri = PRIORITIES.find((p) => p.value === field.value);
          displayValue = `{${pri?.color || "white"}-fg}${pri?.label || field.value}{/}`;
        } else if (field.value.length > 50) {
          displayValue = field.value.substring(0, 50) + "...";
        }
        return `{bold}${field.name.padEnd(20)}{/} ${displayValue}`;
      });
    };
    const fieldList = createList({
      parent: this.mainContainer,
      top: 3,
      left: 1,
      width: "98%",
      height: "100%-6",
      border: { type: "line" },
      style: {
        fg: "white",
        bg: "black",
        border: { fg: "cyan" },
        selected: { fg: "black", bg: "cyan" },
        item: { fg: "white", bg: "black" }
      },
      items: generateItems(),
      keys: true,
      vi: true,
      mouse: true,
      tags: true,
      scrollable: true,
      alwaysScroll: true,
      padding: { left: 1, right: 1 }
    });
    createBox({
      parent: this.mainContainer,
      bottom: 0,
      left: 1,
      width: "98%",
      height: 3,
      border: { type: "line" },
      style: {
        fg: "gray",
        bg: "black",
        border: { fg: "gray" }
      },
      content: " {cyan-fg}[Enter]{/} Edit Field   {cyan-fg}[F10]{/} Submit   {red-fg}[ESC]{/} Cancel",
      tags: true,
      focusable: false,
      mouse: false,
      clickable: false
    });
    const editField = (fieldIdx) => {
      const field = fields[fieldIdx];
      if (field.name === "Category") {
        this.showSelector("Select Category", CATEGORIES.map((c) => c.label), (idx) => {
          if (idx !== -1) {
            field.value = CATEGORIES[idx].value;
          }
          fieldList.setItems(generateItems());
          fieldList.select(fieldIdx);
          this.screen.render();
        });
      } else if (field.name === "Priority") {
        this.showSelector("Select Priority", PRIORITIES.map((p) => p.label), (idx) => {
          if (idx !== -1) {
            field.value = PRIORITIES[idx].value;
          }
          fieldList.setItems(generateItems());
          fieldList.select(fieldIdx);
          this.screen.render();
        });
      } else {
        this.showTextInput(field.name, field.value, field.multiline || false, (value) => {
          if (value !== null) {
            field.value = value;
          }
          fieldList.setItems(generateItems());
          fieldList.select(fieldIdx);
          this.screen.render();
        });
      }
    };
    const submitForm = () => {
      const title = fields.find((f) => f.name === "Title")?.value.trim();
      if (!title) {
        this.showMessage("Error", "Title is required");
        return;
      }
      const bug = this.storage.createBug({
        title,
        description: fields.find((f) => f.name === "Description")?.value || "",
        category: fields.find((f) => f.name === "Category")?.value || "general",
        priority: fields.find((f) => f.name === "Priority")?.value || "medium",
        status: "new",
        reporter: this.username,
        assignee: null,
        stepsToReproduce: fields.find((f) => f.name === "Steps to Reproduce")?.value || "",
        expectedBehavior: fields.find((f) => f.name === "Expected Behavior")?.value || "",
        actualBehavior: fields.find((f) => f.name === "Actual Behavior")?.value || "",
        systemInfo: "",
        tags: [],
        attachments: []
      });
      sendWebhook(this.storage, "create", bug);
      this.showMessage("Success", `Bug #${bug.id} created successfully!`, () => {
        this.showBugDetail(bug.id);
      });
    };
    fieldList.on("select", (_, idx) => {
      editField(idx);
    });
    this.registerKey(["f10"], () => {
      if (this.currentView === "create") {
        submitForm();
      }
    });
    this.registerKey(["escape"], () => {
      if (this.currentView === "create") {
        setImmediate(() => this.showMainMenu());
      }
    });
    fieldList.focus();
    this.screen.render();
  }
  // ============================================================================
  // Analytics Dashboard
  // ============================================================================
  showAnalytics() {
    this.currentView = "stats";
    this.clearMain();
    const stats = this.storage.getStats();
    const openBugs = stats.byStatus.new + stats.byStatus.acknowledged + stats.byStatus["in-progress"];
    const closedBugs = stats.byStatus.fixed + stats.byStatus.closed + stats.byStatus["wont-fix"];
    const openPct = stats.total > 0 ? Math.round(openBugs / stats.total * 100) : 0;
    createBox({
      parent: this.mainContainer,
      top: 0,
      left: 1,
      width: "98%",
      height: 3,
      border: { type: "line" },
      label: " Analytics Dashboard ",
      style: {
        fg: "white",
        bg: "black",
        border: { fg: "green" }
      },
      content: ` Total: ${stats.total} bugs | Open: ${openBugs} (${openPct}%) | Closed: ${closedBugs}`,
      tags: true,
      focusable: false,
      mouse: false,
      clickable: false
    });
    const priorityBars = [];
    const maxPriority = Math.max(...Object.values(stats.byPriority), 1);
    PRIORITIES.forEach((p) => {
      const count = stats.byPriority[p.value];
      const barLen = Math.round(count / maxPriority * 30);
      const bar = "=".repeat(barLen);
      priorityBars.push(`{${p.color}-fg}${p.label.padEnd(8)}{/} [${bar.padEnd(30)}] ${count}`);
    });
    const categoryBars = [];
    const maxCategory = Math.max(...Object.values(stats.byCategory), 1);
    CATEGORIES.forEach((c) => {
      const count = stats.byCategory[c.value];
      const barLen = Math.round(count / maxCategory * 25);
      const bar = "#".repeat(barLen);
      categoryBars.push(`${c.label.padEnd(15)} [${bar.padEnd(25)}] ${count}`);
    });
    const statusLines = [];
    STATUSES.forEach((s) => {
      const count = stats.byStatus[s.value];
      statusLines.push(`  {${s.color}-fg}${s.label.padEnd(12)}{/}: ${count}`);
    });
    const content = [
      `{bold}This Week:{/}`,
      `  New Bugs Created: ${stats.recentlyCreated}`,
      `  Bugs Resolved: ${stats.recentlyClosed}`,
      "",
      "{bold}By Priority:{/bold}",
      ...priorityBars,
      "",
      "{bold}By Category:{/bold}",
      ...categoryBars,
      "",
      "{bold}Status Breakdown:{/bold}",
      ...statusLines
    ];
    const analyticsBox = createBox({
      parent: this.mainContainer,
      top: 3,
      left: 1,
      width: "98%",
      height: "100%-6",
      border: { type: "line" },
      style: {
        fg: "white",
        bg: "black",
        border: { fg: "cyan" }
      },
      content: content.join("\n"),
      tags: true,
      scrollable: true,
      alwaysScroll: true,
      keys: true,
      vi: true,
      mouse: true,
      padding: { left: 1, right: 1 }
    });
    createBox({
      parent: this.mainContainer,
      bottom: 0,
      left: 1,
      width: "98%",
      height: 3,
      border: { type: "line" },
      style: {
        fg: "gray",
        bg: "black",
        border: { fg: "gray" }
      },
      content: " {cyan-fg}[Up/Down]{/} Scroll   {red-fg}[ESC]{/} Back to Menu",
      tags: true,
      focusable: false,
      mouse: false,
      clickable: false
    });
    analyticsBox.focus();
    this.registerKey(["escape"], () => {
      if (this.currentView === "stats") {
        setImmediate(() => this.showMainMenu());
      }
    });
    this.screen.render();
  }
  // ============================================================================
  // Webhook Settings (Sysop only)
  // ============================================================================
  showWebhookSettings() {
    if (!this.isSysop)
      return;
    this.currentView = "settings";
    this.clearMain();
    const webhooks = this.storage.getWebhooks();
    createBox({
      parent: this.mainContainer,
      top: 0,
      left: 1,
      width: "98%",
      height: 3,
      border: { type: "line" },
      label: " Webhook Settings ",
      style: {
        fg: "white",
        bg: "black",
        border: { fg: "yellow" }
      },
      content: ` ${webhooks.length} webhook(s) configured | Notifications for bug events`,
      tags: true,
      focusable: false,
      mouse: false,
      clickable: false
    });
    const listItems = webhooks.map((w, idx) => {
      const status = w.enabled ? "{green-fg}[ON]{/}" : "{red-fg}[OFF]{/}";
      return `${status} ${w.type.toUpperCase().padEnd(8)} ${w.url.substring(0, 50)}${w.url.length > 50 ? "..." : ""}`;
    });
    if (listItems.length === 0) {
      listItems.push("{gray-fg}No webhooks configured - press A to add one{/}");
    }
    const webhookList = createList({
      parent: this.mainContainer,
      top: 3,
      left: 1,
      width: "98%",
      height: "100%-6",
      border: { type: "line" },
      label: " Webhooks ",
      style: {
        fg: "white",
        bg: "black",
        border: { fg: "cyan" },
        selected: { fg: "black", bg: "cyan" },
        item: { fg: "white", bg: "black" }
      },
      items: listItems,
      tags: true,
      keys: true,
      vi: true,
      mouse: true,
      padding: { left: 1 }
    });
    createBox({
      parent: this.mainContainer,
      bottom: 0,
      left: 1,
      width: "98%",
      height: 3,
      border: { type: "line" },
      style: {
        fg: "gray",
        bg: "black",
        border: { fg: "gray" }
      },
      content: " {cyan-fg}[A]{/} Add   {cyan-fg}[D]{/} Delete   {cyan-fg}[T]{/} Toggle   {red-fg}[ESC]{/} Back",
      tags: true,
      focusable: false,
      mouse: false,
      clickable: false
    });
    webhookList.focus();
    this.registerKey(["a", "A"], () => {
      if (this.currentView === "settings") {
        this.showAddWebhook();
      }
    });
    this.registerKey(["d", "D"], () => {
      if (this.currentView === "settings" && webhooks.length > 0) {
        const idx = webhookList.selected || 0;
        this.storage.removeWebhook(idx);
        this.showWebhookSettings();
      }
    });
    this.registerKey(["t", "T"], () => {
      if (this.currentView === "settings" && webhooks.length > 0) {
        const idx = webhookList.selected || 0;
        webhooks[idx].enabled = !webhooks[idx].enabled;
        this.storage.save();
        this.showWebhookSettings();
      }
    });
    this.registerKey(["escape"], () => {
      if (this.currentView === "settings") {
        setImmediate(() => this.showMainMenu());
      }
    });
    this.screen.render();
  }
  showAddWebhook() {
    this.showSelector("Webhook Type", ["Discord", "Slack", "Generic"], (typeIdx) => {
      if (typeIdx === -1) {
        this.showWebhookSettings();
        return;
      }
      const type = ["discord", "slack", "generic"][typeIdx];
      this.showTextInput("Webhook URL", "", false, (url) => {
        if (url && url.trim()) {
          this.storage.addWebhook({
            enabled: true,
            url: url.trim(),
            type,
            events: ["create", "update", "close", "comment"]
          });
        }
        this.showWebhookSettings();
      });
    });
  }
  // ============================================================================
  // Sysop Tools (Sysop only)
  // ============================================================================
  showSysopTools() {
    if (!this.isSysop)
      return;
    this.currentView = "settings";
    this.clearMain();
    const stats = this.storage.getStats();
    const openBugs = stats.byStatus.new + stats.byStatus.acknowledged + stats.byStatus["in-progress"];
    const fixedBugs = stats.byStatus.fixed;
    const closedBugs = stats.byStatus.closed + stats.byStatus["wont-fix"];
    createBox({
      parent: this.mainContainer,
      top: 0,
      left: 1,
      width: "98%",
      height: 3,
      border: { type: "line" },
      label: " Sysop Tools ",
      style: {
        fg: "white",
        bg: "black",
        border: { fg: "red" }
      },
      content: ` Open: ${openBugs} | Fixed (pending close): ${fixedBugs} | Closed: ${closedBugs}`,
      tags: true,
      focusable: false,
      mouse: false,
      clickable: false
    });
    const toolLabels = [
      "[B] Bulk Status Change",
      "[A] Bulk Assign",
      "[C] Close All Fixed Bugs",
      "[P] Purge Closed Bugs",
      "[R] Report by User",
      "[X] Back to Menu"
    ];
    const toolActions = [
      () => this.showBulkStatusChange(),
      () => this.showBulkAssign(),
      () => this.closeAllFixedBugs(),
      () => this.purgeClosedBugs(),
      () => this.showUserReport(),
      () => this.showMainMenu()
    ];
    const toolList = createList({
      parent: this.mainContainer,
      top: 3,
      left: 1,
      width: "98%",
      height: "100%-6",
      border: { type: "line" },
      label: " Available Tools ",
      style: {
        fg: "white",
        bg: "black",
        border: { fg: "cyan" },
        selected: { fg: "black", bg: "red" },
        item: { fg: "white", bg: "black" }
      },
      items: toolLabels,
      tags: true,
      keys: true,
      vi: true,
      mouse: true,
      padding: { left: 1 }
    });
    createBox({
      parent: this.mainContainer,
      bottom: 0,
      left: 1,
      width: "98%",
      height: 3,
      border: { type: "line" },
      style: {
        fg: "gray",
        bg: "black",
        border: { fg: "gray" }
      },
      content: " {cyan-fg}[Enter]{/} Select Tool   {cyan-fg}[Hotkey]{/} Quick Action   {red-fg}[ESC]{/} Back",
      tags: true,
      focusable: false,
      mouse: false,
      clickable: false
    });
    toolList.focus();
    toolList.on("select", (_item, index) => {
      if (toolActions[index]) {
        toolActions[index]();
      }
    });
    this.registerKey(["b", "B"], () => {
      if (this.currentView === "settings")
        this.showBulkStatusChange();
    });
    this.registerKey(["a", "A"], () => {
      if (this.currentView === "settings")
        this.showBulkAssign();
    });
    this.registerKey(["c", "C"], () => {
      if (this.currentView === "settings")
        this.closeAllFixedBugs();
    });
    this.registerKey(["p", "P"], () => {
      if (this.currentView === "settings")
        this.purgeClosedBugs();
    });
    this.registerKey(["r", "R"], () => {
      if (this.currentView === "settings")
        this.showUserReport();
    });
    this.registerKey(["x", "X"], () => {
      if (this.currentView === "settings")
        this.showMainMenu();
    });
    this.registerKey(["escape"], () => {
      if (this.currentView === "settings") {
        setImmediate(() => this.showMainMenu());
      }
    });
    this.screen.render();
  }
  showBulkStatusChange() {
    const statusOptions = STATUSES.map((s) => `${s.label} bugs`);
    statusOptions.unshift("All Open Bugs");
    this.showSelector("Select Bugs to Change", statusOptions, (fromIdx) => {
      if (fromIdx === -1) {
        this.showSysopTools();
        return;
      }
      this.showSelector("Change To Status", STATUSES.map((s) => s.label), (toIdx) => {
        if (toIdx === -1) {
          this.showSysopTools();
          return;
        }
        const targetStatus = STATUSES[toIdx].value;
        let bugs = this.storage.getBugs();
        if (fromIdx === 0) {
          bugs = bugs.filter((b) => !["closed", "fixed", "wont-fix"].includes(b.status));
        } else {
          const fromStatus = STATUSES[fromIdx - 1].value;
          bugs = bugs.filter((b) => b.status === fromStatus);
        }
        let changed = 0;
        bugs.forEach((bug) => {
          this.storage.updateBug(bug.id, { status: targetStatus });
          changed++;
        });
        this.showMessage("Bulk Update", `Changed ${changed} bugs to ${STATUSES[toIdx].label}.`, () => {
          this.showSysopTools();
        });
      });
    });
  }
  showBulkAssign() {
    const bugs = this.storage.getBugs();
    const knownUsers = /* @__PURE__ */ new Set();
    bugs.forEach((b) => {
      if (b.reporter)
        knownUsers.add(b.reporter);
      if (b.assignee)
        knownUsers.add(b.assignee);
    });
    const userList = ["(Unassign All)", "(Enter custom username)", ...Array.from(knownUsers).sort()];
    const filterOptions = [
      "All Unassigned Bugs",
      "All Open Bugs",
      "All Critical/High Bugs"
    ];
    this.showSelector("Select Bugs to Assign", filterOptions, (filterIdx) => {
      if (filterIdx === -1) {
        this.showSysopTools();
        return;
      }
      this.showSelector("Assign To", userList, (userIdx) => {
        if (userIdx === -1) {
          this.showSysopTools();
          return;
        }
        const handleAssignment = (assignee) => {
          let bugsToAssign = this.storage.getBugs();
          switch (filterIdx) {
            case 0:
              bugsToAssign = bugsToAssign.filter((b) => !b.assignee);
              break;
            case 1:
              bugsToAssign = bugsToAssign.filter((b) => !["closed", "fixed", "wont-fix"].includes(b.status));
              break;
            case 2:
              bugsToAssign = bugsToAssign.filter((b) => b.priority === "critical" || b.priority === "high");
              break;
          }
          let assigned = 0;
          bugsToAssign.forEach((bug) => {
            this.storage.updateBug(bug.id, { assignee });
            assigned++;
          });
          const msg = assignee ? `Assigned ${assigned} bugs to ${assignee}.` : `Unassigned ${assigned} bugs.`;
          this.showMessage("Bulk Assign", msg, () => this.showSysopTools());
        };
        if (userIdx === 0) {
          handleAssignment(null);
        } else if (userIdx === 1) {
          this.showTextInput("Enter Username", "", false, (username) => {
            if (username && username.trim()) {
              handleAssignment(username.trim());
            } else {
              this.showSysopTools();
            }
          });
        } else {
          handleAssignment(Array.from(knownUsers).sort()[userIdx - 2]);
        }
      });
    });
  }
  closeAllFixedBugs() {
    const fixedBugs = this.storage.getBugs().filter((b) => b.status === "fixed");
    if (fixedBugs.length === 0) {
      this.showMessage("No Bugs", "No fixed bugs to close.", () => this.showSysopTools());
      return;
    }
    this.showConfirm("Close Fixed Bugs", `Close all ${fixedBugs.length} fixed bugs?`, (confirmed) => {
      if (confirmed) {
        fixedBugs.forEach((bug) => {
          this.storage.updateBug(bug.id, { status: "closed" });
        });
        this.showMessage("Done", `Closed ${fixedBugs.length} bugs.`, () => this.showSysopTools());
      } else {
        this.showSysopTools();
      }
    });
  }
  purgeClosedBugs() {
    const closedBugs = this.storage.getBugs().filter((b) => b.status === "closed" || b.status === "wont-fix");
    if (closedBugs.length === 0) {
      this.showMessage("No Bugs", "No closed bugs to purge.", () => this.showSysopTools());
      return;
    }
    this.showConfirm("Purge Closed Bugs", `PERMANENTLY DELETE ${closedBugs.length} closed bugs?`, (confirmed) => {
      if (confirmed) {
        closedBugs.forEach((bug) => {
          this.storage.deleteBug(bug.id);
        });
        this.showMessage("Purged", `Deleted ${closedBugs.length} bugs.`, () => this.showSysopTools());
      } else {
        this.showSysopTools();
      }
    });
  }
  showUserReport() {
    const bugs = this.storage.getBugs();
    const userStats = {};
    bugs.forEach((bug) => {
      if (bug.reporter) {
        if (!userStats[bug.reporter]) {
          userStats[bug.reporter] = { reported: 0, assigned: 0, commented: 0 };
        }
        userStats[bug.reporter].reported++;
      }
      if (bug.assignee) {
        if (!userStats[bug.assignee]) {
          userStats[bug.assignee] = { reported: 0, assigned: 0, commented: 0 };
        }
        userStats[bug.assignee].assigned++;
      }
      bug.comments.forEach((comment) => {
        if (comment.author) {
          if (!userStats[comment.author]) {
            userStats[comment.author] = { reported: 0, assigned: 0, commented: 0 };
          }
          userStats[comment.author].commented++;
        }
      });
    });
    this.currentView = "stats";
    this.clearMain();
    const userCount = Object.keys(userStats).length;
    createBox({
      parent: this.mainContainer,
      top: 0,
      left: 1,
      width: "98%",
      height: 3,
      border: { type: "line" },
      label: " User Activity Report ",
      style: {
        fg: "white",
        bg: "black",
        border: { fg: "magenta" }
      },
      content: ` Tracking ${userCount} user(s) across ${bugs.length} bug(s)`,
      tags: true,
      focusable: false,
      mouse: false,
      clickable: false
    });
    const lines = [
      "{bold}User                 Reported  Assigned  Comments{/}",
      "{gray-fg}" + "-".repeat(55) + "{/}"
    ];
    Object.entries(userStats).sort((a, b) => b[1].reported + b[1].assigned - (a[1].reported + a[1].assigned)).forEach(([user, stats]) => {
      const row = `${user.padEnd(20)} ${stats.reported.toString().padStart(8)}  ${stats.assigned.toString().padStart(8)}  ${stats.commented.toString().padStart(8)}`;
      lines.push(row);
    });
    if (userCount === 0) {
      lines.push("{gray-fg}No user activity yet{/}");
    }
    const reportBox = createBox({
      parent: this.mainContainer,
      top: 3,
      left: 1,
      width: "98%",
      height: "100%-6",
      border: { type: "line" },
      style: {
        fg: "white",
        bg: "black",
        border: { fg: "cyan" }
      },
      content: lines.join("\n"),
      tags: true,
      scrollable: true,
      alwaysScroll: true,
      keys: true,
      vi: true,
      mouse: true,
      padding: { left: 1, right: 1 }
    });
    createBox({
      parent: this.mainContainer,
      bottom: 0,
      left: 1,
      width: "98%",
      height: 3,
      border: { type: "line" },
      style: {
        fg: "gray",
        bg: "black",
        border: { fg: "gray" }
      },
      content: " {cyan-fg}[Up/Down]{/} Scroll   {red-fg}[ESC]{/} Back to Sysop Tools",
      tags: true,
      focusable: false,
      mouse: false,
      clickable: false
    });
    reportBox.focus();
    this.registerKey(["escape"], () => {
      if (this.currentView === "stats") {
        setImmediate(() => this.showSysopTools());
      }
    });
    this.screen.render();
  }
  // ============================================================================
  // Helper Actions
  // ============================================================================
  toggleVote(bugId) {
    const bug = this.storage.getBug(bugId);
    if (!bug)
      return;
    if (bug.votes.includes(this.username)) {
      this.storage.unvoteBug(bugId, this.username);
      this.showMessage("Vote Removed", "Your vote has been removed.");
    } else {
      this.storage.voteBug(bugId, this.username);
      this.showMessage("Voted", "Your vote has been recorded!");
    }
    this.showBugDetail(bugId);
  }
  showAddComment(bugId) {
    this.showTextInput("Add Comment", "", true, (content) => {
      if (content && content.trim()) {
        const isInternal = this.isSysop && content.startsWith("[INTERNAL]");
        const cleanContent = isInternal ? content.substring(10).trim() : content.trim();
        this.storage.addComment(bugId, {
          author: this.username,
          content: cleanContent,
          isInternal
        });
        const bug = this.storage.getBug(bugId);
        if (bug) {
          sendWebhook(this.storage, "comment", bug);
        }
      }
      this.showBugDetail(bugId);
    });
  }
  showEditBug(bugId) {
    const bug = this.storage.getBug(bugId);
    if (!bug)
      return;
    this.showTextInput("Edit Title", bug.title, false, (title) => {
      if (title && title.trim()) {
        this.storage.updateBug(bugId, { title: title.trim() });
        const updatedBug = this.storage.getBug(bugId);
        if (updatedBug) {
          sendWebhook(this.storage, "update", updatedBug);
        }
      }
      this.showBugDetail(bugId);
    });
  }
  showChangeStatus(bugId) {
    this.showSelector("Change Status", STATUSES.map((s) => s.label), (idx) => {
      if (idx !== -1) {
        this.storage.updateBug(bugId, { status: STATUSES[idx].value });
        const bug = this.storage.getBug(bugId);
        if (bug) {
          const event = bug.status === "closed" || bug.status === "fixed" ? "close" : "update";
          sendWebhook(this.storage, event, bug);
        }
      }
      this.showBugDetail(bugId);
    });
  }
  showAssignBug(bugId) {
    const bugs = this.storage.getBugs();
    const knownUsers = /* @__PURE__ */ new Set();
    bugs.forEach((b) => {
      if (b.reporter)
        knownUsers.add(b.reporter);
      if (b.assignee)
        knownUsers.add(b.assignee);
      b.comments.forEach((c) => {
        if (c.author)
          knownUsers.add(c.author);
      });
    });
    const userList = Array.from(knownUsers).sort();
    const options = [
      "(Unassign)",
      "(Enter custom username)",
      ...userList
    ];
    this.showSelector("Assign Bug To", options, (idx) => {
      if (idx === -1) {
        this.showBugDetail(bugId);
        return;
      }
      if (idx === 0) {
        this.storage.updateBug(bugId, { assignee: null });
        const bug = this.storage.getBug(bugId);
        if (bug)
          sendWebhook(this.storage, "update", bug);
        this.showMessage("Updated", "Bug unassigned.", () => this.showBugDetail(bugId));
      } else if (idx === 1) {
        this.showTextInput("Enter Username", "", false, (assignee) => {
          if (assignee && assignee.trim()) {
            this.storage.updateBug(bugId, { assignee: assignee.trim() });
            const bug = this.storage.getBug(bugId);
            if (bug)
              sendWebhook(this.storage, "update", bug);
            this.showMessage("Assigned", `Bug assigned to ${assignee.trim()}.`, () => this.showBugDetail(bugId));
          } else {
            this.showBugDetail(bugId);
          }
        });
      } else {
        const selectedUser = userList[idx - 2];
        this.storage.updateBug(bugId, { assignee: selectedUser });
        const bug = this.storage.getBug(bugId);
        if (bug)
          sendWebhook(this.storage, "update", bug);
        this.showMessage("Assigned", `Bug assigned to ${selectedUser}.`, () => this.showBugDetail(bugId));
      }
    });
  }
  confirmDeleteBug(bugId) {
    const bug = this.storage.getBug(bugId);
    if (!bug)
      return;
    this.showConfirm(`Delete Bug #${bugId}?`, `Are you sure you want to delete "${bug.title}"?`, (confirmed) => {
      if (confirmed) {
        this.storage.deleteBug(bugId);
        this.showMessage("Deleted", `Bug #${bugId} has been deleted.`, () => {
          this.showBugList();
        });
      } else {
        this.showBugDetail(bugId);
      }
    });
  }
  // ============================================================================
  // UI Helpers
  // ============================================================================
  showSelector(title, items, callback) {
    const previousFocus = this.screen.focused;
    setImmediate(() => {
      const previousView = this.currentView;
      this.currentView = "dialog";
      const backdrop = createBox({
        parent: this.screen,
        top: 0,
        left: 0,
        width: "100%",
        height: "100%",
        style: { bg: "black", transparent: true },
        focusable: false,
        clickable: true
      });
      const list = createList({
        parent: this.screen,
        top: "center",
        left: "center",
        width: 40,
        height: Math.min(items.length + 4, 15),
        border: { type: "line" },
        label: ` ${title} `,
        style: {
          fg: "white",
          bg: "black",
          border: { fg: "yellow" },
          selected: { fg: "black", bg: "yellow" }
        },
        items,
        keys: true,
        vi: true,
        mouse: true,
        grabKeys: true
        // Capture all key input
      });
      list.focus();
      const cleanup = () => {
        backdrop.detach();
        list.detach();
        this.currentView = previousView;
        if (previousFocus && typeof previousFocus.focus === "function") {
          previousFocus.focus();
        }
        this.screen.render();
      };
      list.once("select", (_item, idx) => {
        cleanup();
        callback(idx);
      });
      list.key(["escape"], () => {
        cleanup();
        callback(-1);
      });
      backdrop.on("click", () => {
        cleanup();
        callback(-1);
      });
      this.screen.render();
    });
  }
  showTextInput(title, defaultValue, multiline, callback) {
    const previousFocus = this.screen.focused;
    setImmediate(() => {
      const previousView = this.currentView;
      this.currentView = "dialog";
      const height = multiline ? 10 : 5;
      const backdrop = createBox({
        parent: this.screen,
        top: 0,
        left: 0,
        width: "100%",
        height: "100%",
        style: { bg: "black", transparent: true },
        focusable: false,
        clickable: true
      });
      const inputBox = createBox({
        parent: this.screen,
        top: "center",
        left: "center",
        width: 60,
        height: height + 4,
        border: { type: "line" },
        label: ` ${title} `,
        style: {
          fg: "white",
          bg: "black",
          border: { fg: "yellow" }
        },
        tags: true,
        focusable: false,
        mouse: false,
        clickable: false
      });
      const textbox = createTextbox({
        parent: inputBox,
        top: 1,
        left: 1,
        width: 56,
        height,
        style: {
          fg: "white",
          bg: "blue"
        },
        inputOnFocus: true,
        keys: true,
        mouse: true,
        grabKeys: true
        // Capture all key input while editing
      });
      textbox.setValue(defaultValue);
      textbox.focus();
      createBox({
        parent: inputBox,
        bottom: 0,
        left: 1,
        width: 56,
        height: 1,
        content: "{gray-fg}Enter=Submit | ESC=Cancel{/}",
        tags: true,
        style: { fg: "gray", bg: "black" },
        focusable: false,
        mouse: false,
        clickable: false
      });
      const cleanup = () => {
        backdrop.detach();
        inputBox.detach();
        this.currentView = previousView;
        if (previousFocus && typeof previousFocus.focus === "function") {
          previousFocus.focus();
        }
        this.screen.render();
      };
      textbox.on("submit", () => {
        const value = textbox.getValue();
        cleanup();
        callback(value);
      });
      textbox.key(["escape"], () => {
        cleanup();
        callback(null);
      });
      backdrop.on("click", () => {
        cleanup();
        callback(null);
      });
      this.screen.render();
    });
  }
  showMessage(title, message, callback) {
    const previousFocus = this.screen.focused;
    setImmediate(() => {
      const previousView = this.currentView;
      this.currentView = "dialog";
      const backdrop = createBox({
        parent: this.screen,
        top: 0,
        left: 0,
        width: "100%",
        height: "100%",
        style: { bg: "black", transparent: true },
        focusable: false,
        clickable: true
      });
      const msgBox = createBox({
        parent: this.screen,
        top: "center",
        left: "center",
        width: 50,
        height: 7,
        border: { type: "line" },
        label: ` ${title} `,
        style: {
          fg: "white",
          bg: "black",
          border: { fg: title === "Error" ? "red" : "green" }
        },
        content: `
${message}

{center}Press any key to continue{/center}`,
        tags: true,
        grabKeys: true
        // Capture all key input
      });
      msgBox.focus();
      const cleanup = () => {
        backdrop.detach();
        msgBox.detach();
        this.currentView = previousView;
        if (previousFocus && typeof previousFocus.focus === "function") {
          previousFocus.focus();
        }
        this.screen.render();
      };
      msgBox.once("keypress", () => {
        cleanup();
        if (callback)
          callback();
      });
      backdrop.on("click", () => {
        cleanup();
        if (callback)
          callback();
      });
      msgBox.on("click", () => {
        cleanup();
        if (callback)
          callback();
      });
      this.screen.render();
    });
  }
  showConfirm(title, message, callback) {
    setImmediate(() => {
      const previousView = this.currentView;
      this.currentView = "dialog";
      const backdrop = createBox({
        parent: this.screen,
        top: 0,
        left: 0,
        width: "100%",
        height: "100%",
        style: { bg: "black", transparent: true },
        focusable: false,
        clickable: true
      });
      const confirmBox = createBox({
        parent: this.screen,
        top: "center",
        left: "center",
        width: 50,
        height: 8,
        border: { type: "line" },
        label: ` ${title} `,
        style: {
          fg: "white",
          bg: "black",
          border: { fg: "yellow" }
        },
        content: `
${message}

{center}Y=Yes | N=No{/center}`,
        tags: true,
        grabKeys: true
        // Capture all key input
      });
      confirmBox.focus();
      const cleanup = () => {
        backdrop.detach();
        confirmBox.detach();
        this.currentView = previousView;
        this.screen.render();
      };
      confirmBox.key(["y", "Y"], () => {
        cleanup();
        callback(true);
      });
      confirmBox.key(["n", "N", "escape"], () => {
        cleanup();
        callback(false);
      });
      backdrop.on("click", () => {
        cleanup();
        callback(false);
      });
      this.screen.render();
    });
  }
  // ============================================================================
  // Cleanup
  // ============================================================================
  quit() {
    this.inputManager.disable();
    this.screen.destroy();
  }
};
async function createApp(session, mode) {
  const app = new BugTrackerApp(session);
  await app.run(mode);
}

// index.ts
var metadata = {
  name: "Bug Tracker",
  version: "1.0.0",
  description: "Comprehensive bug tracking and issue management system",
  author: "AmiExpress SDK",
  command: "BUGS"
};
var door = new ServerDoor(metadata);
door.onStart(async (ctx) => {
  const session = ctx;
  const args = session.params || [];
  const mode = args[0]?.toUpperCase();
  await createApp(session, mode);
});
var bug_tracker_default = door;
export {
  createApp,
  bug_tracker_default as default,
  metadata
};
//# sourceMappingURL=index.js.map
