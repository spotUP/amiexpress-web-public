import { PlayerState, MarketState } from '../types';

const GUN_NAMES = ['.38 Revolver','.44 Magnum','Sawn-off Shotgun','Uzi'];

export function renderInventory(box: any, state: PlayerState, market?: MarketState): void {
  const drugNameMap = new Map(market?.prices.map(p => [p.index, p.name]) ?? []);

  const lines: string[] = ['{bold}DRUGS{/}'];
  let hasAny = false;
  for (const d of state.drugs) {
    if (d.carried > 0) {
      hasAny = true;
      const name = drugNameMap.get(d.index) ?? `Drug${d.index}`;
      lines.push(`${name.padEnd(14)} {yellow-fg}${d.carried}{/} units`);
    }
  }
  if (!hasAny) lines.push('  (none)');

  const coatUsed = state.drugs.reduce((s, d) => s + d.carried, 0);
  lines.push('');
  lines.push(`Coat: {yellow-fg}${coatUsed}/${state.coatSize}{/}`);
  lines.push('');
  lines.push('{bold}GUNS{/}');
  let hasGuns = false;
  for (const g of state.guns) {
    if (g.carried > 0) {
      hasGuns = true;
      lines.push(`${(GUN_NAMES[g.index] ?? `Gun${g.index}`).padEnd(20)} x{yellow-fg}${g.carried}{/}`);
    }
  }
  if (!hasGuns) lines.push('  (none)');

  lines.push('');
  lines.push(`Cash:  {green-fg}$${Math.round(state.cash).toLocaleString('en-US')}{/}`);
  lines.push(`Bank:  {green-fg}$${Math.round(state.bank).toLocaleString('en-US')}{/}`);
  lines.push(`Debt:  {red-fg}$${Math.round(state.debt).toLocaleString('en-US')}{/}`);
  lines.push(`HP:    {${state.health > 50 ? 'green' : 'red'}-fg}${state.health}{/}`);
  box.setContent(lines.join('\n'));
}
