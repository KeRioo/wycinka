import { useEffect, useRef, type PointerEvent as ReactPointerEvent } from 'react';
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Crosshair } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ArrowPadProps {
  onNudge: (dx: number, dy: number) => void;
  onUseGps?: () => void;
  step?: number;
  dx?: number;
  dy?: number;
}

const REPEAT_DELAY_MS = 350;
const REPEAT_INTERVAL_MS = 110;

type Direction = 'up' | 'down' | 'left' | 'right';

const DIRECTION_VECTORS: Record<Direction, { dx: number; dy: number }> = {
  up: { dx: 0, dy: 1 },
  down: { dx: 0, dy: -1 },
  left: { dx: -1, dy: 0 },
  right: { dx: 1, dy: 0 },
};

interface RepeatState {
  timer: ReturnType<typeof setTimeout> | null;
  interval: ReturnType<typeof setInterval> | null;
}

function clearRepeat(state: RepeatState): void {
  if (state.timer !== null) {
    clearTimeout(state.timer);
    state.timer = null;
  }
  if (state.interval !== null) {
    clearInterval(state.interval);
    state.interval = null;
  }
}

function ArrowButton({
  direction,
  label,
  onPress,
  onRelease,
  className,
}: {
  direction: Direction;
  label: string;
  onPress: (dir: Direction) => void;
  onRelease: () => void;
  className?: string;
}): JSX.Element {
  const Icon =
    direction === 'up'
      ? ArrowUp
      : direction === 'down'
        ? ArrowDown
        : direction === 'left'
          ? ArrowLeft
          : ArrowRight;

  return (
    <button
      type="button"
      data-testid={`nudge-${direction}`}
      aria-label={label}
      onPointerDown={(e: ReactPointerEvent<HTMLButtonElement>) => {
        e.preventDefault();
        onPress(direction);
      }}
      onPointerUp={onRelease}
      onPointerLeave={onRelease}
      onPointerCancel={onRelease}
      className={cn(
        'flex h-14 w-14 touch-none select-none items-center justify-center rounded-md border border-stone-300 bg-white text-forest-800 transition-colors',
        'hover:bg-forest-50 active:bg-forest-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-forest-500',
        className,
      )}
    >
      <Icon aria-hidden="true" className="h-6 w-6" />
    </button>
  );
}

export default function ArrowPad({
  onNudge,
  onUseGps,
  step = 0.25,
  dx = 0,
  dy = 0,
}: ArrowPadProps): JSX.Element {
  const repeatRef = useRef<RepeatState>({ timer: null, interval: null });

  useEffect(() => {
    const state = repeatRef.current;
    return () => {
      clearRepeat(state);
    };
  }, []);

  const startRepeat = (dir: Direction): void => {
    const vec = DIRECTION_VECTORS[dir];
    onNudge(vec.dx * step, vec.dy * step);
    clearRepeat(repeatRef.current);
    repeatRef.current.timer = setTimeout(() => {
      repeatRef.current.interval = setInterval(() => {
        onNudge(vec.dx * step, vec.dy * step);
      }, REPEAT_INTERVAL_MS);
    }, REPEAT_DELAY_MS);
  };

  const stopRepeat = (): void => {
    clearRepeat(repeatRef.current);
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-col items-center gap-2">
        <ArrowButton
          direction="up"
          label="Przesuń o 0.25 m na północ"
          onPress={startRepeat}
          onRelease={stopRepeat}
        />
        <div className="flex items-center gap-2">
          <ArrowButton
            direction="left"
            label="Przesuń o 0.25 m na zachód"
            onPress={startRepeat}
            onRelease={stopRepeat}
          />
          {onUseGps !== undefined ? (
            <button
              type="button"
              data-testid="use-gps"
              aria-label="Użyj GPS"
              onClick={onUseGps}
              className={cn(
                'flex h-14 w-14 touch-none select-none items-center justify-center rounded-full border border-forest-300 bg-forest-50 text-forest-800 transition-colors',
                'hover:bg-forest-100 active:bg-forest-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-forest-500',
              )}
            >
              <Crosshair aria-hidden="true" className="h-6 w-6" />
            </button>
          ) : (
            <div className="h-14 w-14" aria-hidden="true" />
          )}
          <ArrowButton
            direction="right"
            label="Przesuń o 0.25 m na wschód"
            onPress={startRepeat}
            onRelease={stopRepeat}
          />
        </div>
        <ArrowButton
          direction="down"
          label="Przesuń o 0.25 m na południe"
          onPress={startRepeat}
          onRelease={stopRepeat}
        />
      </div>
      <p data-testid="nudge-status" className="text-center font-mono text-xs text-stone-600">
        Przesunięcie: +{dx.toFixed(2)} m / {dy.toFixed(2)} m
      </p>
    </div>
  );
}
