export interface CombatHandlers {
    onFight: () => void;
    onRun: (location: number) => void;
    onSurrender: () => void;
}
export interface CombatContext {
    currentLocation: number;
    locationNames: string[];
}
export declare function bindCombatKeys(screen: any, handlers: CombatHandlers, ctx: CombatContext): () => void;
//# sourceMappingURL=combat.d.ts.map