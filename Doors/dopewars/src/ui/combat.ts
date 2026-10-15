import { showJetOverlay } from './actions';

export interface CombatHandlers {
  onFight:     () => void;
  onRun:       (location: number) => void;
  onSurrender: () => void;
}

export interface CombatContext {
  currentLocation: number;
  locationNames:   string[];
}

export function bindCombatKeys(
  screen: any,
  handlers: CombatHandlers,
  ctx: CombatContext
): () => void {
  const fightFn     = () => handlers.onFight();
  const surrenderFn = () => handlers.onSurrender();
  const runFn       = () => {
    showJetOverlay(
      screen,
      ctx.currentLocation,
      ctx.locationNames,
      (loc) => { unbind(); handlers.onRun(loc); },
      () => {}  // cancel: stay in combat, keep keys bound
    );
  };

  screen.key(['f','F'], fightFn);
  screen.key(['s','S'], surrenderFn);
  screen.key(['r','R'], runFn);

  function unbind(): void {
    screen.unkey(['f','F'], fightFn);
    screen.unkey(['s','S'], surrenderFn);
    screen.unkey(['r','R'], runFn);
  }

  return unbind;
}
