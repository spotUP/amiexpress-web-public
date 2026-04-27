export interface CombatHandlers {
    onFight: () => void;
    onRun: (location: number) => void;
    onSurrender: () => void;
}
export declare function bindCombatKeys(screen: any, handlers: CombatHandlers): () => void;
//# sourceMappingURL=combat.d.ts.map