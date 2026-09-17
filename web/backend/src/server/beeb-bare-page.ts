/**
 * The emulator's page, with its own interface taken off.
 *
 * jsbeeb ships a full web page around the machine - a navbar, menus, quick
 * settings, links, modals. That is right for its own site and wrong here:
 * a BBC Micro in MODE 7 IS teletext, and a bootstrap navbar above it turns
 * a teletext screen into a web page with a computer in it.
 *
 * The chrome is hidden with injected CSS at SERVE time rather than by
 * editing the vendored files. Two reasons, and the second is the important
 * one:
 *
 *  1. `vendor/jsbeeb` stays byte-identical to the upstream build, so it can
 *     be re-vendored by re-running the build with no patch to reapply.
 *  2. jsbeeb is GPL-3. Shipping a MODIFIED copy carries obligations that an
 *     unmodified one does not - it has to be marked as changed, and the
 *     changed source offered. A stylesheet this board adds on the way out
 *     leaves their program as they published it.
 *
 * Nothing is removed from the DOM: the emulator's own code still expects
 * its elements to exist, and hiding is what a stylesheet can promise
 * without knowing which ones it reads.
 */

/**
 * Hide the page, keep the machine.
 *
 * `#screen` is the emulator's canvas. Everything else here is chrome, and
 * `!important` throughout because Bootstrap's own rules are more specific
 * than anything appended after them.
 */
const BARE_CSS = `
<style id="bbs-bare-emulator">
  /*
   * THE BLACK GOES ON html, NEVER ON body.
   *
   * jsbeeb's own stylesheet puts the canvas at a NEGATIVE z-index:
   *   #screen { z-index: -1; position: absolute; width: 896px; height: 600px }
   *
   * A negative-z descendant is painted above the ROOT background but below
   * the background of every block box in its stacking context - body
   * included. So a black background on body paints over the machine, and
   * the screen goes black while the monitor photograph, which is
   * positioned with an auto z-index, stays perfectly visible.
   *
   * That is what a black screen behind an intact bezel means, and it cost
   * an hour of blaming ROMs and layout rules on 2026-09-17.
   */
  html {
    background: #000 !important;
  }

  body {
    background: transparent !important;
    margin: 0 !important;
    padding: 0 !important;
    overflow: hidden !important;
  }

  /*
   * The emulator's own interface: the navbar across the top, and the strip
   * of indicators along the bottom - #leds holds the drive readouts, the
   * cassette, caps and shift lock, econet and the speed.
   *
   * Both are siblings of the machine, so removing them entirely is safe.
   */
  #header-bar,
  .navbar,
  #quick-settings,
  #leds,
  #audio-stats,
  footer,
  .footer {
    display: none !important;
  }

  /*
   * The CUB monitor photograph.
   *
   * NOT display:none. jsbeeb positions the canvas against this image's box
   * - it is the frame the screen sits inside - so taking the box out of
   * the layout leaves the canvas with nothing to be positioned against and
   * the whole screen goes black. Learned the hard way, 2026-09-17.
   *
   * opacity:0 keeps the geometry exactly as jsbeeb computed it and removes
   * only the picture, which is all that was wanted.
   */
  #cub-monitor-pic,
  #cub-monitor .sidebar {
    opacity: 0 !important;
  }

  /*
   * Nothing below touches position, size or display of #outer,
   * #cub-monitor or #screen. That is deliberate: the emulator's own layout
   * works, and every attempt to improve on it from out here has made the
   * screen disappear.
   */
</style>
`;

/**
 * Put the stylesheet last in the head, so it wins on equal specificity.
 *
 * A page with no `</head>` is served untouched rather than guessed at - a
 * broken injection would be a blank screen with no way to tell why.
 */
export function bareEmulatorPage(html: string): string {
  const at = html.toLowerCase().lastIndexOf('</head>');
  if (at === -1) return html;
  return html.slice(0, at) + BARE_CSS + html.slice(at);
}
