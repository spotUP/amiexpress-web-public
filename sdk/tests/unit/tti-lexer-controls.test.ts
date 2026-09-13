/**
 * A teletext control byte inside an OL payload is DATA, not a line ending.
 *
 * 0x0D is DOUBLE HEIGHT. The lexer normalised every \r to \n before it split
 * records, so a row carrying that control was cut in two and the second half
 * parsed as a record with no command - the row simply vanished. The CEBRA
 * converter writes raw teletext bytes straight into OL payloads, so this hit
 * exactly the pages that use double height.
 */
import { lexTti } from '../../teletext/marco/tti/ttiLexer';

const DH = '\r';   // 0x0D, DOUBLE HEIGHT
const CRLF_FILE = ['DE,Test', 'PN,10000', 'OL,1,HEADLINE', ''].join('\r\n');

describe('lexTti keeps control bytes inside the record', () => {
  it('does not split an OL row on a double-height control', () => {
    const records = lexTti(`DE,Test\nOL,1,${DH}BIG ROW\nOL,2,small\n`);
    const ol = records.filter((r) => r.command === 'OL');
    expect(ol).toHaveLength(2);
    expect(ol[0].parts.join(',')).toContain(DH);
    expect(ol[0].parts.join(',')).toContain('BIG ROW');
  });

  it('still ends records on CRLF and on LF', () => {
    const records = lexTti(CRLF_FILE);
    expect(records.filter((r) => r.command === 'DE')).toHaveLength(1);
    expect(records.filter((r) => r.command === 'PN')).toHaveLength(1);
    expect(records.filter((r) => r.command === 'OL')).toHaveLength(1);
    const lf = lexTti('DE,Test\nPN,10000\nOL,1,row\n');
    expect(lf.filter((r) => r.command === 'OL')).toHaveLength(1);
  });

  it('a row that is only a control byte survives as a row', () => {
    const records = lexTti(`OL,3,${DH}\n`);
    expect(records.filter((r) => r.command === 'OL')).toHaveLength(1);
  });
});
