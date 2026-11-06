/** What the palette needs of a command; the registry's entries have more. */
export interface PaletteCommand {
    name: string;
    usage?: string;
    description?: string;
}
/**
 * One row per command, already tagged for blessed.
 *
 * `dim` is the theme colour the usage is printed in; at the compact tier no
 * usage is printed and the tag never appears.
 */
export declare function commandPaletteItems(commands: readonly PaletteCommand[], cols: number, dim: string): string[];
/**
 * What Enter does while the palette is open.
 *
 * Enter on a half-typed name fills in the command (`/ed` becomes `/edit `).
 * Enter on a name the caller has already typed in full RUNS it: filling
 * `/edit` with `/edit ` changed nothing on screen, so the caller pressed
 * Enter and saw no result (sysop, 2026-11-06).
 */
export declare function paletteEnterAction(typed: string, commandName: string): 'run' | 'fill';
