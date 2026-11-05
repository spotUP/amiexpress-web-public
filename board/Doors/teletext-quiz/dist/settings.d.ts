export interface QuizSettings {
    /** How many questions in a round. */
    questions: number;
    /** Pack id to play, or '' to use every installed pack together. */
    pack: string;
    /** Whether V may uncover the answer (a revealed question never scores). */
    allowReveal: boolean;
}
export declare const DEFAULT_SETTINGS: QuizSettings;
export declare function applySettings(raw: Record<string, string | number | boolean>): QuizSettings;
export declare function loadSettings(): QuizSettings;
