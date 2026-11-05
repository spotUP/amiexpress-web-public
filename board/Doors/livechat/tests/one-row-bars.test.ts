/**
 * LiveChat's one-row bars have no frame, so they can hold text.
 *
 * `blessed.box` builds a `Panel`, and Panel draws a line border whenever the
 * caller passes no `border` key. A box one row high has no interior once the
 * frame takes its top and bottom rows, so its content never renders - the
 * door paints a rule where the text was supposed to be.
 *
 * Eight of them were in this door: the channel header, the user-status line,
 * a video tile's status bar, the empty-grid notice, two settings labels, the
 * ghost-text hint and the drawing palette probe. It is the same rule that
 * produced four separate reports on 2026-09-02, in GRANDMASTER, Scrollwars,
 * the widget showcase and WHIP.
 *
 * Driven, not read: the real components are built against a real Screen and
 * asked what border they ended up with, and what they paint.
 */

import assert from 'assert';
import blessed, { Screen } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import { createChannelHeader } from '../ui/channel-header';
import { createUserStatus } from '../ui/user-status';

function screenWithOutput(): { screen: any; painted: () => string } {
  const writes: string[] = [];
  const screen: any = new Screen({
    title: 'livechat', width: 80, height: 25,
    output: (d: string) => writes.push(d),
  } as any);
  const painted = () => writes.join('')
    .replace(/\x1b\][^\x07]*\x07/g, '')
    .replace(/\x1b\[[0-9;?]*[a-zA-Z]/g, '')
    .replace(/\s+/g, '');
  return { screen, painted };
}

export async function theChannelHeaderIsABarNotAFrame(): Promise<void> {
  const { screen } = screenWithOutput();
  try {
    const header: any = createChannelHeader(blessed, screen);
    assert.ok(!header.border,
      'the channel header is one row high - a frame would leave it nothing to draw in');
  } finally { screen.destroy(); }
}

export async function theUserStatusLineIsABarNotAFrame(): Promise<void> {
  const { screen } = screenWithOutput();
  try {
    const status: any = createUserStatus(blessed, screen);
    assert.ok(!status.border, 'and so is the user-status line');
  } finally { screen.destroy(); }
}

export async function aOneRowBarPaintsWhatItIsGiven(): Promise<void> {
  const { screen, painted } = screenWithOutput();
  try {
    const header: any = createChannelHeader(blessed, screen);
    header.setContent('#general - 3 online');
    screen.render();
    await new Promise((r) => setTimeout(r, 30));

    assert.ok(painted().includes('#general-3online'),
      'the header text reaches the screen rather than being swallowed by its own border');
  } finally { screen.destroy(); }
}
