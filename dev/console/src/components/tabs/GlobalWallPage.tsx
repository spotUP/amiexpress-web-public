import React, { useCallback } from 'react';
import { CrudList } from '../CrudList.js';
import { getGlobalWallComments, updateGlobalWallComment, deleteGlobalWallComment } from '../../api/client.js';
import type { GlobalWallComment } from '../../api/client.js';

// CrudList expects id: number; we'll convert the string id to number
interface GlobalWallRow {
  id: number;
  username?: string;
  message: string;
  timestamp?: string;
  hidden?: boolean;
}

export function GlobalWallPage() {
  const loadComments = useCallback(async () => {
    const comments = await getGlobalWallComments(1, 100);
    return comments.map(c => ({
      ...c,
      id: typeof c.id === 'string' ? parseInt(c.id, 10) || 0 : Number(c.id) || 0,
    })) as GlobalWallRow[];
  }, []);

  return (
    <CrudList<GlobalWallRow>
      title="GLOBAL WALL"
      columns={[
        { label: 'ID',   render: r => String(r.id), width: 6 },
        { label: 'USER', render: r => r.username ?? '(anonymous)', width: 20 },
        { label: 'MESSAGE', render: r => r.message.substring(0, 40), width: 40 },
      ]}
      editFields={[
        { key: 'message', label: 'Message', type: 'string' },
        { key: 'hidden', label: 'Hidden (1=yes, 0=no)', type: 'bool' },
      ]}
      getAll={loadComments}
      update={(id, patch) => {
        const stringId = String(id);
        const typedPatch: Partial<GlobalWallComment> = {
          username: patch.username,
          message: patch.message,
          timestamp: patch.timestamp,
          hidden: patch.hidden,
        };
        return updateGlobalWallComment(stringId, typedPatch);
      }}
      remove={(id) => deleteGlobalWallComment(String(id))}
    />
  );
}
