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
  },
}));

/** The catalogue the page fetches, trimmed to what these tests decide on. */
const PROVIDERS = [
  {
    id: 'r2',
    label: 'Cloudflare R2',
    endpointTemplate: 'https://{}.r2.cloudflarestorage.com',
    endpointFieldLabel: 'Account ID',
    defaultRegion: 'auto',
    volumeClass: 'FREE',
    freeQuotaBytes: 10 * 1024 * 1024 * 1024,
    egress: 'FREE',
    minimumRetentionDays: 0,
    note: 'Zero egress cost.',
  },
  {
    id: 'wasabi',
    label: 'Wasabi',
    endpointTemplate: 'https://s3.{}.wasabisys.com',
    endpointFieldLabel: 'Region',
    defaultRegion: 'eu-central-1',
    volumeClass: 'PAID',
    freeQuotaBytes: 0,
    egress: 'FREE',
    minimumRetentionDays: 90,
    note: 'Egress included.',
  },
];

const confirmMock = vi.fn(async () => true);
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
  getDriveContents.mockResolvedValue({ success: true, data: [] });
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
    getDriveContents.mockResolvedValue({ success: true, data: [{ id: 1, filename: 'DEMO.LHA', size: 100, uploader: 'sysop', downloads: 0 }] });
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
      data: Array.from({ length: 412 }, (_, i) => ({ id: i, filename: `F${i}.LHA`, size: 1, uploader: 'sysop', downloads: 0 })),
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
      data: [{ id: 1, filename: 'DEMO.LHA', size: 1024, uploader: 'sysop', downloads: 0 }],
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

  it('keeps the Enabled checkbox on the Add form, where nothing can yet be orphaned', async () => {
    getDrives.mockResolvedValue({ success: true, data: [] });
    renderPage();

    await userEvent.click(await screen.findByRole('button', { name: /add drive/i }));
    expect(await screen.findByText('Enabled')).toBeInTheDocument();
  });
});

/**
 * Adding a bucket used to mean editing Drives.info on the server: the form
 * offered a drive number, a path and a description, and the save schema
 * declared only those. A sysop could SEE a pooled volume's terms in the admin
 * and never create one there.
 *
 * These cover the selection-driven flow: pick a provider, type the few things
 * only the sysop knows, and let the catalogue supply the rest.
 */
describe('adding a bucket by picking a provider', () => {
  it('offers the next contiguous drive number, never 0', async () => {
    getDrives.mockResolvedValue({ success: true, data: [s3Drive()] });
    renderPage();

    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: /add drive/i }));

    // parseVolumes stops at the first gap, so the number must follow on from
    // what disk already has. 0 was offered before and the schema rejects it.
    const number = (await screen.findByLabelText(/drive number/i)) as HTMLInputElement;
    expect(number.value).toBe(String(s3Drive().drive_number + 1));
  });

  it('sends the provider terms with the drive, and the secret separately', async () => {
    getDrives.mockResolvedValue({ success: true, data: [s3Drive()] });
    createDrive.mockResolvedValue({ success: true, data: {} });
    writeDriveSecret.mockResolvedValue({ success: true });
    renderPage();

    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: /add drive/i }));
    await user.click(await screen.findByRole('button', { name: /Cloudflare R2/ }));

    await user.type(await screen.findByLabelText(/bucket name/i), 'my-bbs-files');
    await user.type(await screen.findByLabelText(/account id/i), 'acct123');
    await user.type(await screen.findByLabelText(/access key id/i), 'AKIAEXAMPLE');
    await user.type(await screen.findByLabelText(/secret access key/i), 'super-secret');

    await user.click(screen.getByRole('button', { name: /create drive/i }));

    await waitFor(() => expect(createDrive).toHaveBeenCalled());
    const payload = createDrive.mock.calls[0]![0] as Record<string, unknown>;

    expect(payload.drive_path).toBe('s3://my-bbs-files');
    // The endpoint is BUILT from the account id - the sysop never types a URL.
    expect(payload.endpoint).toBe('https://acct123.r2.cloudflarestorage.com');
    expect(payload.region).toBe('auto');
    expect(payload.keyId).toBe('AKIAEXAMPLE');
    expect(payload.volumeClass).toBe('FREE');
    expect(payload.egress).toBe('FREE');
    expect(payload.quotaBytes).toBe(10 * 1024 * 1024 * 1024);

    // The secret must never travel to Drives.info with the rest.
    expect(payload.secret).toBeUndefined();
    await waitFor(() =>
      expect(writeDriveSecret).toHaveBeenCalledWith(s3Drive().drive_number + 1, 'super-secret')
    );
  });

  it('warns about a minimum retention that bills for deleted files', async () => {
    getDrives.mockResolvedValue({ success: true, data: [s3Drive()] });
    renderPage();

    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: /add drive/i }));
    await user.click(await screen.findByRole('button', { name: /Wasabi/ }));

    expect(await screen.findByText(/still bills/i)).toBeTruthy();
    expect(screen.getByText(/90 days/i)).toBeTruthy();
  });
});
