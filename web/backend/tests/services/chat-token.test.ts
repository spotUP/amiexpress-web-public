/**
 * Staying logged into /chat.
 *
 * Reported: "I have to log in every time - this should work like Discord."
 *
 * ChatTerminal already reads `authToken` from localStorage and signs in with
 * it, and /api/chat/login already mints one. The door's blessed login modal -
 * which is how most people actually sign in - authenticated against the
 * database and handed back nothing, so there was never a token to store.
 */

import jwt from 'jsonwebtoken';
import { mintChatToken, chatTokenSecret } from '../../src/services/chat-token.service';

const USER = { id: 'u-1', username: 'qwan', secLevel: 30 };

describe('mintChatToken', () => {
  it('carries the claims the socket auth middleware looks for', () => {
    const decoded: any = jwt.verify(mintChatToken(USER), chatTokenSecret());

    expect(decoded).toMatchObject({
      userId: 'u-1',
      username: 'qwan',
      secLevel: 30,
      chatOnly: true,
    });
  });

  it('lasts a day by default', () => {
    const decoded: any = jwt.verify(mintChatToken(USER), chatTokenSecret());
    const lifetimeHours = (decoded.exp - decoded.iat) / 3600;

    expect(lifetimeHours).toBeCloseTo(24, 1);
  });

  it('lasts a month when asked to be remembered', () => {
    const decoded: any = jwt.verify(mintChatToken(USER, true), chatTokenSecret());
    const lifetimeDays = (decoded.exp - decoded.iat) / 86400;

    expect(lifetimeDays).toBeCloseTo(30, 1);
  });

  it('carries the security level, so a restored session is not level 0', () => {
    // A session that comes back without secLevel fails every access check and
    // reads as "requires higher access" - which has already happened here.
    const decoded: any = jwt.verify(mintChatToken({ ...USER, secLevel: 255 }), chatTokenSecret());

    expect(decoded.secLevel).toBe(255);
  });

  it('produces a token the standard verifier accepts', () => {
    expect(() => jwt.verify(mintChatToken(USER), chatTokenSecret())).not.toThrow();
  });
});
