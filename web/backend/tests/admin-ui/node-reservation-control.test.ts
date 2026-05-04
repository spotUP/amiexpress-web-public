/**
 * Regression test for the A-3 admin UI panel.
 *
 * The Reserve / Clear control lives in NodeControlPage.tsx (config-app)
 * and consumes the per-node `reservedFor` field added to GET
 * /api/nodes/status. Pinning the JSX shape catches regressions where
 * someone removes the badge, drops the inline input, or re-points the
 * Save handler at the wrong endpoint.
 *
 * Same grep-style approach as the audit closure tests — config-app has
 * no jest test infra, so we read the source from the backend test
 * harness which already runs jest.
 */

import * as fs from 'fs';
import * as path from 'path';

describe('NodeControlPage reservation control (A-3 admin UI, express.e:7649-7656)', () => {
  const src = fs.readFileSync(
    path.join(
      __dirname, '..', '..', '..', '..',
      'web', 'config-app', 'src', 'pages', 'NodeControlPage.tsx',
    ),
    'utf8',
  );

  test('NodeStatus type includes reservedFor: string | null', () => {
    expect(src).toMatch(
      /interface\s+NodeStatus[\s\S]{0,800}?reservedFor\s*:\s*string\s*\|\s*null/
    );
  });

  test('renders a Reserved badge when node.reservedFor is truthy', () => {
    expect(src).toMatch(
      /node\.reservedFor\s*&&[\s\S]{0,400}?Reserved:\s*\{node\.reservedFor\}/
    );
  });

  test('Reserve button POSTs to /api/nodes/:nodeId/reserve with {username}', () => {
    // The save handler calls sendNodeCommand with command: 'reserve'
    // and a body that includes username when set.
    expect(src).toMatch(
      /handleReserveSave[\s\S]{0,400}?command:\s*['"]reserve['"][\s\S]{0,200}?username/
    );
  });

  test('Clear button calls reserve with empty body to trigger F4 toggle-clear', () => {
    expect(src).toMatch(
      /handleReserveClear[\s\S]{0,400}?command:\s*['"]reserve['"][\s\S]{0,100}?data:\s*\{\s*\}/
    );
  });

  test('Reserve control is rendered for both online and offline node cards', () => {
    // Two .online && (...) blocks each contain a Reserve / Clear control.
    // Easiest check: the Lock icon and Reserve label appear at least twice.
    const lockReserveCount = (src.match(/<Lock className=[^>]*\/>\s*Reserve\b/g) || []).length;
    expect(lockReserveCount).toBeGreaterThanOrEqual(2);
    const lockClearCount = (src.match(/<Lock className=[^>]*\/>\s*Clear Reservation/g) || []).length;
    expect(lockClearCount).toBeGreaterThanOrEqual(2);
  });

  test('inline editor uses Enter to save and Escape to cancel', () => {
    expect(src).toMatch(/e\.key === ['"]Enter['"]\s*\)\s*handleReserveSave/);
    expect(src).toMatch(/e\.key === ['"]Escape['"]\s*\)\s*handleReserveCancel/);
  });

  test('cites express.e:7649-7656 / 7652-7653 for the F4 toggle semantic', () => {
    expect(src).toMatch(/express\.e:7649-7656/);
    expect(src).toMatch(/express\.e:7652-7653/);
  });
});
