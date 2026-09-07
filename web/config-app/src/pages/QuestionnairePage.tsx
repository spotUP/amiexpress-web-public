import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ClipboardList, Save, Power } from 'lucide-react';

import { apiClient } from '../api/client';
import { useNotification } from '../contexts/NotificationContext';
import { useAuth } from '../contexts/AuthContext';

/**
 * What the server knows about the new-user questionnaire.
 *
 * One text, fanned out to every node and baud on save - this board has always
 * carried the same lines in 281 files. `enabled` is a fact about the files
 * (live in the node directory, or parked in `disabled_scripts/`), never a
 * flag of its own.
 */
export interface QuestionnaireShape {
  enabled: boolean;
  text: string;
  nodes: number;
  liveFiles: number;
  parkedFiles: number;
  source: string | null;
}

/**
 * The lines a new caller will be asked, exactly as express.e reads them.
 *
 * A line ending in `~` is a question - the caller answers, and the answer is
 * written to the node's Answers file. Every other line is shown as it is. The
 * whole thing runs once, right after the registration summary, and it ran on
 * this board until 2026-04-24, when it was switched off by moving the files
 * aside; the sysop wanted it back and editable here.
 */
export function QuestionnairePage() {
  const { secLevel } = useAuth();
  const isSysop = secLevel >= 255;
  const { showSuccess, showError, confirm } = useNotification();
  const queryClient = useQueryClient();

  const { data, isLoading, error } = useQuery({
    queryKey: ['questionnaire'],
    queryFn: async () => (await apiClient.getQuestionnaire()).data as QuestionnaireShape,
  });

  const [text, setText] = useState('');
  const [dirty, setDirty] = useState(false);
  useEffect(() => {
    if (data && !dirty) setText(data.text);
  }, [data, dirty]);

  const save = useMutation({
    mutationFn: (body: string) => apiClient.saveQuestionnaire(body),
    onSuccess: (res) => {
      setDirty(false);
      queryClient.invalidateQueries({ queryKey: ['questionnaire'] });
      showSuccess(res.message ?? 'Questionnaire saved');
    },
    onError: (err: Error) => showError(err.message),
  });

  const toggle = useMutation({
    mutationFn: (enabled: boolean) => apiClient.setQuestionnaireEnabled(enabled),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['questionnaire'] });
      showSuccess(res.message ?? 'Questionnaire updated');
    },
    onError: (err: Error) => showError(err.message),
  });

  const questions = text.split(/\r?\n/).filter(line => line.trimEnd().endsWith('~')).length;

  const onToggle = async () => {
    if (!data) return;
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

  return (
    <div className="space-y-4">
      <header className="flex items-center gap-2 min-w-0">
        <ClipboardList size={20} />
        <h1 className="text-xl text-content-primary">New-user questionnaire</h1>
        {data && (
          <span
            className={`text-sm ${data.enabled ? 'text-status-ok' : 'text-content-secondary'}`}
            data-testid="questionnaire-state"
          >
            {data.enabled
              ? `On - ${data.liveFiles} files across ${data.nodes} nodes`
              : data.parkedFiles > 0
                ? `Off - ${data.parkedFiles} files parked`
                : 'Off - no questionnaire yet'}
          </span>
        )}
      </header>

      <p className="text-sm text-content-secondary max-w-3xl">
        Asked once, right after a new caller confirms their registration - the account exists
        by then. A line that ends in <span className="font-mono"> ~ </span> is a question and
        the answer is written to the node&apos;s Answers file. A line that starts with a tilde
        is a command, the same as in a screen file:
        <span className="font-mono"> ~CC_SCREENTHEME| </span> opens the theme picker,
        <span className="font-mono"> ~CC_ACHIEVE| </span> the achievements sign-up, and the
        script carries on when the caller comes back. Every other line is shown as it is. One
        text here reaches every node and every baud rate - the board keeps a copy per node, as
        AmiExpress does.
      </p>

      {error && <p className="text-status-danger text-sm">{(error as Error).message}</p>}

      <div className="space-y-2">
        <label htmlFor="questionnaire-text" className="label">
          Questionnaire{questions > 0 ? ` - ${questions} question${questions === 1 ? '' : 's'}` : ''}
        </label>
        <textarea
          id="questionnaire-text"
          className="input-field w-full font-mono text-sm"
          rows={18}
          spellCheck={false}
          value={text}
          disabled={isLoading || !isSysop}
          onChange={event => { setText(event.target.value); setDirty(true); }}
        />
        {!isSysop && (
          <p className="text-sm text-content-secondary">Only a sysop can change the questionnaire.</p>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="btn-primary inline-flex items-center gap-2"
          disabled={!isSysop || !dirty || save.isPending}
          onClick={() => save.mutate(text)}
        >
          <Save size={16} />
          {save.isPending ? 'Saving' : 'Save to every node'}
        </button>
        <button
          type="button"
          className="btn-secondary inline-flex items-center gap-2"
          disabled={!isSysop || !data || toggle.isPending || (!data.enabled && data.liveFiles + data.parkedFiles === 0 && !dirty)}
          onClick={onToggle}
        >
          <Power size={16} />
          {data?.enabled ? 'Disable' : 'Enable'}
        </button>
        {data?.source && (
          <span className="text-sm text-content-secondary">
            Read from <span className="font-mono">{data.source}</span>
          </span>
        )}
      </div>
    </div>
  );
}
