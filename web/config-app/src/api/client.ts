import type { ApiResponse, User } from '../types';

const API_BASE = '/api';
const AUTH_BASE = '/auth';

class ApiClient {
  private token: string | null = null;

  constructor() {
    this.token = localStorage.getItem('authToken');
  }

  setToken(token: string | null) {
    this.token = token;
    if (token) {
      localStorage.setItem('authToken', token);
    } else {
      localStorage.removeItem('authToken');
    }
  }

  getToken(): string | null {
    return this.token;
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
          throw new Error(error.error || error.message || response.statusText);
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
      throw new Error(error.error || error.message || response.statusText);
    }

    return response.json();
  }

  // Authentication
  async login(username: string, password: string) {
    const response = await this.request<{ accessToken: string; refreshToken: string; user: any }>(`${AUTH_BASE}/login`, {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    });
    if (response.accessToken) {
      this.setToken(response.accessToken);
    }
    return { token: response.accessToken, user: response.user };
  }

  async me() {
    return this.request<{ user: User }>(`${AUTH_BASE}/me`);
  }

  async logout() {
    this.setToken(null);
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

  async deleteConferenceConfig(confNumber: number) {
    return this.request<ApiResponse>(`${API_BASE}/config/conferences/${confNumber}`, {
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

  async deleteDoor(id: number) {
    return this.request<ApiResponse>(`${API_BASE}/config/doors/${id}`, {
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

  // Security Level Access
  async getSecurityAccessForLevel(level: number) {
    return this.request<ApiResponse>(`${API_BASE}/config/security/${level}`);
  }

  async createSecurityAccess(access: any) {
    return this.request<ApiResponse>(`${API_BASE}/config/security`, {
      method: 'POST',
      body: JSON.stringify(access),
    });
  }

  async updateSecurityAccess(id: number, updates: any) {
    return this.request<ApiResponse>(`${API_BASE}/config/security/${id}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
  }

  async deleteSecurityAccess(id: number) {
    return this.request<ApiResponse>(`${API_BASE}/config/security/${id}`, {
      method: 'DELETE',
    });
  }

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

  // Logs
  async getLogs(type: string = 'backend', lines: number = 500, search: string = '') {
    const params = new URLSearchParams();
    params.append('type', type);
    params.append('lines', lines.toString());
    if (search) params.append('search', search);

    return this.request<ApiResponse>(`${API_BASE}/config/logs?${params.toString()}`);
  }

  async clearLogs(type: string = 'backend') {
    return this.request<ApiResponse>(`${API_BASE}/config/logs?type=${type}`, {
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
  async getBatches() {
    return this.request<ApiResponse>(`${API_BASE}/batches`);
  }

  async getBatch(name: string) {
    return this.request<ApiResponse>(`${API_BASE}/batches/${name}`);
  }

  async saveBatch(name: string, content: string) {
    return this.request<ApiResponse>(`${API_BASE}/batches/${name}`, {
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
}

export const apiClient = new ApiClient();
