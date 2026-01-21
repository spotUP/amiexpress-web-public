import { createScreen, DoorInputManager } from '@amiexpress/bbs-door-sdk/utils/blessed-helpers';
import type { Screen } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import blessed from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import type { DoorSession, MenuSelection } from './types/session';
import type { UserStats } from './types/user';
import type { Project } from './types/project';
import { DataManager } from './core/data-manager';
import { AchievementManager } from './core/achievements';
import { PartyCalendar } from './core/party-calendar';
import { calculateLevel } from './core/gamification';
import { showMainMenu } from './ui/main-menu';
import { showKanbanBoard } from './ui/kanban-board';
import { showProjectList } from './ui/project-list';
import { showPartyTimeline } from './ui/party-timeline';
import { showLeaderboard } from './ui/leaderboard';
import { showAchievements } from './ui/achievements';
import { createTask } from './ui/task-editor';

export class WhipApp {
  private screen: Screen;
  private session: DoorSession;
  private inputManager: DoorInputManager;
  private dataManager: DataManager;
  private achievementManager: AchievementManager;
  private partyCalendar: PartyCalendar;
  private currentUser!: UserStats;
  private exited = false;
  private bbsApi: any; // BBS API for event emission

  constructor(session: DoorSession) {
    this.session = session;

    this.screen = createScreen(session.bbs, {
      title: 'WHIP v1.0 - Demo Scene Project Management',
      smartCSR: false,
      fastCSR: false,
      focusKeys: false,
    });

    this.inputManager = new DoorInputManager(session, this.screen, {
      enableGameMode: true,
      enableGrabKeys: true,
      enableMouse: true,
      debug: false,
      debugName: 'WHIP'
    });

    this.dataManager = new DataManager();
    this.achievementManager = new AchievementManager(this.dataManager);
    this.partyCalendar = new PartyCalendar(this.dataManager);
    this.bbsApi = session.bbs;
  }

  async run(): Promise<void> {
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

  private async loadUserStats(): Promise<void> {
    const userId = this.session.user.id;
    const handle = this.session.user.username;

    let user = await this.dataManager.getUser(userId);

    if (!user) {
      user = await this.dataManager.createUser(userId, handle);
    }

    // Update last active
    user.lastActiveAt = new Date().toISOString();

    // Recalculate level based on points
    user.level = calculateLevel(user.points);

    await this.dataManager.updateUser(user);
    this.currentUser = user;

    // Ensure default "Backlog" project exists for quick tasks
    await this.ensureBacklogProject();
  }

  private async ensureBacklogProject(): Promise<void> {
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
        this.bbsApi.emitCustomEvent(
          'project_created',
          'Created default "Backlog" project for quick tasks',
          {
            projectType: 'code',
            projectId: 'backlog',
            status: 'active'
          }
        );
      }
    }
  }

  private async showMainMenu(): Promise<void> {
    while (!this.exited) {
      const selection = await showMainMenu(this.screen, this.currentUser, this.dataManager);

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

  private async showQuickTask(): Promise<void> {
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
      await createTask(
        this.screen,
        backlogProject,
        this.currentUser,
        this.dataManager,
        this.bbsApi
      );

      // Show success message
      this.showMessage('Task created! View in Kanban [K]');
      await this.sleep(2000);
    }
  }

  private async showNewProject(): Promise<void> {
    // For v1.0 MVP, we'll implement a simple project creation
    // This will be expanded in the project-list UI component
    await this.showProjectList();
  }

  private async showProjectList(): Promise<void> {
    await showProjectList(
      this.screen,
      this.currentUser,
      this.dataManager,
      this.achievementManager,
      this.bbsApi
    );
  }

  private async selectProjectForKanban(): Promise<void> {
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
    const selectedProject = await showProjectList(
      this.screen,
      this.currentUser,
      this.dataManager,
      this.achievementManager,
      this.bbsApi
    );

    if (selectedProject) {
      await this.showKanbanBoard(selectedProject);
    }
  }

  private async showKanbanBoard(project: Project): Promise<void> {
    await showKanbanBoard(
      this.screen,
      project,
      this.currentUser,
      this.dataManager,
      this.achievementManager,
      this.bbsApi
    );
  }

  private async showMyTasks(): Promise<void> {
    // Show tasks assigned to current user across all projects
    // For MVP, we'll use the project list to navigate
    await this.showProjectList();
  }

  private async showPartyTimeline(): Promise<void> {
    await showPartyTimeline(
      this.screen,
      this.currentUser,
      this.dataManager,
      this.partyCalendar
    );
  }

  private async showLeaderboard(): Promise<void> {
    await showLeaderboard(this.screen, this.currentUser, this.dataManager);
  }

  private async showAchievements(): Promise<void> {
    await showAchievements(this.screen, this.currentUser, this.dataManager);
  }

  private showMessage(message: string): void {
    // Create a temporary message box
    const msgBox = blessed.box({
      parent: this.screen,
      top: 'center',
      left: 'center',
      width: message.length + 4,
      height: 3,
      content: `{center}${message}{/center}`,
      tags: true,
      border: { type: 'line' },
      style: {
        border: { fg: 'yellow' },
        bg: 'black'
      }
    });

    this.screen.render();

    // Auto-remove after 2 seconds
    setTimeout(() => {
      this.screen.remove(msgBox);
      this.screen.render();
    }, 2000);
  }

  private async quit(): Promise<void> {
    this.screen.clearRegion(0, this.screen.width, 0, this.screen.height);
    this.screen.alloc();
    this.screen.render();
    await this.sleep(200);

    this.inputManager.disable();
    this.screen.destroy();
    this.exited = true;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
