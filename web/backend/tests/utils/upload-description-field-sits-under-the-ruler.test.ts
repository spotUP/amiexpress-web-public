/**
 * The upload description field sits under its ruler.
 *
 * express.e:17728-17729 prints the ruler with its `[` at column 32, then
 * `'\l\s[13]                   :'` - the file name in thirteen columns,
 * nineteen spaces, and the colon at column 32. The board printed the name
 * and the colon straight after it, so an XMODEM caller typed the description
 * at column 14, eighteen columns left of the ruler meant to measure it.
 */
import { descriptionPromptHead, pretransferDescriptionLead } from '../../src/utils/file-upload.util';

const rulerColumn = descriptionPromptHead(10).split('\r\n').find((line) => line.includes('[-'))!.indexOf('[');

describe('the pre-transfer description field', () => {
  it('puts the colon under the ruler, where express.e does', () => {
    expect(rulerColumn).toBe(32);
    expect(pretransferDescriptionLead('DEMO.LHA').indexOf(':')).toBe(rulerColumn);
  });

  it('keeps a long name to thirteen columns so the colon does not move', () => {
    const lead = pretransferDescriptionLead('AVERYLONGFILENAME.LHA');
    expect(lead.startsWith('AVERYLONGFILE ')).toBe(true);
    expect(lead.indexOf(':')).toBe(rulerColumn);
  });
});
