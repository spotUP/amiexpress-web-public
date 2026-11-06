import { describe, it, expect } from 'vitest';
import { decodeOsc52 } from '../../../../packages/terminal/src/utils/osc52-clipboard';

const b64 = (s: string) => Buffer.from(s, 'utf8').toString('base64');

describe('decodeOsc52', () => {
  it('decodes UTF-8 text', () => {
    expect(decodeOsc52(`c;${b64('café åäö')}`)).toBe('café åäö');
  });
  it('ignores queries, empty payloads and bad base64', () => {
    expect(decodeOsc52('c;?')).toBeNull();
    expect(decodeOsc52('c;')).toBeNull();
    expect(decodeOsc52('nosep')).toBeNull();
    expect(decodeOsc52('c;!!!')).toBeNull();
  });
});
