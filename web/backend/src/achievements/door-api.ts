/**
 * What the ACHIEVE door may ask the achievements server, through the board.
 *
 * A door never holds the board key (S10): every call here is made by the
 * backend with the key from system_config, and the door gets the answer or
 * the refusal - never the credential. The email is the caller's own
 * (session.user.email); a door cannot name another address.
 *
 * Every method returns an ApiResult: status and body on success, error
 * code and detail on a refusal, status 0 when the server could not be
 * reached. Nothing here throws.
 */
import { apiRequest } from './client';
import type { ApiResult, FetchLike } from './client';
import { currentSettings } from './reporter';
import type { AchievementsSettings } from './config';
import type {
  CatalogResponse, LeaderboardResponse, LinkResponse, PlayerProfile, QueuedResponse, RotateLinkResponse,
} from './contract';

export interface DoorAchievementsApi {
  /** Is this board configured to talk to a server at all? */
  enabled(): boolean;
  register(email: string, handle: string): Promise<ApiResult<QueuedResponse>>;
  resend(email: string): Promise<ApiResult<QueuedResponse>>;
  verify(email: string, code: string): Promise<ApiResult<PlayerProfile>>;
  link(email: string, code: string): Promise<ApiResult<LinkResponse>>;
  unlink(email: string): Promise<ApiResult<LinkResponse>>;
  rotate(email: string, code: string): Promise<ApiResult<RotateLinkResponse>>;
  profile(email: string): Promise<ApiResult<PlayerProfile>>;
  setPrivate(email: string, isPrivate: boolean): Promise<ApiResult<PlayerProfile>>;
  catalog(): Promise<ApiResult<CatalogResponse>>;
  leaderboard(scope: 'global' | 'board', period: 'all' | 'season', limit?: number): Promise<ApiResult<LeaderboardResponse>>;
}

const OFF: ApiResult<never> = { status: 0, body: null, error: 'not_configured', detail: 'this board has no achievements server configured' };

export function doorAchievementsApi(
  settingsOf: () => AchievementsSettings = currentSettings,
  fetchImpl: FetchLike = fetch
): DoorAchievementsApi {
  const call = <T>(method: 'GET' | 'POST' | 'PATCH' | 'DELETE', path: string, body?: unknown): Promise<ApiResult<T>> => {
    const settings = settingsOf();
    if (!settings.enabled) return Promise.resolve(OFF as ApiResult<T>);
    return apiRequest<T>(settings, method, path, body, fetchImpl);
  };
  const enc = (email: string): string => encodeURIComponent(email.trim());
  return {
    enabled: () => settingsOf().enabled,
    register: (email, handle) => call('POST', '/players', { email, handle }),
    resend: (email) => call('POST', '/players/resend', { email }),
    verify: (email, code) => call('POST', '/players/verify', { email, code }),
    link: (email, code) => call('POST', '/links', { email, code }),
    unlink: (email) => call('DELETE', '/links', { email }),
    rotate: (email, code) => call('POST', '/links/rotate', { email, code }),
    profile: (email) => call('GET', `/players/${enc(email)}`),
    setPrivate: (email, isPrivate) => call('PATCH', `/players/${enc(email)}`, { private: isPrivate }),
    catalog: () => call('GET', '/catalog'),
    leaderboard: (scope, period, limit = 50) => {
      const s = scope === 'global' ? 'global' : `board:${settingsOf().boardId}`;
      return call('GET', `/leaderboard?scope=${encodeURIComponent(s)}&period=${period}&limit=${limit}`);
    },
  };
}
