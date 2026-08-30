import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Save, RefreshCw, Download, Filter, ShieldAlert } from 'lucide-react';
import { apiClient } from '../api/client';
import { useNotification } from '../contexts/NotificationContext';

interface ValidationIssue {
  line: number;
  status: 'ok' | 'warning' | 'error';
  message: string;
  text: string;
}

interface ValidationResult {
  name?: string;
  summary: {
    total: number;
    errors: number;
    warnings: number;
    ok: number;
  };
  issues: ValidationIssue[];
}

export function BatchEditorPage() {
  const { showSuccess, showError } = useNotification();
  const [selectedBatch, setSelectedBatch] = useState<string>('');
  const [content, setContent] = useState<string>('');
  const [dirty, setDirty] = useState(false);
  const [filter, setFilter] = useState('');
  const [hideComments, setHideComments] = useState(false);
  const [validation, setValidation] = useState<ValidationResult | null>(null);

  const batchesQuery = useQuery({
    queryKey: ['batches'],
    queryFn: () => apiClient.getBatches(),
  });

  useEffect(() => {
    if (batchesQuery.data?.batches?.length && !selectedBatch) {
      setSelectedBatch(batchesQuery.data.batches[0]);
    }
  }, [batchesQuery.data, selectedBatch]);

  useEffect(() => {
    const load = async () => {
      if (!selectedBatch) return;
      try {
        const res = await apiClient.getBatch(selectedBatch);
        setContent(res.content || '');
        setDirty(false);
        setValidation(null);
      } catch (err: any) {
        showError(`Failed to load batch ${selectedBatch}: ${err.message}`);
      }
    };
    load();
  }, [selectedBatch, showError]);

  const handleSave = async () => {
    if (!selectedBatch) return;
    try {
      await apiClient.saveBatch(selectedBatch, content);
      showSuccess(`Saved ${selectedBatch}`);
      setDirty(false);
    } catch (err: any) {
      showError(`Failed to save ${selectedBatch}: ${err.message}`);
    }
  };

  const handleExportTxt = () => {
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${selectedBatch || 'batch'}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleExportCsv = () => {
    const rows = (validation?.issues || []).map((issue) =>
      `${issue.line},${issue.status},"${issue.message.replace(/"/g, '""')}","${issue.text.replace(/"/g, '""')}"`
    );
    if (!rows.length) {
      showError('Run validation first to export CSV');
      return;
    }
    const header = 'line,status,message,text';
    const blob = new Blob([header + '\n' + rows.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${selectedBatch || 'batch'}-validation.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleValidate = async () => {
    if (!selectedBatch) return;
    try {
      const result = await apiClient.validateBatch(selectedBatch, content) as ValidationResult;
      setValidation(result);
      if (result.summary.errors > 0) {
        showError(`Validation completed with ${result.summary.errors} error(s)`);
      } else if (result.summary.warnings > 0) {
        showSuccess(`Validation completed with ${result.summary.warnings} warning(s)`);
      } else {
        showSuccess('Validation clean');
      }
    } catch (err: any) {
      showError(`Validation failed: ${err.message}`);
    }
  };

  const handleInsertHelper = (line: string) => {
    setContent((prev) => (prev.endsWith('\n') || prev.length === 0 ? prev + line : `${prev}\n${line}`));
    setDirty(true);
  };

  const lines = useMemo(() => content.split('\n').map((line, idx) => {
    const trimmed = line.trim();
    const isComment = trimmed.startsWith(';') || trimmed.startsWith('#') || trimmed.startsWith('.') || trimmed.length === 0;
    return { idx, text: line, isComment };
  }), [content]);

  const filteredLines = lines.filter(({ text, isComment }) => {
    if (hideComments && isComment) return false;
    if (filter && !text.toLowerCase().includes(filter.toLowerCase())) return false;
    return true;
  });

  const validationByLine = useMemo(() => {
    const map = new Map<number, ValidationIssue[]>();
    (validation?.issues || []).forEach((issue) => {
      const list = map.get(issue.line) || [];
      list.push(issue);
      map.set(issue.line, list);
    });
    return map;
  }, [validation]);

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-accent mb-1">Batch Editor</h1>
          <p className="text-bbs-muted">Edit logon/logoff batch files (batch0–batch6). Use with care.</p>
        </div>
        <div className="flex items-center space-x-2">
          <select
            value={selectedBatch}
            onChange={(e) => setSelectedBatch(e.target.value)}
            className="input-field"
          >
            {(batchesQuery.data?.batches || []).map((b: string) => (
              <option key={b} value={b}>{b}</option>
            ))}
          </select>
          <button
            onClick={handleSave}
            disabled={!dirty}
            className="btn-primary flex items-center space-x-2 disabled:opacity-50"
          >
            <Save size={16} />
            <span>Save</span>
          </button>
          <button
            onClick={handleExportTxt}
            className="btn-secondary flex items-center space-x-2"
          >
            <Download size={16} />
            <span>Export</span>
          </button>
          <button
            onClick={() => setSelectedBatch(selectedBatch)}
            className="btn-secondary flex items-center space-x-2"
          >
            <RefreshCw size={16} />
            <span>Reload</span>
          </button>
        </div>
      </div>

      <div className="card mb-4">
        <div className="flex flex-wrap items-center gap-3 mb-3">
          <div className="flex items-center space-x-2">
            <Filter size={16} className="text-bbs-muted" />
            <input
              type="text"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Filter lines"
              className="input-field"
            />
          </div>
          <label className="flex items-center space-x-2 text-sm text-bbs-text">
            <input
              type="checkbox"
              checked={hideComments}
              onChange={(e) => setHideComments(e.target.checked)}
            />
            <span>Hide comments</span>
          </label>
          <div className="flex items-center space-x-2">
            <button onClick={() => handleInsertHelper('; TIMEOUT 60')} className="btn-secondary">+ Timeout 60</button>
            <button onClick={() => handleInsertHelper('SLEEP 2')} className="btn-secondary">+ Sleep 2s</button>
            <button onClick={() => handleInsertHelper('WAIT 1')} className="btn-secondary">+ Wait 1s</button>
          </div>
          <div className="flex items-center space-x-2 ml-auto">
            <button onClick={handleValidate} className="btn-primary flex items-center space-x-2">
              <ShieldAlert size={16} />
              <span>Validate</span>
            </button>
            <button onClick={handleExportCsv} className="btn-secondary flex items-center space-x-2">
              <Download size={16} />
              <span>Export CSV</span>
            </button>
          </div>
        </div>
        {validation && (
          <div className="text-sm text-bbs-text flex items-center space-x-4">
            <span>Lines: {validation.summary.total}</span>
            <span className="text-status-danger">Errors: {validation.summary.errors}</span>
            <span className="text-status-warn">Warnings: {validation.summary.warnings}</span>
            <span className="text-status-ok">OK: {validation.summary.ok}</span>
          </div>
        )}
      </div>

      <div className="card">
        <div className="grid grid-cols-12 gap-2 text-xs font-mono text-bbs-text">
          <div className="col-span-1 text-bbs-muted">#</div>
          <div className="col-span-10 text-bbs-muted">Command</div>
          <div className="col-span-1 text-bbs-muted text-right">Status</div>
        </div>
        <div className="divide-y divide-bbs-border">
          {filteredLines.map(({ idx, text, isComment }) => {
            const lineNo = idx + 1;
            const issues = validationByLine.get(lineNo) || [];
            const worst = issues.find((i) => i.status === 'error') || issues.find((i) => i.status === 'warning');
            const statusLabel = worst ? worst.status.toUpperCase() : 'OK';
            const statusClass = worst?.status === 'error'
              ? 'text-status-danger'
              : worst?.status === 'warning'
                ? 'text-status-warn'
                : 'text-status-ok';
            return (
              <div key={idx} className="grid grid-cols-12 gap-2 py-1 items-center">
                <div className="col-span-1 text-xs text-bbs-muted">{lineNo}</div>
                <div className="col-span-10">
                  <input
                    type="text"
                    value={text}
                    onChange={(e) => {
                      const next = [...content.split('\n')];
                      next[idx] = e.target.value;
                      setContent(next.join('\n'));
                      setDirty(true);
                    }}
                    className={`input-field w-full font-mono text-xs ${isComment ? 'text-bbs-muted' : 'text-bbs-text'}`}
                  />
                  {issues.map((issue) => (
                    <div key={issue.message + issue.status} className="text-[11px] text-bbs-muted">
                      {issue.status === 'error' ? 'Error' : 'Warning'}: {issue.message}
                    </div>
                  ))}
                </div>
                <div className={`col-span-1 text-right text-xs ${statusClass}`}>{statusLabel}</div>
              </div>
            );
          })}
        </div>
        <button
          onClick={() => {
            setContent(content + '\n');
            setDirty(true);
          }}
          className="btn-secondary mt-3"
        >
          + Add Line
        </button>
      </div>
    </div>
  );
}
