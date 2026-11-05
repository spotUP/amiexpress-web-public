export interface DoorSession {
    socket: {
        emit(event: string, data: string): void;
    };
    bbsSession: Record<string, unknown>;
    user?: {
        username?: string;
    };
    close(): void;
    /** The board's achievement hook, when the host offers one. */
    achievement?(type: string, opts?: {
        value?: number;
        key?: string;
    }): boolean;
}
export declare class QuizApp {
    private readonly session;
    private readonly settings;
    private readonly screen;
    private readonly keys;
    private readonly doorRoot;
    private packs;
    private packErrors;
    private view;
    private round;
    private revealed;
    private lastChoice;
    private lastCorrect;
    private table;
    private closed;
    constructor(session: DoorSession, doorRoot?: string);
    start(): void;
    stop(): void;
    handleInput(data: string): void;
    private handleKey;
    private beginRound;
    private revealAnswer;
    private answer;
    private nextQuestion;
    private finish;
    private quit;
    private paintTitle;
    private paintQuestion;
}
