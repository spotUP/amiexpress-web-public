"use strict";
/**
 * Bug Tracker - Comprehensive Bug Reporting & Tracking System
 *
 * A professional bug tracking door for BBS systems with:
 * - Arrow key navigation
 * - Category-based organization (System Commands, Doors, General)
 * - Detailed bug reports with attachments
 * - Filtering and search capabilities
 * - Sysop management interface
 * - Modern CLI UX with colors and progress indicators
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
const bbs_door_sdk_1 = require("@amiexpress/bbs-door-sdk");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
// Advanced modules
const input_manager_1 = require("./input-manager");
const ui_components_1 = require("./ui-components");
const templates_1 = require("./templates");
const auto_save_1 = require("./auto-save");
const smart_features_1 = require("./smart-features");
const gamification_1 = require("./gamification");
const webhook_1 = require("./webhook");
// ============================================================================
// TYPES & INTERFACES
// ============================================================================
var BugCategory;
(function (BugCategory) {
    BugCategory["SYSTEM_COMMANDS"] = "System Commands";
    BugCategory["DOORS"] = "Doors";
    BugCategory["GENERAL"] = "General System";
})(BugCategory || (BugCategory = {}));
var BugStatus;
(function (BugStatus) {
    BugStatus["NEW"] = "New";
    BugStatus["ACKNOWLEDGED"] = "Acknowledged";
    BugStatus["IN_PROGRESS"] = "In Progress";
    BugStatus["FIXED"] = "Fixed";
    BugStatus["WONT_FIX"] = "Won't Fix";
    BugStatus["DUPLICATE"] = "Duplicate";
})(BugStatus || (BugStatus = {}));
var BugPriority;
(function (BugPriority) {
    BugPriority["LOW"] = "Low";
    BugPriority["MEDIUM"] = "Medium";
    BugPriority["HIGH"] = "High";
    BugPriority["CRITICAL"] = "Critical";
})(BugPriority || (BugPriority = {}));
// ============================================================================
// MAIN BUG TRACKER CLASS
// ============================================================================
class BugTracker {
    constructor() {
        this.currentView = 'main';
        // Form state
        this.formData = {};
        this.formStep = 0;
        this.listOffset = 0;
        this.selectedIndex = 0;
        this.itemsPerPage = 10;
        this.currentDrafts = [];
        this.currentDuplicates = [];
        this.door = new bbs_door_sdk_1.Door({
            name: 'Bug Tracker',
            version: '1.0.0',
            author: 'AmiExpress SDK Team',
            description: 'Comprehensive Bug Reporting & Tracking System',
            minSecurity: 0
        });
        this.gfx = new bbs_door_sdk_1.GraphicsEngine({ width: 80, height: 24 });
        this.dataFile = path.join(__dirname, 'bugs.json');
        this.data = this.loadData();
        // Initialize advanced modules
        this.inputManager = new input_manager_1.InputManager(this.door, 0);
        this.uiComponents = new ui_components_1.UIComponents(this.door, 0);
        this.templateManager = new templates_1.TemplateManager();
        this.autoSaveManager = new auto_save_1.AutoSaveManager(path.join(__dirname, 'drafts.json'));
        this.smartFeatures = new smart_features_1.SmartFeatures();
        this.gamification = new gamification_1.GamificationSystem();
        this.webhooks = new webhook_1.WebhookManager();
        // Load persisted data
        this.gamification.load(path.join(__dirname, 'gamification.json'));
        this.webhooks.loadConfig(path.join(__dirname, 'webhooks.json'));
        this.setupEventHandlers();
    }
    // ==========================================================================
    // DATA PERSISTENCE
    // ==========================================================================
    loadData() {
        try {
            if (fs.existsSync(this.dataFile)) {
                const content = fs.readFileSync(this.dataFile, 'utf-8');
                return JSON.parse(content);
            }
        }
        catch (error) {
            console.error('Error loading data:', error);
        }
        return {
            bugs: [],
            nextId: 1
        };
    }
    saveData() {
        try {
            fs.writeFileSync(this.dataFile, JSON.stringify(this.data, null, 2), 'utf-8');
        }
        catch (error) {
            console.error('Error saving data:', error);
        }
    }
    // ==========================================================================
    // EVENT HANDLERS
    // ==========================================================================
    setupEventHandlers() {
        this.door.onConnect((user) => {
            this.user = user;
            this.showMainMenu();
        });
        this.door.onInput((user, key) => {
            this.handleInput(key.key);
        });
        this.door.onDisconnect(() => {
            this.saveData();
            this.gamification.save(path.join(__dirname, 'gamification.json'));
            this.webhooks.saveConfig(path.join(__dirname, 'webhooks.json'));
        });
    }
    handleInput(key) {
        // Pass input to UI components for toast management
        this.uiComponents.handleInput(key);
        switch (this.currentView) {
            case 'main':
                this.handleMainMenuInput(key);
                break;
            case 'template':
                this.handleTemplateSelectionInput(key);
                break;
            case 'create':
                this.handleCreateFormInput(key);
                break;
            case 'list':
                this.handleListInput(key);
                break;
            case 'view':
                this.handleViewInput(key);
                break;
            case 'filter':
                this.handleFilterInput(key);
                break;
            case 'manage':
                this.handleManageInput(key);
                break;
            case 'status-change':
                this.handleStatusChangeInput(key);
                break;
            case 'leaderboard':
                this.handleLeaderboardInput(key);
                break;
            case 'draft-recovery':
                this.handleDraftRecoveryInput(key);
                break;
            case 'duplicate-warning':
                this.handleDuplicateWarningInput(key);
                break;
        }
    }
    // ==========================================================================
    // MAIN MENU
    // ==========================================================================
    showMainMenu() {
        if (!this.user)
            return;
        this.currentView = 'main';
        this.gfx.clear(bbs_door_sdk_1.AnsiColor.Black);
        // Header with box drawing
        this.drawHeader('BUG TRACKER v1.0', 2);
        // Stats panel
        this.drawStatsPanel();
        // Menu options
        const menuY = 17;
        const isSysop = this.user.securityLevel >= 100;
        this.gfx.drawText(20, menuY, '┌──────────────────────────────────────┐', bbs_door_sdk_1.AnsiColor.Cyan);
        this.gfx.drawText(20, menuY + 1, '│                                      │', bbs_door_sdk_1.AnsiColor.Cyan);
        this.gfx.drawText(22, menuY + 1, '[N] Report New Bug', bbs_door_sdk_1.AnsiColor.Yellow);
        this.gfx.drawText(20, menuY + 2, '│                                      │', bbs_door_sdk_1.AnsiColor.Cyan);
        this.gfx.drawText(22, menuY + 2, '[V] View All Bugs', bbs_door_sdk_1.AnsiColor.Yellow);
        this.gfx.drawText(20, menuY + 3, '│                                      │', bbs_door_sdk_1.AnsiColor.Cyan);
        this.gfx.drawText(22, menuY + 3, '[F] Filter by Category', bbs_door_sdk_1.AnsiColor.Yellow);
        this.gfx.drawText(20, menuY + 4, '│                                      │', bbs_door_sdk_1.AnsiColor.Cyan);
        this.gfx.drawText(22, menuY + 4, '[S] Search Bugs', bbs_door_sdk_1.AnsiColor.Yellow);
        this.gfx.drawText(20, menuY + 5, '│                                      │', bbs_door_sdk_1.AnsiColor.Cyan);
        this.gfx.drawText(22, menuY + 5, '[L] Leaderboard', bbs_door_sdk_1.AnsiColor.Magenta);
        if (isSysop) {
            this.gfx.drawText(20, menuY + 6, '│                                      │', bbs_door_sdk_1.AnsiColor.Cyan);
            this.gfx.drawText(22, menuY + 6, '[M] Manage Bugs (Sysop)', bbs_door_sdk_1.AnsiColor.Red);
        }
        this.gfx.drawText(20, menuY + 7, '│                                      │', bbs_door_sdk_1.AnsiColor.Cyan);
        this.gfx.drawText(22, menuY + 7, '[Q] Quit', bbs_door_sdk_1.AnsiColor.White);
        this.gfx.drawText(20, menuY + 8, '└──────────────────────────────────────┘', bbs_door_sdk_1.AnsiColor.Cyan);
        this.door.sendAnsi(this.gfx.render(), this.user.id);
    }
    drawHeader(title, y) {
        const width = 76;
        const x = 2;
        this.gfx.drawText(x, y, '╔' + '═'.repeat(width) + '╗', bbs_door_sdk_1.AnsiColor.Cyan);
        this.gfx.drawText(x, y + 1, '║' + ' '.repeat(width) + '║', bbs_door_sdk_1.AnsiColor.Cyan);
        const titleX = x + Math.floor((width - title.length) / 2);
        this.gfx.drawText(titleX, y + 1, title, bbs_door_sdk_1.AnsiColor.Magenta);
        this.gfx.drawText(x, y + 2, '╚' + '═'.repeat(width) + '╝', bbs_door_sdk_1.AnsiColor.Cyan);
    }
    drawStatsPanel() {
        const newBugs = this.data.bugs.filter(b => b.status === BugStatus.NEW).length;
        const inProgress = this.data.bugs.filter(b => b.status === BugStatus.IN_PROGRESS).length;
        const fixed = this.data.bugs.filter(b => b.status === BugStatus.FIXED).length;
        const total = this.data.bugs.length;
        const y = 6;
        this.gfx.drawText(10, y, '╔══════════════════════════════════════════════════════════════╗', bbs_door_sdk_1.AnsiColor.White);
        this.gfx.drawText(10, y + 1, '║                      SYSTEM STATISTICS                       ║', bbs_door_sdk_1.AnsiColor.White);
        this.gfx.drawText(10, y + 2, '╠══════════════════════════════════════════════════════════════╣', bbs_door_sdk_1.AnsiColor.White);
        this.gfx.drawText(10, y + 3, `║  Total Bugs: ${String(total).padEnd(10)}  New: ${String(newBugs).padEnd(10)}  Fixed: ${String(fixed).padEnd(10)}  ║`, bbs_door_sdk_1.AnsiColor.Green);
        this.gfx.drawText(10, y + 4, `║  In Progress: ${String(inProgress).padEnd(47)}║`, bbs_door_sdk_1.AnsiColor.Yellow);
        // Add user gamification stats
        if (this.user) {
            const stats = this.gamification.getUserStats(this.user.id, this.user.name);
            const title = this.gamification.getUserTitle(this.user.id);
            const rank = this.gamification.getUserRank(this.user.id);
            const nextLevelPoints = this.gamification.getPointsForNextLevel(stats.level);
            const pointsToNext = nextLevelPoints - stats.points;
            this.gfx.drawText(10, y + 5, '╠══════════════════════════════════════════════════════════════╣', bbs_door_sdk_1.AnsiColor.White);
            this.gfx.drawText(10, y + 6, `║  ${title.padEnd(60)}║`, bbs_door_sdk_1.AnsiColor.Magenta);
            this.gfx.drawText(10, y + 7, `║  Level ${String(stats.level).padEnd(3)} | Points: ${String(stats.points).padEnd(6)} | Rank: #${String(rank).padEnd(27)}║`, bbs_door_sdk_1.AnsiColor.Cyan);
            this.gfx.drawText(10, y + 8, `║  ${String(pointsToNext)} pts to next level${' '.repeat(35)}║`, bbs_door_sdk_1.AnsiColor.Yellow);
        }
        this.gfx.drawText(10, y + 9, '╚══════════════════════════════════════════════════════════════╝', bbs_door_sdk_1.AnsiColor.White);
    }
    handleMainMenuInput(key) {
        const k = key.toLowerCase();
        if (k === 'n') {
            this.startBugReport();
        }
        else if (k === 'v') {
            this.showBugList();
        }
        else if (k === 'f') {
            this.showFilterMenu();
        }
        else if (k === 's') {
            this.showSearchPrompt();
        }
        else if (k === 'l') {
            this.showLeaderboard();
        }
        else if (k === 'm' && this.user && this.user.securityLevel >= 100) {
            this.showManagementMenu();
        }
        else if (k === 'q') {
            this.quit();
        }
    }
    // ==========================================================================
    // BUG REPORT CREATION
    // ==========================================================================
    startBugReport() {
        if (!this.user)
            return;
        // Check for drafts first
        const drafts = this.autoSaveManager.getUserDrafts(this.user.id);
        if (drafts.length > 0) {
            this.showDraftRecoveryPrompt(drafts);
            return;
        }
        // Show template selection
        this.showTemplateSelection();
    }
    showTemplateSelection() {
        if (!this.user)
            return;
        this.currentView = 'template';
        this.selectedIndex = 0;
        this.gfx.clear(bbs_door_sdk_1.AnsiColor.Black);
        this.drawHeader('SELECT BUG REPORT TEMPLATE', 2);
        const y = 6;
        this.gfx.drawText(5, y, 'Choose a template to speed up your report, or start from scratch:', bbs_door_sdk_1.AnsiColor.Green);
        this.gfx.drawText(5, y + 2, '┌──────────────────────────────────────────────────────────────────────┐', bbs_door_sdk_1.AnsiColor.Cyan);
        this.gfx.drawText(5, y + 3, '│  Use ↑↓ arrow keys to navigate  |  Press ENTER to select           │', bbs_door_sdk_1.AnsiColor.White);
        this.gfx.drawText(5, y + 4, '├──────────────────────────────────────────────────────────────────────┤', bbs_door_sdk_1.AnsiColor.Cyan);
        const templates = this.templateManager.getTemplates();
        const displayTemplates = [{ id: 'none', name: '[ No Template - Start from Scratch ]', description: 'Create a custom bug report' }, ...templates];
        const startIdx = Math.max(0, this.selectedIndex - 5);
        const endIdx = Math.min(displayTemplates.length, startIdx + 10);
        for (let i = startIdx; i < endIdx; i++) {
            const template = displayTemplates[i];
            const rowY = y + 5 + (i - startIdx);
            const selected = this.selectedIndex === i;
            const prefix = selected ? '►' : ' ';
            const color = selected ? bbs_door_sdk_1.AnsiColor.Yellow : bbs_door_sdk_1.AnsiColor.White;
            this.gfx.drawText(7, rowY, `${prefix} ${template.name.substring(0, 50)}`, color);
            if (selected && template.description) {
                this.gfx.drawText(10, rowY + 1, template.description.substring(0, 60), bbs_door_sdk_1.AnsiColor.Cyan);
            }
        }
        this.gfx.drawText(5, 21, '[ESC] Cancel', bbs_door_sdk_1.AnsiColor.Red);
        this.door.sendAnsi(this.gfx.render(), this.user.id);
    }
    handleTemplateSelectionInput(key) {
        if (key === 'Escape' || key === '\x1b') {
            this.showMainMenu();
            return;
        }
        const templates = this.templateManager.getTemplates();
        const displayTemplates = [{ id: 'none', name: '[ No Template ]' }, ...templates];
        if (key === 'ArrowUp') {
            this.selectedIndex = Math.max(0, this.selectedIndex - 1);
            this.showTemplateSelection();
        }
        else if (key === 'ArrowDown') {
            this.selectedIndex = Math.min(displayTemplates.length - 1, this.selectedIndex + 1);
            this.showTemplateSelection();
        }
        else if (key === 'Enter' || key === '\r') {
            if (this.selectedIndex === 0) {
                this.selectedTemplate = undefined;
            }
            else {
                this.selectedTemplate = displayTemplates[this.selectedIndex];
            }
            // Initialize form data
            this.formData = {
                reporter: this.user.name,
                reporterId: this.user.id,
                status: BugStatus.NEW,
                priority: BugPriority.MEDIUM,
                attachments: [],
                comments: []
            };
            // Apply template if selected
            if (this.selectedTemplate) {
                this.formData.description = this.selectedTemplate.descriptionTemplate || '';
                this.formData.stepsToReproduce = this.selectedTemplate.stepsTemplate || '';
                this.formData.expectedBehavior = this.selectedTemplate.expectedTemplate || '';
                this.formData.actualBehavior = this.selectedTemplate.actualTemplate || '';
                this.formData.tags = this.selectedTemplate.tags || [];
            }
            this.formStep = 0;
            this.selectedIndex = 0;
            this.currentView = 'create';
            this.showCategorySelection();
        }
    }
    showDraftRecoveryPrompt(drafts) {
        if (!this.user)
            return;
        this.currentView = 'draft-recovery';
        this.currentDrafts = drafts;
        this.selectedIndex = 0;
        this.gfx.clear(bbs_door_sdk_1.AnsiColor.Black);
        this.drawHeader('DRAFT RECOVERY', 2);
        const y = 8;
        this.gfx.drawText(10, y, `Found ${drafts.length} saved draft(s). Would you like to recover one?`, bbs_door_sdk_1.AnsiColor.Yellow);
        this.gfx.drawText(10, y + 2, '┌────────────────────────────────────────────────────────────┐', bbs_door_sdk_1.AnsiColor.Cyan);
        drafts.forEach((draft, idx) => {
            const rowY = y + 3 + idx;
            const date = new Date(draft.timestamp).toLocaleString();
            const selected = this.selectedIndex === idx;
            const prefix = selected ? '►' : ' ';
            const color = selected ? bbs_door_sdk_1.AnsiColor.Yellow : bbs_door_sdk_1.AnsiColor.White;
            this.gfx.drawText(12, rowY, `${prefix} Draft ${idx + 1} - ${date}`, color);
        });
        this.gfx.drawText(10, y + 3 + drafts.length, '└────────────────────────────────────────────────────────────┘', bbs_door_sdk_1.AnsiColor.Cyan);
        this.gfx.drawText(10, 20, '[↑↓] Navigate  [ENTER] Recover  [D] Delete  [N] New Report', bbs_door_sdk_1.AnsiColor.Cyan);
        this.gfx.drawText(10, 21, '[ESC] Cancel', bbs_door_sdk_1.AnsiColor.Red);
        this.door.sendAnsi(this.gfx.render(), this.user.id);
    }
    handleDraftRecoveryInput(key) {
        if (key === 'Escape' || key === '\x1b') {
            this.currentDrafts = [];
            this.showMainMenu();
            return;
        }
        if (key === 'ArrowUp') {
            this.selectedIndex = Math.max(0, this.selectedIndex - 1);
            this.showDraftRecoveryPrompt(this.currentDrafts);
        }
        else if (key === 'ArrowDown') {
            this.selectedIndex = Math.min(this.currentDrafts.length - 1, this.selectedIndex + 1);
            this.showDraftRecoveryPrompt(this.currentDrafts);
        }
        else if (key === 'Enter' || key === '\r') {
            // Recover selected draft
            const draft = this.currentDrafts[this.selectedIndex];
            this.formData = draft.data;
            this.formStep = draft.formStep;
            this.currentDraftId = draft.id;
            this.currentDrafts = [];
            // Continue from where user left off
            this.currentView = 'create';
            if (this.formStep === 0) {
                this.selectedIndex = 0;
                this.showCategorySelection();
            }
            else {
                this.collectFormInput();
            }
        }
        else if (key.toLowerCase() === 'd') {
            // Delete selected draft
            const draft = this.currentDrafts[this.selectedIndex];
            this.autoSaveManager.deleteDraft(draft.id);
            this.currentDrafts.splice(this.selectedIndex, 1);
            if (this.currentDrafts.length === 0) {
                this.uiComponents.showToast('All drafts deleted', ui_components_1.ToastType.INFO);
                setTimeout(() => this.showTemplateSelection(), 1000);
            }
            else {
                this.selectedIndex = Math.min(this.selectedIndex, this.currentDrafts.length - 1);
                this.uiComponents.showToast('Draft deleted', ui_components_1.ToastType.INFO);
                this.showDraftRecoveryPrompt(this.currentDrafts);
            }
        }
        else if (key.toLowerCase() === 'n') {
            // Start new report (ignore drafts)
            this.currentDrafts = [];
            this.showTemplateSelection();
        }
    }
    showCategorySelection() {
        if (!this.user)
            return;
        this.gfx.clear(bbs_door_sdk_1.AnsiColor.Black);
        this.drawHeader('STEP 1: SELECT CATEGORY', 2);
        const y = 8;
        this.gfx.drawText(15, y, '┌─────────────────────────────────────────────────┐', bbs_door_sdk_1.AnsiColor.Cyan);
        this.gfx.drawText(15, y + 1, '│  Use ↑↓ arrow keys to navigate                 │', bbs_door_sdk_1.AnsiColor.White);
        this.gfx.drawText(15, y + 2, '│  Press ENTER to select                          │', bbs_door_sdk_1.AnsiColor.White);
        this.gfx.drawText(15, y + 3, '├─────────────────────────────────────────────────┤', bbs_door_sdk_1.AnsiColor.Cyan);
        const categories = Object.values(BugCategory);
        categories.forEach((cat, idx) => {
            const selected = this.selectedIndex === idx;
            const prefix = selected ? '►' : ' ';
            const color = selected ? bbs_door_sdk_1.AnsiColor.Yellow : bbs_door_sdk_1.AnsiColor.White;
            this.gfx.drawText(17, y + 4 + idx, `${prefix} ${cat}`, color);
        });
        this.gfx.drawText(15, y + 4 + categories.length, '└─────────────────────────────────────────────────┘', bbs_door_sdk_1.AnsiColor.Cyan);
        this.gfx.drawText(15, 21, '[ESC] Cancel', bbs_door_sdk_1.AnsiColor.Red);
        this.door.sendAnsi(this.gfx.render(), this.user.id);
    }
    drawProgressBar(current, total) {
        const y = 6;
        const barWidth = 50;
        const progress = Math.floor((current / total) * barWidth);
        const percentage = Math.floor((current / total) * 100);
        this.gfx.drawText(15, y, 'Progress: ', bbs_door_sdk_1.AnsiColor.White);
        this.gfx.drawText(25, y, '[', bbs_door_sdk_1.AnsiColor.Cyan);
        this.gfx.drawText(26, y, '█'.repeat(progress), bbs_door_sdk_1.AnsiColor.Green);
        this.gfx.drawText(26 + progress, y, '░'.repeat(barWidth - progress), bbs_door_sdk_1.AnsiColor.White);
        this.gfx.drawText(26 + barWidth, y, ']', bbs_door_sdk_1.AnsiColor.Cyan);
        this.gfx.drawText(78 + barWidth, y, `${percentage}%`, bbs_door_sdk_1.AnsiColor.Yellow);
    }
    handleCreateFormInput(key) {
        if (key === 'Escape' || key === '\x1b') {
            // Stop auto-save
            if (this.currentDraftId) {
                this.autoSaveManager.stopAutoSave();
            }
            this.showMainMenu();
            return;
        }
        if (this.formStep === 0) {
            // Category selection
            const categories = Object.values(BugCategory);
            if (key === 'ArrowUp') {
                this.selectedIndex = Math.max(0, this.selectedIndex - 1);
                this.showCategorySelection();
            }
            else if (key === 'ArrowDown') {
                this.selectedIndex = Math.min(categories.length - 1, this.selectedIndex + 1);
                this.showCategorySelection();
            }
            else if (key === 'Enter' || key === '\r') {
                this.formData.category = categories[this.selectedIndex];
                this.formStep = 1;
                this.selectedIndex = 0;
                // Start auto-save
                if (this.user) {
                    this.currentDraftId = this.autoSaveManager.startAutoSave(this.user.id, this.user.name, () => this.formData, () => this.formStep);
                }
                this.collectFormInput();
            }
        }
        else if (this.formStep === 6) {
            // Priority selection
            const priorities = Object.values(BugPriority);
            if (key === 'ArrowUp') {
                this.selectedIndex = Math.max(0, this.selectedIndex - 1);
                this.showPrioritySelection();
            }
            else if (key === 'ArrowDown') {
                this.selectedIndex = Math.min(priorities.length - 1, this.selectedIndex + 1);
                this.showPrioritySelection();
            }
            else if (key === 'Enter' || key === '\r') {
                this.formData.priority = priorities[this.selectedIndex];
                this.checkForDuplicatesAndSubmit();
            }
        }
    }
    async collectFormInput() {
        if (!this.user)
            return;
        try {
            // Step 1: Title
            this.uiComponents.showLoadingSpinner('Preparing form...', 5, 10);
            const titleResult = await this.inputManager.getSingleLineInput('Enter a short, descriptive title for this bug:', 7, 12, { maxLength: 100, required: true });
            if (titleResult.canceled) {
                this.showMainMenu();
                return;
            }
            this.formData.title = titleResult.value;
            this.formStep = 2;
            // Step 2: Description
            const descResult = await this.inputManager.getMultiLineInput('Provide a detailed description of the bug:', 7, 12, { maxLines: 5 });
            if (descResult.canceled) {
                this.showMainMenu();
                return;
            }
            this.formData.description = descResult.value;
            this.formStep = 3;
            // Step 3: Steps to Reproduce
            const stepsResult = await this.inputManager.getMultiLineInput('List the steps to reproduce this bug:', 7, 12, { maxLines: 5 });
            if (stepsResult.canceled) {
                this.showMainMenu();
                return;
            }
            this.formData.stepsToReproduce = stepsResult.value;
            this.formStep = 4;
            // Step 4: Expected Behavior
            const expectedResult = await this.inputManager.getSingleLineInput('What should happen?', 7, 12, { maxLength: 200 });
            if (expectedResult.canceled) {
                this.showMainMenu();
                return;
            }
            this.formData.expectedBehavior = expectedResult.value;
            this.formStep = 5;
            // Step 5: Actual Behavior
            const actualResult = await this.inputManager.getSingleLineInput('What actually happened?', 7, 12, { maxLength: 200 });
            if (actualResult.canceled) {
                this.showMainMenu();
                return;
            }
            this.formData.actualBehavior = actualResult.value;
            this.formStep = 6;
            // Stop auto-save before priority selection
            this.autoSaveManager.stopAutoSave();
            // Step 6: Priority selection
            this.selectedIndex = Object.values(BugPriority).indexOf(this.formData.priority) || 1;
            this.showPrioritySelection();
        }
        catch (error) {
            console.error('Error collecting form input:', error);
            this.uiComponents.showToast('Error collecting input', ui_components_1.ToastType.ERROR);
            this.showMainMenu();
        }
    }
    checkForDuplicatesAndSubmit() {
        if (!this.user || !this.formData.title)
            return;
        // Show loading while checking
        this.uiComponents.showLoadingSpinner('Checking for duplicates...', 30, 10);
        // Check for potential duplicates
        const duplicates = this.smartFeatures.findDuplicates(this.formData, this.data.bugs, 0.6);
        if (duplicates.length > 0) {
            // Show duplicate warning
            this.showDuplicateWarning(duplicates);
        }
        else {
            this.submitBugReport();
        }
    }
    showDuplicateWarning(duplicates) {
        if (!this.user)
            return;
        this.currentView = 'duplicate-warning';
        this.currentDuplicates = duplicates;
        this.gfx.clear(bbs_door_sdk_1.AnsiColor.Black);
        this.drawHeader('POTENTIAL DUPLICATES FOUND', 2);
        const y = 6;
        this.gfx.drawText(5, y, 'Similar bug reports were found. Please review before submitting:', bbs_door_sdk_1.AnsiColor.Yellow);
        this.gfx.drawText(5, y + 2, '┌──────────────────────────────────────────────────────────────────────┐', bbs_door_sdk_1.AnsiColor.Cyan);
        duplicates.slice(0, 5).forEach((dup, idx) => {
            const rowY = y + 3 + idx * 2;
            const similarity = Math.round(dup.similarity * 100);
            this.gfx.drawText(7, rowY, `#${dup.bug.id}: ${dup.bug.title.substring(0, 50)}`, bbs_door_sdk_1.AnsiColor.White);
            this.gfx.drawText(7, rowY + 1, `Similarity: ${similarity}% | Status: ${dup.bug.status}`, bbs_door_sdk_1.AnsiColor.Cyan);
        });
        this.gfx.drawText(5, y + 15, '└──────────────────────────────────────────────────────────────────────┘', bbs_door_sdk_1.AnsiColor.Cyan);
        this.gfx.drawText(5, 20, '[Y] Submit anyway  [N] Cancel', bbs_door_sdk_1.AnsiColor.Green);
        this.door.sendAnsi(this.gfx.render(), this.user.id);
    }
    handleDuplicateWarningInput(key) {
        if (key.toLowerCase() === 'y') {
            this.currentDuplicates = [];
            this.submitBugReport();
        }
        else if (key.toLowerCase() === 'n' || key === 'Escape' || key === '\x1b') {
            this.currentDuplicates = [];
            this.uiComponents.showToast('Bug report cancelled', ui_components_1.ToastType.INFO);
            setTimeout(() => this.showMainMenu(), 1000);
        }
    }
    showPrioritySelection() {
        if (!this.user)
            return;
        this.gfx.clear(bbs_door_sdk_1.AnsiColor.Black);
        this.drawHeader('FINAL STEP: SELECT PRIORITY', 2);
        this.drawProgressBar(5, 5);
        const y = 10;
        this.gfx.drawText(15, y, 'Select bug priority:', bbs_door_sdk_1.AnsiColor.Green);
        this.gfx.drawText(15, y + 2, '┌─────────────────────────────────────┐', bbs_door_sdk_1.AnsiColor.Cyan);
        const priorities = Object.values(BugPriority);
        priorities.forEach((pri, idx) => {
            const selected = this.selectedIndex === idx;
            const prefix = selected ? '►' : ' ';
            let color = bbs_door_sdk_1.AnsiColor.White;
            if (selected) {
                if (pri === BugPriority.CRITICAL)
                    color = bbs_door_sdk_1.AnsiColor.Red;
                else if (pri === BugPriority.HIGH)
                    color = bbs_door_sdk_1.AnsiColor.Yellow;
                else if (pri === BugPriority.MEDIUM)
                    color = bbs_door_sdk_1.AnsiColor.Green;
                else
                    color = bbs_door_sdk_1.AnsiColor.Cyan;
            }
            this.gfx.drawText(17, y + 3 + idx, `${prefix} ${pri}`, color);
        });
        this.gfx.drawText(15, y + 3 + priorities.length, '└─────────────────────────────────────┘', bbs_door_sdk_1.AnsiColor.Cyan);
        this.gfx.drawText(15, 20, 'Press ENTER to submit bug report', bbs_door_sdk_1.AnsiColor.Green);
        this.gfx.drawText(15, 21, '[ESC] Cancel', bbs_door_sdk_1.AnsiColor.Red);
        this.door.sendAnsi(this.gfx.render(), this.user.id);
    }
    async submitBugReport() {
        if (!this.user || !this.formData.category || !this.formData.title) {
            this.uiComponents.showToast('Missing required bug report data', ui_components_1.ToastType.ERROR);
            this.showMainMenu();
            return;
        }
        try {
            const now = Date.now();
            const isCritical = this.formData.priority === BugPriority.CRITICAL;
            const bug = {
                id: this.data.nextId++,
                title: this.formData.title,
                category: this.formData.category,
                subcategory: this.formData.subcategory,
                description: this.formData.description || '',
                stepsToReproduce: this.formData.stepsToReproduce || '',
                expectedBehavior: this.formData.expectedBehavior || '',
                actualBehavior: this.formData.actualBehavior || '',
                priority: this.formData.priority || BugPriority.MEDIUM,
                status: BugStatus.NEW,
                reporter: this.user.name,
                reporterId: this.user.id,
                reportedAt: now,
                updatedAt: now,
                attachments: [],
                comments: [],
                tags: this.formData.tags || []
            };
            this.data.bugs.push(bug);
            this.saveData();
            // Delete draft if exists
            if (this.currentDraftId) {
                this.autoSaveManager.deleteDraft(this.currentDraftId);
                this.currentDraftId = undefined;
            }
            // Record bug report in gamification system
            this.gamification.recordBugReport(this.user.id, this.user.name, isCritical);
            const stats = this.gamification.getUserStats(this.user.id, this.user.name);
            // Send webhooks
            const webhookPayload = {
                id: bug.id,
                title: bug.title,
                category: bug.category,
                subcategory: bug.subcategory,
                priority: bug.priority,
                description: bug.description,
                reporter: bug.reporter,
                tags: bug.tags
            };
            this.webhooks.sendBugReport(webhookPayload).catch(err => {
                console.error('Webhook error:', err);
            });
            // Show success message with gamification info
            this.gfx.clear(bbs_door_sdk_1.AnsiColor.Black);
            this.drawHeader('SUCCESS!', 2);
            const y = 8;
            this.gfx.drawText(10, y, '╔════════════════════════════════════════════════════════════╗', bbs_door_sdk_1.AnsiColor.Green);
            this.gfx.drawText(10, y + 1, '║                                                            ║', bbs_door_sdk_1.AnsiColor.Green);
            this.gfx.drawText(10, y + 2, '║   * Bug report submitted successfully!                    ║', bbs_door_sdk_1.AnsiColor.Green);
            this.gfx.drawText(10, y + 3, '║                                                            ║', bbs_door_sdk_1.AnsiColor.Green);
            this.gfx.drawText(10, y + 4, `║   Bug ID: #${String(bug.id).padEnd(47)}║`, bbs_door_sdk_1.AnsiColor.Yellow);
            this.gfx.drawText(10, y + 5, `║   Priority: ${bug.priority.padEnd(45)}║`, bbs_door_sdk_1.AnsiColor.Cyan);
            this.gfx.drawText(10, y + 6, '║                                                            ║', bbs_door_sdk_1.AnsiColor.Green);
            this.gfx.drawText(10, y + 7, '╠════════════════════════════════════════════════════════════╣', bbs_door_sdk_1.AnsiColor.Green);
            this.gfx.drawText(10, y + 8, '║   REWARDS EARNED                                           ║', bbs_door_sdk_1.AnsiColor.Magenta);
            this.gfx.drawText(10, y + 9, '║                                                            ║', bbs_door_sdk_1.AnsiColor.Green);
            const pointsEarned = isCritical ? 50 : 10;
            this.gfx.drawText(10, y + 10, `║   + ${String(pointsEarned)} Points${' '.repeat(47 - String(pointsEarned).length)}║`, bbs_door_sdk_1.AnsiColor.Yellow);
            this.gfx.drawText(10, y + 11, `║   Level: ${String(stats.level).padEnd(48)}║`, bbs_door_sdk_1.AnsiColor.Cyan);
            this.gfx.drawText(10, y + 12, `║   Total Points: ${String(stats.points).padEnd(41)}║`, bbs_door_sdk_1.AnsiColor.Cyan);
            // Check for new achievements
            const newAchievements = this.gamification.getUserAchievements(this.user.id)
                .filter(a => a.unlockedAt && a.unlockedAt > now - 1000);
            if (newAchievements.length > 0) {
                this.gfx.drawText(10, y + 13, '║                                                            ║', bbs_door_sdk_1.AnsiColor.Green);
                this.gfx.drawText(10, y + 14, '║   NEW ACHIEVEMENT UNLOCKED!                                ║', bbs_door_sdk_1.AnsiColor.Magenta);
                newAchievements.forEach((ach, idx) => {
                    this.gfx.drawText(10, y + 15 + idx, `║   ${ach.icon} ${ach.name.padEnd(52)}║`, bbs_door_sdk_1.AnsiColor.Yellow);
                });
            }
            this.gfx.drawText(10, y + 16, '║                                                            ║', bbs_door_sdk_1.AnsiColor.Green);
            this.gfx.drawText(10, y + 17, '║   Thank you for your report!                               ║', bbs_door_sdk_1.AnsiColor.White);
            this.gfx.drawText(10, y + 18, '╚════════════════════════════════════════════════════════════╝', bbs_door_sdk_1.AnsiColor.Green);
            this.door.sendAnsi(this.gfx.render(), this.user.id);
            // Show toast notification
            this.uiComponents.showToast(`Bug #${bug.id} submitted! +${pointsEarned} pts`, ui_components_1.ToastType.SUCCESS);
            // Wait for key then return to main menu
            setTimeout(() => this.showMainMenu(), 3000);
        }
        catch (error) {
            console.error('Error submitting bug report:', error);
            this.uiComponents.showToast('Failed to submit bug report', ui_components_1.ToastType.ERROR);
            setTimeout(() => this.showMainMenu(), 2000);
        }
    }
    // ==========================================================================
    // BUG LIST VIEW
    // ==========================================================================
    showBugList(filter) {
        if (!this.user)
            return;
        this.currentView = 'list';
        this.listFilter = filter;
        let bugs = this.data.bugs;
        if (filter) {
            bugs = bugs.filter(b => b.category === filter);
        }
        this.gfx.clear(bbs_door_sdk_1.AnsiColor.Black);
        const title = filter ? `BUGS - ${filter}` : 'ALL BUGS';
        this.drawHeader(title, 1);
        if (bugs.length === 0) {
            this.gfx.drawText(25, 10, 'No bugs found!', bbs_door_sdk_1.AnsiColor.Yellow);
            this.gfx.drawText(20, 21, 'Press any key to return...', bbs_door_sdk_1.AnsiColor.Cyan);
            this.door.sendAnsi(this.gfx.render(), this.user.id);
            setTimeout(() => this.showMainMenu(), 1000);
            return;
        }
        // Header
        const y = 5;
        this.gfx.drawText(2, y, 'ID', bbs_door_sdk_1.AnsiColor.Cyan);
        this.gfx.drawText(8, y, 'Title', bbs_door_sdk_1.AnsiColor.Cyan);
        this.gfx.drawText(40, y, 'Category', bbs_door_sdk_1.AnsiColor.Cyan);
        this.gfx.drawText(58, y, 'Priority', bbs_door_sdk_1.AnsiColor.Cyan);
        this.gfx.drawText(70, y, 'Status', bbs_door_sdk_1.AnsiColor.Cyan);
        this.gfx.drawText(2, y + 1, '─'.repeat(78), bbs_door_sdk_1.AnsiColor.White);
        // List bugs
        const startIdx = this.listOffset;
        const endIdx = Math.min(startIdx + this.itemsPerPage, bugs.length);
        for (let i = startIdx; i < endIdx; i++) {
            const bug = bugs[i];
            const rowY = y + 2 + (i - startIdx);
            const isSelected = (i - startIdx) === this.selectedIndex;
            const color = isSelected ? bbs_door_sdk_1.AnsiColor.Yellow : bbs_door_sdk_1.AnsiColor.White;
            const prefix = isSelected ? '►' : ' ';
            this.gfx.drawText(1, rowY, prefix, bbs_door_sdk_1.AnsiColor.Yellow);
            this.gfx.drawText(2, rowY, `#${bug.id}`, color);
            this.gfx.drawText(8, rowY, bug.title.substring(0, 30), color);
            this.gfx.drawText(40, rowY, bug.category.substring(0, 16), color);
            // Priority with colors
            let priColor = bbs_door_sdk_1.AnsiColor.White;
            if (bug.priority === BugPriority.CRITICAL)
                priColor = bbs_door_sdk_1.AnsiColor.Red;
            else if (bug.priority === BugPriority.HIGH)
                priColor = bbs_door_sdk_1.AnsiColor.Yellow;
            else if (bug.priority === BugPriority.MEDIUM)
                priColor = bbs_door_sdk_1.AnsiColor.Green;
            else
                priColor = bbs_door_sdk_1.AnsiColor.Cyan;
            this.gfx.drawText(58, rowY, bug.priority, priColor);
            this.gfx.drawText(70, rowY, bug.status.substring(0, 8), color);
        }
        // Footer
        this.gfx.drawText(2, 19, `Showing ${startIdx + 1}-${endIdx} of ${bugs.length}`, bbs_door_sdk_1.AnsiColor.White);
        this.gfx.drawText(2, 21, '[↑↓] Navigate  [ENTER] View  [ESC] Back', bbs_door_sdk_1.AnsiColor.Cyan);
        if (bugs.length > this.itemsPerPage) {
            this.gfx.drawText(2, 22, '[PgUp/PgDn] Page', bbs_door_sdk_1.AnsiColor.Cyan);
        }
        this.door.sendAnsi(this.gfx.render(), this.user.id);
    }
    handleListInput(key) {
        if (key === 'Escape' || key === '\x1b') {
            this.selectedIndex = 0;
            this.listOffset = 0;
            this.showMainMenu();
            return;
        }
        let bugs = this.data.bugs;
        if (this.listFilter) {
            bugs = bugs.filter(b => b.category === this.listFilter);
        }
        if (key === 'ArrowUp') {
            if (this.selectedIndex > 0) {
                this.selectedIndex--;
            }
            else if (this.listOffset > 0) {
                this.listOffset--;
            }
            this.showBugList(this.listFilter);
        }
        else if (key === 'ArrowDown') {
            if (this.selectedIndex < this.itemsPerPage - 1 && (this.listOffset + this.selectedIndex) < bugs.length - 1) {
                this.selectedIndex++;
            }
            else if (this.listOffset + this.itemsPerPage < bugs.length) {
                this.listOffset++;
            }
            this.showBugList(this.listFilter);
        }
        else if (key === 'PageUp') {
            this.listOffset = Math.max(0, this.listOffset - this.itemsPerPage);
            this.showBugList(this.listFilter);
        }
        else if (key === 'PageDown') {
            this.listOffset = Math.min(bugs.length - this.itemsPerPage, this.listOffset + this.itemsPerPage);
            this.showBugList(this.listFilter);
        }
        else if (key === 'Enter' || key === '\r') {
            const bugIdx = this.listOffset + this.selectedIndex;
            if (bugIdx < bugs.length) {
                this.selectedBug = bugs[bugIdx];
                this.showBugDetail();
            }
        }
    }
    // ==========================================================================
    // BUG DETAIL VIEW
    // ==========================================================================
    showBugDetail() {
        if (!this.user || !this.selectedBug)
            return;
        this.currentView = 'view';
        this.gfx.clear(bbs_door_sdk_1.AnsiColor.Black);
        this.drawHeader(`BUG #${this.selectedBug.id}: ${this.selectedBug.title}`, 1);
        let y = 4;
        // Info section
        this.gfx.drawText(2, y, '╔════════════════════════════════════════════════════════════════════════════╗', bbs_door_sdk_1.AnsiColor.Cyan);
        this.gfx.drawText(2, y + 1, `║ Category: ${this.selectedBug.category.padEnd(63)}║`, bbs_door_sdk_1.AnsiColor.White);
        this.gfx.drawText(2, y + 2, `║ Priority: ${this.selectedBug.priority.padEnd(63)}║`, bbs_door_sdk_1.AnsiColor.Yellow);
        this.gfx.drawText(2, y + 3, `║ Status:   ${this.selectedBug.status.padEnd(63)}║`, bbs_door_sdk_1.AnsiColor.Green);
        this.gfx.drawText(2, y + 4, `║ Reporter: ${this.selectedBug.reporter.padEnd(63)}║`, bbs_door_sdk_1.AnsiColor.White);
        this.gfx.drawText(2, y + 5, '╚════════════════════════════════════════════════════════════════════════════╝', bbs_door_sdk_1.AnsiColor.Cyan);
        y += 7;
        // Description
        this.gfx.drawText(2, y, 'DESCRIPTION:', bbs_door_sdk_1.AnsiColor.Cyan);
        this.gfx.drawText(2, y + 1, this.selectedBug.description.substring(0, 76), bbs_door_sdk_1.AnsiColor.White);
        y += 3;
        // Expected vs Actual
        this.gfx.drawText(2, y, 'EXPECTED:', bbs_door_sdk_1.AnsiColor.Green);
        this.gfx.drawText(12, y, this.selectedBug.expectedBehavior.substring(0, 66), bbs_door_sdk_1.AnsiColor.White);
        this.gfx.drawText(2, y + 1, 'ACTUAL:', bbs_door_sdk_1.AnsiColor.Red);
        this.gfx.drawText(12, y + 1, this.selectedBug.actualBehavior.substring(0, 66), bbs_door_sdk_1.AnsiColor.White);
        // Footer
        const isSysop = this.user.securityLevel >= 100;
        if (isSysop) {
            this.gfx.drawText(2, 21, '[C] Add Comment  [S] Change Status  [ESC] Back', bbs_door_sdk_1.AnsiColor.Yellow);
        }
        else {
            this.gfx.drawText(2, 21, '[C] Add Comment  [ESC] Back', bbs_door_sdk_1.AnsiColor.Yellow);
        }
        this.door.sendAnsi(this.gfx.render(), this.user.id);
    }
    handleViewInput(key) {
        if (key === 'Escape' || key === '\x1b') {
            this.showBugList(this.listFilter);
        }
        else if (key.toLowerCase() === 'c') {
            this.addComment();
        }
        else if (key.toLowerCase() === 's' && this.user && this.user.securityLevel >= 100) {
            this.showStatusChangeMenu();
        }
    }
    async addComment() {
        if (!this.user || !this.selectedBug)
            return;
        const commentResult = await this.inputManager.getMultiLineInput('Add your comment:', 5, 10, { maxLines: 5, required: true });
        if (commentResult.canceled || !commentResult.value) {
            this.showBugDetail();
            return;
        }
        // Add comment to bug
        const comment = {
            author: this.user.name,
            authorId: this.user.id,
            text: commentResult.value,
            timestamp: Date.now()
        };
        this.selectedBug.comments.push(comment);
        this.selectedBug.updatedAt = Date.now();
        this.saveData();
        // Award points for commenting
        this.gamification.recordComment(this.user.id, this.user.name);
        // Show success toast
        this.uiComponents.showToast('Comment added! +2 pts', ui_components_1.ToastType.SUCCESS);
        // Refresh view
        setTimeout(() => this.showBugDetail(), 1000);
    }
    // ==========================================================================
    // FILTER MENU
    // ==========================================================================
    showFilterMenu() {
        if (!this.user)
            return;
        this.currentView = 'filter';
        this.selectedIndex = 0;
        this.gfx.clear(bbs_door_sdk_1.AnsiColor.Black);
        this.drawHeader('FILTER BUGS BY CATEGORY', 2);
        const y = 10;
        this.gfx.drawText(20, y, '┌────────────────────────────────────┐', bbs_door_sdk_1.AnsiColor.Cyan);
        const categories = Object.values(BugCategory);
        categories.forEach((cat, idx) => {
            const selected = this.selectedIndex === idx;
            const prefix = selected ? '►' : ' ';
            const color = selected ? bbs_door_sdk_1.AnsiColor.Yellow : bbs_door_sdk_1.AnsiColor.White;
            this.gfx.drawText(22, y + 1 + idx, `${prefix} ${cat}`, color);
        });
        this.gfx.drawText(20, y + 1 + categories.length, '└────────────────────────────────────┘', bbs_door_sdk_1.AnsiColor.Cyan);
        this.gfx.drawText(15, 21, '[↑↓] Navigate  [ENTER] Select  [ESC] Cancel', bbs_door_sdk_1.AnsiColor.Cyan);
        this.door.sendAnsi(this.gfx.render(), this.user.id);
    }
    handleFilterInput(key) {
        if (key === 'Escape' || key === '\x1b') {
            this.showMainMenu();
            return;
        }
        const categories = Object.values(BugCategory);
        if (key === 'ArrowUp') {
            this.selectedIndex = Math.max(0, this.selectedIndex - 1);
            this.showFilterMenu();
        }
        else if (key === 'ArrowDown') {
            this.selectedIndex = Math.min(categories.length - 1, this.selectedIndex + 1);
            this.showFilterMenu();
        }
        else if (key === 'Enter' || key === '\r') {
            this.showBugList(categories[this.selectedIndex]);
        }
    }
    // ==========================================================================
    // MANAGEMENT (SYSOP)
    // ==========================================================================
    showManagementMenu() {
        if (!this.user || this.user.securityLevel < 100)
            return;
        this.currentView = 'manage';
        this.gfx.clear(bbs_door_sdk_1.AnsiColor.Black);
        this.drawHeader('SYSOP MANAGEMENT', 2);
        const y = 10;
        this.gfx.drawText(20, y, '┌──────────────────────────────────────┐', bbs_door_sdk_1.AnsiColor.Red);
        this.gfx.drawText(20, y + 1, '│  [1] Change Bug Status               │', bbs_door_sdk_1.AnsiColor.Yellow);
        this.gfx.drawText(20, y + 2, '│  [2] Bulk Status Update              │', bbs_door_sdk_1.AnsiColor.Yellow);
        this.gfx.drawText(20, y + 3, '│  [3] Delete Bug Report               │', bbs_door_sdk_1.AnsiColor.Yellow);
        this.gfx.drawText(20, y + 4, '│  [4] Export Bug Reports              │', bbs_door_sdk_1.AnsiColor.Yellow);
        this.gfx.drawText(20, y + 5, '│  [Q] Back to Main Menu               │', bbs_door_sdk_1.AnsiColor.White);
        this.gfx.drawText(20, y + 6, '└──────────────────────────────────────┘', bbs_door_sdk_1.AnsiColor.Red);
        this.gfx.drawText(15, 21, 'Select an option:', bbs_door_sdk_1.AnsiColor.Green);
        this.door.sendAnsi(this.gfx.render(), this.user.id);
    }
    handleManageInput(key) {
        if (key.toLowerCase() === 'q' || key === 'Escape' || key === '\x1b') {
            this.showMainMenu();
        }
        else if (key === '1') {
            this.showBugList(); // Let sysop select a bug to change status
        }
        else if (key === '2') {
            // Bulk update - simplified
            this.showMainMenu();
        }
        else if (key === '3') {
            // Delete - simplified
            this.showMainMenu();
        }
        else if (key === '4') {
            this.exportBugs();
        }
    }
    showStatusChangeMenu() {
        if (!this.user || !this.selectedBug)
            return;
        this.currentView = 'status-change';
        this.selectedIndex = Object.values(BugStatus).indexOf(this.selectedBug.status) || 0;
        this.gfx.clear(bbs_door_sdk_1.AnsiColor.Black);
        this.drawHeader('CHANGE BUG STATUS', 2);
        const y = 8;
        this.gfx.drawText(15, y, `Bug #${this.selectedBug.id}: ${this.selectedBug.title}`, bbs_door_sdk_1.AnsiColor.White);
        this.gfx.drawText(15, y + 1, `Current Status: ${this.selectedBug.status}`, bbs_door_sdk_1.AnsiColor.Yellow);
        this.gfx.drawText(15, y + 3, '┌──────────────────────────────────┐', bbs_door_sdk_1.AnsiColor.Cyan);
        const statuses = Object.values(BugStatus);
        statuses.forEach((status, idx) => {
            const selected = this.selectedIndex === idx;
            const prefix = selected ? '►' : ' ';
            const color = selected ? bbs_door_sdk_1.AnsiColor.Yellow : bbs_door_sdk_1.AnsiColor.White;
            this.gfx.drawText(17, y + 4 + idx, `${prefix} ${status}`, color);
        });
        this.gfx.drawText(15, y + 4 + statuses.length, '└──────────────────────────────────┘', bbs_door_sdk_1.AnsiColor.Cyan);
        this.gfx.drawText(15, 21, '[↑↓] Navigate  [ENTER] Update  [ESC] Cancel', bbs_door_sdk_1.AnsiColor.Cyan);
        this.door.sendAnsi(this.gfx.render(), this.user.id);
    }
    handleStatusChangeInput(key) {
        if (!this.selectedBug)
            return;
        if (key === 'Escape' || key === '\x1b') {
            this.showBugDetail();
            return;
        }
        const statuses = Object.values(BugStatus);
        if (key === 'ArrowUp') {
            this.selectedIndex = Math.max(0, this.selectedIndex - 1);
            this.showStatusChangeMenu();
        }
        else if (key === 'ArrowDown') {
            this.selectedIndex = Math.min(statuses.length - 1, this.selectedIndex + 1);
            this.showStatusChangeMenu();
        }
        else if (key === 'Enter' || key === '\r') {
            const oldStatus = this.selectedBug.status;
            const newStatus = statuses[this.selectedIndex];
            this.selectedBug.status = newStatus;
            this.selectedBug.updatedAt = Date.now();
            // If marked as Fixed, award points to reporter
            if (newStatus === BugStatus.FIXED && oldStatus !== BugStatus.FIXED) {
                this.gamification.recordBugFixed(this.selectedBug.reporterId);
                this.uiComponents.showToast(`Status updated! Reporter earned +20 pts`, ui_components_1.ToastType.SUCCESS);
            }
            else {
                this.uiComponents.showToast('Status updated!', ui_components_1.ToastType.SUCCESS);
            }
            this.saveData();
            setTimeout(() => this.showBugDetail(), 1000);
        }
    }
    handleLeaderboardInput(key) {
        if (key === 'Escape' || key === '\x1b') {
            this.currentView = 'main';
            this.showMainMenu();
        }
    }
    exportBugs() {
        if (!this.user)
            return;
        const filename = `bugs_export_${Date.now()}.json`;
        const filepath = path.join(__dirname, filename);
        try {
            fs.writeFileSync(filepath, JSON.stringify(this.data.bugs, null, 2));
            this.gfx.clear(bbs_door_sdk_1.AnsiColor.Black);
            this.drawHeader('EXPORT SUCCESSFUL', 2);
            const y = 10;
            this.gfx.drawText(15, y, '╔═══════════════════════════════════════════════╗', bbs_door_sdk_1.AnsiColor.Green);
            this.gfx.drawText(15, y + 1, '║  ✓ Bug reports exported successfully!        ║', bbs_door_sdk_1.AnsiColor.Green);
            this.gfx.drawText(15, y + 2, '║                                               ║', bbs_door_sdk_1.AnsiColor.Green);
            this.gfx.drawText(15, y + 3, `║  File: ${filename.padEnd(37)}║`, bbs_door_sdk_1.AnsiColor.Yellow);
            this.gfx.drawText(15, y + 4, '║                                               ║', bbs_door_sdk_1.AnsiColor.Green);
            this.gfx.drawText(15, y + 5, '╚═══════════════════════════════════════════════╝', bbs_door_sdk_1.AnsiColor.Green);
            this.gfx.drawText(20, 21, 'Press any key to continue...', bbs_door_sdk_1.AnsiColor.Cyan);
            this.door.sendAnsi(this.gfx.render(), this.user.id);
            setTimeout(() => this.showManagementMenu(), 2000);
        }
        catch (error) {
            console.error('Export error:', error);
            this.showManagementMenu();
        }
    }
    // ==========================================================================
    // LEADERBOARD
    // ==========================================================================
    showLeaderboard() {
        if (!this.user)
            return;
        this.currentView = 'leaderboard';
        this.gfx.clear(bbs_door_sdk_1.AnsiColor.Black);
        this.drawHeader('TOP CONTRIBUTORS LEADERBOARD', 2);
        const leaderboard = this.gamification.getLeaderboard(10);
        const userRank = this.gamification.getUserRank(this.user.id);
        const userStats = this.gamification.getUserStats(this.user.id, this.user.name);
        const y = 6;
        this.gfx.drawText(5, y, '╔══════════════════════════════════════════════════════════════════════╗', bbs_door_sdk_1.AnsiColor.Cyan);
        this.gfx.drawText(5, y + 1, '║ Rank  Name                    Level  Points  Bugs  Title            ║', bbs_door_sdk_1.AnsiColor.Yellow);
        this.gfx.drawText(5, y + 2, '╠══════════════════════════════════════════════════════════════════════╣', bbs_door_sdk_1.AnsiColor.Cyan);
        leaderboard.forEach((stats, idx) => {
            const rank = idx + 1;
            const rowY = y + 3 + idx;
            const isCurrentUser = stats.userId === this.user.id;
            const color = isCurrentUser ? bbs_door_sdk_1.AnsiColor.Green : bbs_door_sdk_1.AnsiColor.White;
            const title = this.gamification.getUserTitle(stats.userId);
            const rankStr = String(rank).padEnd(6);
            const nameStr = stats.userName.substring(0, 20).padEnd(22);
            const levelStr = String(stats.level).padEnd(6);
            const pointsStr = String(stats.points).padEnd(8);
            const bugsStr = String(stats.bugsReported).padEnd(6);
            const titleStr = title.substring(0, 18).padEnd(18);
            this.gfx.drawText(5, rowY, `║ ${rankStr}${nameStr}${levelStr}${pointsStr}${bugsStr}${titleStr}║`, color);
        });
        const emptyRows = 10 - leaderboard.length;
        for (let i = 0; i < emptyRows; i++) {
            this.gfx.drawText(5, y + 3 + leaderboard.length + i, '║' + ' '.repeat(70) + '║', bbs_door_sdk_1.AnsiColor.Cyan);
        }
        this.gfx.drawText(5, y + 13, '╚══════════════════════════════════════════════════════════════════════╝', bbs_door_sdk_1.AnsiColor.Cyan);
        // Show user's stats
        this.gfx.drawText(5, y + 15, `Your Rank: #${userRank} | Level ${userStats.level} | ${userStats.points} Points`, bbs_door_sdk_1.AnsiColor.Magenta);
        this.gfx.drawText(5, y + 16, `Bugs Reported: ${userStats.bugsReported} | Fixed: ${userStats.bugsFixed}`, bbs_door_sdk_1.AnsiColor.Cyan);
        this.gfx.drawText(5, y + 17, `Title: ${this.gamification.getUserTitle(this.user.id)}`, bbs_door_sdk_1.AnsiColor.Yellow);
        this.gfx.drawText(5, 21, '[ESC] Back to Main Menu', bbs_door_sdk_1.AnsiColor.White);
        this.door.sendAnsi(this.gfx.render(), this.user.id);
    }
    // ==========================================================================
    // SEARCH
    // ==========================================================================
    async showSearchPrompt() {
        if (!this.user)
            return;
        this.gfx.clear(bbs_door_sdk_1.AnsiColor.Black);
        this.drawHeader('SEARCH BUGS', 2);
        const y = 8;
        this.gfx.drawText(10, y, 'Enter search terms:', bbs_door_sdk_1.AnsiColor.Green);
        const searchResult = await this.inputManager.getSingleLineInput('Search:', 10, y + 2, { maxLength: 50 });
        if (searchResult.canceled || !searchResult.value) {
            this.showMainMenu();
            return;
        }
        // Use fuzzy search
        const query = searchResult.value.toLowerCase();
        const searchResults = this.smartFeatures.fuzzySearch(query, this.data.bugs, 10);
        if (searchResults.length === 0) {
            this.uiComponents.showToast('No results found', ui_components_1.ToastType.WARNING);
            setTimeout(() => this.showMainMenu(), 2000);
            return;
        }
        // Show results (extract bugs from search results)
        const results = searchResults.map(r => r.bug);
        this.showSearchResults(results, query);
    }
    showSearchResults(bugs, query) {
        if (!this.user)
            return;
        this.currentView = 'list';
        this.listFilter = undefined;
        this.gfx.clear(bbs_door_sdk_1.AnsiColor.Black);
        const title = `SEARCH RESULTS FOR: "${query}"`;
        this.drawHeader(title, 1);
        // Header
        const y = 5;
        this.gfx.drawText(2, y, 'ID', bbs_door_sdk_1.AnsiColor.Cyan);
        this.gfx.drawText(8, y, 'Title', bbs_door_sdk_1.AnsiColor.Cyan);
        this.gfx.drawText(40, y, 'Category', bbs_door_sdk_1.AnsiColor.Cyan);
        this.gfx.drawText(58, y, 'Priority', bbs_door_sdk_1.AnsiColor.Cyan);
        this.gfx.drawText(70, y, 'Status', bbs_door_sdk_1.AnsiColor.Cyan);
        this.gfx.drawText(2, y + 1, '─'.repeat(78), bbs_door_sdk_1.AnsiColor.White);
        // List bugs
        const startIdx = this.listOffset;
        const endIdx = Math.min(startIdx + this.itemsPerPage, bugs.length);
        for (let i = startIdx; i < endIdx; i++) {
            const bug = bugs[i];
            const rowY = y + 2 + (i - startIdx);
            const isSelected = (i - startIdx) === this.selectedIndex;
            const color = isSelected ? bbs_door_sdk_1.AnsiColor.Yellow : bbs_door_sdk_1.AnsiColor.White;
            const prefix = isSelected ? '►' : ' ';
            this.gfx.drawText(1, rowY, prefix, bbs_door_sdk_1.AnsiColor.Yellow);
            this.gfx.drawText(2, rowY, `#${bug.id}`, color);
            this.gfx.drawText(8, rowY, bug.title.substring(0, 30), color);
            this.gfx.drawText(40, rowY, bug.category.substring(0, 16), color);
            // Priority with colors
            let priColor = bbs_door_sdk_1.AnsiColor.White;
            if (bug.priority === BugPriority.CRITICAL)
                priColor = bbs_door_sdk_1.AnsiColor.Red;
            else if (bug.priority === BugPriority.HIGH)
                priColor = bbs_door_sdk_1.AnsiColor.Yellow;
            else if (bug.priority === BugPriority.MEDIUM)
                priColor = bbs_door_sdk_1.AnsiColor.Green;
            else
                priColor = bbs_door_sdk_1.AnsiColor.Cyan;
            this.gfx.drawText(58, rowY, bug.priority, priColor);
            this.gfx.drawText(70, rowY, bug.status.substring(0, 8), color);
        }
        // Footer
        this.gfx.drawText(2, 19, `Showing ${startIdx + 1}-${endIdx} of ${bugs.length} results`, bbs_door_sdk_1.AnsiColor.White);
        this.gfx.drawText(2, 21, '[↑↓] Navigate  [ENTER] View  [ESC] Back', bbs_door_sdk_1.AnsiColor.Cyan);
        this.door.sendAnsi(this.gfx.render(), this.user.id);
    }
    // ==========================================================================
    // UTILITIES
    // ==========================================================================
    quit() {
        if (this.user) {
            this.door.disconnect(this.user.id);
        }
    }
    start() {
        this.door.start();
    }
}
// ============================================================================
// START THE DOOR
// ============================================================================
const bugTracker = new BugTracker();
bugTracker.start();
