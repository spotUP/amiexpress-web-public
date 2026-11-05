/**
 * Where a quick task goes now that there is no Backlog.
 *
 * Backlog was a project the door created on every start to catch quick
 * tasks; the sysop wanted it gone (2026-09-28: "i still see the backlog it
 * should be removed").
 */
import type { Project } from '../types/project';
import type { DataManager } from './data-manager';

/**
 * The project a quick task opens on: the one this session last used, or else
 * the first active project. The task dialog's Project picker moves it from
 * there. Null when there is no project to put it in.
 */
export function quickTaskProject(projects: readonly Project[], lastProjectId?: string): Project | null {
  const last = lastProjectId ? projects.find((p) => p.id === lastProjectId) : undefined;
  return last ?? projects.find((p) => p.status === 'active') ?? projects[0] ?? null;
}

/**
 * Remove the old Backlog project - but only while it holds no tasks.
 *
 * A board where somebody kept tasks in it keeps it, as an ordinary project
 * they can empty or rename: losing tasks is worse than seeing the name.
 */
export async function retireEmptyBacklog(dataManager: DataManager): Promise<boolean> {
  const projects = await dataManager.loadProjects();
  if (!projects.some((p) => p.id === 'backlog')) return false;
  const tasks = await dataManager.loadTasks();
  if (tasks.some((t) => t.projectId === 'backlog')) return false;
  await dataManager.deleteProject('backlog');
  return true;
}
