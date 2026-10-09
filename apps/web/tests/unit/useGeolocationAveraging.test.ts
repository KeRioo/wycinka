import { act, renderHook, type RenderHookResult } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AVERAGING_ACCURACY_OUTLIER_FACTOR,
  DEFAULT_AVERAGING_WINDOW_MS,
  averageSamples,
  medianOf,
  useGeolocation,
  type GeolocationPosition,
  type UseGeolocationOptions,
} from '@/hooks/useGeolocation';

interface MockPosition {
  coords: { latitude: number; longitude: number; accuracy: number };
  timestamp: number;
}

interface MockGeolocation {
  getCurrentPosition: ReturnType<typeof vi.fn>;
  watchPosition: ReturnType<typeof vi.fn>;
  clearWatch: ReturnType<typeof vi.fn>;
}

const mockGeolocation: MockGeolocation = {
  getCurrentPosition: vi.fn(),
  watchPosition: vi.fn(),
  clearWatch: vi.fn(),
};

type SuccessCallback = (pos: MockPosition) => void;

function installMockGeolocation(): void {
  Object.defineProperty(globalThis.navigator, 'geolocation', {
    value: mockGeolocation,
    configurable: true,
    writable: true,
  });
}

function makePosition(
  lat: number,
  lng: number,
  accuracy: number,
  timestamp: number,
): MockPosition {
  return { coords: { latitude: lat, longitude: lng, accuracy }, timestamp };
}

interface WatchHarness {
  pushToWatch: (pos: MockPosition) => void;
}

let pushToWatch: (pos: MockPosition) => void;

type GeolocationHookResult = RenderHookResult<ReturnType<typeof useGeolocation>, UseGeolocationOptions>;

function renderAveragingHook(options: UseGeolocationOptions): WatchHarness & { result: GeolocationHookResult['result'] } {
  mockGeolocation.watchPosition.mockImplementation((success: SuccessCallback) => {
    pushToWatch = (pos: MockPosition) => {
      act(() => {
        success(pos);
      });
    };
    return 7;
  });
  const render = renderHook(() => useGeolocation(options));
  expect(mockGeolocation.watchPosition).toHaveBeenCalled();
  return { result: render.result, pushToWatch };
}

describe('medianOf', () => {
  it('test_medianOf_when_odd_count_then_middle_value', () => {
    expect(medianOf([3, 1, 2])).toBe(2);
  });

  it('test_medianOf_when_even_count_then_mean_of_middle_two', () => {
    expect(medianOf([4, 1, 3, 2])).toBe(2.5);
  });

  it('test_medianOf_when_empty_then_nan', () => {
    expect(Number.isNaN(medianOf([]))).toBe(true);
  });
});

describe('averageSamples', () => {
  it('test_averageSamples_when_all_similar_then_medians_of_all', () => {
    const samples: GeolocationPosition[] = [
      { lat: 52.0, lng: 21.0, accuracy: 10, timestamp: 1 },
      { lat: 52.2, lng: 21.2, accuracy: 12, timestamp: 2 },
      { lat: 52.4, lng: 21.4, accuracy: 11, timestamp: 3 },
    ];
    const result = averageSamples(samples, 99);
    expect(result).toEqual({ lat: 52.2, lng: 21.2, accuracy: 11, timestamp: 99 });
  });

  it('test_averageSamples_when_accuracy_outlier_then_rejected', () => {
    const outlierFactor = AVERAGING_ACCURACY_OUTLIER_FACTOR;
    const samples: GeolocationPosition[] = [
      { lat: 52.0, lng: 21.0, accuracy: 10, timestamp: 1 },
      { lat: 52.2, lng: 21.2, accuracy: 12, timestamp: 2 },
      { lat: 60.0, lng: 30.0, accuracy: 12 * outlierFactor + 1, timestamp: 3 },
    ];
    const result = averageSamples(samples, 99);
    expect(result.lat).toBeCloseTo(52.1);
    expect(result.lng).toBeCloseTo(21.1);
    expect(result.accuracy).toBe(11);
  });

  it('test_averageSamples_when_borderline_accuracy_then_kept', () => {
    const samples: GeolocationPosition[] = [
      { lat: 52.0, lng: 21.0, accuracy: 10, timestamp: 1 },
      { lat: 52.2, lng: 21.2, accuracy: 20, timestamp: 2 },
    ];
    const result = averageSamples(samples, 99);
    expect(result.accuracy).toBe(15);
    expect(result.lat).toBeCloseTo(52.1);
  });
});

describe('useGeolocation averaging', () => {
  beforeEach(() => {
    mockGeolocation.getCurrentPosition.mockReset();
    mockGeolocation.watchPosition.mockReset();
    mockGeolocation.clearWatch.mockReset();
    installMockGeolocation();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('test_default_options_when_single_fix_then_last_reading_passthrough', () => {
    let success: SuccessCallback | null = null;
    mockGeolocation.getCurrentPosition.mockImplementation((cb: SuccessCallback) => {
      success = cb;
    });
    const { result } = renderHook(() => useGeolocation());
    act(() => {
      success?.(makePosition(52.1, 21.1, 10, 1000));
      success?.(makePosition(60.0, 30.0, 500, 2000));
    });
    expect(result.current.position).toEqual({
      lat: 60.0,
      lng: 30.0,
      accuracy: 500,
      timestamp: 2000,
    });
    expect(mockGeolocation.watchPosition).not.toHaveBeenCalled();
  });

  it('test_averaging_when_five_fixes_then_median_lat_lng', () => {
    const { result, pushToWatch } = renderAveragingHook({ averagingSamples: 5 });
    pushToWatch(makePosition(52.0, 21.0, 10, 1000));
    pushToWatch(makePosition(52.1, 21.1, 10, 1100));
    pushToWatch(makePosition(52.2, 21.2, 10, 1200));
    pushToWatch(makePosition(52.3, 21.3, 10, 1300));
    pushToWatch(makePosition(52.4, 21.4, 10, 1400));
    expect(result.current.position?.lat).toBe(52.2);
    expect(result.current.position?.lng).toBe(21.2);
    expect(result.current.position?.accuracy).toBe(10);
  });

  it('test_averaging_when_outlier_fix_then_median_ignores_it', () => {
    const { result, pushToWatch } = renderAveragingHook({ averagingSamples: 3 });
    pushToWatch(makePosition(52.0, 21.0, 10, 1000));
    pushToWatch(makePosition(52.2, 21.2, 10, 1100));
    pushToWatch(makePosition(70.0, 40.0, 9999, 1200));
    expect(result.current.position?.lat).toBeCloseTo(52.1);
    expect(result.current.position?.lng).toBeCloseTo(21.1);
  });

  it('test_averaging_when_sample_older_than_window_then_evicted', () => {
    const windowMs = 5_000;
    const { result, pushToWatch } = renderAveragingHook({
      averagingSamples: 3,
      averagingWindowMs: windowMs,
    });
    pushToWatch(makePosition(60.0, 30.0, 10, 0));
    pushToWatch(makePosition(52.0, 21.0, 10, windowMs + 1));
    pushToWatch(makePosition(52.4, 21.4, 10, windowMs + 2));
    expect(result.current.position?.lat).toBeCloseTo(52.2);
    expect(result.current.position?.lng).toBeCloseTo(21.2);
  });

  it('test_averaging_when_more_fixes_than_buffer_then_oldest_dropped', () => {
    const { result, pushToWatch } = renderAveragingHook({ averagingSamples: 2 });
    pushToWatch(makePosition(60.0, 30.0, 10, 1000));
    pushToWatch(makePosition(52.0, 21.0, 10, 1100));
    pushToWatch(makePosition(52.4, 21.4, 10, 1200));
    expect(result.current.position?.lat).toBe(52.2);
    expect(mockGeolocation.clearWatch).toBeCalledTimes(0);
  });

  it('test_averaging_enabled_when_no_watch_flag_then_uses_watch_position', () => {
    renderHook(() => useGeolocation({ averagingSamples: 3 }));
    expect(mockGeolocation.getCurrentPosition).not.toHaveBeenCalled();
    expect(mockGeolocation.watchPosition).toHaveBeenCalled();
  });

  it('test_averaging_when_refresh_then_buffer_cleared', () => {
    const { result, pushToWatch } = renderAveragingHook({ averagingSamples: 3 });
    pushToWatch(makePosition(60.0, 30.0, 10, 1000));
    act(() => {
      result.current.refresh();
    });
    const pushAfterRefresh = mockGeolocation.watchPosition.mock.calls.at(-1)?.[0] as
      | SuccessCallback
      | undefined;
    expect(pushAfterRefresh).toBeDefined();
    act(() => {
      pushAfterRefresh?.(makePosition(50.0, 20.0, 10, 5000));
      pushAfterRefresh?.(makePosition(50.2, 20.2, 10, 5100));
    });
    expect(result.current.position?.lat).toBeCloseTo(50.1);
    expect(result.current.position?.lng).toBeCloseTo(20.1);
  });

  it('test_default_window_constant_when_default_then_10_seconds', () => {
    expect(DEFAULT_AVERAGING_WINDOW_MS).toBe(10_000);
  });
});
