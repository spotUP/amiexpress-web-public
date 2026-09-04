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
  async downloadFile(url: string, filename: string): Promise<void> {
    const response = await fetch(url, { headers: this.authHeaders() });
    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: response.statusText }));
      throw this.failed(response.status, error, response.statusText);
    }

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
  async getScreenIndex() {
    return this.request<ApiResponse>(`${API_BASE}/screens`);
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

  async getScreenFile(filePath: string) {
    return this.request<ApiResponse>(`${API_BASE}/screens/file?path=${encodeURIComponent(filePath)}`);
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
  async getAuditLog(tableName?: string, recordId?: number, limit?: number) {
    const params = new URLSearchParams();
    if (tableName) params.append('tableName', tableName);
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

  // Admin Permissions
  async getAdminPermissions() {
    return this.request<{ perms: Record<string, number>; sections: Array<{ key: string; label: string }> }>(
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

}

export const apiClient = new ApiClient();
