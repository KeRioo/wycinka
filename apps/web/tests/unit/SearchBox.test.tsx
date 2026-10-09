import { act, fireEvent, render, screen, waitFor, type RenderResult } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, it, vi, beforeEach, afterEach, expect } from 'vitest';
import { delay, http, HttpResponse } from 'msw';
import SearchBox from '@/components/layout/SearchBox';
import { useMapStore } from '@/stores/mapStore';
import { useProjectStore } from '@/stores/projectStore';
import { server } from '@/test/mocks/server';

function renderSearchBox(): RenderResult {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route path="/" element={<SearchBox />} />
        <Route path="/map" element={<div data-testid="map-route">Mapa</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

function searchCallUrls(spy: { mock: { calls: unknown[][] } }): string[] {
  return spy.mock.calls.flatMap(([input]) => {
    const url = input instanceof Request ? input.url : String(input);
    return url.includes('/search') ? [url] : [];
  });
}

function changeQuery(input: HTMLElement, value: string): void {
  fireEvent.change(input, { target: { value } });
}

async function triggerSearch(input: HTMLElement, value: string): Promise<void> {
  vi.useFakeTimers();
  act(() => {
    fireEvent.change(input, { target: { value } });
  });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(500);
  });
  vi.useRealTimers();
}

async function searchAndShowError(input: HTMLElement, message: string): Promise<void> {
  await triggerSearch(input, '141');
  await waitFor(
    () => {
      expect(screen.getByTestId('search-error')).toHaveTextContent(message);
    },
    { timeout: 4000 },
  );
}

async function searchAndShowResults(input: HTMLElement, value = '141'): Promise<void> {
  await triggerSearch(input, value);
  await waitFor(() => {
    expect(screen.getByTestId('search-results')).toBeDefined();
  });
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  useMapStore.getState().reset();
  useProjectStore.getState().clear();
});

describe('SearchBox', () => {
  it('should not search when query is shorter than 2 characters', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch');
    renderSearchBox();

    await triggerSearch(screen.getByTestId('search-input'), '1');

    expect(searchCallUrls(fetchSpy)).toHaveLength(0);
    expect(screen.queryByTestId('search-results')).toBeNull();
  });

  it('should debounce search request by 500 ms', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch');
    renderSearchBox();
    const input = screen.getByTestId('search-input');

    act(() => {
      changeQuery(input, '141');
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });

    expect(searchCallUrls(fetchSpy)).toHaveLength(0);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(200);
    });
    vi.useRealTimers();

    await waitFor(() => {
      expect(searchCallUrls(fetchSpy)).toHaveLength(1);
    });
  });

  it('should request max 10 results', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch');
    renderSearchBox();

    await triggerSearch(screen.getByTestId('search-input'), '141');

    const [url] = searchCallUrls(fetchSpy);
    expect(new URL(url).searchParams.get('limit')).toBe('10');
  });

  it('should show loading skeleton while request is in flight', async () => {
    server.use(
      http.get('*/api/v1/search', async () => {
        await delay('infinite');
      }),
    );
    renderSearchBox();

    await triggerSearch(screen.getByTestId('search-input'), '141');

    expect(screen.getByTestId('search-skeleton')).toHaveAttribute('aria-busy', 'true');
  });

  it('should render suggestions after search completes', async () => {
    renderSearchBox();

    await searchAndShowResults(screen.getByTestId('search-input'));

    const option = screen.getByRole('option', { name: /141201_1.0001.6509/i });
    expect(option).toHaveAttribute('aria-selected', 'false');
  });

  it('should select a result with keyboard and navigate to map with parcel focus', async () => {
    const user = userEvent.setup({
      advanceTimers: (): Promise<void> => Promise.resolve(),
    });
    renderSearchBox();
    const input = screen.getByTestId('search-input');

    await triggerSearch(input, '141');
    await waitFor(() => {
      expect(screen.getByTestId('search-results')).toBeDefined();
    });

    act(() => {
      input.focus();
    });
    await user.keyboard('{ArrowDown}');
    expect(input).toHaveAttribute('aria-activedescendant', expect.stringContaining('option-0'));

    await act(async () => {
      await user.keyboard('{Enter}');
    });

    await waitFor(() => {
      expect(screen.getByTestId('map-route')).toBeDefined();
    });
    const { selectedParcel, focusTarget } = useMapStore.getState();
    expect(selectedParcel?.teryt).toBe('141201_1.0001.6509');
    expect(focusTarget).toEqual({ lat: 52.2315, lng: 21.0065 });
    expect(screen.queryByTestId('search-results')).toBeNull();
  });

  it('should mark a result already in the active project', async () => {
    const { MOCK_PARCEL_FOUND } = await import('@/test/mocks/api-responses');
    if (!MOCK_PARCEL_FOUND.found) {
      throw new Error('fixture must be found');
    }
    useProjectStore.setState({
      activeProjectId: 'project-1',
      projects: [
        {
          id: 'project-1',
          name: 'Test',
          createdAt: new Date('2026-10-09T00:00:00Z'),
          updatedAt: new Date('2026-10-09T00:00:00Z'),
          pdfPrefs: {
            layout: 'single',
            markerColorBy: 'species',
            markerSizeBy: 'fixed',
            markerScale: { baseSize: 8, perCm: 0.4, maxSize: 20 },
            showNumberedTable: true,
            tableOnSeparatePage: false,
            autoRotate: false,
          },
          speciesConfig: [],
          rangesConfig: [],
        },
      ],
      projectParcels: [MOCK_PARCEL_FOUND.parcel],
    });
    renderSearchBox();

    await searchAndShowResults(screen.getByTestId('search-input'));

    expect(screen.getByText('w projekcie')).toBeDefined();
  });

  it('should close suggestions on Escape', async () => {
    renderSearchBox();
    const input = screen.getByTestId('search-input');

    await searchAndShowResults(input);

    act(() => {
      input.focus();
    });
    await userEvent
      .setup({ advanceTimers: (): Promise<void> => Promise.resolve() })
      .keyboard('{Escape}');

    expect(screen.queryByTestId('search-results')).toBeNull();
  });

  it('should show empty state when no results', async () => {
    server.use(http.get('*/api/v1/search', () => HttpResponse.json({ results: [], total: 0 })));
    renderSearchBox();

    await triggerSearch(screen.getByTestId('search-input'), '999');

    await waitFor(() => {
      expect(screen.getByTestId('search-empty')).toHaveTextContent('Brak wyników');
    });
  });

  it('should show error message when API returns 503', async () => {
    server.use(
      http.get('*/api/v1/search', () =>
        HttpResponse.json(
          { error: 'DB unavailable', code: 'BAD_REQUEST', details: {} },
          { status: 400 },
        ),
      ),
    );
    renderSearchBox();

    await searchAndShowError(screen.getByTestId('search-input'), 'Nieprawidłowe zapytanie');
  });

  it('should show network error message when request fails', async () => {
    const { api } = await import('@/services/api');
    const { ApiError } = await import('@/services/api.types');
    const searchSpy = vi
      .spyOn(api, 'searchParcels')
      .mockRejectedValue(new ApiError('NETWORK_ERROR', 'Network down', 0));
    renderSearchBox();

    await searchAndShowError(screen.getByTestId('search-input'), 'Brak połączenia z serwerem');
    expect(searchSpy).toHaveBeenCalled();
  });

  it('should cancel stale request when query changes', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch');
    renderSearchBox();
    const input = screen.getByTestId('search-input');

    await triggerSearch(input, '1410');
    await triggerSearch(input, '14120');

    await waitFor(
      () => {
        expect(screen.getByTestId('search-results')).toBeDefined();
      },
      { timeout: 4000 },
    );
    expect(
      searchCallUrls(fetchSpy).filter((u) => new URL(u).searchParams.get('q') === '14120'),
    ).toHaveLength(1);
    expect(
      searchCallUrls(fetchSpy).filter((u) => new URL(u).searchParams.get('q') === '1410'),
    ).toHaveLength(1);
  });
});
