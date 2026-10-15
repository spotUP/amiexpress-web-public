import { QueryClient, type DefaultOptions } from '@tanstack/react-query';

/**
 * How every query in the admin behaves - exported because a test that builds
 * its own client with different defaults tests a different application.
 *
 * `staleTime` is the one that bites: five minutes means a page mounting onto
 * a cache entry another page already filled reads that entry AS IS, with no
 * refetch to repair it. Two pages sharing a key must therefore agree on the
 * SHAPE they store, and a test running at staleTime 0 cannot see when they
 * do not.
 */
export const QUERY_DEFAULTS: DefaultOptions = {
  queries: {
    refetchOnWindowFocus: false,
    retry: 1,
    staleTime: 5 * 60 * 1000, // 5 minutes
  },
  mutations: {
    retry: 1,
  },
};

export const queryClient = new QueryClient({ defaultOptions: QUERY_DEFAULTS });
