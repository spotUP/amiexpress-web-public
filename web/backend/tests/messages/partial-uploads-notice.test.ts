/**
 * The logon scan's partial-upload question is express.e's own bytes.
 *
 * partUploadOK(1), express.e:17586 and 17613: the notice, then
 * `View them (Y/N)? ` - plain text, capital N. The port printed a coloured
 * `(Y/n)?` (invented-text audit 2026-10-04, top-10 item 10).
 */
import { partialUploadsNotice } from '../../src/handlers/message/message-scan.handler';

describe('partial uploads at logon', () => {
  it('asks "View them (Y/N)? " in plain text (express.e:17613)', () => {
    const [notice, question] = partialUploadsNotice();
    expect(notice.endsWith('There are some incompleted uploads of yours\r\n')).toBe(true);
    expect(question).toBe('View them (Y/N)? ');
  });
});
