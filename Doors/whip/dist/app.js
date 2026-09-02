"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.WhipApp = void 0;
const blessed_helpers_1 = require("@amiexpress/bbs-door-sdk/utils/blessed-helpers");
const blessed_1 = __importDefault(require("@amiexpress/bbs-door-sdk/engines/ui/blessed"));
const data_manager_1 = require("./core/data-manager");
const achievements_1 = require("./core/achievements");
const party_calendar_1 = require("./core/party-calendar");
const gamification_1 = require("./core/gamification");
const main_menu_1 = require("./ui/main-menu");
const kanban_board_1 = require("./ui/kanban-board");
const project_list_1 = require("./ui/project-list");
const party_timeline_1 = require("./ui/party-timeline");
const leaderboard_1 = require("./ui/leaderboard");
const achievements_2 = require("./ui/achievements");
const task_editor_1 = require("./ui/task-editor");
const project_editor_1 = require("./ui/project-editor");
const my_tasks_1 = require("./ui/my-tasks");
const door_theme_1 = require("./door-theme");
class WhipApp {
    constructor(session) {
        this.exited = false;
        this.session = session;
        // The board's theme, before any widget reads a colour from it.
        (0, door_theme_1.applyTheme)(session.bbs);
        this.screen = (0, blessed_helpers_1.createScreen)(session.bbs, {
            title: 'WHIP v1.0 - Demo Scene Project Management',
            smartCSR: false,
            fastCSR: false,
            focusKeys: false,
        });
        this.inputManager = new blessed_helpers_1.DoorInputManager(session, this.screen, {
            enableGameMode: true,
            enableGrabKeys: true,
            enableMouse: true,
            debug: false,
            debugName: 'WHIP'
        });
        this.dataManager = new data_manager_1.DataManager();
        this.achievementManager = new achievements_1.AchievementManager(this.dataManager);
        this.partyCalendar = new party_calendar_1.PartyCalendar(this.dataManager);
        this.bbsApi = session.bbs;
    }
    async run() {
        // Clear screen
        this.screen.clearRegion(0, this.screen.width, 0, this.screen.height);
        this.screen.alloc();
        this.screen.render();
        await this.sleep(200);
        // Enable input
        this.inputManager.enable();
        // Load/create user stats
        await this.loadUserStats();
        // Refresh party calendar (with cache)
        await this.partyCalendar.refreshParties();
        // Show main menu and navigation loop
        await this.showMainMenu();
    }
    async loadUserStats() {
        const userId = this.session.user.id;
        const handle = this.session.user.username;
        let user = await this.dataManager.getUser(userId);
        if (!user) {
            user = await this.dataManager.createUser(userId, handle);
        }
        // Update last active
        user.lastActiveAt = new Date().toISOString();
        // Recalculate level based on points
        user.level = (0, gamification_1.calculateLevel)(user.points);
        await this.dataManager.updateUser(user);
        this.currentUser = user;
        // Ensure default "Backlog" project exists for quick tasks
        await this.ensureBacklogProject();
    }
    async ensureBacklogProject() {
        const projects = await this.dataManager.loadProjects();
        // Check if Backlog project already exists
        const backlogExists = projects.some(p => p.id === 'backlog');
        if (!backlogExists) {
            // Create default Backlog project
            await this.dataManager.addProject({
                id: 'backlog',
                name: 'Backlog',
                type: 'code',
                description: 'Default project for quick tasks',
                createdBy: this.currentUser.userId,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                status: 'active'
            });
            // Emit event for created Backlog project
            if (this.bbsApi?.emitCustomEvent) {
                this.bbsApi.emitCustomEvent('project_created', 'Created default "Backlog" project for quick tasks', {
                    projectType: 'code',
                    projectId: 'backlog',
                    status: 'active'
                });
            }
        }
    }
    async showMainMenu() {
        while (!this.exited) {
            const selection = await (0, main_menu_1.showMainMenu)(this.screen, this.currentUser, this.dataManager);
            switch (selection) {
                case 'quick-task':
                    await this.showQuickTask();
                    break;
                case 'new-project':
                    await this.showNewProject();
                    break;
                case 'view-projects':
                    await this.showProjectList();
                    break;
                case 'kanban':
                    await this.selectProjectForKanban();
                    break;
                case 'my-tasks':
                    await this.showMyTasks();
                    break;
                case 'parties':
                    await this.showPartyTimeline();
                    break;
                case 'leaderboard':
                    await this.showLeaderboard();
                    break;
                case 'achievements':
                    await this.showAchievements();
                    break;
                case 'quit':
                    await this.quit();
                    return;
            }
            // Reload user stats after each action
            await this.loadUserStats();
        }
    }
    async showQuickTask() {
        // Get or create Backlog project
        const projects = await this.dataManager.loadProjects();
        let backlogProject = projects.find(p => p.id === 'backlog');
        if (!backlogProject) {
            // Ensure backlog project exists (should always exist after loadUserStats)
            await this.ensureBacklogProject();
            const updatedProjects = await this.dataManager.loadProjects();
            backlogProject = updatedProjects.find(p => p.id === 'backlog');
        }
        if (backlogProject) {
            // Open task editor for new task in Backlog project
            await (0, task_editor_1.createTask)(this.screen, backlogProject, this.currentUser, this.dataManager, this.bbsApi);
            // Show success message
            this.showMessage('Task created! View in Kanban [K]');
            await this.sleep(2000);
        }
    }
    async showNewProject() {
        await (0, project_editor_1.createProject)(this.screen, this.currentUser, this.dataManager, this.bbsApi);
    }
    async showProjectList() {
        await (0, project_list_1.showProjectList)(this.screen, this.currentUser, this.dataManager, this.achievementManager, this.bbsApi);
    }
    async selectProjectForKanban() {
        const projects = await this.dataManager.loadProjects();
        if (projects.length === 0) {
            // Show message: no projects yet
            this.showMessage('No projects found. Create one first!');
            await this.sleep(2000);
            return;
        }
        // If only one project, use it
        if (projects.length === 1) {
            await this.showKanbanBoard(projects[0]);
            return;
        }
        // Otherwise, show project selection
        // For MVP, we'll show the project list and let user select
        const selectedProject = await (0, project_list_1.showProjectList)(this.screen, this.currentUser, this.dataManager, this.achievementManager, this.bbsApi);
        if (selectedProject) {
            await this.showKanbanBoard(selectedProject);
        }
    }
    async showKanbanBoard(project) {
        await (0, kanban_board_1.showKanbanBoard)(this.screen, project, this.currentUser, this.dataManager, this.achievementManager, this.bbsApi);
    }
    async showMyTasks() {
        await (0, my_tasks_1.showMyTasks)(this.screen, this.currentUser, this.dataManager, this.achievementManager, this.bbsApi);
    }
    async showPartyTimeline() {
        await (0, party_timeline_1.showPartyTimeline)(this.screen, this.currentUser, this.dataManager, this.partyCalendar);
    }
    async showLeaderboard() {
        await (0, leaderboard_1.showLeaderboard)(this.screen, this.currentUser, this.dataManager);
    }
    async showAchievements() {
        await (0, achievements_2.showAchievements)(this.screen, this.currentUser, this.dataManager);
    }
    showMessage(message) {
        // Create a temporary message box
        const msgBox = blessed_1.default.box({
            parent: this.screen,
            top: 'center',
            left: 'center',
            width: message.length + 4,
            height: 3,
            content: `{center}${message}{/center}`,
            tags: true,
            border: { type: 'line' },
            style: {
                border: { fg: door_theme_1.T.accentAlt },
                bg: door_theme_1.T.ground
            }
        });
        this.screen.render();
        // Auto-remove after 2 seconds
        setTimeout(() => {
            this.screen.remove(msgBox);
            this.screen.render();
        }, 2000);
    }
    async quit() {
        this.screen.clearRegion(0, this.screen.width, 0, this.screen.height);
        this.screen.alloc();
        this.screen.render();
        await this.sleep(200);
        this.inputManager.disable();
        this.screen.destroy();
        this.exited = true;
    }
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}
exports.WhipApp = WhipApp;
