export interface NodeStatus {
  nodeId: number;
  online: boolean;
  userId?: string;
  username?: string;
  location?: string;
  state?: string;
  currentActivity?: string;
  connectionType?: string;
  lastActivity?: string;
  timeRemaining?: number;
}

export interface UserRecord {
  id?: string;
  username: string;
  realname?: string;
  location?: string;
  secLevel?: number;
  seclevel?: number;
  calls?: number;
  lastOn?: string;
  lastLogin?: string;
  uploads?: number;
  downloads?: number;
  flags?: number;
}

export interface ConferenceConfig {
  id: number;
  conference_id: number;
  name: string;
  ndirs: number;
  [key: string]: unknown;
}

export interface CallerRecord {
  id: number;
  nodeId: number;
  userId: string;
  username: string;
  action: string;
  details?: string;
  location: string;
  timestamp: string;
}

export interface SystemStats {
  allTime: {
    totalUsers: number;
    totalMessages: number;
    totalFiles: number;
    totalBytes: number;
    totalDownloads: number;
    totalCalls: number;
  };
  today: {
    calls: number;
    activeUsers: number;
  };
}

export interface LogResponse {
  lines: string[];
  totalLines: number;
  logFile?: string;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  message?: string;
}

export interface AuthResponse {
  token: string;
  user: { id: string; username: string; secLevel: number };
}

export interface DoorInfo {
  id: string | number;
  door_name: string;
  door_command?: string;
  door_type: string;
  door_path?: string;
  enabled: boolean;
  description?: string;
}

export interface ConferenceHealth {
  conferenceId: number;
  name: string;
  healthy: boolean;
  issues: string[];
  fixable: boolean;
}

export interface SystemConfig {
  bbs_name: string;
  sysop_name: string;
  max_nodes: number;
  new_user_sec_level: number;
  telnet_port: number;
  ssh_port?: number;
  [key: string]: unknown;
}

// Phase C: CRUD pages — types mirror the backend SQL columns directly.
export interface LanguageRow {
  id: number;
  language_number: number;
  title: string;
  language_code?: string;
  file_path?: string;
  enabled: boolean;
}
export interface ProtocolRow {
  id: number;
  protocol_name: string;
  protocol_code?: string;
  command?: string;
  upload_command?: string;
  download_command?: string;
  batch_upload?: boolean;
  batch_download?: boolean;
  bidirectional?: boolean;
  enabled: boolean;
  is_default?: boolean;
}
export interface ComputerRow {
  id: number;
  computer_number: number;
  computer_name: string;
  enabled: boolean;
}
export interface ScreenTypeRow {
  id: number;
  screen_number: number;
  screen_type: string;
  screen_title?: string;
  enabled: boolean;
}
export interface DriveRow {
  id: number;
  drive_number: number;
  drive_path: string;
  enabled: boolean;
}
export interface FileCheckerRow {
  id: number;
  checker_name: string;
  checker_path?: string;
  options?: string;
  stack_size?: number;
  priority?: number;
  script_path?: string;
  enabled: boolean;
}
export interface SecurityRow {
  id: number;
  security_level: number;
  acs_flag: string;
  enabled: boolean;
  description?: string;
}
