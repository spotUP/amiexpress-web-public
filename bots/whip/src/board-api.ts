/**
 * Typed client for the backend WEB_BOT_DATA read API (`/api/bot/v1/*`).
 *
 * The board reads the WHIP bot could never reach: board card, who is
 * online, recent messages, caller stats, user lookup. Every endpoint
 * answers a BOTResult ({ text, truncated, total }) - chat-ready text,
 * already capped server-side - so this client relays text rather than
 * parsing rows. Same envelope + injectable-transport shape as
 * WhipApiClient; the token is a per-bot BOT_DATA_TOKENS secret (Bearer
 * sends the secret only) with domain scopes enforced server-side.
 */

import axios from 'axios';

import type { RequestConfig, RequestFn, RequestResponse } from './whip-api';
import { BOARD_HTTP_TIMEOUT_MS } from './http';

export interface BoardText {
  text: string;
  truncated: boolean;
  total?: number;
}

export class BoardApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'BoardApiError';
    this.status = status;
  }
}

function defaultRequestFn(baseUrl: string): RequestFn {
  const instance = axios.create({ baseURL: baseUrl.replace(/\/$/, ''), timeout: BOARD_HTTP_TIMEOUT_MS });
  return async (config: RequestConfig) => {
    try {
      const res = await instance.request({
        method: config.method,
        url: config.url,
        headers: config.headers,
        params: config.params,
        data: config.data,
      });
      return { status: res.status, data: res.data } as RequestResponse;
    } catch (err) {
      if (axios.isAxiosError(err) && err.response) {
        return { status: err.response.status, data: err.response.data } as RequestResponse;
      }
      throw err;
    }
  };
}

function boardData<T>(status: number, body: unknown): T {
  const env = body as { success?: boolean; data?: T; message?: string };
  if (status >= 200 && status < 300 && env && env.success) {
    return env.data as T;
  }
  const message =
    env && typeof env.message === 'string' && env.message
      ? env.message
      : `Board API error (HTTP ${status})`;
  throw new BoardApiError(message, status);
}

export class BoardApiClient {
  private readonly request: RequestFn;
  private readonly token: string;

  constructor(baseUrl: string, token: string, requestFn?: RequestFn) {
    this.token = token;
    this.request = requestFn ?? defaultRequestFn(baseUrl);
  }

  private headers(): Record<string, string> {
    return { Authorization: `Bearer ${this.token}` };
  }

  private async get<T>(url: string, params?: Record<string, string>): Promise<T> {
    const res = await this.request({ method: 'get', url, headers: this.headers(), params });
    return boardData<T>(res.status, res.data);
  }

  /** One-line board card. */
  boardInfo(): Promise<BoardText> {
    return this.get<BoardText>('/api/bot/v1/board-info');
  }

  /** Who is on the board right now. */
  whoOnline(): Promise<BoardText> {
    return this.get<BoardText>('/api/bot/v1/activity/online');
  }

  /** Latest conference traffic. */
  recentMessages(conf = 1, limit = 5): Promise<BoardText> {
    return this.get<BoardText>('/api/bot/v1/messages/recent', {
      conf: String(conf),
      limit: String(limit),
    });
  }

  /** Top callers by activity. */
  topCallers(limit = 5): Promise<BoardText> {
    return this.get<BoardText>('/api/bot/v1/users/top', { limit: String(limit) });
  }

  /** Exact-handle user lookup. 404/empty text when unknown. */
  userLookup(handle: string): Promise<BoardText> {
    return this.get<BoardText>('/api/bot/v1/users/lookup', { handle });
  }

  /** Fuzzy user search. */
  userSearch(q: string, limit = 5): Promise<BoardText> {
    return this.get<BoardText>('/api/bot/v1/users/search', { q, limit: String(limit) });
  }
}
