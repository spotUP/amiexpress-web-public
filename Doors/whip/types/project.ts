export type ProjectType = 'demo' | 'intro' | 'musicdisk' | 'graphics' | 'music' | 'code' | 'tools';
export type ProjectStatus = 'planning' | 'active' | 'released';

export interface Project {
  id: string;
  name: string;
  type: ProjectType;
  partyId?: string;
  description: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  status: ProjectStatus;
  sizeLimit?: number;
  currentSize?: number;
}

export type TaskCategory = 'code' | 'music' | 'gfx' | 'design' | 'effects' | 'engine' | '3d';
export type TaskStatus = 'todo' | 'in-progress' | 'testing' | 'done';
export type TaskPriority = 'lamer' | 'scener' | 'elite' | 'legend';

export interface Task {
  id: string;
  projectId: string;
  title: string;
  category: TaskCategory;
  status: TaskStatus;
  priority: TaskPriority;
  assignedTo?: string;
  points: number;
  estimatedSize?: number;
  description: string;
  createdAt: string;
  updatedAt?: string;
  completedAt?: string;
}
