import blessed from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import { MarketState, PlayerState, GameQuestion, HighScore } from '../types';

const LOCATION_NAMES = [
  'Brooklyn','Bronx','Ghetto','Central Park',
  'Manhattan','Coney Island','Battery Park','Queens',
];
const DRUG_NAMES = [
  'Cocaine','Heroin','Acid','Weed','Speed',
  'Ludes','Shrooms','PCP','Hashish','Opium',
];

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

export function showBuyOverlay(
  screen: any,
  market: MarketState,
  state: PlayerState,
  onBuy: (drugIndex: number, amount: number) => void,
  onCancel: () => void
): void {
  const lines = market.prices.map((p, i) =>
    `  {bold}${i + 1}.{/} ${(DRUG_NAMES[p.index] ?? `Drug${p.index}`).padEnd(12)} {green-fg}$${Math.round(p.price).toLocaleString()}{/}`
  ).join('\n');

  const box = centeredBox(screen, { width: 52, height: market.prices.length + 7, label: ' BUY DRUGS ' });
  box.setContent(lines + '\n\n  Select drug number or {bold}[ESC]{/} to cancel:');

  let chosen = -1;
  let amtStr = '';

  const cleanup = () => { box.destroy(); screen.render(); };

  screen.key(['escape'], () => { cleanup(); onCancel(); });

  for (let i = 0; i < Math.min(market.prices.length, 9); i++) {
    const key = String(i + 1);
    screen.key([key], () => {
      if (chosen < 0) {
        chosen = market.prices[i]!.index;
        box.setContent(lines + `\n\n  Buying {yellow-fg}${DRUG_NAMES[chosen]}{/}\n  Amount: ${amtStr}_`);
        screen.render();
      } else {
        amtStr += key;
        box.setContent(lines + `\n\n  Buying {yellow-fg}${DRUG_NAMES[chosen]}{/}\n  Amount: ${amtStr}_`);
        screen.render();
      }
    });
  }

  screen.key(['0'], () => {
    if (chosen >= 0) { amtStr += '0'; box.setContent(lines + `\n\n  Amount: ${amtStr}_`); screen.render(); }
  });

  screen.key(['backspace'], () => {
    if (chosen >= 0 && amtStr) {
      amtStr = amtStr.slice(0, -1);
      box.setContent(lines + `\n\n  Buying {yellow-fg}${DRUG_NAMES[chosen]}{/}\n  Amount: ${amtStr || '_'}`);
      screen.render();
    }
  });

  screen.key(['enter'], () => {
    if (chosen >= 0 && amtStr) {
      const amt = parseInt(amtStr, 10);
      if (amt > 0) { cleanup(); onBuy(chosen, amt); }
    }
  });

  box.focus();
  screen.render();
}

export function showSellOverlay(
  screen: any,
  state: PlayerState,
  onSell: (drugIndex: number, amount: number) => void,
  onCancel: () => void
): void {
  const carrying = state.drugs.filter(d => d.carried > 0);
  if (carrying.length === 0) { onCancel(); return; }

  const lines = carrying.map((d, i) =>
    `  {bold}${i + 1}.{/} ${(DRUG_NAMES[d.index] ?? `Drug${d.index}`).padEnd(14)} {yellow-fg}${d.carried}{/} units`
  ).join('\n');

  const box = centeredBox(screen, { width: 50, height: carrying.length + 7, label: ' SELL DRUGS ' });
  box.setContent(lines + '\n\n  Select drug or {bold}[ESC]{/}:');

  let chosen = -1;
  let amtStr = '';
  const cleanup = () => { box.destroy(); screen.render(); };

  screen.key(['escape'], () => { cleanup(); onCancel(); });

  for (let i = 0; i < Math.min(carrying.length, 9); i++) {
    screen.key([String(i + 1)], () => {
      if (chosen < 0) {
        chosen = carrying[i]!.index;
        box.setContent(lines + `\n\n  Selling {yellow-fg}${DRUG_NAMES[chosen]}{/}\n  Amount: _`);
        screen.render();
      } else {
        amtStr += String(i + 1);
        box.setContent(lines + `\n\n  Amount: ${amtStr}_`);
        screen.render();
      }
    });
  }

  screen.key(['enter'], () => {
    if (chosen >= 0 && amtStr) {
      const amt = parseInt(amtStr, 10);
      if (amt > 0) { cleanup(); onSell(chosen, amt); }
    }
  });

  box.focus();
  screen.render();
}

export function showJetOverlay(
  screen: any,
  currentLocation: number,
  onJet: (location: number) => void,
  onCancel: () => void
): void {
  const lines = LOCATION_NAMES.map((name, i) =>
    `  {bold}${i + 1}.{/} ${name}${i === currentLocation ? ' {green-fg}(here){/}' : ''}`
  ).join('\n');

  const box = centeredBox(screen, {
    width: 36, height: LOCATION_NAMES.length + 5, label: ' JET TO ',
  });
  box.setContent(lines + '\n\n  Choose or {bold}[ESC]{/}:');

  const cleanup = () => { box.destroy(); screen.render(); };
  screen.key(['escape'], () => { cleanup(); onCancel(); });

  LOCATION_NAMES.forEach((_name, i) => {
    screen.key([String(i + 1)], () => {
      if (i !== currentLocation) { cleanup(); onJet(i); }
    });
  });

  box.focus();
  screen.render();
}

export function showQuestionOverlay(
  screen: any,
  question: GameQuestion,
  onAnswer: (answer: string) => void
): void {
  const box = centeredBox(screen, { width: 62, height: 8, label: ' ACTION REQUIRED ' });
  box.setContent('\n  ' + question.prompt + '\n\n  {bold}[Y]{/}es  {bold}[N]{/}o  {bold}[ESC]{/} = No');

  const cleanup = () => { box.destroy(); screen.render(); };
  screen.key(['y','Y'], () => { cleanup(); onAnswer('y'); });
  screen.key(['n','N','escape'], () => { cleanup(); onAnswer('n'); });

  box.focus();
  screen.render();
}

export function showHighScores(
  screen: any,
  scores: HighScore[],
  onClose: () => void
): void {
  const rows = scores.length === 0
    ? ['  No scores yet.']
    : scores.map((s, i) =>
        `  {bold}${String(i + 1).padStart(2)}.{/} ${s.bbsHandle.padEnd(16)} {green-fg}$${Math.round(s.score).toLocaleString().padStart(12)}{/}  (${s.turns} turns)`
      );

  const box = centeredBox(screen, {
    width: 62, height: Math.min(rows.length + 5, 22), label: ' HIGH SCORES ',
  });
  box.setContent(rows.join('\n') + '\n\n  {bold}[ESC]{/} or {bold}[Q]{/} to close');

  const cleanup = () => { box.destroy(); screen.render(); };
  screen.key(['escape','q','Q'], () => { cleanup(); onClose(); });

  box.focus();
  screen.render();
}
