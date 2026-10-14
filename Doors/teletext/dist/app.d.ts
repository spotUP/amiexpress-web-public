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
    /** The board's grant for fetching the BBC ROMs, for a proved caller. */
    bbs?: {
        grantBeebRomAccess?(): string;
    };
    close(): void;
}
export declare class TeletextApp {
    private readonly session;
    private readonly settings;
    private readonly screen;
    private readonly keys;
    private readonly root;
    /** Where the BEEB door records who has shown their ROMs. */
    private readonly beebProof;
    private services;
    /**
     * What the caller has typed to narrow the list.
     *
     * A board with the restoration archive installed has over a thousand
     * service packs on it - one per recovered broadcast day - and a flat
     * list of nineteen rows with no way down is no use at all. Typing
     * narrows; the arrows walk what is left.
     */
    private pickerFilter;
    /** The board's quicklink list, and where the caller is in it. */
    private catalogue;
    private indexAt;
    private indexTop;
    /** First row of the list that is on screen. */
    private pickerTop;
    private loaded;
    private view;
    private pickerAt;
    private page;
    private subpage;
    private reveal;
    private held;
    private notice;
    private readonly search;
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
    constructor(session: DoorSession, root?: string, proofFile?: string);
    start(): void;
    stop(): void;
    handleInput(data: string): void;
    private handleKey;
    private onArrow;
    private onEscape;
    private indexRows;
    private indexKey;
    /** Open the service a quicklink names, on the page it names. */
    private openEntry;
    private paintIndex;
    private indexBar;
    private pickerKey;
    /** The services the filter leaves. */
    private shown;
    /** How many list rows fit under the heading. */
    private pickerRows;
    private scrollPickerIntoView;
    private openService;
    private pageKey;
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
