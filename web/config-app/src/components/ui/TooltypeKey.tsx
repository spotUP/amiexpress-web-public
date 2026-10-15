/**
 * The tooltype a form field writes to, shown under the field.
 *
 * The admin is a front end onto files the BBS reads: `bbsConfig.info` is the
 * source of truth and this form is one way of editing it. Naming the key makes
 * that visible and lets a sysop cross-check a value against the file - which
 * is the only way to catch a field that round-trips into the wrong tooltype,
 * the way a door's NAME once did.
 *
 * The map comes from the writer over `/api/config/system/tooltypes`, not from
 * a copy in this app: a copy would drift the first time a tooltype was
 * renamed, and the form would then be naming a key that no longer exists.
 */

import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../../api/client';
import type { ApiResponse } from '../../types/bbs';

export const TOOLTYPE_KEYS_QUERY = ['config', 'system', 'tooltypes'] as const;

export function useTooltypeKeys() {
  return useQuery<Record<string, string>>({
    queryKey: TOOLTYPE_KEYS_QUERY,
    queryFn: async () => {
      const response = await apiClient.get<ApiResponse<Record<string, string>>>(
        '/api/config/system/tooltypes'
      );
      return response.data.data ?? {};
    },
    // The map only changes when the writer's own map does, which is a deploy.
    staleTime: Infinity,
  });
}

interface TooltypeKeyProps {
  /** The configuration field name, as registered on the form. */
  field: string;
  /** The file the tooltype lives in. */
  file?: string;
}

export function TooltypeKey({ field, file = 'bbsConfig.info' }: TooltypeKeyProps) {
  const { data } = useTooltypeKeys();
  const tooltype = data?.[field];

  // A field with no tooltype is not written to the file at all; saying nothing
  // is more honest than inventing a key for it.
  if (!tooltype) return null;

  return (
    <p className="mt-1 font-mono text-2xs text-content-muted">
      {file} : {tooltype}
    </p>
  );
}
