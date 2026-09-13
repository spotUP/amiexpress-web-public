/**
 * The co-sysop personas a caller meets, and the builder that writes them.
 *
 * Everything here goes through `apiClient`: the page used to hand-roll six
 * `fetch` calls with their own Authorization header and no `res.ok` check, so
 * a refusal was read as a success - `alert(j.data.systemPrompt)` threw
 * "cannot read properties of undefined" on any error body, an expired session
 * was never handled, and the composed prompt was shown in a browser alert
 * rather than on the page. The trade list came from a copy kept here while
 * the board sent its own with every request.
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Bot, Plus, Trash2, Eye, Send, Wand2, X } from 'lucide-react';
import { apiClient } from '../api/client';
import type { ApiResponse } from '../types';
import { useNotification } from '../contexts/NotificationContext';
import { personaDeleteConfirmFor } from './persona-delete-guard';

interface PersonaTemperament {
  warmth: 'warm' | 'cold';
  patience: 'patient' | 'impatient';
  length: 'terse' | 'verbose';
  register: 'slangy' | 'formal';
}

interface PersonaSummary {
  slug: string;
  handle: string;
  name?: string;
  blurb?: string;
}

/** What the board answers with: its own presets, its own personas, its own trades. */
interface PersonaDirectory {
  presets: PersonaSummary[];
  board: PersonaSummary[];
  trades: string[];
}

interface PersonaForm {
  handle: string;
  name: string;
  trade: string;
  temperament: PersonaTemperament;
  catchphrase: string;
  alwaysBringsUp: string;
  refusesToDiscuss: string;
  /** One line per line, as typed; split on the way out. */
  openingLines: string;
  fallbackLines: string;
}

interface PersonaDraftPayload {
  handle: string;
  name: string;
  trade: string;
  temperament: PersonaTemperament;
  catchphrase: string;
  alwaysBringsUp: string;
  refusesToDiscuss: string;
}

const EMPTY_FORM: PersonaForm = {
  handle: '', name: '', trade: '',
  temperament: { warmth: 'warm', patience: 'patient', length: 'terse', register: 'slangy' },
  catchphrase: '', alwaysBringsUp: '', refusesToDiscuss: '', openingLines: '', fallbackLines: '',
};

const failure = (error: unknown, fallback: string) =>
  error instanceof Error && error.message ? error.message : fallback;

export function CoSysopPersonasPage() {
  const queryClient = useQueryClient();
  const { showSuccess, showError, confirm } = useNotification();
  const [form, setForm] = useState<PersonaForm>(EMPTY_FORM);
  const [describeText, setDescribeText] = useState('');
  const [tryMessage, setTryMessage] = useState('hello');
  const [tryReply, setTryReply] = useState('');
  /** The composed system prompt, shown ON THE PAGE. It used to be an alert. */
  const [composedPrompt, setComposedPrompt] = useState<string | null>(null);

  const personasQuery = useQuery({
    queryKey: ['operator-chat-personas'],
    queryFn: (): Promise<ApiResponse<PersonaDirectory>> => apiClient.getPersonas(),
  });
  const directory = personasQuery.data?.data;
  // The board's own list. A copy kept here went stale the moment a trade was
  // added, and the page was already fetching the real one and ignoring it.
  const trades = directory?.trades ?? (form.trade ? [form.trade] : []);

  const draftOf = (values: PersonaForm): PersonaDraftPayload => ({
    handle: values.handle,
    name: values.name,
    trade: values.trade,
    temperament: values.temperament,
    catchphrase: values.catchphrase,
    alwaysBringsUp: values.alwaysBringsUp,
    refusesToDiscuss: values.refusesToDiscuss,
  });

  const save = useMutation({
    mutationFn: () => apiClient.savePersona({
      ...draftOf(form),
      openingLines: form.openingLines.split('\n').filter(Boolean),
      fallbackLines: form.fallbackLines.split('\n').filter(Boolean),
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['operator-chat-personas'] });
      showSuccess('Persona saved');
    },
    onError: (error: unknown) => showError(failure(error, 'Could not save the persona')),
  });

  const del = useMutation({
    mutationFn: (slug: string) => apiClient.deletePersona(slug),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['operator-chat-personas'] });
      showSuccess('Persona deleted');
    },
    onError: (error: unknown) => showError(failure(error, 'Could not delete the persona')),
  });

  const compose = useMutation({
    mutationFn: (): Promise<ApiResponse<{ systemPrompt: string }>> =>
      apiClient.composePersona(draftOf(form)),
    onSuccess: response => setComposedPrompt(response.data?.systemPrompt ?? ''),
    onError: (error: unknown) => showError(failure(error, 'Could not compose the prompt')),
  });

  const describe = useMutation({
    mutationFn: (): Promise<ApiResponse<{ draft: PersonaDraftPayload | null }>> =>
      apiClient.describePersona(describeText),
    onSuccess: response => {
      const draft = response.data?.draft;
      if (!draft) {
        showError(response.message ?? 'Could not fill the form from that - edit it yourself');
        return;
      }
      setForm(current => ({
        ...current,
        handle: draft.handle || '',
        name: draft.name || '',
        trade: draft.trade || current.trade,
        temperament: draft.temperament || current.temperament,
        catchphrase: draft.catchphrase || '',
        alwaysBringsUp: draft.alwaysBringsUp || '',
        refusesToDiscuss: draft.refusesToDiscuss || '',
      }));
      showSuccess('Draft filled - edit and save');
    },
    onError: (error: unknown) => showError(failure(error, 'Could not fill the form')),
  });

  const tryIt = useMutation({
    mutationFn: (): Promise<ApiResponse<{ handle: string; reply: string }>> =>
      apiClient.tryPersona(draftOf(form), tryMessage),
    onSuccess: response => {
      const answer = response.data;
      setTryReply(answer ? `${answer.handle}: ${answer.reply}` : '');
    },
    onError: (error: unknown) => showError(failure(error, 'The persona did not answer')),
  });

  /** Never one click: a persona is the voice the board answers callers with. */
  const askThenDelete = async (persona: PersonaSummary) => {
    if (await confirm(personaDeleteConfirmFor(persona))) del.mutate(persona.slug);
  };

  const inputCls = "w-full px-3 py-2 bg-surface-0 border border-border text-content-primary rounded focus:outline-none focus:ring-2 focus:ring-accent text-sm";
  const selectCls = inputCls;
  const textareaCls = inputCls;

  return (
    <div className="p-6 max-w-5xl">
      <h1 className="text-2xl font-bold text-content-primary flex items-center gap-2"><Bot className="w-7 h-7" />Co-Sysop Personas</h1>
      <p className="text-sm text-content-secondary mt-1">The builder composes the system prompt so every persona inherits the voice rules. No prompt box.</p>

      <div className="mt-6 grid grid-cols-2 gap-6">
        <div className="space-y-3">
          <h2 className="font-semibold text-content-primary">Board personas</h2>
          {personasQuery.isError ? (
            <div className="text-sm text-status-danger">
              {failure(personasQuery.error, 'The personas could not be loaded')}
            </div>
          ) : null}
          {directory?.board?.length ? directory.board.map(persona => (
            <div key={persona.slug} className="bg-surface-1 border border-border rounded p-3 flex justify-between items-start">
              <div>
                <div className="font-mono text-sm text-content-primary">{persona.handle} — {persona.name}</div>
                <div className="text-xs text-content-secondary">{persona.blurb}</div>
              </div>
              <button
                type="button"
                aria-label={`Delete ${persona.handle}`}
                onClick={() => { void askThenDelete(persona); }}
                disabled={del.isPending}
                className="text-status-danger hover:text-status-danger/80 p-1 disabled:opacity-50"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          )) : <div className="text-sm text-content-secondary">None yet.</div>}
          <h2 className="font-semibold mt-4 text-content-primary">Presets (cannot be deleted)</h2>
          <div className="text-xs space-y-1 bg-surface-1 border border-border rounded p-3">
            {directory?.presets?.map(preset => (
              <div key={preset.slug} className="font-mono text-content-primary">
                {preset.handle} — <span className="text-content-secondary">{preset.blurb}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-3 bg-surface-1 border border-border rounded-lg p-4">
          <h2 className="font-semibold text-content-primary flex items-center gap-2"><Plus className="w-4 h-4" />Builder</h2>
          <input placeholder="Handle (SCENE ALIAS, <=30)" aria-label="Handle" value={form.handle} onChange={e=>setForm({...form, handle:e.target.value})} className={inputCls} />
          <input placeholder="Name (full human name)" aria-label="Name" value={form.name} onChange={e=>setForm({...form, name:e.target.value})} className={inputCls} />
          <select aria-label="Trade" value={form.trade} onChange={e=>setForm({...form, trade:e.target.value})} className={selectCls}>
            <option value="">Choose a trade</option>
            {trades.map(trade => <option key={trade} value={trade}>{trade}</option>)}
          </select>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <select aria-label="Warmth" value={form.temperament.warmth} onChange={e=>setForm({...form, temperament:{...form.temperament, warmth:e.target.value as PersonaTemperament['warmth']}})} className={selectCls}><option value="warm">warm</option><option value="cold">cold</option></select>
            <select aria-label="Patience" value={form.temperament.patience} onChange={e=>setForm({...form, temperament:{...form.temperament, patience:e.target.value as PersonaTemperament['patience']}})} className={selectCls}><option value="patient">patient</option><option value="impatient">impatient</option></select>
            <select aria-label="Length" value={form.temperament.length} onChange={e=>setForm({...form, temperament:{...form.temperament, length:e.target.value as PersonaTemperament['length']}})} className={selectCls}><option value="terse">terse</option><option value="verbose">verbose</option></select>
            <select aria-label="Register" value={form.temperament.register} onChange={e=>setForm({...form, temperament:{...form.temperament, register:e.target.value as PersonaTemperament['register']}})} className={selectCls}><option value="slangy">slangy</option><option value="formal">formal</option></select>
          </div>
          <input placeholder="Catchphrase" aria-label="Catchphrase" value={form.catchphrase} onChange={e=>setForm({...form, catchphrase:e.target.value})} className={inputCls} />
          <input placeholder="Always brings up" aria-label="Always brings up" value={form.alwaysBringsUp} onChange={e=>setForm({...form, alwaysBringsUp:e.target.value})} className={inputCls} />
          <input placeholder="Refuses to discuss" aria-label="Refuses to discuss" value={form.refusesToDiscuss} onChange={e=>setForm({...form, refusesToDiscuss:e.target.value})} className={inputCls} />
          <textarea placeholder="Opening lines (one per line, blank=generated)" aria-label="Opening lines" value={form.openingLines} onChange={e=>setForm({...form, openingLines:e.target.value})} className={textareaCls} rows={2} />
          <textarea placeholder="Fallback lines (one per line)" aria-label="Fallback lines" value={form.fallbackLines} onChange={e=>setForm({...form, fallbackLines:e.target.value})} className={textareaCls} rows={2} />
          <div className="flex gap-2">
            <button type="button" onClick={()=>save.mutate()} disabled={save.isPending} className="px-3 py-2 bg-accent hover:bg-accent/80 text-content-inverse rounded text-sm flex items-center gap-1 disabled:opacity-50"><Send className="w-3 h-3" />Save</button>
            <button type="button" onClick={()=>compose.mutate()} disabled={compose.isPending} className="px-3 py-2 bg-surface-0 border border-border text-content-primary hover:border-accent rounded text-sm flex items-center gap-1 disabled:opacity-50"><Eye className="w-3 h-3" />Preview prompt</button>
          </div>
          {composedPrompt !== null ? (
            <div className="bg-surface-0 border border-border rounded p-2">
              <div className="flex items-start justify-between gap-2">
                <div className="text-xs font-medium text-content-primary">Composed system prompt</div>
                <button
                  type="button"
                  aria-label="Hide the composed prompt"
                  onClick={() => setComposedPrompt(null)}
                  className="text-content-secondary hover:text-content-primary"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
              <pre className="mt-1 max-h-64 overflow-y-auto whitespace-pre-wrap font-mono text-xs text-content-primary">{composedPrompt}</pre>
            </div>
          ) : null}
          <div className="border-t border-border pt-3">
            <div className="text-xs font-medium text-content-primary">Describe it and let the board write it</div>
            <textarea placeholder="a Finnish tracker musician who only wants to talk about Protracker..." aria-label="Description" value={describeText} onChange={e=>setDescribeText(e.target.value)} className={`${textareaCls} mt-1`} rows={2} />
            <button type="button" onClick={()=>describe.mutate()} disabled={describe.isPending || !describeText.trim()} className="mt-2 px-3 py-2 bg-surface-0 border border-border text-content-primary hover:border-accent rounded text-sm flex items-center gap-1 disabled:opacity-50"><Wand2 className="w-3 h-3" />Generate fields</button>
          </div>
          <div className="border-t border-border pt-3">
            <div className="text-xs font-medium text-content-primary">Try it (one exchange, no caller paged)</div>
            <input aria-label="Message to try" value={tryMessage} onChange={e=>setTryMessage(e.target.value)} className={`${inputCls} mt-1`} />
            <button type="button" onClick={()=>tryIt.mutate()} disabled={tryIt.isPending} className="mt-2 px-3 py-2 bg-surface-0 border border-border text-content-primary hover:border-accent rounded text-sm disabled:opacity-50">Try</button>
            {tryReply && <div className="text-xs mt-2 p-2 bg-surface-0 border border-border rounded text-content-primary">{tryReply}</div>}
          </div>
        </div>
      </div>
    </div>
  );
}
