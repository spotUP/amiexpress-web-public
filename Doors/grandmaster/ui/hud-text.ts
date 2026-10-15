/**
 * The HUD's little readouts: the dig counter, the zone meter, the ultra clock.
 *
 * Lifted out of `ui/game-screen.ts` unchanged (2026-09-15) to keep it under
 * its cap. Each is a string built from the run's state and nothing else - no
 * widget, no screen - which is why `zoneHudContent` was already a static on
 * the screen class: it was written to be testable and only its address was
 * wrong.
 *
 * Semantic colours throughout: `ok` / `warn` / `alert` for a count that is
 * running out, `accent` for a meter that is full.
 */
import { T } from '../door-theme';

/** DIG: how many garbage rows are left, and a bar of them. */
export function digHud(state: any): string {
  if (state.mode !== 'dig') return '';
  const remaining = state.digLinesRemaining ?? 0;
  const color = remaining <= 3 ? T.ok : remaining <= 6 ? T.warn : T.alert;
  const filled = 10 - remaining;
  const bar = '#'.repeat(filled) + '-'.repeat(remaining);
  return `\n{${color}-fg}DIG: ${remaining} left{/${color}-fg}\n{${T.dim}-fg}[${bar}]{/${T.dim}-fg}`;
}

/** ZONE: the meter while it fills, the countdown while it runs. */
export function zoneHud(state: any): string {
  if (state.zoneActive) {
    const s = Math.ceil(Math.max(0, state.zoneTimeRemaining) / 1000);
    const n = state.zoneBufferedLines ?? 0;
    return `\n {${T.chrome}-fg}{bold}ACTIVE{/bold}{/${T.chrome}-fg}\n {${T.chrome}-fg}${s}s{/${T.chrome}-fg}\n {${T.ink}-fg}${n} lines held{/${T.ink}-fg}`;
  }
  const meter = state.zoneMeter ?? 0;
  const pct = Math.round(meter * 100);
  const filled = Math.max(0, Math.min(10, Math.round(meter * 10)));
  const bar = '#'.repeat(filled) + '-'.repeat(10 - filled);
  // 20% is the threshold activateZone() enforces; say so rather than leaving
  // the player guessing why the key does nothing.
  const color = pct >= 100 ? T.accent : pct >= 20 ? T.chrome : T.dim;
  const hint = pct >= 20 ? `{${T.ok}-fg}FLIP to enter{/${T.ok}-fg}` : `{${T.dim}-fg}needs 20%{/${T.dim}-fg}`;
  return `\n {${color}-fg}${String(pct).padStart(3)}%{/${color}-fg} {${T.dim}-fg}[${bar}]{/${T.dim}-fg}\n ${hint}`;
}

/** ULTRA: the clock, reddening as it runs down. */
export function ultraTime(state: any): string {
  if (state.mode !== 'ultra' || state.ultraTimeRemaining === undefined) return '';
  const ms = Math.max(0, state.ultraTimeRemaining);
  const totalSecs = Math.ceil(ms / 1000);
  const m = Math.floor(totalSecs / 60);
  const s = (totalSecs % 60).toString().padStart(2, '0');
  const color = ms < 30000 ? T.alert : ms < 60000 ? T.warn : T.ok;
  return `\n  {${color}-fg}TIME: ${m}:${s}{/${color}-fg}`;
}
