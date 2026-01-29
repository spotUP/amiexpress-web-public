import {
  createButton,
} from '@amiexpress/bbs-door-sdk/utils/blessed-helpers';
import blessed from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import type { Screen } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import type { Project, ProjectType, ProjectStatus } from '../types/project';
import type { Party } from '../types/party';
import type { UserStats } from '../types/user';
import type { DataManager } from '../core/data-manager';
import { v4 as uuidv4 } from 'uuid';

const PROJECT_TYPES: ProjectType[] = ['demo', 'intro', 'musicdisk', 'graphics', 'music', 'code', 'tools'];
const PROJECT_STATUSES: ProjectStatus[] = ['planning', 'active', 'released'];

export async function createProject(
  screen: Screen,
  user: UserStats,
  dataManager: DataManager,
  bbsApi?: any
): Promise<Project | null> {
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

  return showProjectEditor(screen, newProject, user, dataManager, true, bbsApi);
}

export async function editProject(
  screen: Screen,
  project: Project,
  user: UserStats,
  dataManager: DataManager,
  bbsApi?: any
): Promise<Project | null> {
  return showProjectEditor(screen, project, user, dataManager, false, bbsApi);
}

async function showProjectEditor(
  screen: Screen,
  project: Project,
  user: UserStats,
  dataManager: DataManager,
  isNew: boolean,
  bbsApi?: any
): Promise<Project | null> {
  return new Promise(async (resolve) => {
    screen.program.enableMouse();

    // Load parties for the party selection
    const parties = await dataManager.loadParties();
    const upcomingParties = parties
      .filter(p => new Date(p.date) >= new Date())
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    // Modal container
    const modal = blessed.box({
      parent: screen,
      top: 'center',
      left: 'center',
      width: 70,
      height: 24,
      border: { type: 'line' },
      style: {
        border: { fg: 'yellow' },
        bg: 'black'
      },
      label: isNew ? ' New Project ' : ' Edit Project ',
      tags: true,
    });

    // Name input with border (height 3 = border + content + border)
    const nameInput = blessed.textbox({
      parent: modal,
      top: 1,
      left: 1,
      right: 1,
      height: 3,
      border: { type: 'line' },
      label: ' Name ',
      keys: true,
      mouse: true,
      inputOnFocus: true,
      value: project.name,
      style: {
        fg: 'white',
        bg: 'black',
        border: { fg: 'cyan' },
      }
    });

    // Type list
    const typeList = blessed.list({
      parent: modal,
      top: 5,
      left: 1,
      width: '48%',
      height: 9,
      border: { type: 'line' },
      label: ' Type ',
      tags: true,
      keys: true,
      vi: true,
      mouse: true,
      focusable: true,
      items: PROJECT_TYPES,
      selected: PROJECT_TYPES.indexOf(project.type),
      style: {
        border: { fg: 'cyan' },
        selected: { bg: 'cyan', fg: 'black' },
        item: { fg: 'white', bg: 'black' },
        bg: 'black'
      },
    } as any);

    // Status list
    const statusList = blessed.list({
      parent: modal,
      top: 5,
      left: '50%',
      right: 1,
      height: 5,
      border: { type: 'line' },
      label: ' Status ',
      tags: true,
      keys: true,
      vi: true,
      mouse: true,
      focusable: true,
      items: PROJECT_STATUSES,
      selected: PROJECT_STATUSES.indexOf(project.status),
      style: {
        border: { fg: 'cyan' },
        selected: { bg: 'cyan', fg: 'black' },
        item: { fg: 'white', bg: 'black' },
        bg: 'black'
      },
    } as any);

    // Party list
    const partyOptions = ['(None)', ...upcomingParties.map(p => p.name.substring(0, 25))];
    const selectedPartyIndex = project.partyId
      ? upcomingParties.findIndex(p => p.id === project.partyId) + 1
      : 0;

    const partyList = blessed.list({
      parent: modal,
      top: 11,
      left: '50%',
      right: 1,
      height: 5,
      border: { type: 'line' },
      label: ' Target Party ',
      tags: true,
      keys: true,
      vi: true,
      mouse: true,
      focusable: true,
      items: partyOptions,
      selected: selectedPartyIndex,
      style: {
        border: { fg: 'cyan' },
        selected: { bg: 'cyan', fg: 'black' },
        item: { fg: 'white', bg: 'black' },
        bg: 'black'
      },
    } as any);

    // Description input with border
    const descInput = blessed.textbox({
      parent: modal,
      top: 15,
      left: 1,
      right: 1,
      height: 3,
      border: { type: 'line' },
      label: ' Description (optional) ',
      keys: true,
      mouse: true,
      inputOnFocus: true,
      value: project.description || '',
      style: {
        fg: 'white',
        bg: 'black',
        border: { fg: 'cyan' },
      }
    });

    // Buttons
    const saveBtn = createButton({
      parent: modal,
      top: 19,
      left: 17,
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

    const cancelBtn = createButton({
      parent: modal,
      top: 19,
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

    const save = async () => {
      project.name = nameInput.getValue();
      project.type = PROJECT_TYPES[typeList.selected!] as ProjectType;
      project.status = PROJECT_STATUSES[statusList.selected!] as ProjectStatus;
      project.description = descInput.getValue();

      const partyIndex = partyList.selected || 0;
      if (partyIndex === 0) {
        delete project.partyId;
      } else {
        project.partyId = upcomingParties[partyIndex - 1].id;
      }

      if (!project.name.trim()) {
        const msg = blessed.message({
          parent: screen,
          top: 'center',
          left: 'center',
          width: 'shrink',
          height: 'shrink',
          padding: 2,
          border: { type: 'line' },
          style: { border: { fg: 'red' }, bg: 'black' },
          label: ' Error '
        });
        msg.display('Project name cannot be empty!', () => {
          screen.remove(msg);
          screen.render();
        });
        return;
      }

      if (isNew) {
        await dataManager.addProject(project);
        if (bbsApi?.emitCustomEvent) {
          bbsApi.emitCustomEvent('project_created', `Created ${project.type} project "${project.name}"`, {
            projectId: project.id, projectName: project.name, projectType: project.type
          });
        }
      } else {
        project.updatedAt = new Date().toISOString();
        await dataManager.updateProject(project);
      }

      cleanup();
      resolve(project);
    };

    saveBtn.on('press', () => { save(); });
    cancelBtn.on('press', () => { cleanup(); resolve(null); });

    const keyHandler = (ch: any, key: any) => {
      if (key.name === 'escape') { cleanup(); resolve(null); }
      else if (key.name === 'enter' && key.ctrl) { save(); }
    };

    screen.on('keypress', keyHandler);
    nameInput.focus();
    screen.render();
  });
}
