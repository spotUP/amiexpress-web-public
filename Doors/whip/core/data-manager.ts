import { Storage } from '@amiexpress/bbs-door-sdk/core';
import type { Project, Task } from '../types/project';
import type { UserStats, Achievement } from '../types/user';
import type { Party } from '../types/party';
import { getDefaultAchievements } from './achievements';
import { getDefaultParties } from './party-calendar';

export class DataManager {
  private storage: Storage;

  // In-memory cache for performance
  private projectsCache: Project[] | null = null;
  private tasksCache: Task[] | null = null;
  private usersCache: Record<string, UserStats> | null = null;
  private achievementsCache: Record<string, Achievement> | null = null;
  private partiesCache: Party[] | null = null;

  constructor() {
    this.storage = new Storage({
      doorName: 'whip',
      global: true
    });
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
      this.projectsCache = (await this.storage.load<Project[]>('projects')) ?? [];
    }
    return this.projectsCache;
  }

  async saveProjects(projects: Project[]): Promise<void> {
    this.projectsCache = projects;  // Update cache
    await this.storage.save('projects', projects);
  }

  async getProject(id: string): Promise<Project | undefined> {
    const projects = await this.loadProjects();
    return projects.find(p => p.id === id);
  }

  async addProject(project: Project): Promise<void> {
    const projects = await this.loadProjects();
    projects.push(project);
    await this.saveProjects(projects);
  }

  async updateProject(project: Project): Promise<void> {
    const projects = await this.loadProjects();
    const index = projects.findIndex(p => p.id === project.id);
    if (index >= 0) {
      projects[index] = project;
      await this.saveProjects(projects);
    }
  }

  async deleteProject(id: string): Promise<void> {
    const projects = await this.loadProjects();
    const filtered = projects.filter(p => p.id !== id);
    await this.saveProjects(filtered);

    // Also delete all tasks for this project
    const tasks = await this.loadTasks();
    const filteredTasks = tasks.filter(t => t.projectId !== id);
    await this.saveTasks(filteredTasks);
  }

  // Tasks
  async loadTasks(): Promise<Task[]> {
    if (this.tasksCache === null) {
      this.tasksCache = (await this.storage.load<Task[]>('tasks')) ?? [];
    }
    return this.tasksCache;
  }

  async saveTasks(tasks: Task[]): Promise<void> {
    this.tasksCache = tasks;  // Update cache
    await this.storage.save('tasks', tasks);
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
    const tasks = await this.loadTasks();
    tasks.push(task);
    await this.saveTasks(tasks);
  }

  async updateTask(task: Task): Promise<void> {
    const tasks = await this.loadTasks();
    const index = tasks.findIndex(t => t.id === task.id);
    if (index >= 0) {
      tasks[index] = task;
      await this.saveTasks(tasks);
    }
  }

  async deleteTask(id: string): Promise<void> {
    const tasks = await this.loadTasks();
    const filtered = tasks.filter(t => t.id !== id);
    await this.saveTasks(filtered);
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
  }

  async updateUser(user: UserStats): Promise<void> {
    const users = await this.loadUsers();
    users[user.userId] = user;
    await this.saveUsers(users);
  }

  async updateRankings(): Promise<void> {
    const users = await this.loadUsers();
    const sorted = Object.values(users).sort((a, b) => b.points - a.points);

    sorted.forEach((user, index) => {
      user.rank = index + 1;
    });

    await this.saveUsers(users);
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
      this.partiesCache = stored ?? [];
    }
    return this.partiesCache;
  }

  async saveParties(parties: Party[]): Promise<void> {
    this.partiesCache = parties;  // Update cache
    await this.storage.save('parties', parties);
  }

  async addParty(party: Party): Promise<void> {
    const parties = await this.loadParties();
    parties.push(party);
    await this.saveParties(parties);
  }

  async updateParty(party: Party): Promise<void> {
    const parties = await this.loadParties();
    const index = parties.findIndex(p => p.id === party.id);
    if (index >= 0) {
      parties[index] = party;
      await this.saveParties(parties);
    }
  }

  async deleteParty(id: string): Promise<void> {
    const parties = await this.loadParties();
    const filtered = parties.filter(p => p.id !== id);
    await this.saveParties(filtered);
  }
}
