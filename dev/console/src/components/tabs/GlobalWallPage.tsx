import React, { useCallback } from 'react';
import { CrudList } from '../CrudList.js';
import { getGlobalWallComments, updateGlobalWallComment, deleteGlobalWallComment } from '../../api/client.js';
import type { GlobalWallComment } from '../../api/client.js';

// Backend uses userName/comment/createdDate; our normalized row uses both.
// CrudList expects id: number — coerce.
interface GlobalWallRow {
  id: number;
  username?: string;
  message?: string;
  timestamp?: string;
  source?: string;
  bbsshortcode?: string;
  hidden?: boolean;
}

export function GlobalWallPage() {
  const loadComments = useCallback(async () => {
    const raw = await getGlobalWallComments(1, 100);
    return raw.map((c): GlobalWallRow => ({
      id: typeof c.id === 'string' ? parseInt(c.id, 10) || 0 : Number(c.id) || 0,
      username: c.username ?? c.userName ?? '(anonymous)',
      message: c.message ?? c.comment ?? '',
      timestamp: c.timestamp ?? c.createdDate,
      source: c.source,
      bbsshortcode: c.bbsshortcode,
      hidden: c.hidden,
    }));
  }, []);

  return (
    <CrudList<GlobalWallRow>
      title="GLOBAL WALL"
      columns={[
        { label: 'ID',      render: r => String(r.id),                            width: 7 },
        { label: 'USER',    render: r => (r.username ?? '(anonymous)').slice(0, 18), width: 20 },
        { label: 'SOURCE',  render: r => (r.source ?? '—').slice(0, 14),          width: 16 },
        { label: 'MESSAGE', render: r => (r.message ?? '').slice(0, 40),          width: 42 },
      ]}
      editFields={[
        { key: 'message', label: 'Message', type: 'string' },
        { key: 'hidden',  label: 'Hidden (1=yes, 0=no)', type: 'bool' },
      ]}
      getAll={loadComments}
      update={(id, patch) => {
        // Backend uses 'comment' field; map our normalized 'message' back to it.
        const typedPatch: Partial<GlobalWallComment> = {};
        if (patch.username !== undefined) typedPatch.userName = patch.username;
        if (patch.message !== undefined) typedPatch.comment = patch.message;
        if (patch.hidden !== undefined) typedPatch.hidden = patch.hidden;
        return updateGlobalWallComment(String(id), typedPatch);
      }}
      remove={(id) => deleteGlobalWallComment(String(id))}
    />
  );
}
