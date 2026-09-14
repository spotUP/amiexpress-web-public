import type { ApiResponse, User } from '../types';
import {
  readAdminToken, writeAdminToken, readAdminRefreshToken, writeAdminRefreshToken,
} from './auth-token';

const API_BASE = '/api';
const AUTH_BASE = '/auth';

/**
 * An HTTP failure, carrying the status the pages need to tell them apart.
 *
 * Everything used to throw a bare Error, so a 401 and a 500 looked the same
 * to a page - and since apiClient throws on a non-2xx, `data` came back
 * undefined either way and eighteen pages rendered "No doors configured" as a
 * POSITIVE claim about a request that had failed.
 */
/**
 * The filename a `Content-Disposition: attachment` header offers, or null.
 *
 * Handles the quoted form every route here sends and the RFC 5987
 * `filename*=UTF-8''...` form, and refuses anything with a path separator
 * in it: a download must never be able to name a directory.
 */
function filenameFromContentDisposition(header: string | null): string | null {
  if (!header) return null;
  const extended = /filename\*=(?:UTF-8'')?([^;]+)/i.exec(header);
  const plain = /filename="?([^";]+)"?/i.exec(header);
  const raw = extended ? decodeURIComponent(extended[1].trim()) : plain ? plain[1].trim() : null;
  if (!raw) return null;
  const name = raw.replace(/^["']|["']$/g, '');
  return name && !name.includes('/') && !name.includes('\\') ? name : null;
}

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    /**
     * The `data` the board sent with the refusal.
     *
     * A refusal is not always just a sentence: the share endpoint answers 409
     * with every blocked node, the files it would lose and the screens that
     * differ, and the page could not show any of it because the error carried
     * only a message. Reported as "5 nodes cannot share this directory" - true,
     * and useless on its own.
     */
    public readonly data?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

class ApiClient {
  private token: string | null = null;
  private unauthorizedHandler: (() => void) | null = null;
  /**
   * The refresh in flight, if any.
   *
   * A page load fires a dozen requests at once, and an expired token fails all
   * of them. One refresh, awaited by all of them - otherwise the first answer
   * back invalidates the token the others are still refreshing with.
   */
  private refreshInFlight: Promise<boolean> | null = null;

  /**
   * Called when any request comes back 401.
   *
   * AuthContext validates the token ONCE at mount, so an expired session used
   * to present as a working admin with nothing in it. Returns an unsubscribe.
   */
  onUnauthorized(handler: () => void): () => void {
    this.unauthorizedHandler = handler;
    return () => {
      if (this.unauthorizedHandler === handler) this.unauthorizedHandler = null;
    };
  }

  private failed(
    status: number,
    body: { error?: string; message?: string; data?: unknown },
    fallback: string,
  ): ApiError {
    if (status === 401) {
      // Reached only after refreshAccessToken() has been tried and refused.
      this.setToken(null);
      writeAdminRefreshToken(null);
      this.unauthorizedHandler?.();
    }
    return new ApiError(body.error || body.message || fallback, status, body.data);
  }

  constructor() {
    this.token = readAdminToken();
  }

  setToken(token: string | null) {
    this.token = token;
    if (token) {
      writeAdminToken(token);
    } else {
      writeAdminToken(null);
    }
  }

  /**
   * Spend the refresh token for a new access token.
   *
   * The access token lasts eight hours and the refresh token seven days, and
   * until now nothing ever called `/auth/refresh` - the first 401 ended the
   * session, which is what the sysop met as "Token invalid, logging out" after
   * a working day. Returns false when there is nothing to spend or the board
   * refuses it, and clears both tokens in that case: the session really is
   * over then.
   */
  private async refreshAccessToken(): Promise<boolean> {
    if (this.refreshInFlight) return this.refreshInFlight;

    const refreshToken = readAdminRefreshToken();
    if (!refreshToken) return false;

    this.refreshInFlight = (async () => {
      try {
        const response = await fetch(`${AUTH_BASE}/refresh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken }),
        });
        if (!response.ok) return false;

        const body = await response.json().catch(() => ({}));
        if (!body?.accessToken) return false;

        this.setToken(body.accessToken);
        return true;
      } catch {
        // A network failure is not an expired session - the caller's own retry
        // handles it, and the tokens stay put.
        return false;
      } finally {
        this.refreshInFlight = null;
      }
    })();

    const refreshed = await this.refreshInFlight;
    if (!refreshed) writeAdminRefreshToken(null);
    return refreshed;
  }

  getToken(): string | null {
    return this.token;
  }

  /**
   * The Authorization header, for the few callers that cannot use request().
   *
   * The Import and Export components each built this by hand from
   * `localStorage.getItem('token')` - and the JWT is stored under
   * `authToken`, so every one of those eight requests sent
   * `Bearer null` and got a 401. The key belongs in one place.
   */
  authHeaders(extra: Record<string, string> = {}): Record<string, string> {
    return this.token
      ? { ...extra, Authorization: `Bearer ${this.token}` }
      : { ...extra };
  }

  /**
   * Fetch a file with the session's credentials and save it.
   *
   * The export download used `window.open(url + '?token=' + token)`, and the
   * auth middleware reads the Authorization header and nothing else - it has
   * never looked at a query string, so the download could not have worked
   * whatever the key was called.
   */
  /**
   * Fetch a file WITH the Authorization header and hand the browser a blob.
   *
   * A plain `<a href="/api/...">` cannot carry a header, so every admin
   * download written as a link answered `{"error":"Access token required"}`.
   * This is the only way to download from this API; a link is a bug.
   *
   * The server's own `Content-Disposition` filename wins when it sends one
   * (the screen export names its archive with the scope and a timestamp),
   * and `filename` is the fallback for the routes that send none.
   */
  async downloadFile(url: string, filename: string): Promise<void> {
    const response = await fetch(url, { headers: this.authHeaders() });
    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: response.statusText }));
      throw this.failed(response.status, error, response.statusText);
    }

    const offered = filenameFromContentDisposition(response.headers.get('content-disposition'));
    if (offered) filename = offered;
    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);
    try {
      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  }

  private async request<T>(
    url: string,
    options: RequestInit = {}
  ): Promise<T> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string> || {}),
    };

    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    // Retry logic to handle race conditions during server startup
    let lastError: Error | null = null;
    const maxRetries = 3;
    const retryDelay = 500; // ms

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const response = await fetch(url, {
          ...options,
          headers,
        });

        if (!response.ok) {
          const error = await response.json().catch(() => ({
            error: response.statusText,
          }));

          // An expired access token is not the end of the session: spend the
          // refresh token once and repeat the request with the new one. Only
          // if THAT fails is the sysop logged out.
          if (response.status === 401 && !url.startsWith(`${AUTH_BASE}/refresh`)) {
            if (await this.refreshAccessToken()) {
              const retry = await fetch(url, {
                ...options,
                headers: { ...headers, Authorization: `Bearer ${this.token}` },
              });
              if (retry.ok) return await retry.json();

              const retryError = await retry.json().catch(() => ({ error: retry.statusText }));
              throw this.failed(retry.status, retryError, retry.statusText);
            }
          }

          throw this.failed(response.status, error, response.statusText);
        }

        const data = await response.json();
        return data;
      } catch (error) {
        lastError = error as Error;

        // Only retry on network errors (ECONNREFUSED, fetch failures)
        // Don't retry on auth errors or other HTTP errors
        const isNetworkError = error instanceof TypeError ||
                              (error as Error).message.includes('Failed to fetch') ||
                              (error as Error).message.includes('ECONNREFUSED');

        if (!isNetworkError || attempt === maxRetries - 1) {
          throw error;
        }

        // Wait before retrying with exponential backoff
        await new Promise(resolve => setTimeout(resolve, retryDelay * Math.pow(2, attempt)));
      }
    }

    throw lastError || new Error('Request failed after retries');
  }

  private async uploadForm<T>(url: string, formData: FormData): Promise<T> {
    const headers: Record<string, string> = {};

    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: formData,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({
        error: response.statusText,
      }));
      throw this.failed(response.status, error, response.statusText);
    }

    return response.json();
  }

  // Authentication
  async login(username: string, password: string, rememberMe = false) {
    const response = await this.request<{ accessToken: string; refreshToken: string; user: any }>(`${AUTH_BASE}/login`, {
      method: 'POST',
      body: JSON.stringify({ username, password, rememberMe }),
    });
    if (response.accessToken) {
      this.setToken(response.accessToken);
    }
    writeAdminRefreshToken(response.refreshToken ?? null);
    return { token: response.accessToken, user: response.user };
  }

  async me() {
    return this.request<{ user: User }>(`${AUTH_BASE}/me`);
  }

  async logout() {
    this.setToken(null);
    writeAdminRefreshToken(null);
  }

  // Generic HTTP methods for custom endpoints
  async get<T>(url: string): Promise<{ data: T }> {
    const data = await this.request<T>(url);
    return { data };
  }

  async post<T>(url: string, body?: any): Promise<{ data: T }> {
    const data = await this.request<T>(url, {
      method: 'POST',
      body: body ? JSON.stringify(body) : undefined,
    });
    return { data };
  }

  async delete<T>(url: string, options?: { data?: any }): Promise<{ data: T }> {
    const data = await this.request<T>(url, {
      method: 'DELETE',
      body: options?.data ? JSON.stringify(options.data) : undefined,
    });
    return { data };
  }

  /** A PUT that answers the envelope directly, like `request` does. */
  async putJson<T>(url: string, body?: any): Promise<T> {
    return this.request<T>(url, {
      method: 'PUT',
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  async put<T>(url: string, body?: any): Promise<{ data: T }> {
    const data = await this.request<T>(url, {
      method: 'PUT',
      body: body ? JSON.stringify(body) : undefined,
    });
    return { data };
  }

  // Screen files - every screen the board can display.
  //
  // Content crosses as base64 in both directions: a screen carries Amiga
  // high-bit bytes, and a UTF-8 round trip turns one into U+FFFD.
  async getScreenIndex(theme?: string) {
    const suffix = theme && theme !== 'default' ? `?theme=${encodeURIComponent(theme)}` : '';
    return this.request<ApiResponse>(`${API_BASE}/screens${suffix}`);
  }

  /** Every MCI code, with how many times this board writes each one. */
  async getMciCatalog() {
    return this.request<ApiResponse>(`${API_BASE}/screens/mci/catalog`);
  }

  /** What a code's argument can point at: commands, screens, doors or menus. */
  async getMciTargets(kind: 'command' | 'screen' | 'door' | 'menu') {
    return this.request<ApiResponse>(`${API_BASE}/screens/mci/targets?kind=${kind}`);
  }

  /** Every damaged screen at once. `dryRun` names them and writes nothing. */
  async repairAllScreens(dryRun = false) {
    return this.request<ApiResponse>(`${API_BASE}/screens/repair-all`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dryRun }),
    });
  }

  /**
   * The sysop's own answer about what a file IS, over the manager's guess.
   * `art` says the guess is wrong; null clears the mark.
   */
  async flagScreen(filePath: string, flag: 'backup' | 'runtime' | 'art' | null) {
    return this.request<ApiResponse>(`${API_BASE}/screens/flag`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: filePath, flag }),
    });
  }

  /**
   * One screen file, and who reads it THROUGH THE GIVEN THEME.
   *
   * Without the theme the board's own index answers, and a theme's own file is
   * read by nothing there - the board's walk never enters a theme directory -
   * so every screen an artist had redrawn claimed "No screen on this board
   * reads this file".
   */
  async getScreenFile(filePath: string, theme?: string) {
    const themeQuery = theme && theme !== 'default' ? `&theme=${encodeURIComponent(theme)}` : '';
    return this.request<ApiResponse>(`${API_BASE}/screens/file?path=${encodeURIComponent(filePath)}${themeQuery}`);
  }

  /**
   * `carryCodes` keeps the replaced file's MCI codes around the new art -
   * 'above' puts its head block back on top and its tail below, 'below' puts
   * everything after. Default 'none' writes exactly what was sent.
   *
   * `dryRun` answers what WOULD be carried and lost, per target, and writes
   * nothing.
   */
  async putScreenFile(
    filePath: string,
    contentBase64: string,
    targets?: string[],
    options?: { carryCodes?: 'none' | 'above' | 'below'; dryRun?: boolean },
  ) {
    return this.putJson<ApiResponse>(`${API_BASE}/screens/file?path=${encodeURIComponent(filePath)}`, {
      content: contentBase64,
      targets,
      carryCodes: options?.carryCodes,
      dryRun: options?.dryRun,
    });
  }

  /** Put the escape byte back in front of a damaged screen's colour codes. */
  async repairScreenFile(filePath: string) {
    return this.request<ApiResponse>(`${API_BASE}/screens/repair`, {
      method: 'POST',
      body: JSON.stringify({ path: filePath }),
    });
  }

  async deleteScreenFile(filePath: string) {
    return this.request<ApiResponse>(`${API_BASE}/screens/file?path=${encodeURIComponent(filePath)}`, { method: 'DELETE' });
  }

  /** Directories a node's SCREENS tooltype can point at, as the board reports them. */
  async getSharedScreenDirs() {
    return this.request<ApiResponse>(`${API_BASE}/screens/shared-directories`);
  }

  async shareScreens(nodes: number[], sharedDir: string, dryRun = false) {
    return this.request<ApiResponse>(`${API_BASE}/screens/share`, {
      method: 'POST',
      body: JSON.stringify({ nodes, sharedDir, dryRun }),
    });
  }

  async resolveScreen(screen: string, node?: number, conf?: number) {
    const params = new URLSearchParams({ screen });
    if (node !== undefined) params.set('node', String(node));
    if (conf !== undefined) params.set('conf', String(conf));
    return this.request<ApiResponse>(`${API_BASE}/screens/resolve?${params.toString()}`);
  }

  /**
   * What a caller in this theme, at this level, on this node, would be shown.
   *
   * The board's own loader and MCI parser answer it - nothing is re-rendered
   * here - so what comes back is the screen, not an approximation of it.
   */
  async previewScreen(options: {
    screen: string;
    theme?: string;
    node?: number;
    conf?: number;
    sec?: number;
    term?: 'ansi' | 'c64' | 'rip';
  }) {
    const params = new URLSearchParams({ screen: options.screen });
    if (options.theme) params.set('theme', options.theme);
    if (options.node !== undefined) params.set('node', String(options.node));
    if (options.conf !== undefined) params.set('conf', String(options.conf));
    if (options.sec !== undefined) params.set('sec', String(options.sec));
    if (options.term) params.set('term', options.term);
    return this.request<ApiResponse>(`${API_BASE}/screens/preview?${params.toString()}`);
  }

  // System Configuration
  async getSystemConfig() {
    return this.request<ApiResponse>(`${API_BASE}/config/system`);
  }

  async updateSystemConfig(updates: any) {
    return this.request<ApiResponse>(`${API_BASE}/config/system`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
  }

  // Node Configuration
  async getNodeConfigs() {
    return this.request<ApiResponse>(`${API_BASE}/config/nodes`);
  }

  async getNodeConfig(nodeNumber: number) {
    return this.request<ApiResponse>(`${API_BASE}/config/nodes/${nodeNumber}`);
  }

  async createNodeConfig(config: any) {
    return this.request<ApiResponse>(`${API_BASE}/config/nodes`, {
      method: 'POST',
      body: JSON.stringify(config),
    });
  }

  async updateNodeConfig(nodeNumber: number, updates: any) {
    return this.request<ApiResponse>(`${API_BASE}/config/nodes/${nodeNumber}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
  }

  async deleteNodeConfig(nodeNumber: number) {
    return this.request<ApiResponse>(`${API_BASE}/config/nodes/${nodeNumber}`, {
      method: 'DELETE',
    });
  }

  // Conference Configuration
  async getConferenceConfigs() {
    return this.request<ApiResponse>(`${API_BASE}/config/conferences`);
  }

  async getConferenceConfig(confNumber: number) {
    return this.request<ApiResponse>(`${API_BASE}/config/conferences/${confNumber}`);
  }

  async createConferenceConfig(config: any) {
    return this.request<ApiResponse>(`${API_BASE}/config/conferences`, {
      method: 'POST',
      body: JSON.stringify(config),
    });
  }

  async updateConferenceConfig(confNumber: number, updates: any) {
    return this.request<ApiResponse>(`${API_BASE}/config/conferences/${confNumber}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
  }

  // Conference directories nothing points at. A delete leaves the directory
  // alone unless the sysop asks for it, so a board collects them.
  async getOrphanConferenceDirs() {
    return this.request<ApiResponse>(`${API_BASE}/config/conferences/orphan-directories`);
  }

  async removeOrphanConferenceDir(dir: string) {
    return this.request<ApiResponse>(
      `${API_BASE}/config/conferences/orphan-directories/${encodeURIComponent(dir)}`,
      { method: 'DELETE' },
    );
  }

  async deleteConferenceConfig(confNumber: number, removeFiles = false) {
    const query = removeFiles ? '?removeFiles=true' : '';
    return this.request<ApiResponse>(`${API_BASE}/config/conferences/${confNumber}${query}`, {
      method: 'DELETE',
    });
  }

  // Doors
  async getDoors() {
    return this.request<ApiResponse>(`${API_BASE}/config/doors`);
  }

  // Bot plugins (WHIP mirror first): registry, status, logs, actions, config.
  async getBotPlugins() {
    return this.request<ApiResponse>(`${API_BASE}/config/bots`);
  }

  async getBotStatus(id: string) {
    return this.request<ApiResponse>(`${API_BASE}/config/bots/${encodeURIComponent(id)}/status`);
  }

  async getBotLogs(id: string, lines = 200, search = '') {
    const params = new URLSearchParams({ lines: String(lines) });
    if (search) params.set('search', search);
    return this.request<ApiResponse>(`${API_BASE}/config/bots/${encodeURIComponent(id)}/logs?${params}`);
  }

  async botAction(id: string, action: 'start' | 'stop' | 'restart') {
    return this.request<ApiResponse>(`${API_BASE}/config/bots/${encodeURIComponent(id)}/${action}`, {
      method: 'POST',
    });
  }

  async getBotConfig(id: string) {
    return this.request<ApiResponse>(`${API_BASE}/config/bots/${encodeURIComponent(id)}/config`);
  }

  async setBotConfig(id: string, values: Record<string, string>) {
    return this.putJson<ApiResponse>(`${API_BASE}/config/bots/${encodeURIComponent(id)}/config`, { values });
  }

  async getDoor(id: number) {
    return this.request<ApiResponse>(`${API_BASE}/config/doors/${id}`);
  }

  async createDoor(door: any) {
    return this.request<ApiResponse>(`${API_BASE}/config/doors`, {
      method: 'POST',
      body: JSON.stringify(door),
    });
  }

  async updateDoor(id: number, updates: any) {
    return this.request<ApiResponse>(`${API_BASE}/config/doors/${id}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
  }

  /**
   * Delete a door by its COMMAND, not by its row in the list.
   *
   * The list numbers doors by position, and that number used to be sent
   * here and looked up as a database row - so a delete could remove a
   * different door's registration than the one on screen.
   */
  async deleteDoor(command: string) {
    return this.request<ApiResponse>(`${API_BASE}/config/doors/${encodeURIComponent(command)}`, {
      method: 'DELETE',
    });
  }

  async uploadDoorArchive(file: File) {
    const formData = new FormData();
    formData.append('door', file);
    return this.uploadForm<ApiResponse>(`${API_BASE}/upload/door`, formData);
  }

  async installDoorArchive(archive: { filename?: string; path?: string }) {
    return this.request<ApiResponse>(`${API_BASE}/config/doors/install-archive`, {
      method: 'POST',
      body: JSON.stringify(archive),
    });
  }

  // Languages
  // ===== New-user questionnaire =====
  async getQuestionnaire() {
    return this.request<ApiResponse>(`${API_BASE}/questionnaire`);
  }
  async saveQuestionnaire(text: string) {
    return this.request<ApiResponse>(`${API_BASE}/questionnaire`, {
      method: 'PUT', body: JSON.stringify({ text }),
    });
  }
  async setQuestionnaireEnabled(enabled: boolean) {
    return this.request<ApiResponse>(`${API_BASE}/questionnaire/enabled`, {
      method: 'POST', body: JSON.stringify({ enabled }),
    });
  }

  // ===== Screen themes =====
  // A theme is a full set of board art one artist owns. These four calls are
  // the whole surface: the server answers what THIS account may do with each
  // theme, so the page never re-decides a permission.

  async getScreenThemes() {
    return this.request<ApiResponse>(`${API_BASE}/themes`);
  }

  async createScreenTheme(theme: { slug: string; title: string; author?: string; owner?: string; widths?: number[]; doorTheme?: string }) {
    return this.request<ApiResponse>(`${API_BASE}/themes`, {
      method: 'POST',
      body: JSON.stringify(theme),
    });
  }

  async updateScreenTheme(slug: string, updates: Record<string, unknown>) {
    return this.request<ApiResponse>(`${API_BASE}/themes/${encodeURIComponent(slug)}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
  }

  /** Copy a board screen into a theme, as the artist's starting point. */
  async copyScreenIntoTheme(slug: string, boardPath: string) {
    return this.request<ApiResponse>(`${API_BASE}/themes/${encodeURIComponent(slug)}/copy`, {
      method: 'POST',
      body: JSON.stringify({ path: boardPath }),
    });
  }

  /** Can this theme be published without breaking a caller? The publish gate's own answer. */
  async getScreenThemeValidation(slug: string) {
    return this.request<ApiResponse>(`${API_BASE}/themes/${encodeURIComponent(slug)}/validation`);
  }

  async setDefaultScreenTheme(slug: string) {
    return this.request<ApiResponse>(`${API_BASE}/themes/default`, {
      method: 'POST',
      body: JSON.stringify({ slug }),
    });
  }

  async getLanguages() {
    return this.request<ApiResponse>(`${API_BASE}/config/languages`);
  }

  async createLanguage(language: any) {
    return this.request<ApiResponse>(`${API_BASE}/config/languages`, {
      method: 'POST',
      body: JSON.stringify(language),
    });
  }

  async updateLanguage(id: number, updates: any) {
    return this.request<ApiResponse>(`${API_BASE}/config/languages/${id}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
  }

  async deleteLanguage(id: number) {
    return this.request<ApiResponse>(`${API_BASE}/config/languages/${id}`, {
      method: 'DELETE',
    });
  }

  // Protocols
  async getProtocols() {
    return this.request<ApiResponse>(`${API_BASE}/config/protocols`);
  }

  async createProtocol(protocol: any) {
    return this.request<ApiResponse>(`${API_BASE}/config/protocols`, {
      method: 'POST',
      body: JSON.stringify(protocol),
    });
  }

  async updateProtocol(id: number, updates: any) {
    return this.request<ApiResponse>(`${API_BASE}/config/protocols/${id}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
  }

  async deleteProtocol(id: number) {
    return this.request<ApiResponse>(`${API_BASE}/config/protocols/${id}`, {
      method: 'DELETE',
    });
  }

  // Security levels, as the BBS stores them: Access/ACS.<level>.info on disk.
  // The endpoints below this comment write a database table the BBS never
  // reads - see thoughts/shared/research/2026-08-27_admin-ui-audit.md.
  async getAcsLevels() {
    return this.request<ApiResponse>(`${API_BASE}/config/security/levels`);
  }

  async getAcsLevelFlags(level: number) {
    return this.request<ApiResponse>(`${API_BASE}/config/security/levels/${level}`);
  }

  async saveAcsLevelFlags(level: number, flags: Record<string, boolean>) {
    return this.request<ApiResponse>(`${API_BASE}/config/security/levels/${level}`, {
      method: 'PUT',
      body: JSON.stringify({ flags }),
    });
  }

  async createAcsLevel(level: number, copyFrom?: number) {
    return this.request<ApiResponse>(`${API_BASE}/config/security/levels/${level}`, {
      method: 'POST',
      body: JSON.stringify(copyFrom === undefined ? {} : { copyFrom }),
    });
  }

  // Door settings - what a door declares it can be configured with
  async getDoorSettings(command: string) {
    return this.request<ApiResponse>(`${API_BASE}/config/doors/${encodeURIComponent(command)}/settings`);
  }

  async saveDoorSettings(command: string, values: Record<string, string | number | boolean>) {
    return this.request<ApiResponse>(`${API_BASE}/config/doors/${encodeURIComponent(command)}/settings`, {
      method: 'PUT',
      body: JSON.stringify({ values }),
    });
  }

  // Door art sections - art living inside a door's config file (Bulls' Title
  // logo in Bulls.CFG), edited in the ANSI Studio, never in a settings form.
  async listDoorArt() {
    return this.request<ApiResponse>(`${API_BASE}/config/doors-art`);
  }

  async getDoorArt(command: string) {
    return this.request<ApiResponse>(`${API_BASE}/config/doors/${encodeURIComponent(command)}/art`);
  }

  /**
   * One narrow drawing: the art a 40-column caller reads instead of the
   * door's own. Absent, the answer is empty content - an undrawn variant is
   * a blank canvas, not an error.
   */
  async getDoorArtVariant(command: string, file: string, section: string, variant: 'c64' | 'ttx') {
    const q = new URLSearchParams({ file, section, variant }).toString();
    return this.request<ApiResponse>(`${API_BASE}/config/doors/${encodeURIComponent(command)}/art?${q}`);
  }

  async saveDoorArt(
    command: string,
    file: string,
    section: string,
    contentBase64: string,
    variant?: 'c64' | 'ttx',
  ) {
    return this.request<ApiResponse>(`${API_BASE}/config/doors/${encodeURIComponent(command)}/art`, {
      method: 'PUT',
      body: JSON.stringify({ file, section, content: contentBase64, ...(variant ? { variant } : {}) }),
    });
  }

  /*
   * There were four more methods here - get/create/update/deleteSecurityAccess
   * - on /config/security/*, with no caller anywhere in this app. They read
   * and wrote the DATABASE MIRROR of security levels, keyed CENSORED, while
   * the four above read and write Access/ACS.<level>.info, keyed ACS.CENSORED,
   * which is what AmiExpress actually reads. Two endpoint families describing
   * the same thing, one of them dead in this app and one line away from being
   * picked up by mistake.
   *
   * The routes stay - dev/console still uses them - and the trap does not.
   */

  // Drives
  async getDrives() {
    return this.request<ApiResponse>(`${API_BASE}/config/drives`);
  }

  async getDrive(id: number) {
    return this.request<ApiResponse>(`${API_BASE}/config/drives/${id}`);
  }

  async createDrive(drive: any) {
    return this.request<ApiResponse>(`${API_BASE}/config/drives`, {
      method: 'POST',
      body: JSON.stringify(drive),
    });
  }

  async updateDrive(id: number, updates: any) {
    return this.request<ApiResponse>(`${API_BASE}/config/drives/${id}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
  }

  async deleteDrive(id: number) {
    return this.request<ApiResponse>(`${API_BASE}/config/drives/${id}`, {
      method: 'DELETE',
    });
  }

  async getStorageProviders() {
    return this.request<ApiResponse>(`${API_BASE}/config/storage-providers`);
  }

  async getDrivePoolStatus() {
    return this.request<ApiResponse>(`${API_BASE}/config/drives/pool/status`);
  }

  async discardParkedFile(localPath: string) {
    return this.request<ApiResponse>(`${API_BASE}/config/drives/pool/parked/discard`, {
      method: 'POST',
      body: JSON.stringify({ localPath }),
    });
  }

  async writeDriveSecret(driveNumber: number, secret: string) {
    return this.request<ApiResponse>(`${API_BASE}/config/drives/${driveNumber}/secret`, {
      method: 'POST',
      body: JSON.stringify({ secret }),
    });
  }

  async testDrive(driveNumber: number) {
    return this.request<ApiResponse>(`${API_BASE}/config/drives/${driveNumber}/test`, {
      method: 'POST',
    });
  }

  async getDriveContents(driveNumber: number) {
    return this.request<ApiResponse>(`${API_BASE}/config/drives/${driveNumber}/contents`);
  }

  // Computer Types
  async getComputerTypes() {
    return this.request<ApiResponse>(`${API_BASE}/config/computers`);
  }

  async getComputerType(id: number) {
    return this.request<ApiResponse>(`${API_BASE}/config/computers/${id}`);
  }

  async createComputerType(type: any) {
    return this.request<ApiResponse>(`${API_BASE}/config/computers`, {
      method: 'POST',
      body: JSON.stringify(type),
    });
  }

  async updateComputerType(id: number, updates: any) {
    return this.request<ApiResponse>(`${API_BASE}/config/computers/${id}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
  }

  async deleteComputerType(id: number) {
    return this.request<ApiResponse>(`${API_BASE}/config/computers/${id}`, {
      method: 'DELETE',
    });
  }

  // Screen Types
  async getScreenTypes() {
    return this.request<ApiResponse>(`${API_BASE}/config/screen-types`);
  }

  async getScreenType(id: number) {
    return this.request<ApiResponse>(`${API_BASE}/config/screen-types/${id}`);
  }

  async createScreenType(type: any) {
    return this.request<ApiResponse>(`${API_BASE}/config/screen-types`, {
      method: 'POST',
      body: JSON.stringify(type),
    });
  }

  async updateScreenType(id: number, updates: any) {
    return this.request<ApiResponse>(`${API_BASE}/config/screen-types/${id}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
  }

  async deleteScreenType(id: number) {
    return this.request<ApiResponse>(`${API_BASE}/config/screen-types/${id}`, {
      method: 'DELETE',
    });
  }

  // File Checkers
  async getFileCheckers() {
    return this.request<ApiResponse>(`${API_BASE}/config/file-checkers`);
  }

  async getFileChecker(id: number) {
    return this.request<ApiResponse>(`${API_BASE}/config/file-checkers/${id}`);
  }

  async createFileChecker(checker: any) {
    return this.request<ApiResponse>(`${API_BASE}/config/file-checkers`, {
      method: 'POST',
      body: JSON.stringify(checker),
    });
  }

  async updateFileChecker(id: number, updates: any) {
    return this.request<ApiResponse>(`${API_BASE}/config/file-checkers/${id}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
  }

  async deleteFileChecker(id: number) {
    return this.request<ApiResponse>(`${API_BASE}/config/file-checkers/${id}`, {
      method: 'DELETE',
    });
  }

  async getFileCheckerErrors(checkerId: number) {
    return this.request<ApiResponse>(`${API_BASE}/config/file-checkers/${checkerId}/errors`);
  }

  async createFileCheckerError(checkerId: number, error: any) {
    return this.request<ApiResponse>(`${API_BASE}/config/file-checkers/${checkerId}/errors`, {
      method: 'POST',
      body: JSON.stringify(error),
    });
  }

  async deleteFileCheckerError(id: number) {
    return this.request<ApiResponse>(`${API_BASE}/config/file-checker-errors/${id}`, {
      method: 'DELETE',
    });
  }

  // User Management
  async getUsers() {
    return this.request<ApiResponse>(`${API_BASE}/config/users`);
  }

  async getUser(id: string) {
    return this.request<ApiResponse>(`${API_BASE}/config/users/${id}`);
  }

  async createUser(user: any) {
    return this.request<ApiResponse>(`${API_BASE}/config/users`, {
      method: 'POST',
      body: JSON.stringify(user),
    });
  }

  async updateUser(id: string, updates: any) {
    return this.request<ApiResponse>(`${API_BASE}/config/users/${id}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
  }

  async deleteUser(id: string) {
    return this.request<ApiResponse>(`${API_BASE}/config/users/${id}`, {
      method: 'DELETE',
    });
  }

  // Audit Log
  //
  // The backend reads req.query.table (config-routes.ts:2012-2017), not
  // `tableName` - the table filter on this page silently matched nothing on
  // every request. Found while porting this endpoint to dev/console; fixed
  // here too since the bug is in this shared param name, not the TUI.
  async getAuditLog(tableName?: string, recordId?: number, limit?: number) {
    const params = new URLSearchParams();
    if (tableName) params.append('table', tableName);
    if (recordId) params.append('recordId', recordId.toString());
    if (limit) params.append('limit', limit.toString());

    const query = params.toString();
    const url = query ? `${API_BASE}/config/audit?${query}` : `${API_BASE}/config/audit`;

    return this.request<ApiResponse>(url);
  }

  // SSH Key Management
  async getSSHKeyInfo() {
    return this.request<ApiResponse>(`${API_BASE}/config/ssh-key`);
  }

  async generateSSHKey(keySize: number = 4096, overwrite: boolean = false) {
    return this.request<ApiResponse>(`${API_BASE}/config/ssh-key/generate`, {
      method: 'POST',
      body: JSON.stringify({ keySize, overwrite }),
    });
  }

  async deleteSSHKey() {
    return this.request<ApiResponse>(`${API_BASE}/config/ssh-key`, {
      method: 'DELETE',
    });
  }

  // SMTP Testing
  async testSmtp() {
    return this.request<ApiResponse>(`${API_BASE}/config/smtp/test`, {
      method: 'POST',
    });
  }

  // Logs
  async getLogs(type: string = 'backend', lines: number = 500, search: string = '', doorLog?: string) {
    const params = new URLSearchParams();
    params.append('type', type);
    params.append('lines', lines.toString());
    if (search) params.append('search', search);
    if (doorLog) params.append('doorLog', doorLog);

    return this.request<ApiResponse>(`${API_BASE}/config/logs?${params.toString()}`);
  }

  async getDoorLogFiles() {
    return this.request<ApiResponse>(`${API_BASE}/config/logs/door-68k`);
  }

  async clearLogs(type: string = 'backend', doorLog?: string) {
    const params = new URLSearchParams();
    params.append('type', type);
    if (doorLog) params.append('doorLog', doorLog);

    return this.request<ApiResponse>(`${API_BASE}/config/logs?${params.toString()}`, {
      method: 'DELETE',
    });
  }

  // Deployment & health
  async getDeploymentHealth() {
    return this.request(`${API_BASE}/deployment/health`);
  }

  async getDeploymentSystemInfo() {
    return this.request(`${API_BASE}/deployment/system-info`);
  }

  async getDeploymentDatabaseStats() {
    return this.request(`${API_BASE}/deployment/database-stats`);
  }

  // Batches
  async getBatches(): Promise<{ batches: string[] }> {
    return this.request<{ batches: string[] }>(`${API_BASE}/batches`);
  }

  async getBatch(name: string): Promise<{ name: string; content: string }> {
    return this.request<{ name: string; content: string }>(`${API_BASE}/batches/${name}`);
  }

  async saveBatch(name: string, content: string): Promise<{ name: string; saved: boolean }> {
    return this.request<{ name: string; saved: boolean }>(`${API_BASE}/batches/${name}`, {
      method: 'PUT',
      body: JSON.stringify({ content }),
    });
  }

  async validateBatch(name: string, content: string) {
    return this.request(`${API_BASE}/batches/validate`, {
      method: 'POST',
      body: JSON.stringify({ name, content }),
    });
  }

  // Session Logs
  async getSessions() {
    return this.request<ApiResponse>(`${API_BASE}/sessions`);
  }

  async getSessionLog(sessionId: string) {
    return this.request<ApiResponse>(`${API_BASE}/sessions/${sessionId}/log`);
  }

  async getSessionLogRaw(sessionId: string) {
    const response = await fetch(`${API_BASE}/sessions/${sessionId}/log/raw`, {
      headers: {
        'Authorization': `Bearer ${this.token}`,
      },
    });
    if (!response.ok) throw new Error('Failed to fetch raw log');
    return await response.text();
  }

  async saveSessionLog(sessionId: string) {
    return this.request<ApiResponse>(`${API_BASE}/sessions/${sessionId}/save`, {
      method: 'POST',
    });
  }

  async getSessionStats() {
    return this.request<ApiResponse>(`${API_BASE}/sessions/stats`);
  }

  // Health Check
  async getHealthCheck() {
    return this.request<ApiResponse>(`${API_BASE}/config/health`);
  }

  async autoFixHealth() {
    return this.request<ApiResponse>(`${API_BASE}/config/health/auto-fix`, {
      method: 'POST',
    });
  }

  // Info Editor
  async getInfoFiles() {
    return this.request<ApiResponse>(`${API_BASE}/info-editor/files`);
  }

  async getInfoFile(relativePath: string) {
    return this.request<ApiResponse>(`${API_BASE}/info-editor/file?path=${encodeURIComponent(relativePath)}`);
  }

  async updateInfoFile(relativePath: string, tooltypes: any[]) {
    return this.request<ApiResponse>(`${API_BASE}/info-editor/file`, {
      method: 'PUT',
      body: JSON.stringify({ path: relativePath, tooltypes }),
    });
  }

  async toggleTooltypeComment(relativePath: string, key: string) {
    return this.request<ApiResponse>(`${API_BASE}/info-editor/toggle`, {
      method: 'POST',
      body: JSON.stringify({ path: relativePath, key }),
    });
  }

  // Operator Chat Configuration
  async getOperatorChatConfig() {
    return this.request<ApiResponse>(`${API_BASE}/config/operator-chat`);
  }

  async updateOperatorChatConfig(config: any) {
    return this.request<ApiResponse>(`${API_BASE}/config/operator-chat`, {
      method: 'PUT',
      body: JSON.stringify(config),
    });
  }

  /*
   * Co-sysop personas.
   *
   * Through the client like everything else: the page hand-rolled six
   * `fetch` calls with their own `Authorization` header, so a 401 went
   * nowhere near the session handling and a failure answered
   * `TypeError: cannot read properties of undefined`.
   */
  async getPersonas() {
    return this.request<ApiResponse>(`${API_BASE}/config/operator-chat/personas`);
  }

  async savePersona(draft: unknown) {
    return this.request<ApiResponse>(`${API_BASE}/config/operator-chat/personas`, {
      method: 'PUT',
      body: JSON.stringify(draft),
    });
  }

  async deletePersona(slug: string) {
    return this.request<ApiResponse>(
      `${API_BASE}/config/operator-chat/personas/${encodeURIComponent(slug)}`,
      { method: 'DELETE' },
    );
  }

  /** The system prompt this draft would compose to - shown, never edited. */
  async composePersona(draft: unknown) {
    return this.request<ApiResponse>(`${API_BASE}/config/operator-chat/personas/compose`, {
      method: 'POST',
      body: JSON.stringify(draft),
    });
  }

  async describePersona(description: string) {
    return this.request<ApiResponse>(`${API_BASE}/config/operator-chat/personas/describe`, {
      method: 'POST',
      body: JSON.stringify({ description }),
    });
  }

  /** One exchange with the draft, with no caller paged. */
  async tryPersona(draft: unknown, message: string) {
    return this.request<ApiResponse>(`${API_BASE}/config/operator-chat/personas/try`, {
      method: 'POST',
      body: JSON.stringify({ draft, message }),
    });
  }

  // Admin Permissions
  async getAdminPermissions() {
    return this.request<{
      perms: Record<string, number>;
      sections: Array<{ key: string; label: string; defaultMinLevel: number }>;
    }>(
      `${API_BASE}/admin-permissions`
    );
  }

  async setAdminPermissions(perms: Record<string, number>) {
    return this.request<{ perms: Record<string, number> }>(`${API_BASE}/admin-permissions`, {
      method: 'PUT',
      body: JSON.stringify({ perms }),
    });
  }

  // Sprite Manager
  async listSpriteDoors() {
    return this.request<{ doors: string[] }>(`${API_BASE}/sprite-manager/doors`);
  }

  async listSprites(door: string) {
    return this.request<{ door: string; sprites: Array<{ file: string; size: number; mtime: number; animationCount: number; dimensions: { width: number; height: number } }> }>(
      `${API_BASE}/sprite-manager/${encodeURIComponent(door)}/sprites`
    );
  }

  async getSprite(door: string, file: string) {
    return this.request<{ content: string; door: string; file: string }>(
      `${API_BASE}/sprite-manager/${encodeURIComponent(door)}/sprite/${encodeURIComponent(file)}`
    );
  }

  async putSprite(door: string, file: string, content: string) {
    return this.request<{ written: boolean }>(`${API_BASE}/sprite-manager/${encodeURIComponent(door)}/sprite/${encodeURIComponent(file)}`, {
      method: 'PUT',
      body: JSON.stringify({ content }),
    });
  }

  async deleteSprite(door: string, file: string) {
    return this.request<{ deleted: boolean }>(`${API_BASE}/sprite-manager/${encodeURIComponent(door)}/sprite/${encodeURIComponent(file)}`, {
      method: 'DELETE',
    });
  }

  // Bulls Menu (Bulls.CFG for the 68K Bulls door)
  async getBullsConfig() {
    return this.request<{ raw: string; entries: Array<{ line: number; title: string; file: string }>; problems: Array<{ line: number; kind: string; message: string }> }>(
      `${API_BASE}/config/bulls`
    );
  }


  async saveBullsEntries(entries: Array<{ title: string; file: string }>) {
    return this.request<{ raw: string; entries: Array<{ line: number; title: string; file: string }>; problems: Array<{ line: number; kind: string; message: string }> }>(
      `${API_BASE}/config/bulls/entries`,
      {
        method: 'PUT',
        body: JSON.stringify({ entries }),
      }
    );
  }

  async listBulletins() {
    return this.request<{ bulletins: Array<{ name: string; size: number; mtimeMs: number; generated: boolean; generator?: string }> }>(
      `${API_BASE}/config/bulls/bulletins`
    );
  }

  async getBulletin(name: string) {
    return this.request<{ name: string; content: string }>(
      `${API_BASE}/config/bulls/bulletins/${encodeURIComponent(name)}`
    );
  }

  async saveBulletin(name: string, content: string) {
    return this.request<{ name: string; size: number; mtimeMs: number }>(
      `${API_BASE}/config/bulls/bulletins/${encodeURIComponent(name)}`,
      {
        method: 'PUT',
        body: JSON.stringify({ content }),
      }
    );
  }

  // Screen Revisions
  /**
   * The three revision calls answer with the API ENVELOPE, like every other
   * route here - `{ success, data, message }`. They used to be typed as the
   * payload itself, so the revisions panel read `data.revisions` off the
   * envelope, got undefined, and threw on `revisions.length` the moment a
   * sysop pressed Revisions: the whole page went black.
   */
  async getScreenRevisions(path: string) {
    return this.request<ApiResponse<{ revisions: Array<{ ts: string; file: string; bytes: number; sha256: string; source: string }> }>>(
      `${API_BASE}/screens/revisions?path=${encodeURIComponent(path)}`
    );
  }

  async getScreenRevision(path: string, file: string) {
    return this.request<ApiResponse<{ content: string; bytes: number }>>(
      `${API_BASE}/screens/revision?path=${encodeURIComponent(path)}&file=${encodeURIComponent(file)}`
    );
  }

  async restoreScreenRevision(path: string, file: string) {
    return this.request<ApiResponse<{ restored: string }>>(`${API_BASE}/screens/restore`, {
      method: 'POST',
      body: JSON.stringify({ path, file }),
    });
  }

  // Message Repair
  async repairMessageHeaders(confId: number) {
    return this.request<{ rebuilt: number; conference: number }>(
      `${API_BASE}/config/messages/repair-headers?conf=${confId}`,
      { method: 'POST' }
    );
  }

}

export const apiClient = new ApiClient();
