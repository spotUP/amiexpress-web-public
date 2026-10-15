/**
 * BBS Event Types for LiveChat
 */

export type BBSEventType = 'user_login' | 'user_logout' | 'upload' | 'download' | 'door_activity' | 'custom_door_event';

export interface BBSEventPayload {
  type: BBSEventType;
  username: string;
  nodeId: number;
  timestamp: number;
  data?: Record<string, any>;
}
