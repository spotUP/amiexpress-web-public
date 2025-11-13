// User types
export interface User {
  id: number;
  username: string;
  email: string;
  secLevel: number;
  created_at: Date;
}

// Authentication
export interface LoginRequest {
  username: string;
  password: string;
}

export interface LoginResponse {
  token: string;
  user: User;
}

// Configuration types
export interface SystemConfig {
  id: number;
  bbs_name: string;
  sysop_name: string;
  min_password_length: number;
  max_session_time: number;
  inactivity_timeout: number;
  min_baud_rate: number;
  max_upload_size_kb: number;
  download_timeout: number;
  enable_guest_access: boolean;
  guest_sec_level: number;
  new_user_sec_level: number;
  allow_alias: boolean;
  allow_ansi: boolean;
  allow_avatar: boolean;
  max_login_attempts: number;
  show_last_callers: boolean;
  show_who_is_online: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface NodeConfig {
  id: number;
  node_number: number;
  node_start: string;
  priority: number;
  capitol_files: boolean;
  telnet: boolean;
  ftp: boolean;
  sysop_chat_color: number;
  user_chat_color: number;
  nrams: string[];
  created_at: Date;
  updated_at: Date;
}

export interface ConferenceConfig {
  id: number;
  conference_id: number;

  // Directory Settings (1-16)
  ndirs: number;
  dlpath_1: string;
  dlpath_2: string;
  dlpath_3: string;
  dlpath_4: string;
  dlpath_5: string;
  dlpath_6: string;
  dlpath_7: string;
  dlpath_8: string;
  dlpath_9: string;
  dlpath_10: string;
  dlpath_11: string;
  dlpath_12: string;
  dlpath_13: string;
  dlpath_14: string;
  dlpath_15: string;
  dlpath_16: string;
  ulpath_1: string;
  ulpath_2: string;
  ulpath_3: string;
  ulpath_4: string;
  ulpath_5: string;
  ulpath_6: string;
  ulpath_7: string;
  ulpath_8: string;
  ulpath_9: string;
  ulpath_10: string;
  ulpath_11: string;
  ulpath_12: string;
  ulpath_13: string;
  ulpath_14: string;
  ulpath_15: string;
  ulpath_16: string;

  // Conference Settings
  force_newscan: boolean;
  exclude_ftp: boolean;
  private_conf: boolean;
  read_only: boolean;

  // Access Control
  min_access_level: number;
  max_access_level: number;

  // Metadata
  created_at: Date;
  updated_at: Date;
}

export interface Door {
  id: number;

  // Door Identity
  door_name: string;
  door_command: string;
  door_type: 'SYSCMD' | 'BBSCMD' | 'INTERNAL';

  // Execution Settings
  door_path: string;
  door_args: string;
  working_directory: string;

  // Door Options
  priority: string;  // P0-P4
  door_options: string[];
  runtime_env: 'AMIGA_68K' | 'NATIVE_NODE' | 'BROWSER';

  // Access Control
  min_security_level: number;
  max_security_level: number;
  required_flags: string;

  // Resource Limits
  time_limit: number;
  memory_limit: number;

  // Display Settings
  title: string;
  description: string;
  category: string;

  // Status
  enabled: boolean;

  // Metadata
  created_at: Date;
  updated_at: Date;
}

export interface Language {
  id: number;
  language_number: number;  // 1-10

  // Language Identity
  title: string;
  language_code: string;

  // File Settings
  file_path: string;

  // Status
  enabled: boolean;

  // Metadata
  created_at: Date;
  updated_at: Date;
}

export interface Protocol {
  id: number;

  // Protocol Identity
  protocol_name: string;
  protocol_code: string;

  // Protocol Settings
  command: string;
  upload_command: string;
  download_command: string;
  batch_upload: boolean;
  batch_download: boolean;
  bidirectional: boolean;

  // Status
  enabled: boolean;
  is_default: boolean;

  // Metadata
  created_at: Date;
  updated_at: Date;
}

export interface ConfigAuditLog {
  id: number;
  table_name: string;
  record_id: number;
  action: 'CREATE' | 'UPDATE' | 'DELETE';
  user_id: number;
  username: string;
  old_values: any;
  new_values: any;
  ip_address: string;
  user_agent: string;
  timestamp: Date;
}

// API Response wrapper
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  message?: string;
  timestamp: string;
}
