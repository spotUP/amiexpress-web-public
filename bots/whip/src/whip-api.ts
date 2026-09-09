/**
 * Typed client for the backend WHIP mirror-bot API (Phase 1 reads + /link).
 *
 * Every request carries `Authorization: Bearer <serviceToken>`. The backend
 * wraps payloads in `{ success, data, message }`; non-2xx responses surface
 * as WhipApiError with the HTTP status so callers can branch on 404
 * (unknown code, not linked, unknown user) vs real failures.
 *
 * The transport is injectable for tests: pass a stub RequestFn instead of
 * hitting axios. No Discord or socket code lives here.
 */

import axios from 'axios';

export interface Envelope<T> {
  success: boolean;
  data?: T;
  message?: string;
}

export class WhipApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'WhipApiError';
    this.status = status;
  }
}

export interface LinkResult {
  userId: string;
  username: string;
}

export interface LinkStatus {
  userId: string;
}

export interface WhipProject {
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

export interface WhipAchievement {
  id: string;
  name: string;
  points: number;
}

export interface WhipAchievements {
  unlocked: WhipAchievement[];
  locked: WhipAchievement[];
  totalPoints: number;
}

export interface WhipParty {
  id: string;
  name: string;
  date: string;
  location: string;
}

export interface RequestConfig {
  method: 'get' | 'post';
  url: string;
  headers: Record<string, string>;
  params?: Record<string, string>;
  data?: unknown;
}

export interface RequestResponse {
  status: number;
  data: unknown;
}

export type RequestFn = (config: RequestConfig) => Promise<RequestResponse>;

function defaultRequestFn(baseUrl: string): RequestFn {
  const instance = axios.create({ baseURL: baseUrl.replace(/\/$/, '') });
  return async (config) => {
    try {
      const res = await instance.request({
        method: config.method,
        url: config.url,
        headers: config.headers,
        params: config.params,
        data: config.data,
      });
      return { status: res.status, data: res.data };
    } catch (err) {
      if (axios.isAxiosError(err) && err.response) {
        return { status: err.response.status, data: err.response.data };
      }
      throw err;
    }
  };
}

function envelopeData<T>(status: number, body: unknown): T {
  const env = body as Envelope<T>;
  if (status >= 200 && status < 300 && env && env.success) {
    return env.data as T;
  }
  const message =
    env && typeof env.message === 'string' && env.message ? env.message : `WHIP API error (HTTP ${status})`;
  throw new WhipApiError(message, status);
}

export class WhipApiClient {
  private readonly request: RequestFn;
  private readonly serviceToken: string;

  constructor(baseUrl: string, serviceToken: string, requestFn?: RequestFn) {
    this.serviceToken = serviceToken;
    this.request = requestFn ?? defaultRequestFn(baseUrl);
  }

  private headers(): Record<string, string> {
    return { Authorization: `Bearer ${this.serviceToken}` };
  }

  /** Spend a LINKDISCORD code and bind the Discord account. 404 = bad/spent code. */
  async link(code: string, discordId: string): Promise<LinkResult> {
    const res = await this.request({
      method: 'post',
      url: '/api/whip/link',
      headers: this.headers(),
      data: { code, discordId },
    });
    return envelopeData<LinkResult>(res.status, res.data);
  }

  /** Which BBS user owns this Discord account. 404 = not linked. */
  async linkStatus(discordId: string): Promise<LinkStatus> {
    const res = await this.request({
      method: 'get',
      url: '/api/whip/link-status',
      headers: this.headers(),
      params: { discordId },
    });
    return envelopeData<LinkStatus>(res.status, res.data);
  }

  async listProjects(): Promise<WhipProject[]> {
    const res = await this.request({ method: 'get', url: '/api/whip/projects', headers: this.headers() });
    return envelopeData<WhipProject[]>(res.status, res.data);
  }

  async listTasks(projectId: string): Promise<WhipTask[]> {
    const res = await this.request({
      method: 'get',
      url: '/api/whip/tasks',
      headers: this.headers(),
      params: { projectId },
    });
    return envelopeData<WhipTask[]>(res.status, res.data);
  }

  async listUserTasks(userId: string): Promise<WhipTask[]> {
    const res = await this.request({
      method: 'get',
      url: '/api/whip/my-tasks',
      headers: this.headers(),
      params: { userId },
    });
    return envelopeData<WhipTask[]>(res.status, res.data);
  }

  async leaderboard(): Promise<WhipLeaderboardEntry[]> {
    const res = await this.request({ method: 'get', url: '/api/whip/leaderboard', headers: this.headers() });
    return envelopeData<WhipLeaderboardEntry[]>(res.status, res.data);
  }

  async achievements(userId: string): Promise<WhipAchievements> {
    const res = await this.request({
      method: 'get',
      url: `/api/whip/achievements/${encodeURIComponent(userId)}`,
      headers: this.headers(),
    });
    return envelopeData<WhipAchievements>(res.status, res.data);
  }

  async listParties(): Promise<WhipParty[]> {
    const res = await this.request({ method: 'get', url: '/api/whip/parties', headers: this.headers() });
    return envelopeData<WhipParty[]>(res.status, res.data);
  }
}
