import { MarketState, PlayerState } from '../types';

const DRUG_NAMES = [
  'Cocaine','Heroin','Acid','Weed','Speed',
  'Ludes','Shrooms','PCP','Hashish','Opium',
];

export function renderMarket(box: any, market: MarketState, state: PlayerState): void {
  const lines: string[] = ['{bold}Drug           Price    Evt{/}'];
  for (const p of market.prices) {
    const name    = (DRUG_NAMES[p.index] ?? `Drug${p.index}`).padEnd(12);
    const price   = ('$' + Math.round(p.price).toLocaleString()).padStart(8);
    let   trend   = '--';
    if (p.cheap)     trend = '{green-fg}!!{/}';
    if (p.expensive) trend = '{red-fg}**{/}';
    const carried = state.drugs[p.index]?.carried ?? 0;
    const ownStr  = carried > 0 ? ` {yellow-fg}(${carried}){/}` : '';
    lines.push(`${name} ${price}  ${trend}${ownStr}`);
  }
  box.setContent(lines.join('\n'));
}
