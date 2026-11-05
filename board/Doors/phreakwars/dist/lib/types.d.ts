/**
 * PhreakWars Game Types and Interfaces
 *
 * All type definitions for the PhreakWars game.
 */
export interface PhreakWarsGameState {
    player: {
        handle: string;
        skillLevel: number;
        money: number;
        phoneBills: number;
        computer: {
            ram: number;
            storage: number;
            modemSpeed: number;
            hasBlueBox: boolean;
            hasRedBox: boolean;
        };
        skills: {
            phreaking: number;
            programming: number;
            hacking: number;
        };
        inventory: string[];
        achievements: string[];
    };
    bbs: {
        name: string;
        security: number;
        users: number;
        messages: Array<{
            subject: string;
            body: string;
            author: string;
            timestamp: Date;
        }>;
        files: Array<{
            name: string;
            description: string;
            size: number;
            uploader: string;
        }>;
    };
    ownBbs?: {
        name: string;
        security: number;
        users: number;
        messages: Array<{
            subject: string;
            body: string;
            author: string;
            timestamp: Date;
        }>;
        files: Array<{
            name: string;
            description: string;
            size: number;
            uploader: string;
        }>;
    };
    shadow: {
        relationship: number;
        messages: string[];
        lastContact: Date;
        pendingReplies: Array<{
            subject: string;
            body: string;
            timestamp: Date;
        }>;
    };
    dailyLimits: {
        lastReset: Date;
        phreakingAttempts: number;
        hackingAttempts: number;
        programmingSessions: number;
        tradingVisits: number;
        chatMessages: number;
        downloads: number;
        posts: number;
        bbsHacks: number;
    };
    currentMode: string;
    /**
     * The caller's terminal width, set at door start from the real session
     * (server.ts). Per-state and not module-level on purpose: `gameStates` is
     * shared across every node, so a module-level width would give an
     * 80-column caller the C64's banner whenever the two overlap.
     */
    terminalWidth?: number;
    previousMode: string;
    inputBuffer: string;
    postingSubject?: string;
    postingBody?: string;
    minigameType?: string;
    minigameState?: any;
}
export type MinigameType = 'redbox' | 'bluebox' | 'tonegen' | 'hack' | 'program' | 'bbs_hack';
export interface MessageTemplate {
    subject: string;
    body: string;
    relationshipBoost: number;
    replyChance: number;
    replySubject: string;
    replyBody: string;
}
export declare const DAILY_LIMITS: {
    readonly PHREAKING_ATTEMPTS: 10;
    readonly HACKING_ATTEMPTS: 8;
    readonly PROGRAMMING_SESSIONS: 6;
    readonly TRADING_VISITS: 5;
    readonly CHAT_MESSAGES: 15;
    readonly DOWNLOADS: 5;
    readonly POSTS: 3;
    readonly BBS_HACKS: 3;
};
