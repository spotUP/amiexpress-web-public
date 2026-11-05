/**
 * Settings status radio buttons
 */
import { Box, RadioSet } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import type { PresenceService, SocketEmitter } from '../services';
export declare function createStatusRadio(p: Box, l: number, top: number, h: number, presenceService: PresenceService, socketEmitter: SocketEmitter, userId: number, updateStatusBar: () => void): RadioSet;
