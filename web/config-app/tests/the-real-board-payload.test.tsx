/**
 * THE PAYLOAD THE SYSOP'S OWN BOARD ANSWERS WITH, captured 2026-09-16 from
 * `GET /api/screens/login-sequence?node=1` on localhost while he reported
 * "found it on local now its stuck loading".
 *
 * Kept verbatim: six steps, every one of them with an EMPTY item list, a
 * theme in play, and a file that does not resolve for one step. A fixture
 * written by hand would have had items in it, which is exactly the case that
 * already worked.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

const get = vi.fn();
const put = vi.fn();
vi.mock('../src/api/client', () => ({ apiClient: { get: (...a: unknown[]) => get(...a), put: (...a: unknown[]) => put(...a) } }));
vi.mock('../src/contexts/NotificationContext', () => ({
  useNotification: () => ({ showSuccess: vi.fn(), showError: vi.fn(), confirm: vi.fn(async () => true) }),
}));

import { LoginSequencePage } from '../src/pages/LoginSequencePage';

const PAYLOAD = {
  "node": 1,
  "conf": null,
  "theme": "tango",
  "themes": [
    {
      "slug": "default",
      "title": "Board default screens",
      "status": "live",
      "isDefault": false
    },
    {
      "slug": "tango",
      "title": "Tango",
      "status": "live",
      "isDefault": true
    },
    {
      "slug": "ansiguy",
      "title": "ansiguy's screens",
      "status": "draft",
      "isDefault": false
    }
  ],
  "steps": [
    {
      "screen": "LOGON",
      "label": "Logon screen",
      "note": "Logon.txt, or logon<level>.txt for the caller's access level",
      "skippedByQuickFlag": true,
      "file": "Themes/tango/Node/LOGON.TXT",
      "exists": true,
      "bytes": 957,
      "items": [],
      "program": false,
      "blankPause": false
    },
    {
      "screen": "BULL",
      "label": "Board bulletin",
      "note": "The board-wide bulletin, before the node's own",
      "skippedByQuickFlag": false,
      "file": "Themes/tango/Board/BULL.TXT",
      "exists": true,
      "bytes": 1209,
      "items": [],
      "program": false,
      "blankPause": false
    },
    {
      "screen": "NODE_BULL",
      "label": "Node bulletins",
      "note": "This node's bulletins - where the MultiTop pages are listed",
      "skippedByQuickFlag": false,
      "file": null,
      "exists": false,
      "bytes": 0,
      "items": [],
      "program": false,
      "blankPause": false
    },
    {
      "screen": "ACHIEVETOP",
      "label": "Achievements leaderboard",
      "note": "Written on its own timer; absent on a board with no achievements server",
      "skippedByQuickFlag": false,
      "file": "Screens/AchieveTop.txt",
      "exists": true,
      "bytes": 715,
      "items": [],
      "program": false,
      "blankPause": false
    },
    {
      "screen": "MAILSCAN",
      "label": "Mail scan",
      "note": "Shown during the conference scan",
      "skippedByQuickFlag": false,
      "file": "Themes/tango/Board/MAILSCAN.TXT",
      "exists": true,
      "bytes": 1265,
      "items": [],
      "program": false,
      "blankPause": false
    },
    {
      "screen": "CONF_BULL",
      "label": "Conference bulletin",
      "note": "The joined conference's own bulletin, last before the menu",
      "skippedByQuickFlag": false,
      "file": null,
      "exists": false,
      "bytes": 0,
      "items": [],
      "program": false,
      "blankPause": false
    }
  ],
  "available": [
    {
      "target": "BBS:Bulletins/BullHelp.ttx",
      "bytes": 328
    },
    {
      "target": "BBS:Bulletins/BullHelp.txt",
      "bytes": 248
    },
    {
      "target": "BBS:Bulletins/bull1.txt",
      "bytes": 2124
    },
    {
      "target": "BBS:Bulletins/bull10.txt",
      "bytes": 1231
    },
    {
      "target": "BBS:Bulletins/bull11.txt",
      "bytes": 1254
    },
    {
      "target": "BBS:Bulletins/bull12.txt",
      "bytes": 6
    },
    {
      "target": "BBS:Bulletins/bull2.txt",
      "bytes": 2124
    },
    {
      "target": "BBS:Bulletins/bull3.txt",
      "bytes": 2124
    },
    {
      "target": "BBS:Bulletins/bull4.txt",
      "bytes": 2124
    },
    {
      "target": "BBS:Bulletins/bull5.txt",
      "bytes": 2123
    },
    {
      "target": "BBS:Bulletins/bull6.txt",
      "bytes": 2573
    },
    {
      "target": "BBS:Bulletins/bull7.txt",
      "bytes": 1744
    },
    {
      "target": "BBS:Bulletins/bull8.txt",
      "bytes": 1591
    },
    {
      "target": "BBS:Bulletins/bull9.txt",
      "bytes": 2323
    },
    {
      "target": "BBS:Bulletins/lastc.txt",
      "bytes": 3707
    },
    {
      "target": "BBS:Screens/AchieveTop.txt",
      "bytes": 715
    },
    {
      "target": "BBS:Screens/BBSTITLE.TXT",
      "bytes": 13981
    },
    {
      "target": "BBS:Screens/Logon24hrs.txt",
      "bytes": 794
    },
    {
      "target": "BBS:Screens/ONENODE.TXT",
      "bytes": 815
    },
    {
      "target": "BBS:Screens/ONENODE.ttx",
      "bytes": 503
    },
    {
      "target": "BBS:Screens/PRIVACY.TXT",
      "bytes": 1069
    },
    {
      "target": "BBS:Screens/PRIVACY.ttx",
      "bytes": 616
    },
    {
      "target": "BBS:Screens/bbb.txt",
      "bytes": 2326
    },
    {
      "target": "BBS:Screens/flt.txt",
      "bytes": 10963
    },
    {
      "target": "BBS:Screens/quicknew.txt",
      "bytes": 1488
    },
    {
      "target": "BBS:Screens/quicknew2.txt",
      "bytes": 39
    },
    {
      "target": "BBS:Screens/uprough.txt",
      "bytes": 10053
    }
  ]
};

beforeEach(() => {
  get.mockReset().mockResolvedValue({ data: { success: true, data: PAYLOAD, timestamp: '' } });
  put.mockReset().mockResolvedValue({ data: {} });
});

describe("the board's own answer", () => {
  it('renders the walk instead of spinning on skeletons', async () => {
    render(<LoginSequencePage />);
    expect(await screen.findByText(/1\. /)).toBeTruthy();
  });

  it('asks the board twice at most - once, then once more for the theme it named', async () => {
    render(<LoginSequencePage />);
    await screen.findByText(/1\. /);
    await new Promise(resolve => setTimeout(resolve, 300));
    expect(get.mock.calls.length).toBeLessThanOrEqual(2);
  });
});
