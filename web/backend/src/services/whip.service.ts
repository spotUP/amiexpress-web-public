import * as path from 'path';

/**
 * WhipService (WHIP mirror bot, Phase 1: reads).
 *
 * Owns WHIP data access for everything that is not the door itself. Two
 * deliberately boring decisions:
 *
 * 1. The door's DataManager is loaded with a runtime require() of the
 *    door's committed dist/, never a static import. A static import of
 *    door source breaks `tsc -p tsconfig.build.json` (rootDir is src) and
 *    with it the Docker image build; the Dockerfile's own comments bless
 *    runtime require() for exactly this.
 * 2. Every method constructs a FRESH DataManager. Its in-memory caches
 *    would otherwise serve stale reads and clobber concurrent writers -
 *    whole-file JSON with no locking. Fresh-per-call costs one file read
 *    and is always current. Shared-instance writes arrive in Phase 2 with
 *    the door refactor; until then this service never writes WHIP JSON.
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
  unlocked: Array<{ id: string; name: string; points: number }>;
  locked: Array<{ id: string; name: string; points: number }>;
  totalPoints: number;
}

function doorDistDir(): string {
  // WHIP_DOOR_DIST_DIR is the test seam: points the service at a fixture
  // door tree instead of the board's.
  if (process.env.WHIP_DOOR_DIST_DIR) return process.env.WHIP_DOOR_DIST_DIR;
  const bbsRoot = process.env.BBS_DATA_DIR || path.resolve(__dirname, '../../../..');
  return path.join(bbsRoot, 'Doors', 'whip', 'dist');
}

function freshManager(): any {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mod = require(path.join(doorDistDir(), 'core', 'data-manager.js'));
  return new mod.DataManager();
}

class WhipService {
  async listProjects(): Promise<WhipProjectSummary[]> {
    const dm = freshManager();
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
    const dm = freshManager();
    return dm.getTasksForProject(projectId);
  }

  async listUserTasks(userId: string): Promise<WhipTask[]> {
    const dm = freshManager();
    return dm.getTasksForUser(userId);
  }

  async leaderboard(): Promise<WhipLeaderboardEntry[]> {
    const dm = freshManager();
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
    const dm = freshManager();
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
    return { unlocked, locked, totalPoints };
  }

  async listParties(): Promise<any[]> {
    const dm = freshManager();
    return dm.loadParties();
  }
}

export const whipService = new WhipService();
