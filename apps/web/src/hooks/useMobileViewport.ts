import { useEffect, useState } from 'react';

export const MOBILE_MEDIA_QUERY = '(max-width: 639px)';

export function subscribeToMediaQuery(
  query: string,
  onChange: (matches: boolean) => void,
): () => void {
  const mediaQueryList = window.matchMedia(query);
  onChange(mediaQueryList.matches);
  const listener = (event: MediaQueryListEvent): void => {
    onChange(event.matches);
  };
  mediaQueryList.addEventListener('change', listener);
  return () => {
    mediaQueryList.removeEventListener('change', listener);
  };
}

export function useMobileViewport(): boolean {
  const [isMobile, setIsMobile] = useState<boolean>(
    () => window.matchMedia(MOBILE_MEDIA_QUERY).matches,
  );
  useEffect(() => subscribeToMediaQuery(MOBILE_MEDIA_QUERY, setIsMobile), []);
  return isMobile;
}
