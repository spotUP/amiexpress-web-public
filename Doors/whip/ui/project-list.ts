import {
  createBox,
  createList,
  createTextbox,
  createButton
} from '@amiexpress/bbs-door-sdk/utils/blessed-helpers';
import blessed from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import type { Screen } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import type { Project, ProjectType, ProjectStatus } from '../types/project';
import type { UserStats } from '../types/user';
import type { DataManager } from '../core/data-manager';
import type { AchievementManager } from '../core/achievements';
import { v4 as uuidv4 } from 'uuid';

const PROJECT_TYPES: ProjectType[] = ['demo', 'intro', 'musicdisk', 'graphics', 'music', 'code', 'tools'];

export async function showProjectList(
  screen: Screen,
  user: UserStats,
  dataManager: DataManager,
  achievementManager: AchievementManager,
  bbsApi?: any
): Promise<Project | null> {
  return new Promise(async (resolve) => {
    screen.program.enableMouse();
    screen.clearRegion(0, screen.width, 0, screen.height);
    screen.alloc();
    // Note: Removed 200ms artificial delay for better responsiveness

    let projects = await dataManager.loadProjects();
    let selectedIndex = 0;

    // Header
    const header = createBox({
      fixed: true,
      parent: screen,
      top: 0,
      left: 0,
      width: '100%',
      height: 2,
      content: `{center}{bold}{cyan-fg}ALL PROJECTS{/cyan-fg}{/bold}\n` +
               `{center}Manage your demo scene projects{/center}`,
      style: { fg: 'white', bg: 'black' }
    });

    // Project list container
    const listBox = createBox({
      fixed: true,
      parent: screen,
      top: 3,
      left: 2,
      width: screen.width - 4,
      height: screen.height - 7,
      border: { type: 'line' },
      label: ' Projects ',
      style: {
        border: { fg: 'cyan' },
        bg: 'black'
      }
    });

    const list = createList({
      parent: listBox,
      top: 0,
      left: 0,
      width: '100%',
      height: '100%',
      keys: true,
      vi: true,
      mouse: true,
      items: projects.length > 0
        ? projects.map(p => `{bold}${p.name}{/bold} - ${p.type} (${p.status})`)
        : ['{gray-fg}No projects yet. Press N to create one.{/gray-fg}'],
      style: {
        selected: { bg: 'cyan', fg: 'black' },
        item: { fg: 'white' },
        bg: 'black'
      }
    });

    // Instructions
    const footer = createBox({
      fixed: true,
      parent: screen,
      bottom: 0,
      left: 0,
      width: '100%',
      height: 1,
      content: `{center}[N] New  |  [E] Edit  |  [D] Delete  |  [Enter] Select  |  [Q] Back{/center}`,
      style: { fg: 'gray', bg: 'black' }
    });

    const cleanup = () => {
      screen.off('keypress', keyHandler);
      screen.remove(header);
      screen.remove(listBox);
      screen.remove(footer);
    };

    const keyHandler = (ch: any, key: any) => {
      (async () => {
        switch (key.name) {
        case 'n':
          await createProject(screen, user, dataManager, achievementManager, bbsApi);
          projects = await dataManager.loadProjects();
          list.setItems(projects.map(p => `{bold}${p.name}{/bold} - ${p.type} (${p.status})`));
          screen.render();
          break;

        case 'e':
          if (projects.length > 0) {
            await editProject(screen, projects[list.selected || 0], dataManager, bbsApi);
            projects = await dataManager.loadProjects();
            list.setItems(projects.map(p => `{bold}${p.name}{/bold} - ${p.type} (${p.status})`));
            screen.render();
          }
          break;

        case 'd':
          if (projects.length > 0) {
            const projectToDelete = projects[list.selected || 0];
            const confirmed = await confirmDelete(screen, projectToDelete.name);
            if (confirmed) {
              await dataManager.deleteProject(projectToDelete.id);

              // Emit event for deleted project
              if (bbsApi?.emitCustomEvent) {
                bbsApi.emitCustomEvent(
                  'project_deleted',
                  `Deleted project "${projectToDelete.name}"`,
                  { projectType: projectToDelete.type, projectId: projectToDelete.id }
                );
              }

              projects = await dataManager.loadProjects();
              list.setItems(projects.length > 0
                ? projects.map(p => `{bold}${p.name}{/bold} - ${p.type} (${p.status})`)
                : ['{gray-fg}No projects yet. Press N to create one.{/gray-fg}']);
              screen.render();
            }
          }
          break;

        case 'enter':
          if (projects.length > 0) {
            cleanup();
            resolve(projects[list.selected || 0]);
            return;
          }
          break;

        case 'q':
        case 'escape':
          cleanup();
          resolve(null);
          return;
        }
      })();
    };

    screen.on('keypress', keyHandler);
    list.focus();
    screen.render();
  });
}

async function createProject(
  screen: Screen,
  user: UserStats,
  dataManager: DataManager,
  achievementManager: AchievementManager,
  bbsApi?: any
): Promise<void> {
  const newProject: Project = {
    id: uuidv4(),
    name: '',
    type: 'demo',
    description: '',
    createdBy: user.userId,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    status: 'planning'
  };

  await showProjectEditor(screen, newProject, dataManager, true, bbsApi);
}

async function editProject(
  screen: Screen,
  project: Project,
  dataManager: DataManager,
  bbsApi?: any
): Promise<void> {
  await showProjectEditor(screen, project, dataManager, false, bbsApi);
}

async function showProjectEditor(
  screen: Screen,
  project: Project,
  dataManager: DataManager,
  isNew: boolean,
  bbsApi?: any
): Promise<void> {
  return new Promise((resolve) => {
    screen.program.enableMouse();

    // Modal container
    const modal = createBox({
      fixed: true,
      parent: screen,
      top: 'center',
      left: 'center',
      width: 70,
      height: 22,  // Increased from 20 for more comfortable spacing
      border: { type: 'line' },
      style: {
        border: { fg: 'yellow' },
        bg: 'black'
      },
      label: isNew ? ' New Project ' : ' Edit Project '
    });

    // Name field
    const nameLabel = createBox({
      fixed: true,
      parent: modal,
      top: 1,
      left: 2,
      width: '100%-4',
      height: 1,
      content: 'Project Name:',
      style: { fg: 'white', bg: 'black' }
    });

    const nameInput = createTextbox({
      parent: modal,
      top: 2,
      left: 2,
      width: '100%-4',
      height: 1,
      keys: true,
      mouse: true,
      inputOnFocus: true,
      value: project.name,
      style: {
        fg: 'white',
        bg: 'blue',
        focus: { bg: 'lightblue', fg: 'black' }
      }
    });

    // Type label
    const typeLabel = createBox({
      fixed: true,
      parent: modal,
      top: 4,
      left: 2,
      width: 30,
      height: 1,
      content: 'Type:',
      style: { fg: 'white', bg: 'black' }
    });

    // Type list
    const typeList = createList({
      parent: modal,
      top: 5,
      left: 2,
      width: 30,
      height: 7,
      border: { type: 'line' },
      style: {
        border: { fg: 'cyan' },
        selected: { bg: 'cyan', fg: 'black' },
        item: { fg: 'white' },
        bg: 'black'
      },
      keys: true,
      vi: true,
      mouse: true,
      items: PROJECT_TYPES,
      selected: PROJECT_TYPES.indexOf(project.type)
    });

    // Status label
    const statusLabel = createBox({
      fixed: true,
      parent: modal,
      top: 4,
      left: 35,
      width: 30,
      height: 1,
      content: 'Status:',
      style: { fg: 'white', bg: 'black' }
    });

    // Status list
    const statuses: ProjectStatus[] = ['planning', 'active', 'released'];
    const statusList = createList({
      parent: modal,
      top: 5,
      left: 35,
      width: 30,
      height: 7,
      border: { type: 'line' },
      style: {
        border: { fg: 'cyan' },
        selected: { bg: 'cyan', fg: 'black' },
        item: { fg: 'white' },
        bg: 'black'
      },
      keys: true,
      vi: true,
      mouse: true,
      items: statuses,
      selected: statuses.indexOf(project.status)
    });

    // Description label
    const descLabel = createBox({
      fixed: true,
      parent: modal,
      top: 13,
      left: 2,
      width: '100%-4',
      height: 1,
      content: 'Description (optional):',
      style: { fg: 'white', bg: 'black' }
    });

    const descInput = createTextbox({
      parent: modal,
      top: 14,
      left: 2,
      width: '100%-4',
      height: 1,
      keys: true,
      mouse: true,
      inputOnFocus: true,
      value: project.description,
      style: {
        fg: 'white',
        bg: 'blue',
        focus: { bg: 'lightblue', fg: 'black' }
      }
    });

    // Save button
    const saveBtn = createButton({
      parent: modal,
      bottom: 1,
      left: 15,
      width: 12,
      height: 3,
      content: ' Save ',
      align: 'center',
      keys: true,
      mouse: true,
      style: {
        fg: 'white',
        bg: 'green',
        focus: { bg: 'lightgreen', fg: 'black' },
        hover: { bg: 'lightgreen', fg: 'black' }
      }
    });

    // Cancel button
    const cancelBtn = createButton({
      parent: modal,
      bottom: 1,
      left: 40,
      width: 12,
      height: 3,
      content: ' Cancel ',
      align: 'center',
      keys: true,
      mouse: true,
      style: {
        fg: 'white',
        bg: 'red',
        focus: { bg: 'lightred', fg: 'black' },
        hover: { bg: 'lightred', fg: 'black' }
      }
    });

    const cleanup = () => {
      screen.off('keypress', keyHandler);
      screen.remove(modal);
      screen.render();
    };

    // Save handler
    const save = async () => {
      project.name = nameInput.getValue();
      project.type = PROJECT_TYPES[typeList.selected!] as ProjectType;
      project.status = statuses[statusList.selected!];
      project.description = descInput.getValue();

      if (!project.name.trim()) {
        const msg = blessed.message({
          parent: screen,
          top: 'center',
          left: 'center',
          width: 'shrink',
          height: 'shrink',
          padding: 2,
          border: { type: 'line' },
          style: {
            border: { fg: 'red' },
            bg: 'black'
          },
          label: ' Error '
        });

        msg.display('Project name cannot be empty!\n\nPress any key to continue.', () => {
          screen.remove(msg);
          screen.render();
        });

        return;
      }

      if (isNew) {
        await dataManager.addProject(project);

        // Emit event for new project
        if (bbsApi?.emitCustomEvent) {
          bbsApi.emitCustomEvent(
            'project_created',
            `Created new ${project.type} project "${project.name}"`,
            { projectType: project.type, projectId: project.id, status: project.status }
          );
        }
      } else {
        project.updatedAt = new Date().toISOString();
        await dataManager.updateProject(project);

        // Emit event for updated project
        if (bbsApi?.emitCustomEvent) {
          bbsApi.emitCustomEvent(
            'project_updated',
            `Updated project "${project.name}"`,
            { projectType: project.type, projectId: project.id, status: project.status }
          );
        }
      }

      cleanup();
      resolve();
    };

    saveBtn.on('press', () => {
      save();
    });

    cancelBtn.on('press', () => {
      cleanup();
      resolve();
    });

    // Key handler for ESC
    const keyHandler = (ch: any, key: any) => {
      if (key.name === 'escape') {
        cleanup();
        resolve();
      } else if (key.name === 'enter' && key.ctrl) {
        save();
      }
    };

    screen.on('keypress', keyHandler);

    // Focus name input initially
    nameInput.focus();
    screen.render();
  });
}

async function confirmDelete(screen: Screen, projectName: string): Promise<boolean> {
  return new Promise((resolve) => {
    const question = blessed.question({
      parent: screen,
      top: 'center',
      left: 'center',
      width: 60,
      height: 7,
      border: { type: 'line' },
      style: {
        border: { fg: 'red' },
        bg: 'black'
      },
      label: ' Confirm Delete '
    });

    question.ask(`Delete project "${projectName}"?\n\n(Y/N)`, (answer: boolean) => {
      screen.remove(question);
      screen.render();
      resolve(answer);
    });
  });
}
