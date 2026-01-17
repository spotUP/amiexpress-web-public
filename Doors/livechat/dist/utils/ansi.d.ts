/** ANSI color helpers for blessed tags */
export declare const colors: {
    readonly user: "cyan";
    readonly system: "gray";
    readonly error: "red";
    readonly success: "green";
    readonly info: "yellow";
    readonly highlight: "magenta";
    readonly muted: "gray";
};
/** Wrap text in blessed color tag */
export declare function color(text: string, c: string): string;
/** Bold text */
export declare function bold(text: string): string;
/** Format username with color */
export declare function userName(name: string, c: string): string;
/** Format timestamp */
export declare function timestamp(time: string): string;
/** Format system message */
export declare function systemMsg(text: string): string;
/** Format error message */
export declare function errorMsg(text: string): string;
