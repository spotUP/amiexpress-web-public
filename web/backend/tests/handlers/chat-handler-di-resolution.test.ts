/**
 * Sysop chat state must survive between calls.
 *
 * From the live log of 2026-08-26, five times:
 *
 *   [ChatHandler] DI Resolution Error: Error: TypeInfo not known for "ChatHandler"
 *
 * Production runs `npx tsx src/index.ts` (Dockerfile CMD), and tsx delegates
 * to esbuild, which does NOT emit `design:paramtypes`. tsyringe has no
 * constructor type info to work from, so `container.resolve(ChatHandler)`
 * throws on EVERY call and resolveChatHandler() falls back to
 * `new ChatHandler(new ChatSessionUseCase())`.
 *
 * That fallback is not harmless. ChatSessionUseCase owns chatState -
 * activeSessions, pagingUsers, sysopAvailable - so a fresh instance per call
 * means a session created by one call is invisible to the next. Paging a
 * sysop and then asking whether anybody is paging used to consult two
 * different objects.
 *
 * Jest runs through @swc/jest with decoratorMetadata enabled, so it HAS the
 * metadata production lacks - and tsyringe captures constructor types at
 * DECORATION time, so deleting Reflect metadata afterwards cannot reproduce
 * the tsx failure from inside jest. What can be checked here is the thing
 * that makes resolution independent of emitted metadata in the first place:
 * an explicit injection token on the constructor parameter. The state-sharing
 * tests below are the faithful ones - they failed for exactly the reason
 * production fails.
 */

import 'reflect-metadata';
import { container } from '../../src/container';
import { ChatHandler } from '../../src/handlers/chat/chat.handler';
import { ChatSessionUseCase } from '../../src/services/use-cases/chat-session.use-case';

describe('ChatHandler DI without emitted decorator metadata (the tsx runtime)', () => {
  afterEach(() => {
    container.clearInstances();
  });

  it('declares its dependency with an explicit token, not by reflected type', () => {
    // tsyringe records @inject(...) tokens here. With one present it never
    // consults design:paramtypes for that parameter, which is what lets
    // resolution work under esbuild. Without it, production logs
    // "TypeInfo not known" on every call.
    const tokens: Record<string, { token: unknown }> =
      Reflect.getMetadata('injectionTokens', ChatHandler) ?? {};
    expect(Object.values(tokens).map(t => t.token)).toContain(ChatSessionUseCase);
  });

  it('still resolves through the container', () => {
    expect(() => container.resolve(ChatHandler)).not.toThrow();
    expect(container.resolve(ChatHandler)).toBeInstanceOf(ChatHandler);
  });

  it('hands every ChatHandler the SAME ChatSessionUseCase, so state persists', () => {
    const first = container.resolve(ChatSessionUseCase);
    const second = container.resolve(ChatSessionUseCase);
    expect(second).toBe(first);
  });

  it('a chat session created through one resolve is visible through the next', () => {
    // The symptom in user terms: page the sysop, then nothing knows you are
    // paging.
    const a = container.resolve(ChatSessionUseCase);
    a.createChatSession('user-1', 'qwan');

    const b = container.resolve(ChatSessionUseCase);
    // getPagingUsers() returns user IDs, not display names.
    expect(b.getPagingUsers()).toContain('user-1');
    expect(b.getChatSessionByUser('user-1')).not.toBeNull();
  });
});
