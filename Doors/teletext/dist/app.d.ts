export interface DoorSession {
    socket: {
        emit(event: string, data: string): void;
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
    private paintPage;
    private paintStatus;
    private pageBar;
    private pickerBar;
    private paintPicker;
    private scheduleCarousel;
    private clearCarousel;
}
