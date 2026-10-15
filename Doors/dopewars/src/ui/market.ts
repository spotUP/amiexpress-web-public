import { MarketState } from '../types';
import { T } from '../door-theme';

export function renderMarket(box: any, market: MarketState): void {
  const header = '{bold}' + 'Drug'.padEnd(11) + ' ' + 'Price'.padStart(8) + '  !{/}';
  const lines: string[] = [header];
  for (const p of market.prices) {
    const name    = (p.name || `Drug${p.index}`).slice(0, 11).padEnd(11);
    const price   = ('$' + Math.round(p.price).toLocaleString('en-US')).padStart(8);
    let trend = '--';
    if (p.cheap)     trend = `{${T.ok}-fg}!!{/}`;
    if (p.expensive) trend = `{${T.alert}-fg}**{/}`;
    lines.push(`${name} ${price}  ${trend}`);
  }
  box.setContent(lines.join('\n'));
}
