/**
 * The events the BBS puts on the wire, typed as a discriminated union so
 * `data` narrows per event and no `any` crosses the socket boundary.
 *
 * Mirrors `web/backend/src/services/bbs-event-emitter.ts`. The backend types
 * `data` as `Record<string, any>`; these are the shapes it actually sends,
 * from the emit call sites.
 */

export type BBSEventType =
  | 'user_login'
  | 'user_logout'
  | 'upload'
  | 'download'
  | 'door_activity'
  | 'custom_door_event';

interface BBSEventBase {
  username: string;
  nodeId: number;
  timestamp: number;
}

export interface UserLoginEvent extends BBSEventBase {
  type: 'user_login';
  data?: { location?: string };
}

export interface UserLogoutEvent extends BBSEventBase {
  type: 'user_logout';
  /** Session length in seconds. */
  data?: { duration?: number };
}

export interface TransferEvent extends BBSEventBase {
  type: 'upload' | 'download';
  data?: {
    fileName?: string;
    fileSize?: number;
    conferenceId?: number;
    conferenceName?: string;
  };
}

export interface DoorActivityEvent extends BBSEventBase {
  type: 'door_activity';
  data?: { doorName?: string; action?: 'entered' | 'exited' };
}

export interface CustomDoorEvent extends BBSEventBase {
  type: 'custom_door_event';
  data?: { doorName?: string; eventType?: string; message?: string };
}

export type BBSEvent =
  | UserLoginEvent
  | UserLogoutEvent
  | TransferEvent
  | DoorActivityEvent
  | CustomDoorEvent;

/** Emitted to the `admin` room during an import. */
export interface ImportProgressEvent {
  sessionId: string;
  progress: number;
  message: string;
}

/**
 * `live` - the socket is connected and events are arriving; background polls
 * sit at their slow rate.
 * `reconnecting` / `offline` - every realtime-backed query drops to its fast
 * rate. Nothing goes blank; the app keeps working, slower and dumber.
 */
export type RealtimeStatus = 'live' | 'reconnecting' | 'offline';
