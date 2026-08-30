import { GameScreen } from '../../../../Doors/grandmaster/ui/game-screen';

/**
 * "In gmaster the zone mode shows no zone meter."
 *
 * The meter was built on every frame and appended to the STATS box, which is
 * eight rows with a border - six usable lines, and the six stats already
 * filled them. Everything after them was drawn past the bottom of the box, so
 * zone mode ran with no meter at all and nothing told the player when they
 * could enter the zone.
 *
 * It has its own box now. These cover what that box says.
 */

function state(overrides: Record<string, unknown> = {}) {
  return {
    mode: 'zone',
    zoneMeter: 0,
    zoneActive: false,
    zoneTimeRemaining: 0,
    zoneBufferedLines: 0,
    ...overrides,
  };
}

describe('GRANDMASTER zone meter', () => {
  it('shows the meter as a percentage and a bar', () => {
    const content = GameScreen.zoneHudContent(state({ zoneMeter: 0.4 }));

    expect(content).toContain('40%');
    expect(content).toContain('[####------]');
  });

  it('draws an empty bar at zero and a full one at 100 per cent', () => {
    expect(GameScreen.zoneHudContent(state({ zoneMeter: 0 }))).toContain('[----------]');
    expect(GameScreen.zoneHudContent(state({ zoneMeter: 1 }))).toContain('[##########]');
  });

  it('says when the zone can be entered, and when it cannot', () => {
    // activateZone() enforces 20 per cent; without saying so, the key just
    // appears to do nothing.
    expect(GameScreen.zoneHudContent(state({ zoneMeter: 0.1 }))).toContain('needs 20%');
    expect(GameScreen.zoneHudContent(state({ zoneMeter: 0.25 }))).toContain('FLIP to enter');
  });

  it('counts down while the zone is running, and says how much is held', () => {
    const content = GameScreen.zoneHudContent(
      state({ zoneActive: true, zoneTimeRemaining: 4200, zoneBufferedLines: 7 })
    );

    expect(content).toContain('ACTIVE');
    expect(content).toContain('5s');
    expect(content).toContain('7 lines held');
  });

  it('never draws a bar longer or shorter than ten cells', () => {
    for (const meter of [-1, 0, 0.049, 0.5, 0.999, 1, 2]) {
      const bar = GameScreen.zoneHudContent(state({ zoneMeter: meter })).match(/\[([#-]*)\]/);
      expect(bar?.[1]).toHaveLength(10);
    }
  });

  it('fits the box: four lines, none wider than eighteen visible characters', () => {
    // The box is 20 wide with a border, so 18 columns of content.
    const content = GameScreen.zoneHudContent(state({ zoneMeter: 1 }));
    const visible = content.replace(/\{[^}]*\}/g, '').split('\n');

    expect(visible.length).toBeLessThanOrEqual(4);
    for (const line of visible) {
      expect(line.length).toBeLessThanOrEqual(18);
    }
  });
});
