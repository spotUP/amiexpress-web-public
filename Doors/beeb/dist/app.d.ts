export interface DoorSession {
    socket: {
        emit(event: string, data?: unknown): void;
        on(event: string, handler: (...args: unknown[]) => void): void;
        off?(event: string, handler: (...args: unknown[]) => void): void;
    };
    bbsSession: Record<string, unknown>;
    user?: {
        username?: string;
        id?: string | number;
    };
    /**
     * What the board lends a door: the browser file picker, and the grant
     * that lets this caller fetch the ROMs once they have shown they own a
     * copy. A host without them simply cannot run the machine, which is the
     * right failure.
     */
    bbs?: {
        requestArchiveUpload?(): Promise<{
            path: string;
            filename: string;
        }>;
        grantBeebRomAccess?(): string;
    };
    close(): void;
}
export declare class BeebApp {
    private readonly session;
    private readonly keys;
    private readonly startDir;
    /** Where this board records who has shown their ROMs. */
    private readonly proofPath;
    private readonly width;
    private readonly rows;
    private titles;
    private roms;
    private at;
    private top;
    /** An upload is being taken and checked; keys wait. */
    private busy;
    /** One line of feedback over the listing. */
    private message;
    private running;
    private closed;
    private readonly onEmulatorClosed;
    constructor(session: DoorSession, startDir?: string, proofFile?: string);
    start(): void;
    stop(): void;
    handleInput(data: string): void;
    private onArrow;
    private handleKey;
    /** Has THIS caller shown a copy of the ROMs? */
    private proved;
    /**
     * Ask the caller to show their own copy of the ROMs.
     *
     * The board holds one copy and ships none - Acorn's ROMs are not ours to
     * hand out - so everybody shows theirs once, the sysop included. The
     * upload is read, checked and deleted; what is kept is the fact that they
     * showed it.
     */
    private proveRoms;
    /** A one-line message over the listing. */
    private notice;
    private launchSelected;
    private launchBare;
    private launch;
    private onReturn;
    private quit;
    private paint;
    private write;
}
