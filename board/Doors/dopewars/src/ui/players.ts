import { PlayerSummary } from '../types';
import { T } from '../door-theme';

export function renderPlayers(box: any, players: PlayerSummary[], selfId: string): void {
  const others = players.filter(p => p.id !== selfId);
  if (others.length === 0) {
    box.setContent('  ---');
    return;
  }
  const txt = others
    .map(p => `{${T.accentAlt}-fg}${p.name}{/} ({${p.health > 50 ? 'green' : 'red'}-fg}${p.health}hp{/})`)
    .join('  ');
  box.setContent('  ' + txt);
}
