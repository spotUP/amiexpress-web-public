/**
 * Whether new callers are asked anything, beside the screen that asks it.
 *
 * The questionnaire IS a screen - `Node<n>/script<baud>`, a text shown to a
 * new caller that carries the `~CC_` codes the board runs - and the sysop said
 * to treat it like one: "the questionair should probably just be treated like
 * a normal screen" (2026-09-17). So it opens in the same dialog as every other
 * screen, and this is the one thing about it a screen does not have: an off
 * switch.
 *
 * Off means the 281 copies are moved into `Node<n>/disabled_scripts/`, which
 * is how this board has been switched off since 2026-04-24 - not a flag of its
 * own, because `doNewUserQuestions` looks for the FILES.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ClipboardList } from 'lucide-react';

import { apiClient } from '../api/client';
import { useNotification } from '../contexts/NotificationContext';

interface QuestionnaireState {
  enabled: boolean;
  nodes: number;
  liveFiles: number;
  parkedFiles: number;
}

/** `Node1/script2400` yes, `Node1/BBSTITLE.txt` no. */
export function isQuestionnaireScreen(path: string | null): boolean {
  if (!path) return false;
  const name = path.slice(path.lastIndexOf('/') + 1);
  return /^script\d+$/i.test(name);
}

export function QuestionnaireSwitch() {
  const queryClient = useQueryClient();
  const { showSuccess, showError, confirm } = useNotification();

  const { data } = useQuery({
    queryKey: ['questionnaire'],
    queryFn: async () => (await apiClient.getQuestionnaire()).data as QuestionnaireState,
  });

  const toggle = useMutation({
    mutationFn: (enabled: boolean) => apiClient.setQuestionnaireEnabled(enabled),
    onSuccess: (res: { message?: string }) => {
      queryClient.invalidateQueries({ queryKey: ['questionnaire'] });
      // The files move, so the index that lists this screen is now wrong.
      queryClient.invalidateQueries({ queryKey: ['screen-index'] });
      showSuccess(res.message ?? 'Questionnaire updated');
    },
    onError: (err: Error) => showError(err.message),
  });

  if (!data) return null;

  const onToggle = async () => {
    if (data.enabled) {
      const sure = await confirm({
        title: 'Disable the questionnaire?',
        message: 'New callers will go straight from the registration summary to their account. The text is kept and can be switched back on.',
        confirmText: 'Disable',
      });
      if (!sure) return;
    }
    toggle.mutate(!data.enabled);
  };

  const copies = data.enabled ? data.liveFiles : data.parkedFiles;

  return (
    <div className="mt-3 flex flex-wrap items-center gap-3 border border-border p-3 text-sm">
      <ClipboardList size={16} className="text-content-secondary" />
      <span className={data.enabled ? 'text-content-primary' : 'text-content-secondary'}>
        {data.enabled
          ? 'Asked of every new caller.'
          : 'Not asked: new callers go straight to their account.'}
      </span>
      <span className="text-content-secondary">
        {copies} file{copies === 1 ? '' : 's'}, {data.nodes} node{data.nodes === 1 ? '' : 's'}
        {data.enabled ? '' : ', parked'}
      </span>
      <button
        type="button"
        className="btn-secondary ml-auto"
        onClick={onToggle}
        disabled={toggle.isPending}
      >
        {data.enabled ? 'Disable' : 'Enable'}
      </button>
    </div>
  );
}
