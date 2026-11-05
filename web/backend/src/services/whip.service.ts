import * as path from 'path';
import { randomUUID } from 'crypto';
import { boardRoot } from '../utils/board-root.util';

/**
 * WhipService (WHIP mirror bot).
 *
 * Owns WHIP data access for everything that is not the door itself. Three
 * deliberately boring decisions:
 *
 * 1. The door's DataManager is loaded with a runtime require() of the
 *    door's committed dist/, never a static import. A static import of
 *    door source breaks `tsc -p tsconfig.build.json` (rootDir is src) and
 *    with it the Docker image build; the Dockerfile's own comments bless
 *    runtime require() for exactly this.
 * 2. Reads AND writes go through the door's getSharedDataManager() - the
 *    same module instance the door itself uses (same resolved dist file,
 *    same process), so there is exactly one cache. Every mutation runs
 *    serialized through the door's runExclusive: whole-file JSON with no
 *    locking is only safe as last-writer-wins, and serialization makes the
 *    last writer the one that read last.
 * 3. Completion mirrors ui/kanban-board.ts moveTask exactly (points,
 *    completedAt, level, achievements, events) - the bot's completions are
 *    indistinguishable from the door's, including LiveChat and webhooks.
 */

export interface WhipProjectSummary {
  id: string;
  name: string;
  type: string;
  status: string;
  description: string;
  partyId?: string;
  taskCounts: { total: number; done: number };
}

export interface WhipTask {
  id: string;
  projectId: string;
  title: string;
  category: string;
  status: string;
  priority: string;
  assignedTo?: string;
  points: number;
  description: string;
}

export interface WhipLeaderboardEntry {
  userId: string;
  handle: string;
  points: number;
  level: string;
  rank: number;
  tasksCompleted: number;
  achievements: string[];
}

export interface WhipAchievements {
  userId: string;
  handle: string;
  unlocked: Array<{ id: string; name: string; points: number }>;
  locked: Array<{ id: string; name: string; points: number }>;
  totalPoints: number;
}

export interface WhipUserTasks {
  userId: string;
  handle: string;
  tasks: WhipTask[];
}

function doorDistDir(): string {
  // WHIP_DOOR_DIST_DIR is the test seam: points the service at a fixture
  // door tree instead of the board's.
  if (process.env.WHIP_DOOR_DIST_DIR) return process.env.WHIP_DOOR_DIST_DIR;
  const bbsRoot = boardRoot();
  return path.join(bbsRoot, 'Doors', 'whip', 'dist');
}

interface DoorModules {
  getSharedDataManager(baseDir?: string): any;
  AchievementManager: new (dm: any) => any;
  calculateLevel(points: number): string;
}

let doorDataModules: { getSharedDataManager(baseDir?: string): any } | null = null;
let doorFullModules: DoorModules | null = null;

function doorData(): { getSharedDataManager(baseDir?: string): any } {
  if (!doorDataModules) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const dm = require(path.join(doorDistDir(), 'core', 'data-manager.js'));
    doorDataModules = { getSharedDataManager: dm.getSharedDataManager };
  }
  return doorDataModules;
}

function doors(): DoorModules {
  if (!doorFullModules) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const ach = require(path.join(doorDistDir(), 'core', 'achievements.js'));
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const gam = require(path.join(doorDistDir(), 'core', 'gamification.js'));
    doorFullModules = {
      getSharedDataManager: doorData().getSharedDataManager,
      AchievementManager: ach.AchievementManager,
      calculateLevel: gam.calculateLevel,
    };
  }
  return doorFullModules;
}

/** The one DataManager for this process. WHIP_STORAGE_BASE isolates tests. */
function sharedDm(): any {
  return doorData().getSharedDataManager(process.env.WHIP_STORAGE_BASE || undefined);
}

export interface WhipActor {
  userId: string;
  username: string;
  gdprConsented: boolean;
}

function announce(actor: WhipActor, eventType: string, message: string, data?: Record<string, any>): void {
  try {
    // Same bus the door's own bbs.emitCustomEvent feeds: LiveChat shows it
    // and the sysop's webhooks fire from it. nodeId 0 = it happened outside
    // any BBS node session (Discord).
    const { emitCustomDoorEvent } = require('./bbs-event-emitter');
    emitCustomDoorEvent({
      username: actor.username,
      userId: actor.userId,
      gdprConsented: actor.gdprConsented,
      nodeId: 0,
      doorName: 'WHIP',
      eventType,
      message,
      data,
      timestamp: Date.now(),
    });
  } catch (err) {
    console.error('[WhipService] Failed to announce event:', err);
  }
}

// Validation mirrors Doors/whip (project-editor, task-editor, kanban): the
// door is the source of truth, these are the API's guardrails.
const PROJECT_TYPES = ['demo', 'intro', 'musicdisk', 'graphics', 'music', 'code', 'tools'];
const PROJECT_STATUSES = ['planning', 'active', 'released'];
const TASK_STATUSES = ['todo', 'in-progress', 'testing', 'done'];
const TASK_CATEGORIES = ['code', 'music', 'gfx', 'design', 'effects', 'engine', '3d', 'bug'];
const TASK_PRIORITIES = ['lamer', 'scener', 'elite', 'legend'];

export class WhipWriteError extends Error {
  constructor(
    message: string,
    public statusCode = 400
  ) {
    super(message);
  }
}

function requireIn(value: unknown, allowed: string[], field: string): string {
  if (typeof value !== 'string' || !allowed.includes(value)) {
    throw new WhipWriteError(`${field} must be one of: ${allowed.join(', ')}`);
  }
  return value;
}

/**
 * Mirror of app.ts loadUserStats: the door creates zeroed WHIP stats on
 * first entry, so every door-side write finds a user record. Bot writes
 * must ensure the same, or completions silently award nothing (points,
 * achievements) to BBS users who never opened the door.
 */
async function ensureWhipUser(dm: any, actor: WhipActor): Promise<any> {
  const existing = await dm.getUser(actor.userId);
  if (existing) return existing;
  return dm.createUser(actor.userId, actor.username);
}

class WhipService {
  async listProjects(): Promise<WhipProjectSummary[]> {
    const dm = sharedDm();
    const [projects, tasks] = await Promise.all([dm.loadProjects(), dm.loadTasks()]);
    return projects.map((p: any) => {
      const mine = tasks.filter((t: any) => t.projectId === p.id);
      return {
        id: p.id,
        name: p.name,
        type: p.type,
        status: p.status,
        description: p.description ?? '',
        partyId: p.partyId,
        taskCounts: { total: mine.length, done: mine.filter((t: any) => t.status === 'done').length },
      };
    });
  }

  async listTasks(projectId: string): Promise<WhipTask[]> {
    const dm = sharedDm();
    return dm.getTasksForProject(projectId);
  }

  async getTask(id: string): Promise<WhipTask | null> {
    const dm = sharedDm();
    return (await dm.getTask(id)) ?? null;
  }

  async listAllTasks(): Promise<Array<WhipTask & { projectName: string }>> {
    const dm = sharedDm();
    const [tasks, projects] = await Promise.all([dm.loadTasks(), dm.loadProjects()]);
    const names = new Map(projects.map((p: any) => [p.id, p.name]));
    return tasks.map((t: any) => ({ ...t, projectName: names.get(t.projectId) ?? t.projectId }));
  }

  async listUserTasks(userId: string): Promise<WhipUserTasks> {
    const dm = sharedDm();
    const [tasks, user] = await Promise.all([dm.getTasksForUser(userId), dm.getUser(userId)]);
    return { userId, handle: user?.handle ?? userId, tasks };
  }

  async leaderboard(): Promise<WhipLeaderboardEntry[]> {
    const dm = sharedDm();
    const users = await dm.loadUsers();
    const sorted = Object.values(users).sort((a: any, b: any) => b.points - a.points);
    return sorted.map((u: any, i: number) => ({
      userId: u.userId,
      handle: u.handle,
      points: u.points,
      level: u.level,
      rank: i + 1,
      tasksCompleted: u.tasksCompleted,
      achievements: u.achievements ?? [],
    }));
  }

  async achievementsFor(userId: string): Promise<WhipAchievements | null> {
    const dm = sharedDm();
    const [defs, user] = await Promise.all([dm.loadAchievements(), dm.getUser(userId)]);
    if (!user) return null;
    const have = new Set<string>(user.achievements ?? []);
    const unlocked: WhipAchievements['unlocked'] = [];
    const locked: WhipAchievements['locked'] = [];
    for (const a of Object.values(defs) as any[]) {
      const row = { id: a.id, name: a.name, points: a.points };
      (have.has(a.id) ? unlocked : locked).push(row);
    }
    const totalPoints = unlocked.reduce((sum, a) => sum + a.points, 0);
    return { userId, handle: user.handle ?? userId, unlocked, locked, totalPoints };
  }

  async listParties(): Promise<any[]> {
    const dm = sharedDm();
    return dm.loadParties();
  }

  async listUsers(): Promise<Array<{ userId: string; handle: string; discordName?: string }>> {
    const dm = sharedDm();
    const users = await dm.loadUsers();
    return Object.values(users).map((u: any) => ({
      userId: u.userId, handle: u.handle,
      ...(typeof u.discordName === 'string' && u.discordName ? { discordName: u.discordName } : {}),
    }));
  }

  /**
   * The Discord handle a user claims in the WHIP door ("my Discord name").
   * Empty clears it. The door writes through here too - one writer, the
   * DataManager under its exclusive lock.
   */
  async setDiscordName(userId: string, discordName: string): Promise<{ userId: string; handle: string; discordName?: string }> {
    const name = String(discordName ?? '').trim().slice(0, 32);
    const dm = sharedDm();
    const users = await dm.loadUsers();
    const user = users[userId];
    if (!user) throw new WhipWriteError(`Unknown user ${userId}`);
    if (name) user.discordName = name;
    else delete user.discordName;
    await dm.updateUser(user);
    return { userId: user.userId, handle: user.handle, ...(name ? { discordName: name } : {}) };
  }

  /**
   * Ensure WHIP stats exist, mirroring the door's first-entry creation.
   * Called on /link so a freshly linked account never hits "Unknown user"
   * on reads; harmless when stats already exist.
   */
  async ensureUser(userId: string, username: string): Promise<void> {
    const dm = sharedDm();
    await ensureWhipUser(dm, { userId, username, gdprConsented: false });
  }

  // ---- Writes (bot Phase 2). Every mutation runs serialized through the
  // shared DataManager; events mirror the door's own wording so LiveChat
  // and webhooks cannot tell door and bot apart. ----

  async createProject(
    input: { name: string; type: string; status?: string; description?: string; partyId?: string },
    actor: WhipActor
  ): Promise<any> {
    const name = typeof input.name === 'string' ? input.name.trim() : '';
    if (!name) throw new WhipWriteError('Project name is required');
    const project = {
      id: randomUUID(),
      name,
      type: requireIn(input.type, PROJECT_TYPES, 'type'),
      status: input.status === undefined ? 'planning' : requireIn(input.status, PROJECT_STATUSES, 'status'),
      description: typeof input.description === 'string' ? input.description : '',
      partyId: input.partyId,
      createdBy: actor.userId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const dm = sharedDm();
    await dm.addProject(project);
    const user = await ensureWhipUser(dm, actor);
    user.projectsCreated = (user.projectsCreated ?? 0) + 1;
    await dm.updateUser(user);
    announce(actor, 'project_created', `Created ${project.type} project "${project.name}"`, {
      projectId: project.id,
      projectName: project.name,
      projectType: project.type,
    });
    return project;
  }

  async updateProject(
    id: string,
    patch: { name?: string; type?: string; status?: string; description?: string; partyId?: string | null },
    actor: WhipActor
  ): Promise<any> {
    const dm = sharedDm();
    const project = await dm.getProject(id);
    if (!project) throw new WhipWriteError('Unknown project', 404);
    if (patch.name !== undefined) {
      if (!patch.name.trim()) throw new WhipWriteError('Project name cannot be empty');
      project.name = patch.name.trim();
    }
    if (patch.type !== undefined) project.type = requireIn(patch.type, PROJECT_TYPES, 'type');
    if (patch.status !== undefined) project.status = requireIn(patch.status, PROJECT_STATUSES, 'status');
    if (patch.description !== undefined) project.description = patch.description;
    if (patch.partyId !== undefined) {
      if (patch.partyId === null) delete project.partyId;
      else project.partyId = patch.partyId;
    }
    project.updatedAt = new Date().toISOString();
    await dm.updateProject(project);
    announce(actor, 'project_updated', `Updated project "${project.name}"`, {
      projectId: project.id,
      projectName: project.name,
    });
    return project;
  }

  async deleteProject(id: string, actor: WhipActor): Promise<void> {
    const dm = sharedDm();
    const project = await dm.getProject(id);
    if (!project) throw new WhipWriteError('Unknown project', 404);
    await dm.deleteProject(id);
    announce(actor, 'project_deleted', `Deleted project "${project.name}"`, {
      projectId: project.id,
      projectName: project.name,
    });
  }

  async createTask(
    projectId: string,
    input: {
      title: string;
      category?: string;
      priority?: string;
      points?: number;
      description?: string;
      assignedTo?: string;
    },
    actor: WhipActor
  ): Promise<any> {
    const title = typeof input.title === 'string' ? input.title.trim() : '';
    if (!title) throw new WhipWriteError('Task title is required');
    const dm = sharedDm();
    const project = await dm.getProject(projectId);
    if (!project) throw new WhipWriteError('Unknown project', 404);
    await ensureWhipUser(dm, actor);
    const points = input.points === undefined ? 10 : Math.floor(Number(input.points));
    if (!Number.isFinite(points) || points < 0) throw new WhipWriteError('points must be a non-negative integer');
    const task = {
      id: randomUUID(),
      projectId,
      title,
      category: input.category === undefined ? 'code' : requireIn(input.category, TASK_CATEGORIES, 'category'),
      status: 'todo',
      priority: input.priority === undefined ? 'scener' : requireIn(input.priority, TASK_PRIORITIES, 'priority'),
      assignedTo: input.assignedTo ?? actor.userId,
      points,
      description: typeof input.description === 'string' ? input.description : '',
      createdAt: new Date().toISOString(),
    };
    await dm.addTask(task);
    announce(actor, 'task_created', `Created ${task.category} task "${task.title}" in "${project.name}"`, {
      projectId: project.id,
      projectName: project.name,
      taskId: task.id,
      taskCategory: task.category,
    });
    return task;
  }

  async updateTask(
    id: string,
    patch: { title?: string; category?: string; priority?: string; points?: number; description?: string; assignedTo?: string | null },
    _actor: WhipActor
  ): Promise<any> {
    const dm = sharedDm();
    const task = await dm.getTask(id);
    if (!task) throw new WhipWriteError('Unknown task', 404);
    if (patch.title !== undefined) {
      if (!patch.title.trim()) throw new WhipWriteError('Task title cannot be empty');
      task.title = patch.title.trim();
    }
    if (patch.category !== undefined) task.category = requireIn(patch.category, TASK_CATEGORIES, 'category');
    if (patch.priority !== undefined) task.priority = requireIn(patch.priority, TASK_PRIORITIES, 'priority');
    if (patch.points !== undefined) {
      const points = Math.floor(Number(patch.points));
      if (!Number.isFinite(points) || points < 0) throw new WhipWriteError('points must be a non-negative integer');
      task.points = points;
    }
    if (patch.description !== undefined) task.description = patch.description;
    if (patch.assignedTo !== undefined) {
      if (patch.assignedTo === null) delete task.assignedTo;
      else task.assignedTo = patch.assignedTo;
    }
    task.updatedAt = new Date().toISOString();
    await dm.updateTask(task);
    // The door's own edit path emits nothing; mirrored exactly.
    return task;
  }

  async deleteTask(id: string, actor: WhipActor): Promise<void> {
    const dm = sharedDm();
    const task = await dm.getTask(id);
    if (!task) throw new WhipWriteError('Unknown task', 404);
    const project = await dm.getProject(task.projectId);
    await dm.deleteTask(id);
    announce(actor, 'task_deleted', `Deleted task "${task.title}" from "${project?.name ?? task.projectId}"`, {
      projectId: task.projectId,
      taskId: task.id,
    });
  }

  /**
   * Move a task across columns. Mirrors ui/kanban-board.ts moveTask exactly:
   * first-time arrival in done stamps completedAt, awards points, recalculates
   * level, runs the achievement check with per-unlock events; any other move
   * emits task_moved. Returns the task plus unlocked achievement ids.
   */
  async moveTask(id: string, status: string, actor: WhipActor): Promise<{ task: any; unlocked: string[] }> {
    const toStatus = requireIn(status, TASK_STATUSES, 'status');
    const dm = sharedDm();
    const task = await dm.getTask(id);
    if (!task) throw new WhipWriteError('Unknown task', 404);
    const project = await dm.getProject(task.projectId);
    if (!project) throw new WhipWriteError('Task has no project', 404);
    const fromStatus = task.status;
    const unlocked: string[] = [];

    task.status = toStatus;
    task.updatedAt = new Date().toISOString();

    if (toStatus === 'done' && fromStatus !== 'done') {
      task.completedAt = new Date().toISOString();
      const userData = await ensureWhipUser(dm, actor);
      userData.points += task.points;
      userData.tasksCompleted += 1;
      userData.level = doors().calculateLevel(userData.points);
      await dm.updateUser(userData);
      announce(actor, 'task_completed', `Completed task "${task.title}" (+${task.points} pts) in "${project.name}"`, {
        projectId: project.id,
        projectName: project.name,
        taskId: task.id,
        taskCategory: task.category,
        points: task.points,
        totalPoints: userData.points,
        level: userData.level,
      });
      const manager = new (doors().AchievementManager)(dm);
      const fresh = await manager.checkAchievements(userData);
      if (fresh.length > 0) {
        const defs = await dm.loadAchievements();
        for (const achievementId of fresh) {
          const achievement = defs[achievementId];
          if (!achievement) continue;
          unlocked.push(achievementId);
          announce(
            actor,
            'achievement_unlocked',
            `Unlocked achievement "${achievement.name}" (+${achievement.points} pts)`,
            {
              achievementId: achievement.id,
              achievementName: achievement.name,
              points: achievement.points,
              category: achievement.category,
              totalPoints: userData.points,
            }
          );
        }
      }
    } else if (toStatus !== fromStatus) {
      announce(actor, 'task_moved', `Moved task "${task.title}" from ${fromStatus} to ${toStatus}`, {
        projectId: project.id,
        projectName: project.name,
        taskId: task.id,
        fromStatus,
        toStatus,
      });
    }

    await dm.updateTask(task);
    return { task, unlocked };
  }
}

export const whipService = new WhipService();
