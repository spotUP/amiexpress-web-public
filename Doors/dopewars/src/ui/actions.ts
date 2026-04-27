import blessed from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import { bindKeys } from '@amiexpress/bbs-door-sdk/utils/blessed-helpers';
import { MarketState, PlayerState, GameQuestion, HighScore } from '../types';

export type ActionBarMode = 'normal' | 'combat' | 'question';

export function renderActionBar(box: any, mode: ActionBarMode): void {
  if (mode === 'combat') {
    box.setContent('  {bold}[F]{/}ight  {bold}[R]{/}un to...  {bold}[S]{/}urrender');
    return;
  }
  if (mode === 'question') {
    box.setContent('  Waiting for your answer...');
    return;
  }
  box.setContent(
    '  {bold}[B]{/}uy  {bold}[S]{/}ell  {bold}[J]{/}et  ' +
    '{bold}[K]{/}bank  {bold}[L]{/}oan  {bold}[G]{/}uns  ' +
    '{bold}[D]{/}oc  {bold}[A]{/}ttack  {bold}[H]{/}iscores  {bold}[Q]{/}uit'
  );
}

function centeredBox(screen: any, opts: any): any {
  return blessed.box({
    parent: screen,
    top: 'center', left: 'center',
    border: { type: 'line' },
    tags: true,
    style: { border: { fg: 'yellow' }, fg: 'white', bg: 'black' },
    keys: true,
    ...opts,
  });
}

/* ─── Buy overlay ──────────────────────────────────────── */

export function showBuyOverlay(
  screen: any,
  market: MarketState,
  state: PlayerState,
  onBuy: (drugIndex: number, amount: number) => void,
  onCancel: () => void
): void {
  const lines = market.prices.map((p, i) =>
    `  {bold}${i + 1}.{/} ${p.name.padEnd(12)} {green-fg}$${Math.round(p.price).toLocaleString('en-US')}{/}`
  ).join('\n');

  const box = centeredBox(screen, { width: 52, height: market.prices.length + 7, label: ' BUY ' });
  box.setContent(lines + '\n\n  Select number or {bold}[ESC]{/}:');

  let chosen     = -1;
  let chosenName = '';
  let amtStr     = '';

  let unbind: () => void;
  function cleanup(): void { unbind(); box.destroy(); screen.render(); }

  const escapeFn    = () => { cleanup(); onCancel(); };
  const enterFn     = () => {
    if (chosen >= 0 && amtStr) {
      const amt = parseInt(amtStr, 10);
      if (amt > 0) { cleanup(); onBuy(chosen, amt); }
    }
  };
  const backspaceFn = () => {
    if (chosen >= 0 && amtStr) {
      amtStr = amtStr.slice(0, -1);
      box.setContent(lines + `\n\n  Buying {yellow-fg}${chosenName}{/}\n  Amount: ${amtStr || '_'}`);
      screen.render();
    }
  };
  const zeroFn = () => {
    if (chosen >= 0) {
      amtStr += '0';
      box.setContent(lines + `\n\n  Buying {yellow-fg}${chosenName}{/}\n  Amount: ${amtStr}_`);
      screen.render();
    }
  };

  const numBindings: Array<[string[], () => void]> = [];
  for (let i = 0; i < Math.min(market.prices.length, 9); i++) {
    const digit = String(i + 1);
    const fn = () => {
      if (chosen < 0) {
        chosen     = market.prices[i]!.index;
        chosenName = market.prices[i]!.name;
        box.setContent(lines + `\n\n  Buying {yellow-fg}${chosenName}{/}\n  Amount: _`);
        screen.render();
      } else {
        amtStr += digit;
        box.setContent(lines + `\n\n  Buying {yellow-fg}${chosenName}{/}\n  Amount: ${amtStr}_`);
        screen.render();
      }
    };
    numBindings.push([[digit], fn]);
  }

  unbind = bindKeys(screen, [
    [['escape'],    escapeFn],
    [['enter'],     enterFn],
    [['backspace'], backspaceFn],
    [['0'],         zeroFn],
    ...numBindings,
  ]);

  box.focus();
  screen.render();
}

/* ─── Sell overlay ─────────────────────────────────────── */

export function showSellOverlay(
  screen: any,
  state: PlayerState,
  market: MarketState,
  onSell: (drugIndex: number, amount: number) => void,
  onCancel: () => void
): void {
  const carrying = state.drugs.filter(d => d.carried > 0);
  if (carrying.length === 0) { onCancel(); return; }

  const drugNameMap = new Map(market.prices.map(p => [p.index, p.name]));
  const lines = carrying.map((d, i) =>
    `  {bold}${i + 1}.{/} ${(drugNameMap.get(d.index) ?? `Drug${d.index}`).padEnd(12)} {yellow-fg}${d.carried}{/} units`
  ).join('\n');

  const box = centeredBox(screen, { width: 50, height: carrying.length + 7, label: ' SELL ' });
  box.setContent(lines + '\n\n  Select drug or {bold}[ESC]{/}:');

  let chosen     = -1;
  let chosenName = '';
  let amtStr     = '';

  let unbind: () => void;
  function cleanup(): void { unbind(); box.destroy(); screen.render(); }

  const escapeFn    = () => { cleanup(); onCancel(); };
  const enterFn     = () => {
    if (chosen >= 0 && amtStr) {
      const amt = parseInt(amtStr, 10);
      if (amt > 0) { cleanup(); onSell(chosen, amt); }
    }
  };
  const backspaceFn = () => {
    if (chosen >= 0 && amtStr) {
      amtStr = amtStr.slice(0, -1);
      box.setContent(lines + `\n\n  Selling {yellow-fg}${chosenName}{/}\n  Amount: ${amtStr || '_'}`);
      screen.render();
    }
  };
  const zeroFn = () => {
    if (chosen >= 0) {
      amtStr += '0';
      box.setContent(lines + `\n\n  Selling {yellow-fg}${chosenName}{/}\n  Amount: ${amtStr}_`);
      screen.render();
    }
  };

  const numBindings: Array<[string[], () => void]> = [];
  for (let i = 0; i < Math.min(carrying.length, 9); i++) {
    const digit = String(i + 1);
    const fn = () => {
      if (chosen < 0) {
        chosen     = carrying[i]!.index;
        chosenName = drugNameMap.get(chosen) ?? `Drug${chosen}`;
        box.setContent(lines + `\n\n  Selling {yellow-fg}${chosenName}{/}\n  Amount: _`);
        screen.render();
      } else {
        amtStr += digit;
        box.setContent(lines + `\n\n  Selling {yellow-fg}${chosenName}{/}\n  Amount: ${amtStr}_`);
        screen.render();
      }
    };
    numBindings.push([[digit], fn]);
  }

  unbind = bindKeys(screen, [
    [['escape'],    escapeFn],
    [['enter'],     enterFn],
    [['backspace'], backspaceFn],
    [['0'],         zeroFn],
    ...numBindings,
  ]);

  box.focus();
  screen.render();
}

/* ─── Jet overlay ──────────────────────────────────────── */

export function showJetOverlay(
  screen: any,
  currentLocation: number,
  locationNames: string[],
  onJet: (location: number) => void,
  onCancel: () => void
): void {
  const lines = locationNames.map((name, i) =>
    `  {bold}${i + 1}.{/} ${name}${i === currentLocation ? ' {green-fg}(here){/}' : ''}`
  ).join('\n');

  const box = centeredBox(screen, {
    width: 36, height: locationNames.length + 5, label: ' JET TO ',
  });
  box.setContent(lines + '\n\n  Choose or {bold}[ESC]{/}:');

  let unbind: () => void;
  function cleanup(): void { unbind(); box.destroy(); screen.render(); }

  const escapeFn = () => { cleanup(); onCancel(); };

  const locBindings: Array<[string[], () => void]> = locationNames.map((_name, i) => {
    const fn = () => {
      if (i !== currentLocation) { cleanup(); onJet(i); }
    };
    return [[String(i + 1)], fn];
  });

  unbind = bindKeys(screen, [
    [['escape'], escapeFn],
    ...locBindings,
  ]);

  box.focus();
  screen.render();
}

/* ─── Question overlay ─────────────────────────────────── */

export function showQuestionOverlay(
  screen: any,
  question: GameQuestion,
  onAnswer: (answer: string) => void
): void {
  const box = centeredBox(screen, { width: 62, height: 8, label: ' ACTION REQUIRED ' });
  box.setContent('\n  ' + question.prompt + '\n\n  {bold}[Y]{/}es  {bold}[N]{/}o  {bold}[ESC]{/} = No');

  let unbind: () => void;
  function cleanup(): void { unbind(); box.destroy(); screen.render(); }

  const yesFn = () => { cleanup(); onAnswer('y'); };
  const noFn  = () => { cleanup(); onAnswer('n'); };

  unbind = bindKeys(screen, [
    [['y', 'Y'],           yesFn],
    [['n', 'N', 'escape'], noFn],
  ]);

  box.focus();
  screen.render();
}

/* ─── High scores overlay ──────────────────────────────── */

export function showHighScores(
  screen: any,
  scores: HighScore[],
  onClose: () => void
): void {
  const rows = scores.length === 0
    ? ['  No scores yet.']
    : scores.map((s, i) =>
        `  {bold}${String(i + 1).padStart(2)}.{/} ${s.bbsHandle.padEnd(16)} {green-fg}$${Math.round(s.score).toLocaleString('en-US').padStart(12)}{/}  (${s.turns} turns)`
      );

  const box = centeredBox(screen, {
    width: 62, height: Math.min(rows.length + 5, 22), label: ' HIGH SCORES ',
  });
  box.setContent(rows.join('\n') + '\n\n  {bold}[ESC]{/} or {bold}[Q]{/} to close');

  let unbind: () => void;
  function cleanup(): void { unbind(); box.destroy(); screen.render(); }

  const closeFn = () => { cleanup(); onClose(); };

  unbind = bindKeys(screen, [
    [['escape', 'q', 'Q'], closeFn],
  ]);

  box.focus();
  screen.render();
}
