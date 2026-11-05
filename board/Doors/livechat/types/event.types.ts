/** BBS event types */
export type BBSEventType =
  | 'user_login'
  | 'user_logout'
  | 'upload_start'
  | 'upload_complete'
  | 'download_start'
  | 'download_complete'
  | 'door_enter'
  | 'door_exit'
  | 'new_message'
  | 'page_sysop'
  | 'conference_join'
  | 'node_activity'
  | 'system_announcement';

/** BBS event visibility */
export type EventVisibility = 'all' | 'channel' | 'user';

/** BBS event */
export interface BBSEvent {
  id?: number;
  type: BBSEventType;
  userId?: number;
  username?: string;
  nodeId?: number;
  details: Record<string, any>;
  visibility: EventVisibility;
  channelId?: string;
  timestamp: Date;
}

/** Event format prefixes */
export const EVENT_PREFIXES: Record<BBSEventType, string> = {
  user_login: '-->',
  user_logout: '<--',
  upload_start: '[UL]',
  upload_complete: '[UL]',
  download_start: '[DL]',
  download_complete: '[DL]',
  door_enter: '[DOOR]',
  door_exit: '[DOOR]',
  new_message: '[MSG]',
  page_sysop: '[PAGE]',
  conference_join: '[CONF]',
  node_activity: '[NODE]',
  system_announcement: '***'
};
