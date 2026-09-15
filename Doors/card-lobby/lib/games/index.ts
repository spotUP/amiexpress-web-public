/**
 * The lobby's games, behind one seam.
 */

export * from './types';
export * from './registry';
// Both engines export a `cardId`/`cardFromId` for their own card shape, so
// the barrel re-exports the types and the classes and leaves the helpers to
// be imported from the engine that owns them.
export {
  SkitgubbeEngine, SUIT_NAMES, beats, rankValue, buildSkitgubbeDeck,
  type SkitgubbeCard, type SkitgubbeSuit, type SkitgubbePhase,
  type SkitgubbePlayer, type SkitgubbeState, type SkitgubbeSnapshot, type SkitgubbeResult,
} from './skitgubbe/engine';
export * from './skitgubbe/module';
export {
  VandtiaEngine, canPlayOn, isWild, burnsThePile, cardValue, buildVandtiaDeck,
  type VandtiaCard, type VandtiaSuit, type VandtiaPhase, type VandtiaSource,
  type VandtiaPlayer, type VandtiaState, type VandtiaSnapshot, type VandtiaResult,
} from './vandtia/engine';
export * from './vandtia/module';
