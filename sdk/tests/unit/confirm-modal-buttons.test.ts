/**
 * Only the active button is framed, and the idle one is readable.
 *
 * Reported from the live board on 2026-08-31, from DOORMAN's delete dialog:
 * "the left button is not readable and only the active button should have
 * the line border around it".
 *
 * Both buttons were built with `border: { type: 'line' }` and a filled
 * background in their role colour, so the dialog showed two framed, filled
 * buttons and nothing said which one Enter would press. The idle one - white
 * text on a mid-tone fill - was the unreadable half.
 *
 * The rule now: idle is the role colour as TEXT on the modal's own black,
 * with a border drawn in black so it does not show; focused fills with the
 * role colour and draws its border in it. The geometry never changes, so
 * nothing shifts when focus moves - only what is painted.
 */
import { confirmButtonStyle } from '../../engines/ui/blessed/widgets/confirm-modal';

describe('the idle button', () => {
  it('is the role colour on black, not white on a fill', () => {
    const style = confirmButtonStyle('red');

    expect(style.bg).toBe('black');
    expect(style.fg).toBe('red');
  });

  it('draws its border in the modal background, so no frame shows', () => {
    const style = confirmButtonStyle('green');

    expect(style.border?.fg).toBe('black');
  });
});

describe('the focused button', () => {
  it('fills with its role colour and frames itself in it', () => {
    const style = confirmButtonStyle('red');

    expect(style.focus?.bg).toBe('red');
    expect(style.focus?.border?.fg).toBe('red');
  });

  it('picks a foreground that can be read on that fill', () => {
    // Dark fills take white text; light fills take black. A single hardcoded
    // foreground is how the unreadable button happened in the first place.
    expect(confirmButtonStyle('red').focus?.fg).toBe('white');
    expect(confirmButtonStyle('blue').focus?.fg).toBe('white');
    expect(confirmButtonStyle('green').focus?.fg).toBe('black');
    expect(confirmButtonStyle('yellow').focus?.fg).toBe('black');
    expect(confirmButtonStyle('lightblue').focus?.fg).toBe('black');
    expect(confirmButtonStyle('white').focus?.fg).toBe('black');
  });

  it('hovers the same way it focuses, so the mouse and the keyboard agree', () => {
    const style = confirmButtonStyle('green');

    expect(style.hover?.bg).toBe(style.focus?.bg);
    expect(style.hover?.fg).toBe(style.focus?.fg);
    expect(style.hover?.border?.fg).toBe(style.focus?.border?.fg);
  });
});

describe('both buttons together', () => {
  it('never paint two frames at once', () => {
    // The screenshot: Delete framed in cyan, Cancel framed in green, both
    // filled. Whichever is focused, the other's border is the background.
    const confirm = confirmButtonStyle('red');
    const cancel = confirmButtonStyle('green');

    expect(confirm.border?.fg).toBe('black');
    expect(cancel.border?.fg).toBe('black');
    expect(confirm.focus?.border?.fg).not.toBe('black');
    expect(cancel.focus?.border?.fg).not.toBe('black');
  });
});
