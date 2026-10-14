/**
 * What a hotkey prompt was answered with, in one line each.
 *
 * GWall's colour prompt rejected the caller's key on the live board and
 * accepted the same key, from the same binary, under the harness - and the
 * log said neither what the door had been handed nor where it landed. The
 * door reprints on any key it does not know, so the bytes ARE the diagnosis.
 * They are also what showed that the reply was correct and the FETCH was not
 * (`HotKey() -> char: 0` a millisecond after the prompt), which is the bug
 * wait-budget.ts now describes.
 */

/**
 * A prompt answered out of the TYPE-AHEAD QUEUE, with how many keys were
 * still behind it - the key a door acts on need not be the key just pressed.
 */
export function logHotkeyFromTypeAhead(token: string, keyData: string, queued: number, secret = false): void {
  if (secret) {
    console.log(`[JH_HK] answered with <withheld> (${queued} more queued)`);
    return;
  }
  console.log(
    `[JH_HK] answered with ${JSON.stringify(token)} -> ` +
      `${JSON.stringify(keyData)} (${queued} more queued)`,
  );
}

/**
 * A prompt answered by a key pressed while the door was waiting - the path a
 * live caller takes. `readBack` is the byte re-read from emulator memory
 * AFTER the reply, because a value that was right until reply() overwrote it
 * looks identical in a log that trusts the variable.
 */
export function logHotkeyReply(
  char: string,
  keyCode: number,
  stringAddr: number,
  readBack: number,
  ximPort: number,
  msgAddr: number,
  stringPtr: number,
  secret = false,
): void {
  if (secret) {
    console.log(`[JH_HK] replied <withheld> port=${ximPort} msg=0x${msgAddr.toString(16)}`);
    return;
  }
  console.log(
    `[JH_HK] replied ${JSON.stringify(char)} -> 0x${keyCode.toString(16)} ` +
      `at 0x${stringAddr.toString(16)} (read back 0x${readBack.toString(16)}), ` +
      `port=${ximPort} msg=0x${msgAddr.toString(16)} ` +
      `strPtr=${stringPtr ? '0x' + stringPtr.toString(16) : 'NULL'}`,
  );
}
