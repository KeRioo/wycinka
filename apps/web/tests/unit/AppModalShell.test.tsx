import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AppModalShell, { PANEL_MOBILE_HEIGHT_CLASS } from '@/components/layout/AppModalShell';
import { useAppStore } from '@/stores/appStore';

type MediaListener = () => void;

const mediaQueryState = vi.hoisted(() => ({
  matches: false,
  listeners: [] as MediaListener[],
}));

function installMatchMedia(matches: boolean): void {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches,
    media: query,
    onchange: null,
    addEventListener: vi.fn((_type: string, listener: MediaListener) => {
      mediaQueryState.listeners.push(listener);
    }),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: () => false,
  }));
}

describe('AppModalShell — modal' , () => {
  beforeEach(() => {
    mediaQueryState.matches = false;
    mediaQueryState.listeners = [];
    installMatchMedia(false);
  });

  it('should render a centered dialog with backdrop, title and scrollable body', () => {
    render(
      <AppModalShell
        kind="modal"
        open
        testId="app-modal"
        ariaLabel="Ustawienia"
        title="Ustawienia"
        onClose={() => undefined}
      >
        <p>Treść modala</p>
      </AppModalShell>,
    );
    const overlay = screen.getByTestId('app-modal');
    expect(overlay).toHaveAttribute('role', 'dialog');
    expect(overlay.className).toContain('items-center');
    expect(overlay.className).toContain('bg-stone-900/40');
    expect(screen.getByRole('heading', { name: 'Ustawienia' })).toBeInTheDocument();
    expect(screen.getByText('Treść modala')).toBeInTheDocument();
  });

  it('should call onClose when the close button is clicked', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <AppModalShell
        kind="modal"
        open
        testId="app-modal"
        ariaLabel="Raporty"
        title="Raporty"
        onClose={onClose}
      >
        <p>PDF</p>
      </AppModalShell>,
    );
    await user.click(screen.getByTestId('modal-close'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('should render nothing when closed', () => {
    render(
      <AppModalShell kind="modal" open={false} testId="app-modal" ariaLabel="Ustawienia">
        <p>treść</p>
      </AppModalShell>,
    );
    expect(screen.queryByTestId('app-modal')).not.toBeInTheDocument();
  });

  it('should keep the card under the 85vh overflow guard with scrollable body', () => {
    render(
      <AppModalShell kind="modal" open testId="app-modal" ariaLabel="Ustawienia">
        <p>treść</p>
      </AppModalShell>,
    );
    const body = screen.getByText('treść').parentElement;
    if (body === null) {
      throw new Error('body missing');
    }
    expect(body.className).toContain('overflow-y-auto');
    expect(body.className).toContain('min-h-0');
    const card = body.parentElement;
    if (card === null) {
      throw new Error('card missing');
    }
    expect(card.className).toContain('max-h-[85vh]');
    expect(card.className).toContain('overflow-hidden');
  });
});

describe('AppModalShell — panel', () => {
  beforeEach(() => {
    mediaQueryState.matches = false;
    mediaQueryState.listeners = [];
  });

  it('should render a desktop right drawer with width classes when not mobile', () => {
    installMatchMedia(false);
    render(
      <AppModalShell kind="panel" open testId="app-panel" ariaLabel="Lista drzew" desktopWidthClass="w-80 max-w-[90vw]">
        <p>panel</p>
      </AppModalShell>,
    );
    const panel = screen.getByTestId('app-panel');
    expect(panel).toHaveAttribute('data-split-panel', 'false');
    expect(panel.className).toContain('border-l');
    expect(panel.className).toContain('right-0');
    expect(panel.className).toContain('w-80');
    expect(panel.className).not.toContain('h-[50dvh]');
  });

  it('should render a mobile bottom-half split panel at 50dvh with min height', () => {
    installMatchMedia(true);
    render(
      <AppModalShell kind="panel" open testId="app-panel" ariaLabel="Lista drzew">
        <p>panel</p>
      </AppModalShell>,
    );
    const panel = screen.getByTestId('app-panel');
    expect(panel).toHaveAttribute('data-split-panel', 'true');
    expect(panel.className).toContain('bottom-0');
    expect(panel.className).toContain('rounded-t-2xl');
    expect(panel.className).toContain('h-[50dvh]');
    expect(panel.className).toContain('min-h-[300px]');
    expect(panel.className).not.toContain('border-l');
  });

  it('should render nothing when closed on mobile', () => {
    installMatchMedia(true);
    render(
      <AppModalShell kind="panel" open={false} testId="app-panel" ariaLabel="Lista drzew">
        <p>panel</p>
      </AppModalShell>,
    );
    expect(screen.queryByTestId('app-panel')).not.toBeInTheDocument();
  });
});

describe('PANEL_MOBILE_HEIGHT_CLASS', () => {
  it('should encode the 50/50 split with a 300px floor', () => {
    expect(PANEL_MOBILE_HEIGHT_CLASS).toBe('h-[50dvh] min-h-[300px]');
  });
});

describe('appStore — gpsModalOpen', () => {
  beforeEach(() => {
    useAppStore.getState().reset();
  });

  it('should open and close the GPS troubleshoot modal state', () => {
    expect(useAppStore.getState().gpsModalOpen).toBe(false);
    useAppStore.getState().openGpsModal();
    expect(useAppStore.getState().gpsModalOpen).toBe(true);
    useAppStore.getState().closeGpsModal();
    expect(useAppStore.getState().gpsModalOpen).toBe(false);
  });

  it('should stay independent from the app modal state', () => {
    useAppStore.getState().openGpsModal();
    useAppStore.getState().openAppModal('settings');
    expect(useAppStore.getState().appModal).toBe('settings');
    expect(useAppStore.getState().gpsModalOpen).toBe(true);
    useAppStore.getState().reset();
    expect(useAppStore.getState().appModal).toBeNull();
    expect(useAppStore.getState().gpsModalOpen).toBe(false);
  });
});
