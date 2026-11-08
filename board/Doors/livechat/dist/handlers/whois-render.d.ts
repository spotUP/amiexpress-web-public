/**
 * /whois - resolve and render a user's presence inline.
 *
 * The command (`commands/user.ts`) returns `{ type: 'whois', username }` and
 * nothing consumed it, so right-clicking Whois - which submits `/whois <name>`
 * - did nothing. Resolution has to happen where the online-user map lives (the
 * submit handler), because `CommandContext` only knows the CURRENT caller, not
 * the target. These two functions are pure so they are tested the way
 * `dm-render.formatDmLine` is; the handler wires them together.
 */
/** Find an online user by name (a leading `@` is optional), case-insensitive. */
export declare function findOnlineUser(users: Map<string, any>, name: string): any;
/**
 * The /whois line - the same facts the profile overlay shows (node, status),
 * rendered inline because a command prints to the log, not a dialog.
 */
export declare function formatWhois(user: any, name: string): string;
/** One PROFILE row from the federation door server, as the bridge forwards it. */
export interface ProfileReply {
    found: boolean;
    user: string;
    nick?: string;
    board?: string;
    status?: string;
    statusText?: string;
    firstSeen?: string;
    lastSeen?: string;
    idleSeconds?: string;
    online?: string;
    sharedRooms?: string;
}
/** The /whois text for a server profile; the same facts the overlay's extra lines show. */
export declare function profileLines(p: ProfileReply): string[];
export declare function formatProfile(p: ProfileReply): string;
/**
 * /whois asks the server and waits for chat:profile. A board without the
 * federation never answers, so each request carries a fallback that runs
 * after `ms` unless the reply arrives first.
 */
export declare class WhoisRequests {
    private pending;
    ask(name: string, fallback: () => void, ms?: number): void;
    /** The reply arrived: true when a request was waiting for it (fallback cancelled). */
    answer(user: string): boolean;
}
export declare const whoisRequests: WhoisRequests;
export declare function setProfileSink(sink: ((p: ProfileReply) => boolean) | null): void;
export declare function offerProfile(p: ProfileReply): boolean;
