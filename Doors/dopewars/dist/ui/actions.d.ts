import { MarketState, PlayerState, GameQuestion, HighScore } from '../types';
export type ActionBarMode = 'normal' | 'combat' | 'question';
export declare function renderActionBar(box: any, mode: ActionBarMode): void;
export declare function showBuyOverlay(screen: any, market: MarketState, state: PlayerState, onBuy: (drugIndex: number, amount: number) => void, onCancel: () => void): void;
export declare function showSellOverlay(screen: any, state: PlayerState, market: MarketState, onSell: (drugIndex: number, amount: number) => void, onCancel: () => void): void;
export declare function showJetOverlay(screen: any, currentLocation: number, locationNames: string[], onJet: (location: number) => void, onCancel: () => void): void;
export declare function showQuestionOverlay(screen: any, question: GameQuestion, onAnswer: (answer: string) => void): void;
export declare function showHighScores(screen: any, scores: HighScore[], onClose: () => void): void;
//# sourceMappingURL=actions.d.ts.map