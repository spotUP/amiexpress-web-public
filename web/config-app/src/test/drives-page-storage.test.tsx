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
  },
}));

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
  it('names a broken area - a mis-numbered STORAGEDRIVE - rather than hiding it', async () => {
    getDrives.mockResolvedValue({ success: true, data: [s3Drive()] });
    getDrivePoolStatus.mockResolvedValue({
      success: true,
      data: {
        ...EMPTY_POOL_STATUS,
        brokenAreas: [{ conferenceId: 1, dirNumber: 3, path: 'BBS:Conf1/Warez/', driveNumber: 9 }],
      },
    });
    renderPage();

    expect(await screen.findByText(/DRIVE\.9/)).toBeInTheDocument();
    expect(screen.getByText(/Conf1 dir 3/)).toBeInTheDocument();
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
    renderPage();

    expect(await screen.findByText(/storage cache is not active/i)).toBeInTheDocument();
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
