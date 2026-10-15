import { BBSEventBus } from './event-bus';
/** Extended BBS Event Bus methods */
export declare class ExtendedEventBus extends BBSEventBus {
    /** Door entered */
    doorEnter(userId: number, username: string, doorName: string): void;
    /** Door exited */
    doorExit(userId: number, username: string, doorName: string): void;
    /** New message posted */
    newMessage(userId: number, username: string, conference: string): void;
    /** Sysop paged */
    pageSysop(userId: number, username: string): void;
    /** Conference joined */
    conferenceJoin(userId: number, username: string, conference: string): void;
    /** Download completed */
    downloadComplete(userId: number, username: string, filename: string): void;
    /** Node activity */
    nodeActivity(nodeId: number, status: 'active' | 'offline'): void;
    /** System announcement */
    announce(message: string): void;
}
