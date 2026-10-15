/**
 * Replies still owed by waits that already gave up.
 *
 * A wait that ends on its deadline leaves the door's message unanswered -
 * and the board answers it LATER, when the caller finally presses the key.
 * That late reply lands on the same reply port the NEXT wait polls, so the
 * next command is answered by the previous command's reply, and from then
 * on every call returns one reply early with a buffer nobody filled.
 *
 * That is what a caller saw as GWall's colour prompt looping for ever on
 * 2026-09-20: the comment prompt (`JH_PM`) timed out while he was typing,
 * and every `HotKey()` after it returned instantly with character 0 -
 * `[AEDoorLibrary] HotKey() -> char: 0` in the live log, one millisecond
 * after the prompt was sent and a second before he touched a key. The door
 * rejected 0 as a colour, redrew the menu, asked again, and spun.
 *
 * So a wait counts what it abandoned, and later waits throw away exactly
 * that many replies before believing one.
 */

export class StaleReplyLedger {
  private owedCount = 0;

  /** A wait gave up; the board still owes that message an answer. */
  owe(): void {
    this.owedCount++;
  }

  /** True while at least one reply is still owed to an abandoned wait. */
  owed(): boolean {
    return this.owedCount > 0;
  }

  /**
   * Consumes one owed reply, if any are owed. True means the message just
   * taken off the port belongs to an earlier command and must be DISCARDED.
   */
  take(): boolean {
    if (this.owedCount <= 0) return false;
    this.owedCount--;
    console.warn(
      `[AEDoorLibrary] Discarded a reply owed to a wait that had already given up ` +
        `(${this.owedCount} still owed) - it belongs to an earlier command.`,
    );
    return true;
  }
}
