import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, TreePine } from 'lucide-react';
import { cn } from '@/lib/utils';
import { mapApiErrorToMessage, selectSearchResult } from '@/lib/search';
import { api } from '@/services/api';
import type { SearchResult } from '@/services/api.types';
import { ApiError } from '@/services/api.types';
import { useProjectStore } from '@/stores/projectStore';

const DEBOUNCE_MS = 500;
const MIN_QUERY_LENGTH = 2;
const MAX_RESULTS = 10;

type SearchStatus = 'idle' | 'loading' | 'done' | 'empty' | 'error';

export default function SearchBox(): JSX.Element {
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<SearchStatus>('idle');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);

  const navigate = useNavigate();
  const listboxId = useId();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const requestIdRef = useRef(0);
  const latestQueryRef = useRef('');

  useEffect(() => {
    latestQueryRef.current = query;
  }, [query]);

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < MIN_QUERY_LENGTH) {
      requestIdRef.current += 1;
      setStatus('idle');
      setResults([]);
      setErrorMessage(null);
      setOpen(false);
      return;
    }

    setStatus('loading');
    setOpen(true);
    const requestId = ++requestIdRef.current;
    const timer = window.setTimeout(() => {
      void api
        .searchParcels(trimmed, MAX_RESULTS)
        .then((response) => {
          if (requestIdRef.current !== requestId) {
            return;
          }
          if (latestQueryRef.current.trim() !== trimmed) {
            return;
          }
          setResults(response.results.slice(0, MAX_RESULTS));
          setStatus(response.results.length === 0 ? 'empty' : 'done');
          setHighlightedIndex(-1);
        })
        .catch((error: unknown) => {
          if (requestIdRef.current !== requestId) {
            return;
          }
          setResults([]);
          setStatus('error');
          setErrorMessage(
            error instanceof ApiError
              ? mapApiErrorToMessage(error)
              : 'Błąd wyszukiwania. Spróbuj ponownie.',
          );
        });
    }, DEBOUNCE_MS);

    return () => {
      window.clearTimeout(timer);
    };
  }, [query]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent): void => {
      if (rootRef.current !== null && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const handleSelect = useCallback(
    async (result: SearchResult): Promise<void> => {
      setOpen(false);
      setQuery('');
      setResults([]);
      setStatus('idle');
      try {
        await selectSearchResult(result);
        navigate('/map');
      } catch (error) {
        setStatus('error');
        setErrorMessage(
          error instanceof ApiError
            ? mapApiErrorToMessage(error)
            : 'Nie udało się otworzyć działki. Spróbuj ponownie.',
        );
        setOpen(true);
      }
    },
    [navigate],
  );

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>): void => {
    if (status !== 'done') {
      if (event.key === 'Escape') {
        setOpen(false);
      }
      return;
    }
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        setHighlightedIndex((index) => (index + 1) % results.length);
        break;
      case 'ArrowUp':
        event.preventDefault();
        setHighlightedIndex((index) => (index <= 0 ? results.length - 1 : index - 1));
        break;
      case 'Enter': {
        event.preventDefault();
        const selected = highlightedIndex >= 0 ? results[highlightedIndex] : undefined;
        if (selected !== undefined) {
          void handleSelect(selected);
        }
        break;
      }
      case 'Escape':
        setOpen(false);
        break;
      default:
        break;
    }
  };

  const showList = open;
  const activeDescendant =
    highlightedIndex >= 0 ? `${listboxId}-option-${String(highlightedIndex)}` : undefined;
  const isInProject = (teryt: string): boolean =>
    useProjectStore.getState().isParcelInProject(teryt);

  return (
    <div ref={rootRef} className="relative w-full sm:w-72" data-testid="search-box">
      <div className="relative">
        <Search
          aria-hidden="true"
          className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-forest-100"
        />
        <input
          type="search"
          role="combobox"
          aria-expanded={showList}
          aria-controls={listboxId}
          aria-autocomplete="list"
          aria-activedescendant={activeDescendant}
          aria-label="Szukaj działki po numerze TERYT"
          placeholder="Szukaj działki (TERYT)…"
          value={query}
          data-testid="search-input"
          onChange={(event) => {
            setQuery(event.target.value);
          }}
          onKeyDown={handleKeyDown}
          className="h-8 w-full rounded-md border border-forest-500 bg-forest-600 pl-8 pr-2 text-sm text-white placeholder:text-forest-100 focus:border-forest-200 focus:outline-none focus:ring-1 focus:ring-forest-200"
        />
      </div>

      {showList && (
        <div className="absolute right-0 z-50 mt-1 w-full overflow-hidden rounded-lg border border-stone-200 bg-white shadow-md sm:w-96">
          <div role="status" aria-live="polite" className="sr-only">
            {status === 'loading' ? 'Szukanie działek…' : ''}
            {status === 'empty' ? 'Brak wyników' : ''}
          </div>

          {status === 'loading' && (
            <ul
              className="divide-y divide-stone-100 p-1"
              id={listboxId}
              data-testid="search-skeleton"
              aria-busy="true"
            >
              {[0, 1, 2].map((index) => (
                <li key={index} className="flex items-center gap-2 px-2 py-2">
                  <TreePine aria-hidden="true" className="h-4 w-4 text-stone-300" />
                  <span className="h-3.5 w-3/4 animate-pulse rounded bg-stone-200" />
                </li>
              ))}
            </ul>
          )}

          {status === 'empty' && (
            <p className="p-3 text-sm text-stone-500" data-testid="search-empty">
              Brak wyników dla podanego zapytania.
            </p>
          )}

          {status === 'error' && (
            <p className="p-3 text-sm text-red-700" data-testid="search-error" role="alert">
              {errorMessage}
            </p>
          )}

          {status === 'done' && (
            <ul
              role="listbox"
              id={listboxId}
              className="max-h-80 overflow-y-auto divide-y divide-stone-100"
              data-testid="search-results"
            >
              {results.map((result, index) => (
                <li
                  key={result.teryt}
                  id={`${listboxId}-option-${String(index)}`}
                  role="option"
                  aria-selected={index === highlightedIndex}
                  onMouseEnter={() => {
                    setHighlightedIndex(index);
                  }}
                  onMouseDown={(event) => {
                    event.preventDefault();
                    void handleSelect(result);
                  }}
                  className={cn(
                    'flex cursor-pointer items-center justify-between gap-2 px-3 py-2 text-sm text-stone-800',
                    index === highlightedIndex && 'bg-forest-50',
                  )}
                >
                  <span className="truncate">
                    <span className="block font-medium">{result.teryt}</span>
                    {result.label !== result.teryt && (
                      <span className="block text-xs text-stone-500">{result.label}</span>
                    )}
                  </span>
                  {isInProject(result.teryt) && (
                    <span className="shrink-0 rounded bg-forest-100 px-1.5 py-0.5 text-xs font-medium text-forest-800">
                      w projekcie
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
