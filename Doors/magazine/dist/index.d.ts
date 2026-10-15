/**
 * MAG - the reader for THE UNKNOWN FREQUENCY.
 *
 * Reads the stories the board's magazine service publishes
 * (Magazine/index.json, Magazine/stories/<id>.json, Magazine/frontpage.json)
 * and sets them in newspaper columns: one column at 40, two at 80, three on
 * a wide terminal. Only the front page the editor approved is shown as the
 * front page; with nothing approved the reader says AWAITING EDITOR.
 */
import { CoreDoor as Door } from '@amiexpress/bbs-door-sdk';
declare const door: Door;
export default door;
//# sourceMappingURL=index.d.ts.map