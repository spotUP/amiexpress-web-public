/**
 * TWO TAB STRIPS ON ONE PAGE CANNOT SHARE ONE URL PARAMETER.
 *
 * `useTabParam` hard-coded the key `tab`, and the Screens area mounts one
 * `TabbedWorkspace` inside another: the workspace strip (Screen files, Themes,
 * Artist studio, Questionnaire) around `ScreenFilesPage`'s own eleven.
 *
 * So clicking any inner tab wrote `?tab=gallery`, which the OUTER strip does
 * not recognise - it fell back to its default and the inner selection could
 * never be bookmarked. Two strips, one key, and the reader of the key cannot
 * tell whose value it is looking at.
 *
 * The fix is a parameter name per strip. These cases pin the property rather
 * than the Screens page, because the page is about to be rebuilt and the
 * property outlives it.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useSearchParams } from 'react-router-dom';

import { TabbedWorkspace, type TabDefinition } from '../components/ui/Tabs';

/** Shows the current query string, so a test can read what the strips wrote. */
function QueryReadout() {
  const [params] = useSearchParams();
  return <output data-testid="query">{params.toString()}</output>;
}

const INNER: TabDefinition[] = [
  { id: 'gallery', label: 'Gallery', render: () => <p>gallery body</p> },
  { id: 'codes', label: 'Codes', render: () => <p>codes body</p> },
];

const OUTER: TabDefinition[] = [
  {
    id: 'files',
    label: 'Screen files',
    render: () => <TabbedWorkspace tabs={INNER} defaultTab="gallery" param="view" />,
  },
  { id: 'themes', label: 'Themes', render: () => <p>themes body</p> },
];

const mount = (initial = '/admin/screens') =>
  render(
    <MemoryRouter initialEntries={[initial]}>
      <QueryReadout />
      <TabbedWorkspace tabs={OUTER} defaultTab="files" />
    </MemoryRouter>,
  );

afterEach(() => cleanup());

describe('a strip inside a strip', () => {
  it('does not knock the outer strip off its tab', async () => {
    mount();
    await userEvent.click(screen.getByRole('tab', { name: 'Codes' }));

    // RED before the fix: the inner click wrote ?tab=codes, the outer strip
    // did not know that id, and it silently reverted to its default.
    expect(screen.getByText('codes body')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Screen files' })).toHaveAttribute(
      'data-state',
      'active',
    );
  });

  it('writes its own key, so both selections are in the URL at once', async () => {
    mount();
    await userEvent.click(screen.getByRole('tab', { name: 'Codes' }));

    const query = screen.getByTestId('query').textContent ?? '';
    expect(query).toContain('view=codes');
    expect(query).not.toContain('tab=codes');
  });

  it('can be linked to, which is the point of putting it in the URL', () => {
    mount('/admin/screens?tab=files&view=codes');
    expect(screen.getByText('codes body')).toBeInTheDocument();
  });

  it('leaves the other strip alone when only one of them moves', async () => {
    mount('/admin/screens?view=codes');
    await userEvent.click(screen.getByRole('tab', { name: 'Themes' }));

    const query = screen.getByTestId('query').textContent ?? '';
    expect(query).toContain('tab=themes');
    // The inner strip's place survives even though its body is unmounted.
    expect(query).toContain('view=codes');
  });
});

describe('the default key is unchanged', () => {
  it('a strip that names no parameter still uses tab', async () => {
    render(
      <MemoryRouter initialEntries={['/admin/nodes']}>
        <QueryReadout />
        <TabbedWorkspace tabs={OUTER} defaultTab="files" />
      </MemoryRouter>,
    );
    await userEvent.click(screen.getByRole('tab', { name: 'Themes' }));
    expect(screen.getByTestId('query').textContent).toContain('tab=themes');
  });

  it('an unknown value falls back rather than rendering nothing', () => {
    mount('/admin/screens?tab=nonesuch');
    expect(screen.getByRole('tab', { name: 'Screen files' })).toHaveAttribute(
      'data-state',
      'active',
    );
  });
});
