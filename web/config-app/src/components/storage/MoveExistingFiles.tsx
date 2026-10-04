import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { UploadCloud } from 'lucide-react';
import { apiClient } from '../../api/client';
import { formatBytes } from '../../lib/format';

export interface MoveToDrivePlan {
  conference: number;
  dir: number;
  driveNumber: number;
  files: Array<{ filename: string; size: number }>;
  totalBytes: number;
  roomBytes: number | null;
}

interface MoveBatch {
  moved: string[];
  failed: Array<{ filename: string; error: string }>;
  remaining: number;
}

export interface MoveExistingFilesProps {
  conference: number;
  dir: number;
}

/**
 * A directory put on a cloud drive sends only NEW uploads there; the files it
 * already had stay on this server's disk. This shows how many there are and
 * moves them on request, batch by batch, until none are left or a batch
 * moves nothing (a full drive, a failing drive).
 */
export function MoveExistingFiles({ conference, dir }: MoveExistingFilesProps) {
  const queryClient = useQueryClient();
  const [running, setRunning] = useState(false);
  const [moved, setMoved] = useState(0);
  const [failed, setFailed] = useState<MoveBatch['failed']>([]);
  const [error, setError] = useState<string | null>(null);

  const planKey = ['move-to-drive', conference, dir];
  const planQuery = useQuery<MoveToDrivePlan>({
    queryKey: planKey,
    queryFn: async () => (await apiClient.getMoveToDrivePlan(conference, dir)).data as MoveToDrivePlan,
    // A directory just put on the drive reaches the board's pool a moment
    // after the conference is saved.
    retry: (count, err) => count < 4 && /not on a cloud drive/i.test(String((err as Error)?.message)),
    retryDelay: 1000,
  });

  const run = async () => {
    setRunning(true);
    setError(null);
    setFailed([]);
    let total = 0;
    try {
      for (;;) {
        const batch = (await apiClient.moveToDriveBatch(conference, dir)).data as MoveBatch;
        total += batch.moved.length;
        setMoved(total);
        setFailed(batch.failed);
        if (batch.remaining === 0 || batch.moved.length === 0) break;
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRunning(false);
      queryClient.invalidateQueries({ queryKey: planKey });
      queryClient.invalidateQueries({ queryKey: ['drives'] });
    }
  };

  if (planQuery.isLoading) return <p className="text-xs text-content-muted">Counting the files on this server...</p>;
  if (planQuery.error) return <p className="text-xs text-status-danger">{(planQuery.error as Error).message}</p>;
  const plan = planQuery.data;
  if (!plan) return null;

  const fileWord = (n: number) => `${n} file${n === 1 ? '' : 's'}`;
  const tooBig = plan.roomBytes !== null && plan.totalBytes > plan.roomBytes;

  return (
    <div className="space-y-1">
      {plan.files.length === 0 ? (
        <p className="text-xs text-content-muted">
          {moved > 0 ? `Moved ${fileWord(moved)}. ` : ''}No files of this directory are left on this server.
        </p>
      ) : (
        <>
          <p className="text-xs text-content-secondary">
            {fileWord(plan.files.length)} ({formatBytes(plan.totalBytes)}) are still on this server&apos;s disk.
            {plan.roomBytes !== null && ` Drive ${plan.driveNumber} has ${formatBytes(plan.roomBytes)} left.`}
          </p>
          {tooBig && (
            <p className="text-xs text-status-warn">
              They do not all fit. The files that fit are moved; the rest stay here.
            </p>
          )}
          <button type="button" onClick={run} disabled={running} className="btn-secondary inline-flex items-center gap-2">
            <UploadCloud size={16} aria-hidden="true" />
            <span>{running ? `Moving... ${moved} done` : `Move them to drive ${plan.driveNumber}`}</span>
          </button>
        </>
      )}
      {failed.length > 0 && (
        <ul className="text-xs text-status-danger">
          {failed.map((f) => (
            <li key={f.filename}>
              {f.filename}: {f.error}
            </li>
          ))}
        </ul>
      )}
      {error && <p className="text-xs text-status-danger">{error}</p>}
    </div>
  );
}
