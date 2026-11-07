import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { ChatRolesPage } from './ChatRolesPage';
import { apiClient } from '../api/client';

describe('ChatRolesPage', () => {
  it('lists roles from the proxy and their 16 terminal colours', async () => {
    vi.spyOn(apiClient, 'getChatRoles').mockResolvedValue([
      { id: 'r1', name: 'Crew', colorHex: '#ff0000', colorAnsi: 1, position: 0, perms: { kick: true, ban: false, mute: false, topic: false, createPrivate: false } },
    ]);
    vi.spyOn(apiClient, 'getChatRoleAssignments').mockResolvedValue([{ handle: 'bob@UPROUGH', roleId: 'r1' }]);
    render(<ChatRolesPage />);
    await waitFor(() => expect(screen.getByDisplayValue('Crew')).toBeTruthy());
    expect(screen.getAllByRole('radio')).toHaveLength(16);
    expect(screen.getByText('bob@UPROUGH')).toBeTruthy();
  });
});
