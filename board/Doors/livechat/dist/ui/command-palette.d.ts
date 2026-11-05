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
