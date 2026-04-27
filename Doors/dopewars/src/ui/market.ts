import { MarketState, PlayerState } from '../types';

export function renderMarket(box: any, market: MarketState, state: PlayerState): void {
  const lines: string[] = ['{bold}Drug        Price    !{/}'];
  for (const p of market.prices) {
    const name    = (p.name || `Drug${p.index}`).slice(0, 11).padEnd(11);
    const price   = ('$' + Math.round(p.price).toLocaleString('en-US')).padStart(8);
    let   trend   = '--';
    if (p.cheap)     trend = '{green-fg}!!{/}';
    if (p.expensive) trend = '{red-fg}**{/}';
    const carried = state.drugs[p.index]?.carried ?? 0;
    const ownStr  = carried > 0 ? ` {yellow-fg}(${carried}){/}` : '';
    lines.push(`${name} ${price}  ${trend}${ownStr}`);
  }
  box.setContent(lines.join('\n'));
}
