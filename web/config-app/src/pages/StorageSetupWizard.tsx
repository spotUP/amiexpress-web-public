import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, ArrowRight, CheckCircle2, ExternalLink, PlugZap, X, XCircle } from 'lucide-react';
import { Modal } from '../components/ui/Modal';
import { apiClient } from '../api/client';
import { useNotification } from '../contexts/NotificationContext';
import {
  GB,
  QUOTA_CHOICES,
  completeEndpoint,
  regionFor,
  type StorageProvider,
} from './storage-providers';

/**
 * Adding a storage drive, one step at a time.
 *
 * The sysop's words (2026-10-04): "i tried to add a Backblaze B2 bucket now
 * but it needs an api key and there is no help/link on how to create the
 * account and get a key", then "maybe we could do them as wizards". The old
 * Add Drive dialog asked for a bucket, an endpoint value, a key ID and a
 * secret, and said nothing about where any of them come from.
 *
 * Every provider-specific word on these pages - the sign-up link, the console
 * steps, which console field is the key ID - comes from the provider
 * catalogue (web/backend/src/storage/providers.ts) through
 * GET /api/config/storage-providers. This component only lays it out.
 */

type StepId = 'provider' | 'account' | 'bucket' | 'key' | 'details' | 'use';

const STEP_TITLES: Record<StepId, string> = {
  provider: 'Choose a provider',
  account: 'Create the account',
  bucket: 'Create the bucket',
  key: 'Create the access key',
  details: 'Enter the details',
  use: 'Use the drive',
};

const BUCKET_STEPS: StepId[] = ['provider', 'account', 'bucket', 'key', 'details', 'use'];
const LOCAL_STEPS: StepId[] = ['provider', 'details', 'use'];

interface ConnectionTestResult {
  reachable: boolean;
  error?: string;
  explanation?: string;
}

/** The slice of a conference this step reads: its dirs, and which drive each is on. */
interface ConferenceDirs {
  conference_id: number;
  name: string;
  ndirs: number;
  [storagedrive: `storagedrive_${number}`]: number | undefined;
}

export interface StorageSetupWizardProps {
  open: boolean;
  onClose: () => void;
  providers: StorageProvider[];
  /**
   * The number the new drive takes. parseVolumes stops at the first GAP in
   * the DRIVE.n series, so it must follow on from the drives already there.
   */
  nextDriveNumber: number;
}

/** A choice button, the same look the Drives and Conferences pages use for theirs. */
function choiceClass(selected: boolean): string {
  return `rounded border px-3 py-2 text-left text-sm transition-colors ${
    selected
      ? 'border-accent bg-accent/10 text-accent'
      : 'border-border text-content-secondary hover:border-accent/50'
  }`;
}

function Steps({ items }: { items: string[] }) {
  return (
    <ol className="list-decimal space-y-2 pl-5 text-sm text-content-primary">
      {items.map((item) => (
        <li key={item} className="break-words">{item}</li>
      ))}
    </ol>
  );
}

export function StorageSetupWizard({ open, onClose, providers, nextDriveNumber }: StorageSetupWizardProps) {
  const queryClient = useQueryClient();
  const { showSuccess, showError } = useNotification();

  const [stepIndex, setStepIndex] = useState(0);
  /** null until picked; '' is this server's own disk. */
  const [providerId, setProviderId] = useState<string | null>(null);
  const [bucket, setBucket] = useState('');
  const [endpointFill, setEndpointFill] = useState('');
  const [regionFill, setRegionFill] = useState('');
  const [keyId, setKeyId] = useState('');
  const [secret, setSecret] = useState('');
  const [quotaBytes, setQuotaBytes] = useState<number | ''>('');
  const [localPath, setLocalPath] = useState('');
  const [description, setDescription] = useState('');
  const [testResult, setTestResult] = useState<ConnectionTestResult | null>(null);
  const [createdDrive, setCreatedDrive] = useState<number | null>(null);
  /** `conference:dir` pairs ticked on the last step. */
  const [chosenDirs, setChosenDirs] = useState<Set<string>>(new Set());

  const provider = providers.find((p) => p.id === providerId);
  const isLocal = providerId === '';
  const steps = isLocal ? LOCAL_STEPS : BUCKET_STEPS;
  const step = steps[stepIndex];
  const needsFill = !!provider?.endpointTemplate?.includes('{}');
  const endpoint = completeEndpoint(provider, endpointFill, regionFill);
  const region = provider ? regionFor(provider, endpointFill, regionFill) : '';

  const conferencesQuery = useQuery({
    queryKey: ['conferences'],
    queryFn: () => apiClient.getConferenceConfigs(),
    enabled: open && step === 'use',
  });
  const conferences = ((conferencesQuery.data as { data?: ConferenceDirs[] } | undefined)?.data ?? []);

  const pickProvider = (id: string) => {
    const picked = providers.find((p) => p.id === id);
    setProviderId(id);
    setEndpointFill('');
    setRegionFill('');
    setTestResult(null);
    // The free tier is the starting quota: the board stops filing uploads
    // there before the provider starts billing.
    setQuotaBytes(picked?.freeQuotaBytes ? picked.freeQuotaBytes : '');
  };

  const testMutation = useMutation({
    mutationFn: async () =>
      (await apiClient.testDriveConnection({ endpoint, region, bucket: bucket.trim(), keyId: keyId.trim(), secret }))
        .data as ConnectionTestResult,
    onSuccess: (result) => setTestResult(result),
    onError: (error: Error) => setTestResult({ reachable: false, explanation: error.message }),
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const payload = provider
        ? {
            drive_number: nextDriveNumber,
            drive_path: `s3://${bucket.trim()}`,
            description,
            enabled: true,
            provider: provider.id,
            endpoint,
            region,
            keyId: keyId.trim(),
            volumeClass: provider.volumeClass,
            egress: provider.egress,
            ...(quotaBytes === '' ? {} : { quotaBytes }),
            ...(provider.minimumRetentionDays > 0 ? { retentionDays: provider.minimumRetentionDays } : {}),
          }
        : { drive_number: nextDriveNumber, drive_path: localPath.trim(), description, enabled: true };
      await apiClient.createDrive(payload);
      // A separate write on purpose: the secret must never reach Drives.info,
      // which every part of the board can read.
      if (provider) await apiClient.writeDriveSecret(nextDriveNumber, secret);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['drives'] });
      showSuccess(`Drive ${nextDriveNumber} created`);
      setCreatedDrive(nextDriveNumber);
      // Saved; this page has no further use for it.
      setSecret('');
      setStepIndex(steps.indexOf('use'));
    },
    onError: (error: Error) => showError(`Failed to create drive: ${error.message}`),
  });

  const assignMutation = useMutation({
    mutationFn: async () => {
      const byConference = new Map<number, Record<string, number>>();
      for (const pair of chosenDirs) {
        const [conference, dir] = pair.split(':').map(Number);
        const updates = byConference.get(conference) ?? {};
        updates[`storagedrive_${dir}`] = createdDrive!;
        byConference.set(conference, updates);
      }
      // The same PUT the Conferences form's "Dir N lives on" buttons save through.
      for (const [conference, updates] of byConference) {
        await apiClient.updateConferenceConfig(conference, updates);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conferences'] });
      queryClient.invalidateQueries({ queryKey: ['drives'] });
      showSuccess(`${chosenDirs.size} director${chosenDirs.size === 1 ? 'y' : 'ies'} now on drive ${createdDrive}`);
      onClose();
    },
    onError: (error: Error) => showError(`Failed to update conferences: ${error.message}`),
  });

  const detailsComplete = isLocal
    ? localPath.trim() !== ''
    : bucket.trim() !== '' &&
      (!needsFill || endpointFill.trim() !== '') &&
      keyId.trim() !== '' &&
      secret !== '';

  const canGoNext = step === 'provider' ? providerId !== null : true;

  const toggleDir = (key: string) =>
    setChosenDirs((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  return (
    <Modal open={open} title="Add Drive" onClose={onClose} maxWidth="max-w-2xl" showHeader={false}>
      <div className="flex items-center justify-between border-b border-border p-6">
        <div>
          <h2 className="text-2xl font-bold text-accent">Add Drive</h2>
          <p className="text-sm text-content-secondary">
            Step {stepIndex + 1} of {steps.length}: {STEP_TITLES[step]}
            {provider ? ` - ${provider.label}` : isLocal ? ' - This server' : ''}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="text-content-secondary transition-colors hover:text-content-primary"
        >
          <X size={24} />
        </button>
      </div>

      <ol className="flex flex-wrap gap-2 border-b border-border px-6 py-3" aria-label="Steps">
        {steps.map((id, index) => (
          <li
            key={id}
            aria-current={index === stepIndex ? 'step' : undefined}
            className={`rounded px-2 py-1 text-xs ${
              index === stepIndex
                ? 'bg-accent/10 text-accent'
                : index < stepIndex
                  ? 'text-content-secondary'
                  : 'text-content-muted'
            }`}
          >
            {index + 1}. {STEP_TITLES[id]}
          </li>
        ))}
      </ol>

      <div className="space-y-4 p-6">
        {step === 'provider' && (
          <>
            <p className="text-sm text-content-secondary">
              Where should this drive keep its files? A bucket at a storage provider adds room without a bigger
              server; the free tiers below cost nothing up to their size.
            </p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <button type="button" onClick={() => pickProvider('')} className={choiceClass(isLocal)}>
                <span className="block font-medium">This server</span>
                <span className="block text-xs text-content-muted">A folder on the board&apos;s own disk</span>
              </button>
              {providers.map((p) => (
                <button key={p.id} type="button" onClick={() => pickProvider(p.id)} className={choiceClass(providerId === p.id)}>
                  <span className="block font-medium">{p.label}</span>
                  <span className="block text-xs text-content-muted">
                    {p.freeQuotaBytes > 0 ? `${Math.round(p.freeQuotaBytes / GB)} GB free storage` : 'No free storage'}
                    {p.egress === 'FREE' ? ', free downloads' : ', downloads billed'}
                  </span>
                </button>
              ))}
            </div>
            {provider && (
              <div className="space-y-1 rounded border border-border bg-surface-2 p-3 text-sm">
                <p className="text-content-primary">{provider.note}</p>
                {provider.minimumRetentionDays > 0 && (
                  <p className="text-status-warn">
                    A file deleted before {provider.minimumRetentionDays} days still bills for the full{' '}
                    {provider.minimumRetentionDays} days.
                  </p>
                )}
              </div>
            )}
          </>
        )}

        {step === 'account' && provider && (
          <>
            <a
              href={provider.setup.signupUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-primary inline-flex items-center gap-2"
            >
              <ExternalLink size={16} aria-hidden="true" />
              <span>Open the {provider.label} sign-up page</span>
            </a>
            <Steps items={provider.setup.account} />
            <p className="text-xs text-content-muted">
              Already have an account? Sign in and go on to the next step. The sign-up page opens in a new tab,
              so this one stays where it is.
            </p>
          </>
        )}

        {step === 'bucket' && provider && (
          <>
            <Steps items={provider.setup.bucket} />
            {provider.setup.endpointHint && (
              <p className="rounded border border-border bg-surface-2 p-3 text-sm text-content-primary">
                {provider.setup.endpointHint}
              </p>
            )}
            <p className="text-xs text-content-muted">
              Write down the bucket name - the next steps ask for it.
            </p>
          </>
        )}

        {step === 'key' && provider && (
          <>
            <Steps items={provider.setup.key} />
            <dl className="grid grid-cols-1 gap-2 rounded border border-border bg-surface-2 p-3 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-content-muted">Key ID here</dt>
                <dd className="text-content-primary">is &quot;{provider.setup.keyIdField}&quot; there</dd>
              </div>
              <div>
                <dt className="text-content-muted">Secret here</dt>
                <dd className="text-content-primary">is &quot;{provider.setup.secretField}&quot; there</dd>
              </div>
            </dl>
            {provider.setup.secretShownOnce && (
              <p className="text-sm text-status-warn">
                {provider.label} shows the {provider.setup.secretField} once only, when the key is created. Copy it
                before closing that page - if it is lost, create a new key.
              </p>
            )}
          </>
        )}

        {step === 'details' && isLocal && (
          <>
            <div>
              <label htmlFor="wizard_local_path" className="label">Folder on this server *</label>
              <input
                id="wizard_local_path"
                type="text"
                value={localPath}
                onChange={(e) => setLocalPath(e.target.value)}
                className="input-field w-full font-mono"
                placeholder="/path/to/drive"
              />
            </div>
            <div>
              <label htmlFor="wizard_description" className="label">Description</label>
              <input
                id="wizard_description"
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="input-field w-full"
              />
            </div>
          </>
        )}

        {step === 'details' && provider && (
          <>
            <div>
              <label htmlFor="wizard_bucket" className="label">Bucket name *</label>
              <input
                id="wizard_bucket"
                type="text"
                value={bucket}
                onChange={(e) => { setBucket(e.target.value.trim()); setTestResult(null); }}
                className="input-field w-full font-mono"
                placeholder="my-bbs-files"
              />
            </div>

            {needsFill && (
              <div>
                <label htmlFor="wizard_endpoint_fill" className="label">{provider.endpointFieldLabel} *</label>
                <input
                  id="wizard_endpoint_fill"
                  type="text"
                  value={endpointFill}
                  onChange={(e) => { setEndpointFill(e.target.value); setTestResult(null); }}
                  className="input-field w-full font-mono"
                />
              </div>
            )}

            {provider.regionFieldLabel && (
              <div>
                <label htmlFor="wizard_region" className="label">{provider.regionFieldLabel}</label>
                <input
                  id="wizard_region"
                  type="text"
                  value={regionFill}
                  onChange={(e) => { setRegionFill(e.target.value); setTestResult(null); }}
                  className="input-field w-full font-mono"
                  placeholder={provider.defaultRegion}
                />
              </div>
            )}

            {endpoint && (
              <p className="text-xs text-content-muted">
                Endpoint: <span className="font-mono">{endpoint}</span>
              </p>
            )}

            <div>
              <label htmlFor="wizard_key_id" className="label">Key ID * ({provider.setup.keyIdField})</label>
              <input
                id="wizard_key_id"
                type="text"
                value={keyId}
                onChange={(e) => { setKeyId(e.target.value); setTestResult(null); }}
                className="input-field w-full font-mono"
              />
            </div>

            <div>
              <label htmlFor="wizard_secret" className="label">Secret * ({provider.setup.secretField})</label>
              <input
                id="wizard_secret"
                type="password"
                value={secret}
                onChange={(e) => { setSecret(e.target.value); setTestResult(null); }}
                className="input-field w-full font-mono"
                autoComplete="new-password"
              />
              <p className="mt-1 text-xs text-content-muted">
                Stored outside Drives.info, in Storage/{nextDriveNumber}.key, and never shown again.
              </p>
            </div>

            <div>
              <span className="label">Quota</span>
              <div className="flex flex-wrap gap-2">
                {QUOTA_CHOICES.map((choice) => (
                  <button
                    key={choice.label}
                    type="button"
                    onClick={() => setQuotaBytes(choice.bytes === 0 ? '' : choice.bytes)}
                    className={choiceClass((choice.bytes === 0 && quotaBytes === '') || quotaBytes === choice.bytes)}
                  >
                    {choice.label}
                  </button>
                ))}
              </div>
              <p className="mt-1 text-xs text-content-muted">
                The board stops filing new uploads here once the quota is reached.
                {provider.freeQuotaBytes > 0 && ` The free tier is ${Math.round(provider.freeQuotaBytes / GB)} GB.`}
              </p>
            </div>

            <div>
              <label htmlFor="wizard_description" className="label">Description</label>
              <input
                id="wizard_description"
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="input-field w-full"
              />
            </div>

            <div className="space-y-2 rounded border border-border p-3">
              <button
                type="button"
                onClick={() => testMutation.mutate()}
                disabled={!detailsComplete || testMutation.isPending}
                className="btn-secondary btn-small"
              >
                <PlugZap size={14} aria-hidden="true" />
                <span>{testMutation.isPending ? 'Testing...' : 'Test connection'}</span>
              </button>
              {testResult?.reachable && (
                <p role="status" className="flex items-start gap-2 text-sm text-status-ok">
                  <CheckCircle2 size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
                  <span>Connected. The board can reach bucket {bucket} with this key.</span>
                </p>
              )}
              {testResult && !testResult.reachable && (
                <div role="status" className="space-y-1 text-sm">
                  <p className="flex items-start gap-2 text-status-danger">
                    <XCircle size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
                    <span>{testResult.explanation ?? 'The bucket could not be reached.'}</span>
                  </p>
                  {testResult.error && testResult.error !== testResult.explanation && (
                    <p className="break-words text-xs text-content-muted">Provider said: {testResult.error}</p>
                  )}
                </div>
              )}
              {!testResult && (
                <p className="text-xs text-content-muted">
                  One request to the provider with the details above. Nothing is saved until Create Drive.
                </p>
              )}
            </div>
          </>
        )}

        {step === 'use' && createdDrive !== null && (
          <>
            <p className="text-sm text-content-primary">
              Drive {createdDrive} is ready. Pick the conference directories whose uploads should go to it.
            </p>
            {conferencesQuery.isLoading && <p className="text-sm text-content-muted">Loading conferences...</p>}
            {conferencesQuery.error && (
              <p className="text-sm text-status-danger">Could not load the conferences: {(conferencesQuery.error as Error).message}</p>
            )}
            <div className="max-h-72 space-y-3 overflow-y-auto">
              {conferences.map((conf) => (
                <div key={conf.conference_id}>
                  <p className="text-sm font-medium text-content-primary">
                    {conf.conference_id}. {conf.name}
                  </p>
                  <div className="mt-1 flex flex-wrap gap-2">
                    {Array.from({ length: conf.ndirs }, (_, i) => i + 1).map((dir) => {
                      const key = `${conf.conference_id}:${dir}`;
                      const current = conf[`storagedrive_${dir}`];
                      return (
                        <button
                          key={key}
                          type="button"
                          aria-pressed={chosenDirs.has(key)}
                          onClick={() => toggleDir(key)}
                          className={choiceClass(chosenDirs.has(key))}
                        >
                          Dir {dir}
                          <span className="block text-xs text-content-muted">
                            {current ? `now on drive ${current}` : 'now on this server'}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
            <p className="text-xs text-content-muted">
              Saving does not move files already in a directory. To change this later: Conferences tab, edit the
              conference, and pick the drive under &quot;Dir N lives on&quot;.
            </p>
          </>
        )}
      </div>

      <div className="flex justify-between border-t border-border p-6">
        {step === 'use' ? (
          <span />
        ) : (
          <button
            type="button"
            onClick={() => setStepIndex((i) => Math.max(0, i - 1))}
            disabled={stepIndex === 0}
            className="btn-secondary inline-flex items-center gap-2"
          >
            <ArrowLeft size={16} aria-hidden="true" />
            <span>Back</span>
          </button>
        )}

        {step === 'details' ? (
          <button
            type="button"
            onClick={() => createMutation.mutate()}
            disabled={!detailsComplete || createMutation.isPending}
            className="btn-primary"
          >
            {createMutation.isPending ? 'Creating...' : 'Create Drive'}
          </button>
        ) : step === 'use' ? (
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="btn-secondary">
              {chosenDirs.size > 0 ? 'Skip' : 'Done'}
            </button>
            {chosenDirs.size > 0 && (
              <button
                type="button"
                onClick={() => assignMutation.mutate()}
                disabled={assignMutation.isPending}
                className="btn-primary"
              >
                {assignMutation.isPending ? 'Saving...' : `Put ${chosenDirs.size} on drive ${createdDrive}`}
              </button>
            )}
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setStepIndex((i) => i + 1)}
            disabled={!canGoNext}
            className="btn-primary inline-flex items-center gap-2"
          >
            <span>Next</span>
            <ArrowRight size={16} aria-hidden="true" />
          </button>
        )}
      </div>
    </Modal>
  );
}
