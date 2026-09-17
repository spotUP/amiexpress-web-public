export interface DoorSession {
    socket: {
        emit(event: string, data?: unknown): void;
        on(event: string, handler: (...args: unknown[]) => void): void;
        off?(event: string, handler: (...args: unknown[]) => void): void;
    };
    bbsSession: Record<string, unknown>;
    user?: {
        username?: string;
    };
    close(): void;
}
export declare class TeletextApp {
    private readonly session;
    private readonly settings;
    private readonly screen;
    private readonly keys;
    private readonly root;
    private services;
    private loaded;
    private view;
    private pickerAt;
    private page;
    private subpage;
    private reveal;
    private held;
    private digits;
    private notice;
    private carousel;
    private closed;
    /** The program running on the board's BBC Micro, while one is. */
    private running;
    private readonly onEmulatorClosed;
    /**
     * @param root Which Teletext directory to browse. The door leaves this
     *   alone and gets the board's; a test passes its own, because a test
     *   that reads whatever packs happen to be installed is a test that
     *   breaks the day a sysop installs one.
     */
    constructor(session: DoorSession, root?: string);
    start(): void;
    stop(): void;
    handleInput(data: string): void;
    private handleKey;
    private onArrow;
    private onEscape;
    private pickerKey;
    private openService;
    private pageKey;
    private typeDigit;
    private follow;
    private goHome;
    private goTo;
    private stepPage;
    private stepSubpage;
    private toggleReveal;
    private toggleHold;
    private quit;
    private current;
    /** The program broadcast on the page being looked at, if any. */
    private programHere;
    private paintPage;
    /**
     * A telesoftware page, shown as what it is.
     *
     * These pages were never meant to be looked at. Their rows carry a
     * program in the Redefinable Telesoftware Format, and painting them as
     * characters gives a screen of mojibake - which is exactly what it did,
     * and read as a rendering bug rather than as software.
     *
     * So the page is described instead of drawn, and the caller is offered
     * the thing the page was for.
     */
    private paintProgram;
    /**
     * Hand the program to the board's BBC Micro, already typed in.
     *
     * AUTOTYPE RATHER THAN AUTOBOOT, and they are exclusive - jsbeeb takes
     * the first of autoboot, autochain, autorun, autotype that it finds, so a
     * URL carrying both boots the disc and ignores the program. Booting would
     * only reach the disc's catalogue; typing reaches THIS program, which is
     * the one the caller was reading about.
     */
    private runProgram;
    private onEmulatorReturn;
    private paintStatus;
    private pageBar;
    private pickerBar;
    private paintPicker;
    private scheduleCarousel;
    private clearCarousel;
}
