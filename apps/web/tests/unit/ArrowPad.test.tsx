import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ArrowPad from '@/components/trees/ArrowPad';

describe('ArrowPad', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should render all four arrow buttons', () => {
    render(<ArrowPad onNudge={vi.fn()} />);
    expect(screen.getByTestId('nudge-up')).toBeInTheDocument();
    expect(screen.getByTestId('nudge-down')).toBeInTheDocument();
    expect(screen.getByTestId('nudge-left')).toBeInTheDocument();
    expect(screen.getByTestId('nudge-right')).toBeInTheDocument();
  });

  it('should render use-gps button when onUseGps provided', () => {
    render(<ArrowPad onNudge={vi.fn()} onUseGps={vi.fn()} />);
    expect(screen.getByTestId('use-gps')).toBeInTheDocument();
  });

  it('should not render use-gps button when onUseGps missing', () => {
    render(<ArrowPad onNudge={vi.fn()} />);
    expect(screen.queryByTestId('use-gps')).not.toBeInTheDocument();
  });

  it('should call onNudge with step when arrow pressed', () => {
    const onNudge = vi.fn();
    render(<ArrowPad onNudge={onNudge} />);
    fireEvent.pointerDown(screen.getByTestId('nudge-right'));
    expect(onNudge).toHaveBeenCalledWith(0.25, 0);
    fireEvent.pointerUp(screen.getByTestId('nudge-right'));
  });

  it('should call onNudge with negative dx for left', () => {
    const onNudge = vi.fn();
    render(<ArrowPad onNudge={onNudge} />);
    fireEvent.pointerDown(screen.getByTestId('nudge-left'));
    expect(onNudge).toHaveBeenCalledWith(-0.25, 0);
  });

  it('should call onNudge with positive dy for up', () => {
    const onNudge = vi.fn();
    render(<ArrowPad onNudge={onNudge} />);
    fireEvent.pointerDown(screen.getByTestId('nudge-up'));
    expect(onNudge).toHaveBeenCalledWith(0, 0.25);
  });

  it('should call onNudge with negative dy for down', () => {
    const onNudge = vi.fn();
    render(<ArrowPad onNudge={onNudge} />);
    fireEvent.pointerDown(screen.getByTestId('nudge-down'));
    expect(onNudge).toHaveBeenCalledWith(0, -0.25);
  });

  it('should respect custom step', () => {
    const onNudge = vi.fn();
    render(<ArrowPad onNudge={onNudge} step={1} />);
    fireEvent.pointerDown(screen.getByTestId('nudge-right'));
    expect(onNudge).toHaveBeenCalledWith(1, 0);
  });

  it('should repeat nudges while holding', () => {
    const onNudge = vi.fn();
    render(<ArrowPad onNudge={onNudge} />);
    fireEvent.pointerDown(screen.getByTestId('nudge-right'));
    expect(onNudge).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(800);
    expect(onNudge.mock.calls.length).toBeGreaterThan(1);
    fireEvent.pointerUp(screen.getByTestId('nudge-right'));
  });

  it('should call onUseGps when center button clicked', () => {
    const onUseGps = vi.fn();
    render(<ArrowPad onNudge={vi.fn()} onUseGps={onUseGps} />);
    fireEvent.click(screen.getByTestId('use-gps'));
    expect(onUseGps).toHaveBeenCalledTimes(1);
  });

  it('should display offset status with formatted values', () => {
    render(<ArrowPad onNudge={vi.fn()} dx={1.234} dy={-0.567} />);
    const status = screen.getByTestId('nudge-status');
    expect(status.textContent).toMatch(/Przesunięcie:/);
    expect(status.textContent).toMatch(/1\.23/);
    expect(status.textContent).toMatch(/-0\.57/);
  });
});
