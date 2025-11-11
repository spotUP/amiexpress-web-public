// Type definitions for SDK Preview frontend

export interface DoorMetadata {
  name: string;
  version: string;
  description: string;
  author: string;
  doorType: 'typescript' | 'javascript' | 'amiga';
  entryPoint: string;
  lastModified: number;
  fileCount: number;
  totalSize: number;
  dependencies: Record<string, string>;
  hasBuild: boolean;
  bbsCommand?: string;
}

export interface DoorFile {
  path: string;
  name: string;
  extension: string;
  size: number;
  lastModified: number;
  content?: string;
  type: 'file' | 'directory';
  children?: DoorFile[];
}

export interface BuildError {
  file: string;
  line: number;
  column: number;
  message: string;
  severity: 'error' | 'warning' | 'info';
}

export interface BuildStatus {
  building: boolean;
  success: boolean;
  errors: BuildError[];
  warnings: BuildError[];
  lastBuild: number;
  duration: number;
}

export interface SessionEvent {
  type: 'input' | 'output';
  timestamp: number;
  data: string;
  ansiData?: string;
}

export interface SessionRecording {
  id: string;
  doorName: string;
  startTime: number;
  endTime: number;
  events: SessionEvent[];
  metadata?: Record<string, any>;
}

export interface PerformanceMetrics {
  fps: number;
  memoryUsage: number;
  cpuUsage: number;
  lastUpdate: number;
}

export interface AppSettings {
  theme: 'light' | 'dark';
  editorTheme: 'vs-dark' | 'vs-light';
  terminalFontSize: number;
  editorFontSize: number;
  autoScroll: boolean;
  showLineNumbers: boolean;
  enableKeyboardShortcuts: boolean;
  playbackSpeed: number;
}

export interface WebSocketMessage {
  type: 'output' | 'input' | 'error' | 'status' | 'build' | 'doorList' | 'doorMetadata' | 'fileContent' | 'buildStatus' | 'client-door-bundle' | 'debug' | 'auto-launch';
  data: any;
  timestamp?: number;
  // For client-door-bundle messages
  doorId?: string;
  code?: string;
}

export interface ConnectionStatus {
  connected: boolean;
  reconnecting: boolean;
  error: string | null;
  lastConnected: number | null;
}

export interface DoorListItem {
  id: string;
  name: string;
  description: string;
  version: string;
  author: string;
  favorite: boolean;
  lastOpened: number;
  thumbnail?: string;
}

export interface ArchiveOptions {
  format: 'lha' | 'zip';
  includeSource: boolean;
  includeAssets: boolean;
  includeDocs: boolean;
  doormanCompatible: boolean;
}

export interface KeyboardShortcut {
  key: string;
  ctrl?: boolean;
  shift?: boolean;
  alt?: boolean;
  action: () => void;
  description: string;
}
