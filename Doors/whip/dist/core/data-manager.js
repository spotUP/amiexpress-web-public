"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DataManager = void 0;
exports.getSharedDataManager = getSharedDataManager;
exports.uniqueById = uniqueById;
exports.runExclusive = runExclusive;
const core_1 = require("@amiexpress/bbs-door-sdk/core");
const achievements_1 = require("./achievements");
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
let sharedInstance = null;
let sharedBaseDir;
function getSharedDataManager(storageBaseDir) {
    if (!sharedInstance || (storageBaseDir !== undefined && storageBaseDir !== sharedBaseDir)) {
        sharedInstance = new DataManager(storageBaseDir);
        sharedBaseDir = storageBaseDir;
    }
    return sharedInstance;
}
/** When a record last changed, for choosing between two copies of it. */
const changedAt = (r) => r.updatedAt ?? r.createdAt ?? '';
/**
 * The records with every id kept once - the most recently changed copy, in
 * the place the id first appeared. Returns the same array when nothing
 * repeats, so a clean store is not copied.
 */
function uniqueById(records) {
    const at = new Map();
    let repeated = false;
    const out = [];
    for (const record of records) {
        const i = at.get(record.id);
        if (i === undefined) {
            at.set(record.id, out.length);
            out.push(record);
            continue;
        }
        repeated = true;
        if (changedAt(record) >= changedAt(out[i]))
            out[i] = record;
    }
    return repeated ? out : records;
}
/** Put a record in its list: over the one with its id, or at the end. */
function putById(records, record) {
    const i = records.findIndex((r) => r.id === record.id);
    if (i >= 0)
        records[i] = record;
    else
        records.push(record);
}
let writeChain = Promise.resolve();
function runExclusive(fn) {
    const run = writeChain.then(fn, fn);
    writeChain = run.then(() => undefined, () => undefined);
    return run;
}
class DataManager {
    constructor(storageBaseDir) {
        // In-memory cache for performance
        this.projectsCache = null;
        this.tasksCache = null;
        this.usersCache = null;
        this.achievementsCache = null;
        this.partiesCache = null;
        // No fallback here: undefined lets the SDK default decide (volume in
        // prod, cwd in dev). A hardcoded cwd fallback is what kept WHIP data
        // on the container layer, wiped by every redeploy.
        this.storage = new core_1.Storage({
            doorName: 'whip',
            global: true,
        }, storageBaseDir);
    }
    // Cache invalidation methods
    invalidateProjectsCache() {
        this.projectsCache = null;
    }
    invalidateTasksCache() {
        this.tasksCache = null;
    }
    invalidateUsersCache() {
        this.usersCache = null;
    }
    invalidateAchievementsCache() {
        this.achievementsCache = null;
    }
    invalidatePartiesCache() {
        this.partiesCache = null;
    }
    invalidateAllCaches() {
        this.projectsCache = null;
        this.tasksCache = null;
        this.usersCache = null;
        this.achievementsCache = null;
        this.partiesCache = null;
    }
    // Projects
    async loadProjects() {
        if (this.projectsCache === null) {
            this.projectsCache = uniqueById((await this.storage.load('projects')) ?? []);
        }
        return this.projectsCache;
    }
    async saveProjects(projects) {
        const unique = uniqueById(projects);
        this.projectsCache = unique; // Update cache
        await this.storage.save('projects', unique);
    }
    async getProject(id) {
        const projects = await this.loadProjects();
        return projects.find(p => p.id === id);
    }
    async addProject(project) {
        return runExclusive(async () => {
            const projects = await this.loadProjects();
            putById(projects, project);
            await this.saveProjects(projects);
        });
    }
    async updateProject(project) {
        return runExclusive(async () => {
            const projects = await this.loadProjects();
            const index = projects.findIndex(p => p.id === project.id);
            if (index >= 0) {
                projects[index] = project;
                await this.saveProjects(projects);
            }
        });
    }
    async deleteProject(id) {
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
    async loadTasks() {
        if (this.tasksCache === null) {
            this.tasksCache = uniqueById((await this.storage.load('tasks')) ?? []);
        }
        return this.tasksCache;
    }
    async saveTasks(tasks) {
        const unique = uniqueById(tasks);
        this.tasksCache = unique; // Update cache
        await this.storage.save('tasks', unique);
    }
    async getTask(id) {
        const tasks = await this.loadTasks();
        return tasks.find(t => t.id === id);
    }
    async getTasksForProject(projectId) {
        const tasks = await this.loadTasks();
        return tasks.filter(t => t.projectId === projectId);
    }
    async getTasksForUser(userId) {
        const tasks = await this.loadTasks();
        return tasks.filter(t => t.assignedTo === userId);
    }
    async addTask(task) {
        return runExclusive(async () => {
            const tasks = await this.loadTasks();
            putById(tasks, task);
            await this.saveTasks(tasks);
        });
    }
    async updateTask(task) {
        return runExclusive(async () => {
            const tasks = await this.loadTasks();
            const index = tasks.findIndex(t => t.id === task.id);
            if (index >= 0) {
                tasks[index] = task;
                await this.saveTasks(tasks);
            }
        });
    }
    async deleteTask(id) {
        return runExclusive(async () => {
            const tasks = await this.loadTasks();
            const filtered = tasks.filter(t => t.id !== id);
            await this.saveTasks(filtered);
        });
    }
    // Users
    async loadUsers() {
        if (this.usersCache === null) {
            this.usersCache = (await this.storage.load('users')) ?? {};
        }
        return this.usersCache;
    }
    async saveUsers(users) {
        this.usersCache = users; // Update cache
        await this.storage.save('users', users);
    }
    async getUser(userId) {
        const users = await this.loadUsers();
        return users[userId];
    }
    async createUser(userId, handle) {
        return runExclusive(async () => {
            const users = await this.loadUsers();
            const newUser = {
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
    async updateUser(user) {
        return runExclusive(async () => {
            const users = await this.loadUsers();
            users[user.userId] = user;
            await this.saveUsers(users);
        });
    }
    async updateRankings() {
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
    async loadAchievements() {
        if (this.achievementsCache === null) {
            const stored = await this.storage.load('achievements');
            this.achievementsCache = stored ?? (0, achievements_1.getDefaultAchievements)();
        }
        return this.achievementsCache;
    }
    async saveAchievements(achievements) {
        this.achievementsCache = achievements; // Update cache
        await this.storage.save('achievements', achievements);
    }
    // Parties
    async loadParties() {
        if (this.partiesCache === null) {
            const stored = await this.storage.load('parties');
            // Return empty array if no stored data - let refreshParties() populate from demoparty.net
            this.partiesCache = uniqueById(stored ?? []);
        }
        return this.partiesCache;
    }
    async saveParties(parties) {
        const unique = uniqueById(parties);
        this.partiesCache = unique; // Update cache
        await this.storage.save('parties', unique);
    }
    async addParty(party) {
        return runExclusive(async () => {
            const parties = await this.loadParties();
            putById(parties, party);
            await this.saveParties(parties);
        });
    }
    async updateParty(party) {
        return runExclusive(async () => {
            const parties = await this.loadParties();
            const index = parties.findIndex(p => p.id === party.id);
            if (index >= 0) {
                parties[index] = party;
                await this.saveParties(parties);
            }
        });
    }
    async deleteParty(id) {
        return runExclusive(async () => {
            const parties = await this.loadParties();
            const filtered = parties.filter(p => p.id !== id);
            await this.saveParties(filtered);
        });
    }
}
exports.DataManager = DataManager;
