import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import maplibregl from 'maplibre-gl';
import { pmtilesUrl, usePMTiles } from '@/components/map/usePMTiles';

vi.mock('maplibre-gl', () => {
  return {
    default: {
      addProtocol: vi.fn(),
      removeProtocol: vi.fn(),
    },
  };
});

describe('usePMTiles', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should register pmtiles protocol on mount', () => {
    renderHook(() => {
      usePMTiles('https://example.com/data.pmtiles');
    });
    expect(maplibregl.addProtocol).toHaveBeenCalledWith('pmtiles', expect.any(Function));
  });

  it('should remove pmtiles protocol on unmount', () => {
    const { unmount } = renderHook(() => {
      usePMTiles('https://example.com/data.pmtiles');
    });
    unmount();
    expect(maplibregl.removeProtocol).toHaveBeenCalledWith('pmtiles');
  });

  it('should support custom protocol key', () => {
    const { unmount } = renderHook(() => {
      usePMTiles('https://example.com/data.pmtiles', 'custom');
    });
    expect(maplibregl.addProtocol).toHaveBeenCalledWith('custom', expect.any(Function));
    unmount();
    expect(maplibregl.removeProtocol).toHaveBeenCalledWith('custom');
  });

  it('should re-register when protocol key changes', () => {
    const { rerender } = renderHook(
      ({ key }) => {
        usePMTiles('https://example.com/data.pmtiles', key);
      },
      {
        initialProps: { key: 'pmtiles' },
      },
    );
    expect(maplibregl.addProtocol).toHaveBeenCalledTimes(1);
    rerender({ key: 'custom' });
    expect(maplibregl.removeProtocol).toHaveBeenCalledWith('pmtiles');
    expect(maplibregl.addProtocol).toHaveBeenCalledWith('custom', expect.any(Function));
  });
});

describe('pmtilesUrl', () => {
  it('should prefix URL with protocol', () => {
    expect(pmtilesUrl('https://example.com/data.pmtiles')).toBe('pmtiles://https://example.com/data.pmtiles');
  });

  it('should support custom protocol key', () => {
    expect(pmtilesUrl('https://example.com/data.pmtiles', 'custom')).toBe(
      'custom://https://example.com/data.pmtiles',
    );
  });
});
