import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useGeolocation } from '@/hooks/useGeolocation';

interface MockPosition {
  coords: { latitude: number; longitude: number; accuracy: number };
  timestamp: number;
}

interface MockError {
  message: string;
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
type ErrorCallback = (err: MockError) => void;

describe('useGeolocation', () => {
  beforeEach(() => {
    mockGeolocation.getCurrentPosition.mockReset();
    mockGeolocation.watchPosition.mockReset();
    mockGeolocation.clearWatch.mockReset();
    Object.defineProperty(globalThis.navigator, 'geolocation', {
      value: mockGeolocation,
      configurable: true,
      writable: true,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should set error when geolocation not available', () => {
    Object.defineProperty(globalThis.navigator, 'geolocation', {
      value: undefined,
      configurable: true,
      writable: true,
    });
    const { result } = renderHook(() => useGeolocation());
    expect(result.current.error).toMatch(/nie jest dostępna/i);
  });

  it('should call getCurrentPosition on mount', () => {
    renderHook(() => useGeolocation());
    expect(mockGeolocation.getCurrentPosition).toHaveBeenCalled();
  });

  it('should expose position after success callback', () => {
    const calls = { success: null as SuccessCallback | null };
    mockGeolocation.getCurrentPosition.mockImplementation((success: SuccessCallback) => {
      calls.success = success;
    });
    const { result } = renderHook(() => useGeolocation());
    const cb = calls.success;
    expect(cb).not.toBeNull();
    if (cb) {
      act(() => {
        cb({ coords: { latitude: 52.23, longitude: 21.01, accuracy: 10 }, timestamp: 1000 });
      });
    }
    expect(result.current.position).toEqual({
      lat: 52.23,
      lng: 21.01,
      accuracy: 10,
      timestamp: 1000,
    });
    expect(result.current.loading).toBe(false);
  });

  it('should set error after error callback', () => {
    const calls = { error: null as ErrorCallback | null };
    mockGeolocation.getCurrentPosition.mockImplementation((_success: unknown, error: ErrorCallback) => {
      calls.error = error;
    });
    const { result } = renderHook(() => useGeolocation());
    const cb = calls.error;
    expect(cb).not.toBeNull();
    if (cb) {
      act(() => {
        cb({ message: 'Permission denied' });
      });
    }
    expect(result.current.error).toBe('Permission denied');
    expect(result.current.loading).toBe(false);
  });

  it('should call clearWatch on unmount in watch mode', () => {
    mockGeolocation.watchPosition.mockReturnValue(42);
    const { unmount } = renderHook(() => useGeolocation({ watch: true }));
    expect(mockGeolocation.watchPosition).toHaveBeenCalled();
    unmount();
    expect(mockGeolocation.clearWatch).toHaveBeenCalledWith(42);
  });
});
