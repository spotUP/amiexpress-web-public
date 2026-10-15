import type { PresenceStatus } from '../types';
/** Create user status summary component */
export declare function createUserStatus(blessed: any, screen: any): any;
/** Format user status summary */
export declare function formatUserStatus(counts: Record<PresenceStatus, number>): string;
/** Update user status display */
export declare function updateUserStatus(status: any, counts: Record<PresenceStatus, number>): void;
/** Get status symbol for display */
export declare function getStatusSymbol(status: PresenceStatus): string;
