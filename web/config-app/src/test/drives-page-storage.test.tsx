/**
 * Drive Setup as the storage page.
 *
 * Task 11: the page that used to be a bare DRIVE.n path list now shows the
 * pool facts a sysop needs - quota use, class, egress, request budget,
 * degraded/out-of-requests health, parked files with their sizes, an
 * eviction shortfall, and areas a mis-numbered STORAGEDRIVE has broken.
 * The one hard rule throughout: the secret is write-only and never comes
 * back from the API in any field.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

function s3Drive(overrides: Record<string, unknown> = {}) {
  return {
    id: 2,
    drive_number: 2,
    drive_path: 's3://uprough-cold',
    enabled: true,
    description: '',
    created_at: new Date(),
    updated_at: new Date(),
    kind: 's3' as const,
    quotaBytes: 10 * 1024 ** 3,
    usedBytes: 5 * 1024 ** 3,
    volumeClass: 'FREE' as const,
    egress: '3X' as const,
    retentionDays: undefined,
    keyId: 'keyid-2',
    requestBudget: undefined,
    requestsThisMonth: undefined,
    secretConfigured: true,
    inPool: true,
    degraded: false,
    outOfRequests: false,
    ...overrides,
  };
}

const EMPTY_POOL_STATUS = {
  cacheActive: false,
  overBudgetBytes: 0,
  evictionDisabled: false,
  parkedFiles: [] as unknown[],
  brokenAreas: [] as unknown[],
  bootError: null as string | null,
};

const getDrives = vi.fn();
const getDrivePoolStatus = vi.fn();
const getDriveContents = vi.fn();
const writeDriveSecret = vi.fn();
const testDrive = vi.fn();
const discardParkedFile = vi.fn();
const createDrive = vi.fn();
const updateDrive = vi.fn();
const deleteDrive = vi.fn();
const getStorageProviders = vi.fn();
const testDriveConnection = vi.fn();
const getConferenceConfigs = vi.fn();
const updateConferenceConfig = vi.fn();

vi.mock('../api/client', () => ({
  apiClient: {
    getDrives: (...args: unknown[]) => getDrives(...args),
    getDrivePoolStatus: (...args: unknown[]) => getDrivePoolStatus(...args),
    getDriveContents: (...args: unknown[]) => getDriveContents(...args),
    writeDriveSecret: (...args: unknown[]) => writeDriveSecret(...args),
    testDrive: (...args: unknown[]) => testDrive(...args),
    discardParkedFile: (...args: unknown[]) => discardParkedFile(...args),
    createDrive: (...args: unknown[]) => createDrive(...args),
    updateDrive: (...args: unknown[]) => updateDrive(...args),
    deleteDrive: (...args: unknown[]) => deleteDrive(...args),
    getStorageProviders: (...args: unknown[]) => getStorageProviders(...args),
    testDriveConnection: (...args: unknown[]) => testDriveConnection(...args),
    getConferenceConfigs: (...args: unknown[]) => getConferenceConfigs(...args),
    updateConferenceConfig: (...args: unknown[]) => updateConferenceConfig(...args),
  },
}));

/** A provider's setup guide, as the catalogue serves it. */
function guide(overrides: Record<string, unknown> = {}) {
  return {
    signupUrl: 'https://example.com/sign-up',
    docsUrl: 'https://example.com/docs',
    account: ['Sign up.'],
    bucket: ['Create a bucket.'],
    key: ['Create a key.'],
    keyIdField: 'Access Key ID',
    secretField: 'Secret Access Key',
    secretShownOnce: true,
    endpointHint: '',
    ...overrides,
  };
}

/** The catalogue the page fetches, trimmed to what these tests decide on. */
const PROVIDERS = [
  {
    id: 'b2',
    label: 'Backblaze B2',
    endpointTemplate: 'https://s3.{}.backblazeb2.com',
    endpointFieldLabel: 'Region (eu-central-003, us-west-004)',
    regionFieldLabel: '',
    regionFromEndpointField: true,
    defaultRegion: 'eu-central-003',
    volumeClass: 'FREE',
    freeQuotaBytes: 10 * 1024 * 1024 * 1024,
    egress: 'FREE',
    minimumRetentionDays: 0,
    note: 'Free egress up to three times what you store.',
    setup: guide({
      signupUrl: 'https://www.backblaze.com/sign-up/cloud-storage',
      account: ['Choose EU Central in the Region selector before you sign up.'],
      bucket: ['Set Files in Bucket to Private.'],
      key: ['Set Allow Access to Bucket(s) to this bucket only.'],
      keyIdField: 'keyID',
      secretField: 'applicationKey',
      endpointHint: 'The region is the middle part of the bucket Endpoint.',
    }),
  },
  {
    id: 'r2',
    label: 'Cloudflare R2',
    endpointTemplate: 'https://{}.r2.cloudflarestorage.com',
    endpointFieldLabel: 'Account ID',
    regionFieldLabel: '',
    regionFromEndpointField: false,
    defaultRegion: 'auto',
    volumeClass: 'FREE',
    freeQuotaBytes: 10 * 1024 * 1024 * 1024,
    egress: 'FREE',
    minimumRetentionDays: 0,
    note: 'Zero egress cost.',
    setup: guide(),
  },
  {
    id: 'wasabi',
    label: 'Wasabi',
    endpointTemplate: 'https://s3.{}.wasabisys.com',
    endpointFieldLabel: 'Region',
    regionFieldLabel: '',
    regionFromEndpointField: true,
    defaultRegion: 'eu-central-1',
    volumeClass: 'PAID',
    freeQuotaBytes: 0,
    egress: 'FREE',
    minimumRetentionDays: 90,
    note: 'Egress included.',
    setup: guide(),
  },
];

const confirmMock = vi.fn(async (_options: { title: string; message: string }) => true);
vi.mock('../contexts/NotificationContext', () => ({
  useNotification: () => ({
    showSuccess: vi.fn(),
    showError: vi.fn(),
    confirm: confirmMock,
  }),
  NotificationProvider: ({ children }: { children: ReactNode }) => children,
}));

const { DrivesPage } = await import('../pages/DrivesPage');

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <DrivesPage />
    </QueryClientProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  confirmMock.mockResolvedValue(true);
  getDrivePoolStatus.mockResolvedValue({ success: true, data: EMPTY_POOL_STATUS });
  getStorageProviders.mockResolvedValue({ success: true, data: PROVIDERS });
  getDriveContents.mockResolvedValue({ success: true, data: { areas: [], files: [] } });
});

describe('DrivesPage - pool facts', () => {
  it('shows quota use and the volume class for an s3 drive', async () => {
    getDrives.mockResolvedValue({ success: true, data: [s3Drive()] });
    renderPage();

    expect(await screen.findByText(/5 GB of 10 GB/)).toBeInTheDocument();
    expect(screen.getByText('FREE')).toBeInTheDocument();
  });

  it('badges a degraded drive rather than showing it as healthy', async () => {
    getDrives.mockResolvedValue({ success: true, data: [s3Drive({ degraded: true })] });
    renderPage();

    expect(await screen.findByText('Degraded')).toBeInTheDocument();
  });

  it('badges a drive that has spent its monthly request budget', async () => {
    getDrives.mockResolvedValue({
      success: true,
      data: [s3Drive({ outOfRequests: true, requestBudget: 50000, requestsThisMonth: 50000 })],
    });
    renderPage();

    expect(await screen.findByText('Out of requests')).toBeInTheDocument();
    expect(screen.getByText('50,000 / 50,000')).toBeInTheDocument();
  });

  it('shows a drive with no declared quota as unbounded, not zero', async () => {
    getDrives.mockResolvedValue({
      success: true,
      data: [s3Drive({ quotaBytes: undefined, usedBytes: 1024 })],
    });
    renderPage();

    expect(await screen.findByText(/no quota/)).toBeInTheDocument();
  });
});

describe('DrivesPage - the secret is write-only', () => {
  it('never renders a secret field with a value, and never fetches one', async () => {
    getDrives.mockResolvedValue({ success: true, data: [s3Drive()] });
    renderPage();

    const secretButton = await screen.findByRole('button', { name: /set secret for drive 2/i });
    await userEvent.click(secretButton);

    const secretInput = await screen.findByLabelText(/secret key/i, { selector: 'input' });
    expect(secretInput).toHaveValue('');

    // The GET response never carried a secret in the first place, so there is
    // nothing to have leaked in - assert it directly against what the page
    // fetched and rendered.
    expect(JSON.stringify(getDrives.mock.results)).not.toMatch(/secret/i);
  });

  it('submits the secret only on save, never on open', async () => {
    getDrives.mockResolvedValue({ success: true, data: [s3Drive()] });
    writeDriveSecret.mockResolvedValue({ success: true, data: { driveNumber: 2 } });
    renderPage();

    await userEvent.click(await screen.findByRole('button', { name: /set secret for drive 2/i }));
    expect(writeDriveSecret).not.toHaveBeenCalled();

    await userEvent.type(await screen.findByLabelText(/secret key/i, { selector: 'input' }), 'brand-new-secret');
    await userEvent.click(screen.getByRole('button', { name: /save secret/i }));

    await waitFor(() => expect(writeDriveSecret).toHaveBeenCalledWith(2, 'brand-new-secret'));
  });
});

describe('DrivesPage - pool status', () => {
  it('renders every broken-area complaint verbatim, the same messages the board itself would emit', async () => {
    getDrives.mockResolvedValue({ success: true, data: [s3Drive()] });
    getDrivePoolStatus.mockResolvedValue({
      success: true,
      data: {
        ...EMPTY_POOL_STATUS,
        brokenAreas: [
          '[Storage] Conf1 dir 3 names DRIVE.9, which is not in Drives.info - the area is treated as local disk.',
          '[Storage] Conf1 dir 2 ("DH1:Archive/Files/") would use the same object prefix "Conf1/Files/" as dir 1 ("BBS:Conf1/Files/") - the later area is treated as local disk. Give them different directory names.',
        ],
      },
    });
    renderPage();

    expect(await screen.findByText(/DRIVE\.9/)).toBeInTheDocument();
    expect(screen.getByText(/same object prefix/)).toBeInTheDocument();
  });

  it('lists parked files with their sizes and discards one by its localPath, not its label', async () => {
    getDrives.mockResolvedValue({ success: true, data: [s3Drive()] });
    getDrivePoolStatus.mockResolvedValue({
      success: true,
      data: {
        ...EMPTY_POOL_STATUS,
        cacheActive: true,
        parkedFiles: [
          { driveNumber: 2, label: 'Files/DOOR.DAT.2', localPath: '/cache/.parked/2/Files/DOOR.DAT.2', sizeBytes: 4096 },
        ],
      },
    });
    discardParkedFile.mockResolvedValue({ success: true, data: { discarded: true } });
    renderPage();

    expect(await screen.findByText(/Files\/DOOR\.DAT\.2/)).toBeInTheDocument();
    expect(screen.getByText(/4 KB/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /discard parked file/i }));

    await waitFor(() =>
      expect(discardParkedFile).toHaveBeenCalledWith('/cache/.parked/2/Files/DOOR.DAT.2')
    );
  });

  it('shows the eviction shortfall and the disabled state when the cache reports them', async () => {
    getDrives.mockResolvedValue({ success: true, data: [s3Drive()] });
    getDrivePoolStatus.mockResolvedValue({
      success: true,
      data: { ...EMPTY_POOL_STATUS, cacheActive: true, overBudgetBytes: 2048, evictionDisabled: true },
    });
    renderPage();

    expect(await screen.findByText('Disabled')).toBeInTheDocument();
    expect(screen.getByText(/2 KB/)).toBeInTheDocument();
  });

  it('says the cache is not active rather than reporting zero parked files as a fact', async () => {
    getDrives.mockResolvedValue({ success: true, data: [s3Drive()] });
    getDrivePoolStatus.mockResolvedValue({ success: true, data: EMPTY_POOL_STATUS });
  getStorageProviders.mockResolvedValue({ success: true, data: PROVIDERS });
    renderPage();

    expect(await screen.findByText(/storage cache is not active/i)).toBeInTheDocument();
  });

  it('says the pool failed to build, and why, rather than reading identically to "not configured"', async () => {
    getDrives.mockResolvedValue({ success: true, data: [s3Drive()] });
    getDrivePoolStatus.mockResolvedValue({
      success: true,
      data: { ...EMPTY_POOL_STATUS, bootError: 'DRIVE.2.QUOTA: Unreadable quota "garbage"' },
    });
    renderPage();

    expect(await screen.findByText(/failed to build/i)).toBeInTheDocument();
    expect(screen.getByText(/Unreadable quota/)).toBeInTheDocument();
    expect(screen.queryByText(/storage cache is not active/i)).not.toBeInTheDocument();
  });

  it('says the last refresh failed - still serving the previous config - when the pool is active but bootError is set (Blocker B)', async () => {
    getDrives.mockResolvedValue({ success: true, data: [s3Drive()] });
    getDrivePoolStatus.mockResolvedValue({
      success: true,
      data: { ...EMPTY_POOL_STATUS, cacheActive: true, bootError: 'DRIVE.2.QUOTA: Unreadable quota "garbage"' },
    });
    renderPage();

    expect(await screen.findByText(/last refresh failed/i)).toBeInTheDocument();
    expect(screen.getByText(/Unreadable quota/)).toBeInTheDocument();
    // Not the "pool failed to build" wording - the pool IS active, this is a
    // different, milder outcome.
    expect(screen.queryByText(/pool failed to build/i)).not.toBeInTheDocument();
  });

  it('shows the pending uploads count on an active pool', async () => {
    getDrives.mockResolvedValue({ success: true, data: [s3Drive()] });
    getDrivePoolStatus.mockResolvedValue({
      success: true,
      data: { ...EMPTY_POOL_STATUS, cacheActive: true, pendingUploads: 3 },
    });
    renderPage();

    expect(await screen.findByText('Pending Uploads')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
  });
});

describe('DrivesPage - contents and retention', () => {
  it('warns about minimum retention before showing the contents of a volume that has one', async () => {
    getDrives.mockResolvedValue({
      success: true,
      data: [s3Drive({ retentionDays: 90 })],
    });
    getDriveContents.mockResolvedValue({ success: true, data: { areas: [{ conference: 1, dir: 1 }], files: [{ filename: 'DEMO.LHA', size: 100, uploader: 'sysop', downloads: 0, conference: 1, dir: 1 }] } });
    renderPage();

    await userEvent.click(await screen.findByRole('button', { name: /contents of drive 2/i }));

    expect(await screen.findByText(/90 days/)).toBeInTheDocument();
    expect(await screen.findByText('DEMO.LHA')).toBeInTheDocument();
    expect(getDriveContents).toHaveBeenCalledWith(2);
  });
});

describe('DrivesPage - status honesty (a drive VolumeSet dropped must never read OK)', () => {
  it('badges a drive with no usable secret as danger, not OK, even though degraded/outOfRequests are both false', async () => {
    getDrives.mockResolvedValue({
      success: true,
      data: [s3Drive({ secretConfigured: false, inPool: false, degraded: false, outOfRequests: false })],
    });
    renderPage();

    expect(await screen.findByText('No secret')).toBeInTheDocument();
    expect(screen.queryByText('OK')).not.toBeInTheDocument();
  });

  it('badges a drive with a secret that VolumeSet still dropped (bad KEYID/ENDPOINT) as misconfigured', async () => {
    getDrives.mockResolvedValue({
      success: true,
      data: [s3Drive({ secretConfigured: true, inPool: false, degraded: false, outOfRequests: false })],
    });
    renderPage();

    expect(await screen.findByText('Disabled (misconfigured)')).toBeInTheDocument();
    expect(screen.queryByText('OK')).not.toBeInTheDocument();
  });

  it('shows unknown, not OK, when no live context exists to ask at all', async () => {
    getDrives.mockResolvedValue({
      success: true,
      data: [s3Drive({ secretConfigured: true, inPool: undefined, degraded: false, outOfRequests: false })],
    });
    renderPage();

    expect(await screen.findByText('Unknown')).toBeInTheDocument();
    expect(screen.queryByText('OK')).not.toBeInTheDocument();
  });

  it('only shows OK for a drive with a secret that IS in the live pool and healthy', async () => {
    getDrives.mockResolvedValue({
      success: true,
      data: [s3Drive({ secretConfigured: true, inPool: true, degraded: false, outOfRequests: false })],
    });
    renderPage();

    expect(await screen.findByText('OK')).toBeInTheDocument();
  });
});

describe('DrivesPage - delete and edit say what they orphan', () => {
  it('interpolates the file count and bytes into the delete confirmation', async () => {
    getDrives.mockResolvedValue({ success: true, data: [s3Drive({ usedBytes: 5 * 1024 ** 3 })] });
    getDriveContents.mockResolvedValue({
      success: true,
      data: {
        areas: [{ conference: 1, dir: 1 }],
        files: Array.from({ length: 412 }, (_, i) => ({ filename: `F${i}.LHA`, size: 1, uploader: 'sysop', downloads: 0, conference: 1, dir: 1 })),
      },
    });
    renderPage();

    await userEvent.click(await screen.findByRole('button', { name: /delete drive 2/i }));

    await waitFor(() => expect(confirmMock).toHaveBeenCalled());
    const call = confirmMock.mock.calls[0][0];
    expect(call.message).toMatch(/412 files/);
    expect(call.message).toMatch(/5 GB/);
  });

  it('warns before changing an s3 drive path, naming what it orphans', async () => {
    getDrives.mockResolvedValue({ success: true, data: [s3Drive({ drive_path: 's3://old-bucket' })] });
    getDriveContents.mockResolvedValue({
      success: true,
      data: { areas: [{ conference: 1, dir: 1 }], files: [{ filename: 'DEMO.LHA', size: 1024, uploader: 'sysop', downloads: 0, conference: 1, dir: 1 }] },
    });
    updateDrive.mockResolvedValue({ success: true, data: {} });
    renderPage();

    await userEvent.click(await screen.findByRole('button', { name: /edit drive 2/i }));
    const pathInput = await screen.findByLabelText(/drive path/i);
    await userEvent.clear(pathInput);
    await userEvent.type(pathInput, 's3://new-bucket');
    await userEvent.click(screen.getByRole('button', { name: /update drive/i }));

    await waitFor(() => expect(confirmMock).toHaveBeenCalled());
    expect(confirmMock.mock.calls[0][0].message).toMatch(/unreachable/);
    expect(updateDrive).toHaveBeenCalled();
  });

  it('does not warn when editing a field other than path on an s3 drive', async () => {
    getDrives.mockResolvedValue({ success: true, data: [s3Drive()] });
    updateDrive.mockResolvedValue({ success: true, data: {} });
    renderPage();

    await userEvent.click(await screen.findByRole('button', { name: /edit drive 2/i }));
    const descriptionInput = await screen.findByLabelText(/description/i);
    await userEvent.type(descriptionInput, 'a note');
    await userEvent.click(screen.getByRole('button', { name: /update drive/i }));

    await waitFor(() => expect(updateDrive).toHaveBeenCalled());
    expect(confirmMock).not.toHaveBeenCalled();
  });
});

describe('DrivesPage - the Edit form cannot silently strand or delete a mapping', () => {
  it('disables the drive number field for an s3 drive being edited', async () => {
    getDrives.mockResolvedValue({ success: true, data: [s3Drive()] });
    renderPage();

    await userEvent.click(await screen.findByRole('button', { name: /edit drive 2/i }));
    expect(await screen.findByLabelText(/drive number/i)).toBeDisabled();
  });

  it('renders no Enabled checkbox on the edit form - removal only happens through Delete', async () => {
    getDrives.mockResolvedValue({ success: true, data: [s3Drive()] });
    renderPage();

    await userEvent.click(await screen.findByRole('button', { name: /edit drive 2/i }));
    await screen.findByLabelText(/drive path/i);
    expect(screen.queryByText('Enabled')).not.toBeInTheDocument();
    expect(screen.getByText(/use Delete instead/i)).toBeInTheDocument();
  });
});

/**
 * Adding a drive is a wizard: "i tried to add a Backblaze B2 bucket now but
 * it needs an api key and there is no help/link on how to create the account
 * and get a key" (the sysop, 2026-10-04). The steps come from the provider
 * catalogue; these walk one provider through to a drive in use.
 */
describe('the Add Drive wizard', () => {
  const SECRET = 'K005-application-key-shown-once';

  it('walks Backblaze B2 from sign-up to a directory on the new drive, and never shows the secret back', async () => {
    getDrives.mockResolvedValue({ success: true, data: [s3Drive()] });
    testDriveConnection
      .mockResolvedValueOnce({
        success: true,
        data: {
          reachable: false,
          error: 'SignatureDoesNotMatch (403)',
          explanation: 'The secret does not belong to this key ID.',
        },
      })
      .mockResolvedValueOnce({ success: true, data: { reachable: true } });
    createDrive.mockResolvedValue({ success: true, data: {} });
    writeDriveSecret.mockResolvedValue({ success: true });
    getConferenceConfigs.mockResolvedValue({
      success: true,
      data: [{ conference_id: 1, name: 'Main', ndirs: 2, storagedrive_1: 2 }],
    });
    updateConferenceConfig.mockResolvedValue({ success: true, data: {} });
    renderPage();

    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: /add drive/i }));

    // 1. Provider: the terms that decide it.
    await user.click(await screen.findByRole('button', { name: /Backblaze B2/ }));
    expect(screen.getByText(/three times what you store/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /next/i }));

    // 2. Account: the sign-up link, in a new tab.
    const signup = await screen.findByRole('link', { name: /sign-up page/i });
    expect(signup).toHaveAttribute('href', 'https://www.backblaze.com/sign-up/cloud-storage');
    expect(signup).toHaveAttribute('target', '_blank');
    expect(screen.getByText(/EU Central/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /next/i }));

    // 3. Bucket: where the region is read from.
    expect(await screen.findByText(/Files in Bucket to Private/)).toBeInTheDocument();
    expect(screen.getByText(/middle part of the bucket Endpoint/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /next/i }));

    // 4. Key: which console field is which, and that the secret shows once.
    expect(await screen.findByText(/this bucket only/)).toBeInTheDocument();
    expect(screen.getByText(/"keyID" there/)).toBeInTheDocument();
    expect(screen.getByText(/"applicationKey" there/)).toBeInTheDocument();
    expect(screen.getByText(/once only/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /next/i }));

    // 5. Details, tested before anything is saved.
    await user.type(await screen.findByLabelText(/bucket name/i), 'my-bbs-files');
    await user.type(screen.getByLabelText(/^Region/), 'us-west-004');
    await user.type(screen.getByLabelText(/key id/i), '0041234567890ab0000000001');
    await user.type(screen.getByLabelText(/^Secret/), SECRET);

    await user.click(screen.getByRole('button', { name: /test connection/i }));
    expect(await screen.findByText('The secret does not belong to this key ID.')).toBeInTheDocument();
    expect(testDriveConnection).toHaveBeenCalledWith({
      endpoint: 'https://s3.us-west-004.backblazeb2.com',
      // The region the bucket is in, not the catalogue's default.
      region: 'us-west-004',
      bucket: 'my-bbs-files',
      keyId: '0041234567890ab0000000001',
      secret: SECRET,
    });
    expect(createDrive).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: /test connection/i }));
    expect(await screen.findByText(/Connected/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /create drive/i }));
    await waitFor(() => expect(createDrive).toHaveBeenCalledTimes(1));
    const payload = createDrive.mock.calls[0]![0] as Record<string, unknown>;
    expect(payload).toEqual({
      drive_number: s3Drive().drive_number + 1,
      drive_path: 's3://my-bbs-files',
      description: '',
      enabled: true,
      provider: 'b2',
      endpoint: 'https://s3.us-west-004.backblazeb2.com',
      region: 'us-west-004',
      keyId: '0041234567890ab0000000001',
      volumeClass: 'FREE',
      egress: 'FREE',
      // The free tier is the starting quota.
      quotaBytes: 10 * 1024 * 1024 * 1024,
    });
    await waitFor(() => expect(writeDriveSecret).toHaveBeenCalledWith(3, SECRET));

    // 6. Use it: a directory goes on the new drive through the conference save.
    await user.click(await screen.findByRole('button', { name: /Dir 2/ }));
    expect(screen.getByRole('button', { name: /Dir 1/ })).toHaveTextContent('now on drive 2');
    // Saved means gone from the page: no field and no text holds it.
    expect(document.body.innerHTML).not.toContain(SECRET);
    await user.click(screen.getByRole('button', { name: /put 1 on drive 3/i }));
    await waitFor(() => expect(updateConferenceConfig).toHaveBeenCalledWith(1, { storagedrive_2: 3 }));
  });

  it('warns about a minimum retention that bills for deleted files', async () => {
    getDrives.mockResolvedValue({ success: true, data: [s3Drive()] });
    renderPage();

    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: /add drive/i }));
    await user.click(await screen.findByRole('button', { name: /Wasabi/ }));

    expect(await screen.findByText(/still bills/i)).toBeTruthy();
    expect(screen.getByText(/90 days\./i)).toBeTruthy();
  });

  it('adds a folder on this server without any provider steps', async () => {
    getDrives.mockResolvedValue({ success: true, data: [] });
    createDrive.mockResolvedValue({ success: true, data: {} });
    getConferenceConfigs.mockResolvedValue({ success: true, data: [] });
    renderPage();

    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: /add drive/i }));
    await user.click(await screen.findByRole('button', { name: /This server/ }));
    await user.click(screen.getByRole('button', { name: /next/i }));
    await user.type(await screen.findByLabelText(/folder on this server/i), '/data/drive1');
    await user.click(screen.getByRole('button', { name: /create drive/i }));

    await waitFor(() =>
      expect(createDrive).toHaveBeenCalledWith({ drive_number: 1, drive_path: '/data/drive1', description: '', enabled: true })
    );
    expect(writeDriveSecret).not.toHaveBeenCalled();
  });
});
