import { Storage } from '@amiexpress/bbs-door-sdk/core';
import type { Project, Task } from '../types/project';
import type { UserStats, Achievement } from '../types/user';
import type { Party } from '../types/party';
import { getDefaultAchievements } from './achievements';
import { getDefaultParties } from './party-calendar';

/**
 * Single ownership for WHIP data.
 *
 * WHIP storage is whole-file JSON with no locking, and DataManager keeps
 * in-memory caches that never invalidate - so two instances (the BBS door
 * and the Discord bot's backend service, same process) would serve stale
 * reads and overwrite each other's writes. There is exactly one instance
 * per process below, and every read-modify-write mutation runs serialized
 * through runExclusive. Reads stay lock-free: on one thread, a read
 * between two serialized writes always sees a complete snapshot.
 *
 * Re-entrancy rule: runExclusive callbacks must never call runExclusive
 * again - the inner call would queue behind the outer one's completion
 * while the outer one waits for the inner one. Leaf save*() methods stay
 * unlocked for exactly this reason; the mutators above them hold the lock.
 */
let sharedInstance: DataManager | null = null;
let sharedBaseDir: string | undefined;

export function getSharedDataManager(storageBaseDir?: string): DataManager {
  if (!sharedInstance || (storageBaseDir !== undefined && storageBaseDir !== sharedBaseDir)) {
    sharedInstance = new DataManager(storageBaseDir);
    sharedBaseDir = storageBaseDir;
  }
  return sharedInstance;
}

/**
 * ONE RECORD PER ID - the invariant every list store here keeps.
 *
 * The live board held the same project and two tasks twice (2026-09-28):
 * identical copies, side by side, because the SAME object had been pushed
 * twice. A closed task/project dialog still held focus, so a second Enter
 * pressed its Save again and `add*` pushed a record that was already there.
 * The dialogs are fixed; this is the store refusing to hold the result
 * whoever calls it: `add*` replaces a record with its own id instead of
 * appending one, every save writes one record per id, and a load heals a
 * file that already holds twins.
 */
type Record_ = { id: string; updatedAt?: string; createdAt?: string };

/** When a record last changed, for choosing between two copies of it. */
const changedAt = (r: Record_): string => r.updatedAt ?? r.createdAt ?? '';

/**
 * The records with every id kept once - the most recently changed copy, in
 * the place the id first appeared. Returns the same array when nothing
 * repeats, so a clean store is not copied.
 */
export function uniqueById<T extends Record_>(records: T[]): T[] {
  const at = new Map<string, number>();
  let repeated = false;
  const out: T[] = [];
  for (const record of records) {
    const i = at.get(record.id);
    if (i === undefined) {
      at.set(record.id, out.length);
      out.push(record);
      continue;
    }
    repeated = true;
    if (changedAt(record) >= changedAt(out[i])) out[i] = record;
  }
  return repeated ? out : records;
}

/** Put a record in its list: over the one with its id, or at the end. */
function putById<T extends Record_>(records: T[], record: T): void {
  const i = records.findIndex((r) => r.id === record.id);
  if (i >= 0) records[i] = record;
  else records.push(record);
}

let writeChain: Promise<void> = Promise.resolve();

export function runExclusive<T>(fn: () => Promise<T>): Promise<T> {
  const run = writeChain.then(fn, fn);
  writeChain = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}

export class DataManager {
  private storage: Storage;

  // In-memory cache for performance
  private projectsCache: Project[] | null = null;
  private tasksCache: Task[] | null = null;
  private usersCache: Record<string, UserStats> | null = null;
  private achievementsCache: Record<string, Achievement> | null = null;
  private partiesCache: Party[] | null = null;

  constructor(storageBaseDir?: string) {
    // No fallback here: undefined lets the SDK default decide (volume in
    // prod, cwd in dev). A hardcoded cwd fallback is what kept WHIP data
    // on the container layer, wiped by every redeploy.
    this.storage = new Storage(
      {
        doorName: 'whip',
        global: true,
      },
      storageBaseDir
    );
  }

  // Cache invalidation methods
  invalidateProjectsCache(): void {
    this.projectsCache = null;
  }

  invalidateTasksCache(): void {
    this.tasksCache = null;
  }

  invalidateUsersCache(): void {
    this.usersCache = null;
  }

  invalidateAchievementsCache(): void {
    this.achievementsCache = null;
  }

  invalidatePartiesCache(): void {
    this.partiesCache = null;
  }

  invalidateAllCaches(): void {
    this.projectsCache = null;
    this.tasksCache = null;
    this.usersCache = null;
    this.achievementsCache = null;
    this.partiesCache = null;
  }

  // Projects
  async loadProjects(): Promise<Project[]> {
    if (this.projectsCache === null) {
      this.projectsCache = uniqueById((await this.storage.load<Project[]>('projects')) ?? []);
    }
    return this.projectsCache;
  }

  async saveProjects(projects: Project[]): Promise<void> {
    const unique = uniqueById(projects);
    this.projectsCache = unique;  // Update cache
    await this.storage.save('projects', unique);
  }

  async getProject(id: string): Promise<Project | undefined> {
    const projects = await this.loadProjects();
    return projects.find(p => p.id === id);
  }

  async addProject(project: Project): Promise<void> {
    return runExclusive(async () => {
      const projects = await this.loadProjects();
      putById(projects, project);
      await this.saveProjects(projects);
    });
  }

  async updateProject(project: Project): Promise<void> {
    return runExclusive(async () => {
      const projects = await this.loadProjects();
      const index = projects.findIndex(p => p.id === project.id);
      if (index >= 0) {
        projects[index] = project;
        await this.saveProjects(projects);
      }
    });
  }

  async deleteProject(id: string): Promise<void> {
    return runExclusive(async () => {
      const projects = await this.loadProjects();
      const filtered = projects.filter(p => p.id !== id);
      await this.saveProjects(filtered);

      // Also delete all tasks for this project
      const tasks = await this.loadTasks();
      const filteredTasks = tasks.filter(t => t.projectId !== id);
      await this.saveTasks(filteredTasks);
    });
  }

  // Tasks
  async loadTasks(): Promise<Task[]> {
    if (this.tasksCache === null) {
      this.tasksCache = uniqueById((await this.storage.load<Task[]>('tasks')) ?? []);
    }
    return this.tasksCache;
  }

  async saveTasks(tasks: Task[]): Promise<void> {
    const unique = uniqueById(tasks);
    this.tasksCache = unique;  // Update cache
    await this.storage.save('tasks', unique);
  }

  async getTask(id: string): Promise<Task | undefined> {
    const tasks = await this.loadTasks();
    return tasks.find(t => t.id === id);
  }

  async getTasksForProject(projectId: string): Promise<Task[]> {
    const tasks = await this.loadTasks();
    return tasks.filter(t => t.projectId === projectId);
  }

  async getTasksForUser(userId: string): Promise<Task[]> {
    const tasks = await this.loadTasks();
    return tasks.filter(t => t.assignedTo === userId);
  }

  async addTask(task: Task): Promise<void> {
    return runExclusive(async () => {
      const tasks = await this.loadTasks();
      putById(tasks, task);
      await this.saveTasks(tasks);
    });
  }

  async updateTask(task: Task): Promise<void> {
    return runExclusive(async () => {
      const tasks = await this.loadTasks();
      const index = tasks.findIndex(t => t.id === task.id);
      if (index >= 0) {
        tasks[index] = task;
        await this.saveTasks(tasks);
      }
    });
  }

  async deleteTask(id: string): Promise<void> {
    return runExclusive(async () => {
      const tasks = await this.loadTasks();
      const filtered = tasks.filter(t => t.id !== id);
      await this.saveTasks(filtered);
    });
  }

  // Users
  async loadUsers(): Promise<Record<string, UserStats>> {
    if (this.usersCache === null) {
      this.usersCache = (await this.storage.load<Record<string, UserStats>>('users')) ?? {};
    }
    return this.usersCache;
  }

  async saveUsers(users: Record<string, UserStats>): Promise<void> {
    this.usersCache = users;  // Update cache
    await this.storage.save('users', users);
  }

  async getUser(userId: string): Promise<UserStats | undefined> {
    const users = await this.loadUsers();
    return users[userId];
  }

  async createUser(userId: string, handle: string): Promise<UserStats> {
    return runExclusive(async () => {
      const users = await this.loadUsers();

      const newUser: UserStats = {
        userId,
        handle,
        points: 0,
        level: 'lamer',
        rank: 0,
        tasksCompleted: 0,
        projectsCreated: 0,
        achievements: [],
        joinedAt: new Date().toISOString(),
        lastActiveAt: new Date().toISOString()
      };

      users[userId] = newUser;
      await this.saveUsers(users);
      return newUser;
    });
  }

  async updateUser(user: UserStats): Promise<void> {
    return runExclusive(async () => {
      const users = await this.loadUsers();
      users[user.userId] = user;
      await this.saveUsers(users);
    });
  }

  async updateRankings(): Promise<void> {
    return runExclusive(async () => {
      const users = await this.loadUsers();
      const sorted = Object.values(users).sort((a, b) => b.points - a.points);

      sorted.forEach((user, index) => {
        user.rank = index + 1;
      });

      await this.saveUsers(users);
    });
  }

  // Achievements
  async loadAchievements(): Promise<Record<string, Achievement>> {
    if (this.achievementsCache === null) {
      const stored = await this.storage.load<Record<string, Achievement>>('achievements');
      this.achievementsCache = stored ?? getDefaultAchievements();
    }
    return this.achievementsCache;
  }

  async saveAchievements(achievements: Record<string, Achievement>): Promise<void> {
    this.achievementsCache = achievements;  // Update cache
    await this.storage.save('achievements', achievements);
  }

  // Parties
  async loadParties(): Promise<Party[]> {
    if (this.partiesCache === null) {
      const stored = await this.storage.load<Party[]>('parties');
      // Return empty array if no stored data - let refreshParties() populate from demoparty.net
      this.partiesCache = uniqueById(stored ?? []);
    }
    return this.partiesCache;
  }

  async saveParties(parties: Party[]): Promise<void> {
    const unique = uniqueById(parties);
    this.partiesCache = unique;  // Update cache
    await this.storage.save('parties', unique);
  }

  async addParty(party: Party): Promise<void> {
    return runExclusive(async () => {
      const parties = await this.loadParties();
      putById(parties, party);
      await this.saveParties(parties);
    });
  }

  async updateParty(party: Party): Promise<void> {
    return runExclusive(async () => {
      const parties = await this.loadParties();
      const index = parties.findIndex(p => p.id === party.id);
      if (index >= 0) {
        parties[index] = party;
        await this.saveParties(parties);
      }
    });
  }

  async deleteParty(id: string): Promise<void> {
    return runExclusive(async () => {
      const parties = await this.loadParties();
      const filtered = parties.filter(p => p.id !== id);
      await this.saveParties(filtered);
    });
  }
}
