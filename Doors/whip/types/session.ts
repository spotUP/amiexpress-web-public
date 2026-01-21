export interface DoorSession {
  socket: any;
  user: any;
  bbsSession: any;
  bbs: any;
  params?: string[];
  args?: string[];
}

export type MenuSelection =
  | 'quick-task'
  | 'new-project'
  | 'view-projects'
  | 'kanban'
  | 'my-tasks'
  | 'parties'
  | 'leaderboard'
  | 'achievements'
  | 'quit';
