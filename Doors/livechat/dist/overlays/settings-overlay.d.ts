import { Screen, Box } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import type { AppState } from '../core/state';
import type { PresenceService, SocketEmitter } from '../services';
export declare function createSettingsOverlay(s: Screen, st: AppState, ps: PresenceService, se: SocketEmitter, uid: number, usb: () => void, hm: (w: Box) => void): Box;
