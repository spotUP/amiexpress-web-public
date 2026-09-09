import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Bot, Plus, Trash2, Eye, Send, Wand2 } from 'lucide-react';
import { readAdminToken } from '../api/auth-token';
import { useNotification } from '../contexts/NotificationContext';

const TRADES = ['Sysop','Coder','Pixel graphician','Musician','Cracker','Trader / courier','Mail swapper','Phone phreak','Dealer','Elder','The kid'];

export function CoSysopPersonasPage() {
  const qc = useQueryClient();
  const { showSuccess, showError } = useNotification();
  const [form, setForm] = useState({ handle: '', name: '', trade: 'Sysop', temperament: { warmth: 'warm', patience: 'patient', length: 'terse', register: 'slangy' }, catchphrase: '', alwaysBringsUp: '', refusesToDiscuss: '', openingLines: '', fallbackLines: '' });
  const [describeText, setDescribeText] = useState('');
  const [tryMessage, setTryMessage] = useState('hello');
  const [tryReply, setTryReply] = useState('');

  const { data } = useQuery({
    queryKey: ['operator-chat-personas'],
    queryFn: async () => {
      const res = await fetch('/api/config/operator-chat/personas', { headers: { Authorization: `Bearer ${readAdminToken()}` } });
      const j = await res.json();
      return j.data as { presets: any[]; board: any[]; trades: string[] };
    },
  });

  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        handle: form.handle,
        name: form.name,
        trade: form.trade,
        temperament: form.temperament,
        catchphrase: form.catchphrase,
        alwaysBringsUp: form.alwaysBringsUp,
        refusesToDiscuss: form.refusesToDiscuss,
        openingLines: form.openingLines.split('\n').filter(Boolean),
        fallbackLines: form.fallbackLines.split('\n').filter(Boolean),
      };
      const res = await fetch('/api/config/operator-chat/personas', { method: 'PUT', headers: { Authorization: `Bearer ${readAdminToken()}`, 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      if (!res.ok) throw new Error((await res.json()).message || 'save failed');
      return res.json();
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['operator-chat-personas'] }); showSuccess('Persona saved'); },
    onError: (e: any) => showError(e.message),
  });

  const del = useMutation({
    mutationFn: async (slug: string) => {
      const res = await fetch(`/api/config/operator-chat/personas/${slug}`, { method: 'DELETE', headers: { Authorization: `Bearer ${readAdminToken()}` } });
      if (!res.ok) throw new Error((await res.json()).message);
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['operator-chat-personas'] }); showSuccess('Deleted'); },
    onError: (e: any) => showError(e.message),
  });

  const compose = async () => {
    const res = await fetch('/api/config/operator-chat/personas/compose', { method: 'POST', headers: { Authorization: `Bearer ${readAdminToken()}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ handle: form.handle, name: form.name, trade: form.trade, temperament: form.temperament, catchphrase: form.catchphrase, alwaysBringsUp: form.alwaysBringsUp, refusesToDiscuss: form.refusesToDiscuss }) });
    const j = await res.json();
    alert(j.data.systemPrompt);
  };

  const describe = async () => {
    const res = await fetch('/api/config/operator-chat/personas/describe', { method: 'POST', headers: { Authorization: `Bearer ${readAdminToken()}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ description: describeText }) });
    const j = await res.json();
    if (j.data?.draft) {
      setForm({ ...form, handle: j.data.draft.handle || '', name: j.data.draft.name || '', trade: j.data.draft.trade || 'Sysop', temperament: j.data.draft.temperament || form.temperament, catchphrase: j.data.draft.catchphrase || '', alwaysBringsUp: j.data.draft.alwaysBringsUp || '', refusesToDiscuss: j.data.draft.refusesToDiscuss || '' });
      showSuccess('Draft filled - edit and save');
    } else showError(j.message || 'Could not fill - edit manually');
  };

  const tryIt = async () => {
    const res = await fetch('/api/config/operator-chat/personas/try', { method: 'POST', headers: { Authorization: `Bearer ${readAdminToken()}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ draft: { handle: form.handle, name: form.name, trade: form.trade, temperament: form.temperament, catchphrase: form.catchphrase, alwaysBringsUp: form.alwaysBringsUp, refusesToDiscuss: form.refusesToDiscuss }, message: tryMessage }) });
    const j = await res.json();
    if (res.ok) setTryReply(`${j.data.handle}: ${j.data.reply}`);
    else showError(j.message);
  };

  const inputCls = "w-full px-3 py-2 bg-surface-0 border border-border text-content-primary rounded focus:outline-none focus:ring-2 focus:ring-accent text-sm";
  const selectCls = "w-full px-3 py-2 bg-surface-0 border border-border text-content-primary rounded focus:outline-none focus:ring-2 focus:ring-accent text-sm";
  const textareaCls = "w-full px-3 py-2 bg-surface-0 border border-border text-content-primary rounded focus:outline-none focus:ring-2 focus:ring-accent text-sm";

  return (
    <div className="p-6 max-w-5xl">
      <h1 className="text-2xl font-bold text-content-primary flex items-center gap-2"><Bot className="w-7 h-7" />Co-Sysop Personas</h1>
      <p className="text-sm text-content-secondary mt-1">The builder composes the system prompt so every persona inherits the voice rules. No prompt box.</p>

      <div className="mt-6 grid grid-cols-2 gap-6">
        <div className="space-y-3">
          <h2 className="font-semibold text-content-primary">Board personas</h2>
          {data?.board?.length ? data.board.map((p: any) => (
            <div key={p.slug} className="bg-surface-1 border border-border rounded p-3 flex justify-between items-start">
              <div><div className="font-mono text-sm text-content-primary">{p.handle} — {p.name}</div><div className="text-xs text-content-secondary">{p.blurb}</div></div>
              <button onClick={() => del.mutate(p.slug)} className="text-status-danger hover:text-status-danger/80 p-1"><Trash2 className="w-4 h-4" /></button>
            </div>
          )) : <div className="text-sm text-content-secondary">None yet.</div>}
          <h2 className="font-semibold mt-4 text-content-primary">Presets (cannot be deleted)</h2>
          <div className="text-xs space-y-1 bg-surface-1 border border-border rounded p-3">{data?.presets?.map((p:any) => <div key={p.slug} className="font-mono text-content-primary">{p.handle} — <span className="text-content-secondary">{p.blurb}</span></div>)}</div>
        </div>

        <div className="space-y-3 bg-surface-1 border border-border rounded-lg p-4">
          <h2 className="font-semibold text-content-primary flex items-center gap-2"><Plus className="w-4 h-4" />Builder</h2>
          <input placeholder="Handle (SCENE ALIAS, <=30)" value={form.handle} onChange={e=>setForm({...form, handle:e.target.value})} className={inputCls} />
          <input placeholder="Name (full human name)" value={form.name} onChange={e=>setForm({...form, name:e.target.value})} className={inputCls} />
          <select value={form.trade} onChange={e=>setForm({...form, trade:e.target.value})} className={selectCls}>{TRADES.map(t=><option key={t} value={t}>{t}</option>)}</select>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <select value={form.temperament.warmth} onChange={e=>setForm({...form, temperament:{...form.temperament, warmth:e.target.value as any}})} className={selectCls}><option value="warm">warm</option><option value="cold">cold</option></select>
            <select value={form.temperament.patience} onChange={e=>setForm({...form, temperament:{...form.temperament, patience:e.target.value as any}})} className={selectCls}><option value="patient">patient</option><option value="impatient">impatient</option></select>
            <select value={form.temperament.length} onChange={e=>setForm({...form, temperament:{...form.temperament, length:e.target.value as any}})} className={selectCls}><option value="terse">terse</option><option value="verbose">verbose</option></select>
            <select value={form.temperament.register} onChange={e=>setForm({...form, temperament:{...form.temperament, register:e.target.value as any}})} className={selectCls}><option value="slangy">slangy</option><option value="formal">formal</option></select>
          </div>
          <input placeholder="Catchphrase" value={form.catchphrase} onChange={e=>setForm({...form, catchphrase:e.target.value})} className={inputCls} />
          <input placeholder="Always brings up" value={form.alwaysBringsUp} onChange={e=>setForm({...form, alwaysBringsUp:e.target.value})} className={inputCls} />
          <input placeholder="Refuses to discuss" value={form.refusesToDiscuss} onChange={e=>setForm({...form, refusesToDiscuss:e.target.value})} className={inputCls} />
          <textarea placeholder="Opening lines (one per line, blank=generated)" value={form.openingLines} onChange={e=>setForm({...form, openingLines:e.target.value})} className={textareaCls} rows={2} />
          <textarea placeholder="Fallback lines (one per line)" value={form.fallbackLines} onChange={e=>setForm({...form, fallbackLines:e.target.value})} className={textareaCls} rows={2} />
          <div className="flex gap-2">
            <button onClick={()=>save.mutate()} className="px-3 py-2 bg-accent hover:bg-accent/80 text-content-inverse rounded text-sm flex items-center gap-1"><Send className="w-3 h-3" />Save</button>
            <button onClick={compose} className="px-3 py-2 bg-surface-0 border border-border text-content-primary hover:border-accent rounded text-sm flex items-center gap-1"><Eye className="w-3 h-3" />Preview prompt</button>
          </div>
          <div className="border-t border-border pt-3">
            <div className="text-xs font-medium text-content-primary">Describe it and let the board write it</div>
            <textarea placeholder="a Finnish tracker musician who only wants to talk about Protracker..." value={describeText} onChange={e=>setDescribeText(e.target.value)} className={`${textareaCls} mt-1`} rows={2} />
            <button onClick={describe} className="mt-2 px-3 py-2 bg-surface-0 border border-border text-content-primary hover:border-accent rounded text-sm flex items-center gap-1"><Wand2 className="w-3 h-3" />Generate fields</button>
          </div>
          <div className="border-t border-border pt-3">
            <div className="text-xs font-medium text-content-primary">Try it (one exchange, no caller paged)</div>
            <input value={tryMessage} onChange={e=>setTryMessage(e.target.value)} className={`${inputCls} mt-1`} />
            <button onClick={tryIt} className="mt-2 px-3 py-2 bg-surface-0 border border-border text-content-primary hover:border-accent rounded text-sm">Try</button>
            {tryReply && <div className="text-xs mt-2 p-2 bg-surface-0 border border-border rounded text-content-primary">{tryReply}</div>}
          </div>
        </div>
      </div>
    </div>
  );
}
