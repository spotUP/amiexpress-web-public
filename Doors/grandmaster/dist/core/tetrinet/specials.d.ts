/**
 * TetriNET Special Blocks
 *
 * Defines all 16 special block types from TetriNET Extended rules.
 * Each special has properties for targeting, duration, and spawn rate.
 */
/**
 * All available special block types
 */
export type SpecialType = 'add_line' | 'clear_line' | 'nuke' | 'random_clear' | 'switch' | 'clear_specials' | 'gravity' | 'quake' | 'block_bomb' | 'clear_column' | 'immunity' | 'darkness' | 'confusion' | 'mutation' | 'zebra' | 'left_gravity';
/**
 * Special block definition
 */
export interface SpecialDef {
    type: SpecialType;
    char: string;
    name: string;
    description: string;
    targetable: boolean;
    selfOnly: boolean;
    continuous: boolean;
    duration: number;
    pieceCount: number;
    occurancy: number;
    color: string;
}
/**
 * All special block definitions with TetriNET2 Extended default spawn rates
 */
export declare const SPECIALS: Record<SpecialType, SpecialDef>;
/**
 * Get special by single character code
 */
export declare function getSpecialByChar(char: string): SpecialDef | null;
/**
 * Get all specials as array (for iteration)
 */
export declare function getAllSpecials(): SpecialDef[];
/**
 * Get specials by rule set
 */
export declare function getSpecialsForRule(rule: 'classic' | 'standard' | 'extended'): SpecialType[];
/**
 * Check if special can target other players
 */
export declare function canTargetOthers(type: SpecialType): boolean;
/**
 * Check if special is continuous (has duration)
 */
export declare function isContinuous(type: SpecialType): boolean;
/**
 * Get display string for special (colored char)
 */
export declare function getSpecialDisplay(type: SpecialType): string;
/**
 * Get display color for special type
 */
export declare function getSpecialColor(type: SpecialType): string;
/**
 * Get display character for special type
 */
export declare function getSpecialDisplayChar(type: SpecialType): string;
/**
 * Random special selection based on occurancy weights
 */
export declare function selectRandomSpecial(availableSpecials: SpecialType[]): SpecialType;
//# sourceMappingURL=specials.d.ts.map