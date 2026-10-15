/**
 * A push notification's link must go somewhere the sysop can actually reach.
 *
 * Four call sites built it as `process.env.BASE_URL || 'http://localhost:3001'`
 * and BASE_URL is not set on the live container, so every notification the
 * board sent carried a link to localhost. Nobody noticed because the board
 * also had zero push subscriptions: both halves had to be broken for the
 * feature to look merely absent.
 */
import { adminBaseUrl, operatorChatUrl } from '../../src/utils/admin-base-url.util';
import { config } from '../../src/config';

describe('the URL a sysop notification links to', () => {
  const saved = { base: process.env.BASE_URL, pub: process.env.PUBLIC_URL };

  afterEach(() => {
    if (saved.base === undefined) delete process.env.BASE_URL; else process.env.BASE_URL = saved.base;
    if (saved.pub === undefined) delete process.env.PUBLIC_URL; else process.env.PUBLIC_URL = saved.pub;
    jest.restoreAllMocks();
  });

  test('an operator who set BASE_URL gets exactly that, trailing slash trimmed', () => {
    process.env.BASE_URL = 'https://board.example/';
    expect(adminBaseUrl()).toBe('https://board.example');
    expect(operatorChatUrl('tok')).toBe('https://board.example/admin/operator-chat?token=tok');
  });

  test('with BASE_URL unset it uses the board\'s own public hostname, not localhost', () => {
    delete process.env.BASE_URL;
    delete process.env.PUBLIC_URL;
    jest.spyOn(config, 'getConfig').mockReturnValue({
      allowedOrigins: ['http://localhost:5173', 'https://bbs.uprough.net'],
    } as never);

    // The live case: this is the link that used to say localhost.
    expect(adminBaseUrl()).toBe('https://bbs.uprough.net');
    expect(operatorChatUrl()).toBe('https://bbs.uprough.net/admin/operator-chat');
  });

  test('a board that knows nothing about itself still answers, for a developer', () => {
    delete process.env.BASE_URL;
    delete process.env.PUBLIC_URL;
    jest.spyOn(config, 'getConfig').mockReturnValue({ allowedOrigins: [] } as never);
    expect(adminBaseUrl()).toBe('http://localhost:3001');
  });

  test('the token is carried, and omitted when there is none', () => {
    process.env.BASE_URL = 'https://board.example';
    expect(operatorChatUrl('abc123')).toContain('?token=abc123');
    expect(operatorChatUrl()).not.toContain('?token=');
  });
});
