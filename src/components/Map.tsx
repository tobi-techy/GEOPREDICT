'use client';

import { useEffect, useRef, useCallback } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { MOCK_MARKETS, calcOdds, type Market, type MarketCategory } from '@/lib/markets';

mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || '';

const MARKER_COLORS: Record<MarketCategory, string> = {
  real_estate: '#60a5fa',
  event: '#c084fc',
  environmental: '#2dd4bf',
  music: '#f472b6',
  sports: '#fb923c',
  crypto: '#facc15',
};

interface MapProps {
  onMarkerClick?: (market: Market) => void;
}

export default function Map({ onMarkerClick }: MapProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);

  const handleMarkerClick = useCallback((market: Market) => {
    onMarkerClick?.(market);
  }, [onMarkerClick]);

  useEffect(() => {
    if (!mapContainer.current || map.current) return;

    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: 'mapbox://styles/mapbox/dark-v11',
      center: [-20, 25],
      zoom: 1.8,
    });

    map.current.on('load', () => {
      MOCK_MARKETS.forEach((market) => {
        const color = MARKER_COLORS[market.category];
        const odds = calcOdds(market);

        const popup = new mapboxgl.Popup({ 
          offset: 25, 
          closeButton: false,
        }).setHTML(`
          <div style="background:#18181b;color:#fafafa;padding:12px;border-radius:12px;min-width:200px;font-family:system-ui,sans-serif;">
            <p style="font-size:11px;color:#71717a;margin-bottom:4px;text-transform:uppercase;">${market.category.replace('_', ' ')}</p>
            <p style="font-size:13px;font-weight:500;margin-bottom:8px;">${market.question}</p>
            <div style="display:flex;gap:12px;font-size:12px;">
              <span style="color:#34d399;">Yes ${odds.yes}%</span>
              <span style="color:#fb7185;">No ${odds.no}%</span>
            </div>
          </div>
        `);

        const marker = new mapboxgl.Marker({ color })
          .setLngLat([market.lng, market.lat])
          .setPopup(popup)
          .addTo(map.current!);

        marker.getElement().addEventListener('click', () => {
          handleMarkerClick(market);
        });
      });
    });

    return () => {
      map.current?.remove();
      map.current = null;
    };
  }, [handleMarkerClick]);

  return (
    <>
      <style jsx global>{`
        .mapboxgl-popup-content {
          background: transparent !important;
          padding: 0 !important;
          box-shadow: 0 8px 32px rgba(0,0,0,0.4) !important;
          border-radius: 12px !important;
        }
        .mapboxgl-popup-tip {
          border-top-color: #18181b !important;
        }
      `}</style>
      <div ref={mapContainer} className="w-full h-full" />
    </>
  );
}
