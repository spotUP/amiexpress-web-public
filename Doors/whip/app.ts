import { createScreen, DoorInputManager } from '@amiexpress/bbs-door-sdk/utils/blessed-helpers';
import type { Screen } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import blessed from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import type { DoorSession, MenuSelection } from './types/session';
import type { UserStats } from './types/user';
import type { Project } from './types/project';
import { DataManager, getSharedDataManager } from './core/data-manager';
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
import { createProject } from './ui/project-editor';
import { showMyTasks } from './ui/my-tasks';
import { showMyProfile, normalizeDiscordName } from './ui/my-profile';
import { attachResponsiveMode } from './ui/responsive';
import type { TerminalModeSwitch } from '@amiexpress/bbs-door-sdk/utils/terminal-mode';
import { T, applyTheme } from './door-theme';
import { quickTaskProject, retireEmptyBacklog } from './core/quick-task';
import { DoorLoader } from '@amiexpress/bbs-door-sdk/utils/DoorLoader';

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
  // Menu picks on subpages stash their destination here; the screen
  // resolves itself right after, and the loop jumps instead of showing
  // the menu (ui/menu.ts).
  private pendingNav: MenuSelection | null = null;
  // Alt+Enter responsive switch (ui/responsive.ts). Created at startup
  // like livechat's - the call site runs in run(), and the proof is a
  // started door, never a grep.
  private terminalMode: TerminalModeSwitch | null = null;
  // Last project created or boarded, per session. Creating a project used
  // to leave the session nowhere, so the next Kanban opened Backlog (or a
  // picker) and a task made in a hurry "vanished" - it was in Backlog.
  private lastProjectId?: string;
  /** Settles when the screen is destroyed, so a board close ends run() even mid-menu. */
  readonly ended: Promise<void>;

  constructor(session: DoorSession) {
    this.session = session;

    // The board's theme, before any widget reads a colour from it.
    applyTheme(session.bbs);

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
      debugName: 'WHIP',
      // Ctrl+C and a Ctrl+K palette pick leave through the door's own quit.
      onClose: () => { void this.quit(); },
    });
    this.ended = new Promise<void>((resolve) => { this.screen.once('destroy', () => resolve()); });

    this.dataManager = getSharedDataManager();
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

    // Responsive switch: fixed 80 columns until the caller asks (Alt+Enter).
    this.terminalMode = attachResponsiveMode(this.session.bbs, this.screen, () => {
      this.screen.render();
    });

    /**
     * The two waits below are a database read and a party-calendar refresh
     * that can reach the network, and the caller was shown a cleared screen
     * for the length of both. The SDK's loader is the board's one answer to
     * that (sysop, 2026-09-14: "apply the door loader"), and this door
     * already declares PRELOADER=YES in its .info - it just had nothing
     * drawing one once the module was in.
     */
    const loader = new DoorLoader(this.screen);
    loader.show('Reading your stats...');
    this.screen.render();

    // Load/create user stats
    await this.loadUserStats();

    loader.update(60, 'Refreshing the party calendar...');
    // Refresh party calendar (with cache)
    await this.partyCalendar.refreshParties();
    loader.hide();
    this.screen.render();

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

    await retireEmptyBacklog(this.dataManager);
  }

  private async showMainMenu(): Promise<void> {
    while (!this.exited) {
      // A menu pick on any subpage lands here instead of the menu: the
      // screen resolved itself after stashing the destination.
      const selection = this.pendingNav ?? await showMainMenu(this.screen, this.currentUser, this.dataManager);
      this.pendingNav = null;

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
        case 'my-profile':
          await this.showMyProfile();
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
    // No Backlog any more (sysop, 2026-09-28: "it should be removed"): a quick
    // task opens on the project this session last used, or the first active
    // one, and the dialog's own Project picker moves it anywhere else.
    const projects = await this.dataManager.loadProjects();
    const project = quickTaskProject(projects, this.lastProjectId);
    if (!project) {
      this.showMessage('No projects yet. Create one first [N]');
      await this.sleep(2000);
      return;
    }

    // Silence on cancel: an ESC out of the dialog used to congratulate the
    // caller on a task that was never created (sysop, 2026-09-10).
    const created = await createTask(this.screen, project, this.currentUser, this.dataManager, this.bbsApi);
    if (!created) return;
    const home = projects.find(p => p.id === created.projectId) ?? project;
    this.lastProjectId = home.id;
    this.showMessage(`Task created in ${home.name}! View in Kanban [K]`);
    await this.sleep(2000);
  }

  private async showNewProject(): Promise<void> {
    const project = await createProject(this.screen, this.currentUser, this.dataManager, this.bbsApi);
    if (project) {
      this.lastProjectId = project.id;
      this.showMessage(`Project "${project.name}" created! Open it in Kanban [K]`);
      await this.sleep(2000);
    }
  }

  private async showProjectList(): Promise<void> {
    // Selecting a project opens its board - returning to the menu
    // instead is the dead end reported 2026-09-10.
    const selected = await showProjectList(
      this.screen,
      this.currentUser,
      this.dataManager,
      this.achievementManager,
      this.bbsApi,
      this.onNavigate
    );
    if (selected) {
      await this.showKanbanBoard(selected);
    }
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

    // Reopen where the session already was - a project just created, or a
    // board just left. Otherwise the picker, which defaults to Backlog.
    if (this.lastProjectId) {
      const last = projects.find(p => p.id === this.lastProjectId);
      if (last) {
        await this.showKanbanBoard(last);
        return;
      }
      this.lastProjectId = undefined;
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

  private onNavigate = (sel: MenuSelection): void => {
    this.pendingNav = sel;
  };

  private async showKanbanBoard(project: Project): Promise<void> {
    this.lastProjectId = project.id;
    await showKanbanBoard(
      this.screen,
      project,
      this.currentUser,
      this.dataManager,
      this.achievementManager,
      this.bbsApi,
      this.onNavigate
    );
  }

  private async showMyTasks(): Promise<void> {
    await showMyTasks(this.screen, this.currentUser, this.dataManager, this.achievementManager, this.bbsApi, this.onNavigate);
  };

  private async showMyProfile(): Promise<void> {
    const result = await showMyProfile(this.screen, this.currentUser);
    if (result === null) return;
    const name = normalizeDiscordName(result);
    const user = await this.dataManager.getUser(this.currentUser.userId);
    if (!user) return;
    if (name) user.discordName = name;
    else delete user.discordName;
    await this.dataManager.updateUser(user);
    this.currentUser = user;
  }

  private async showPartyTimeline(): Promise<void> {
    await showPartyTimeline(
      this.screen,
      this.currentUser,
      this.dataManager,
      this.partyCalendar,
      this.onNavigate
    );
  }

  private async showLeaderboard(): Promise<void> {
    await showLeaderboard(this.screen, this.currentUser, this.dataManager, this.onNavigate);
  }

  private async showAchievements(): Promise<void> {
    await showAchievements(this.screen, this.currentUser, this.dataManager, this.onNavigate);
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
        border: { fg: T.accentAlt },
        bg: T.ground
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

    // Put the board's 80 columns back before leaving.
    this.terminalMode?.dispose();
    this.terminalMode = null;
    this.inputManager.disable();
    this.screen.destroy();
    this.exited = true;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
