// BBS Configuration System - mirrors AmiExpress configuration structure
import * as path from 'path';

export interface BBSConfig {
  // System Information
  bbsName: string;
  sysopName: string;
  location: string;
  phone: string;

  // Network Settings
  hostname: string;
  port: number;

  // Path Settings
  dataDir: string; // BBS data directory (contains BBS/, Node0/, etc.)

  // Time Settings
  timeZone: string;
  dailyTimeLimit: number;
  sessionTimeLimit: number;

  // Security Settings
  defaultSecLevel: number;
  maxUsers: number;
  newUserSecLevel: number;

  // File Settings
  uploadPath: string;
  downloadPath: string;
  maxFileSize: number;
  fileRatio: number;

  // Message Settings
  maxMessagesPerDay: number;
  maxPrivateMessages: number;

  // Chat Settings
  chatEnabled: boolean;
  chatTimeLimit: number;

  // Door Settings
  doorsEnabled: boolean;
  maxDoorTime: number;

  // Display Settings
  ansiEnabled: boolean;
  screenWidth: number;
  screenHeight: number;
  linesPerScreen: number;

  // Logging Settings
  logLevel: 'error' | 'warning' | 'info' | 'debug';
  logToFile: boolean;
  logPath: string;

  // Database Settings
  dbPath: string;
  dbBackupEnabled: boolean;
  dbBackupInterval: number; // hours

  // Web Settings
  webEnabled: boolean;
  webPort: number;
  webHost: string;
  corsOrigins: string[];
}

export class ConfigManager {
  private config: BBSConfig;
  private configPath: string;

  constructor(configPath: string = 'amiexpress.conf') {
    this.configPath = configPath;
    this.config = this.getDefaultConfig();
    this.loadConfig();
  }

  private getDefaultConfig(): BBSConfig {
    return {
      // System Information
      bbsName: 'AmiExpress Web BBS',
      sysopName: 'Sysop',
      location: 'Server Room',
      phone: '',

      // Network Settings
      hostname: 'localhost',
      port: 3001,

      // Path Settings
      dataDir: process.env.BBS_DATA_DIR || path.join(__dirname, '..'),

      // Time Settings
      timeZone: 'UTC',
      dailyTimeLimit: 120, // 2 hours
      sessionTimeLimit: 60, // 1 hour

      // Security Settings
      defaultSecLevel: 10,
      maxUsers: 1000,
      newUserSecLevel: 10,

      // File Settings
      uploadPath: './uploads',
      downloadPath: './downloads',
      maxFileSize: 10485760, // 10MB
      fileRatio: 1.0,

      // Message Settings
      maxMessagesPerDay: 50,
      maxPrivateMessages: 100,

      // Chat Settings
      chatEnabled: true,
      chatTimeLimit: 30,

      // Door Settings
      doorsEnabled: true,
      maxDoorTime: 60,

      // Display Settings
      ansiEnabled: true,
      screenWidth: 80,
      screenHeight: 24,
      linesPerScreen: 23,

      // Logging Settings
      logLevel: 'info',
      logToFile: true,
      logPath: './logs',

      // Database Settings
      dbPath: './amiexpress.db',
      dbBackupEnabled: true,
      dbBackupInterval: 24,

      // Web Settings
      webEnabled: true,
      webPort: 5173,
      webHost: 'localhost',
      corsOrigins: process.env.CORS_ORIGINS
        ? process.env.CORS_ORIGINS.split(',')
        : ['http://localhost:5173', 'https://bbs.uprough.net']
    };
  }

  private loadConfig(): void {
    try {
      // In a real implementation, this would read from a config file
      // For now, we just use defaults
      console.log('Configuration loaded from:', this.configPath);
    } catch (error) {
      console.warn('Failed to load config, using defaults:', error);
    }
  }

  public saveConfig(): void {
    try {
      // In a real implementation, this would write to a config file
      console.log('Configuration saved to:', this.configPath);
    } catch (error) {
      console.error('Failed to save config:', error);
    }
  }

  public getConfig(): BBSConfig {
    return { ...this.config };
  }

  public updateConfig(updates: Partial<BBSConfig>): void {
    this.config = { ...this.config, ...updates };
    this.saveConfig();
  }

  public get(key: keyof BBSConfig): any {
    return this.config[key];
  }

  public set(key: keyof BBSConfig, value: any): void {
    (this.config as any)[key] = value;
    this.saveConfig();
  }

  // Configuration validation
  public validateConfig(): { valid: boolean, errors: string[] } {
    const errors: string[] = [];

    if (!this.config.bbsName || this.config.bbsName.length === 0) {
      errors.push('BBS name cannot be empty');
    }

    if (this.config.port < 1 || this.config.port > 65535) {
      errors.push('Invalid port number');
    }

    if (this.config.dailyTimeLimit < 0) {
      errors.push('Daily time limit cannot be negative');
    }

    if (this.config.sessionTimeLimit < 0) {
      errors.push('Session time limit cannot be negative');
    }

    if (this.config.defaultSecLevel < 0 || this.config.defaultSecLevel > 255) {
      errors.push('Invalid default security level');
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  // Reset to defaults
  public resetToDefaults(): void {
    this.config = this.getDefaultConfig();
    this.saveConfig();
  }
}

// Export singleton instance
export const config = new ConfigManager();