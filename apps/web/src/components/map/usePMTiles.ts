import { useEffect } from 'react';
import { Protocol } from 'pmtiles';
import maplibregl from 'maplibre-gl';

let registeredProtocolKey: string | null = null;

function registerProtocol(key: string): void {
  if (registeredProtocolKey === key) {
    return;
  }
  if (registeredProtocolKey !== null) {
    maplibregl.removeProtocol(registeredProtocolKey);
  }
  const protocol = new Protocol();
  maplibregl.addProtocol(key, protocol.tile);
  registeredProtocolKey = key;
}

function unregisterProtocol(key: string): void {
  if (registeredProtocolKey !== key) {
    return;
  }
  maplibregl.removeProtocol(key);
  registeredProtocolKey = null;
}

export function usePMTiles(pmtilesUrl: string, protocolKey = 'pmtiles'): void {
  useEffect(() => {
    registerProtocol(protocolKey);
    return () => {
      unregisterProtocol(protocolKey);
    };
  }, [protocolKey]);

  useEffect(() => {
    if (!pmtilesUrl) {
      return;
    }
    void fetch(pmtilesUrl, {
      method: 'GET',
      headers: { Range: 'bytes=0-0' },
    }).catch(() => {
      // ignore - tile requests will surface errors later
    });
  }, [pmtilesUrl]);
}

export function pmtilesUrl(url: string, protocolKey = 'pmtiles'): string {
  return `${protocolKey}://${url}`;
}
