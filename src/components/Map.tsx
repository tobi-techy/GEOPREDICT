'use client';

import { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { calcOdds, formatAmount, type Market } from '@/lib/markets';

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || '';
mapboxgl.accessToken = MAPBOX_TOKEN;

const SOURCE_ID = 'markets-source';
const CLUSTER_LAYER_ID = 'markets-clusters';
const CLUSTER_COUNT_LAYER_ID = 'markets-cluster-count';
const POINT_LAYER_ID = 'markets-unclustered';

interface MapProps {
  markets: Market[];
  onMarkerClick?: (market: Market) => void;
}

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function toFeatureCollection(markets: Market[]): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: markets.map((market) => {
      const odds = calcOdds(market);
      return {
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: [market.lng, market.lat],
        },
        properties: {
          id: market.id,
          category: market.category,
          question: market.question,
          yes: odds.yes,
          no: odds.no,
          pool: formatAmount(market.totalYes + market.totalNo),
          deadline: market.deadline.toLocaleDateString(),
          outcome: market.outcome,
        },
      };
    }),
  };
}

export default function Map({ markets, onMarkerClick }: MapProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const popupRef = useRef<mapboxgl.Popup | null>(null);
  const marketsByIdRef = useRef<globalThis.Map<string, Market>>(new globalThis.Map());
  const onMarkerClickRef = useRef(onMarkerClick);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [mapError, setMapError] = useState<string | null>(
    MAPBOX_TOKEN ? null : 'Missing NEXT_PUBLIC_MAPBOX_TOKEN. Add it in your Vercel project env and redeploy.',
  );

  useEffect(() => {
    onMarkerClickRef.current = onMarkerClick;
  }, [onMarkerClick]);

  useEffect(() => {
    if (!mapContainer.current || mapRef.current || !MAPBOX_TOKEN) return;

    try {
      const map = new mapboxgl.Map({
        container: mapContainer.current,
        style: 'mapbox://styles/mapbox/dark-v11',
        center: [-20, 25],
        zoom: 1.6,
      });
      mapRef.current = map;

      map.on('error', () => {
        setMapError('Map failed to load. Check NEXT_PUBLIC_MAPBOX_TOKEN and domain restrictions.');
      });

      map.on('load', () => {
        map.addSource(SOURCE_ID, {
          type: 'geojson',
          data: toFeatureCollection([]),
          cluster: true,
          clusterRadius: 54,
          clusterMaxZoom: 8,
        });

        map.addLayer({
          id: CLUSTER_LAYER_ID,
          type: 'circle',
          source: SOURCE_ID,
          filter: ['has', 'point_count'],
          paint: {
            'circle-color': [
              'step',
              ['get', 'point_count'],
              '#1f2937',
              20, '#0f766e',
              50, '#0891b2',
              120, '#2563eb',
            ],
            'circle-radius': [
              'step',
              ['get', 'point_count'],
              14,
              20, 18,
              50, 22,
              120, 28,
            ],
            'circle-stroke-color': '#0a0a0a',
            'circle-stroke-width': 1.5,
          },
        });

        map.addLayer({
          id: CLUSTER_COUNT_LAYER_ID,
          type: 'symbol',
          source: SOURCE_ID,
          filter: ['has', 'point_count'],
          layout: {
            'text-field': ['get', 'point_count_abbreviated'],
            'text-size': 11,
          },
          paint: {
            'text-color': '#f8fafc',
          },
        });

        map.addLayer({
          id: POINT_LAYER_ID,
          type: 'circle',
          source: SOURCE_ID,
          filter: ['!', ['has', 'point_count']],
          paint: {
            'circle-color': [
              'match',
              ['get', 'category'],
              'real_estate', '#60a5fa',
              'event', '#c084fc',
              'environmental', '#2dd4bf',
              'music', '#f472b6',
              'sports', '#fb923c',
              'crypto', '#facc15',
              '#a3a3a3',
            ],
            'circle-radius': [
              'interpolate',
              ['linear'],
              ['zoom'],
              1, 4,
              5, 6,
              9, 8,
            ],
            'circle-stroke-color': '#09090b',
            'circle-stroke-width': 1,
          },
        });

        map.on('click', CLUSTER_LAYER_ID, (event) => {
          const features = map.queryRenderedFeatures(event.point, { layers: [CLUSTER_LAYER_ID] });
          const first = features[0];
          if (!first) return;
          const clusterId = first.properties?.cluster_id as number | undefined;
          if (clusterId == null) return;

          const source = map.getSource(SOURCE_ID) as (mapboxgl.GeoJSONSource & {
            getClusterExpansionZoom?: (clusterId: number, callback: (error: Error | null, zoom: number) => void) => void;
          }) | null;
          if (!source?.getClusterExpansionZoom) return;

          source.getClusterExpansionZoom(clusterId, (error, zoom) => {
            if (error) return;
            const targetZoom = typeof zoom === 'number' ? zoom : Math.min(map.getZoom() + 2, 10);
            const point = first.geometry as GeoJSON.Point;
            map.easeTo({
              center: [point.coordinates[0], point.coordinates[1]],
              zoom: targetZoom,
              duration: 350,
            });
          });
        });

        map.on('click', POINT_LAYER_ID, (event) => {
          const feature = event.features?.[0];
          if (!feature) return;
          const point = feature.geometry as GeoJSON.Point;
          const props = feature.properties as Record<string, string | number | undefined>;
          const marketId = String(props.id ?? '');
          const market = marketsByIdRef.current.get(marketId);
          if (!market) return;

          const question = escapeHtml(String(props.question ?? market.question));
          const yes = String(props.yes ?? '');
          const no = String(props.no ?? '');
          const pool = escapeHtml(String(props.pool ?? formatAmount(market.totalYes + market.totalNo)));
          const deadline = escapeHtml(String(props.deadline ?? market.deadline.toLocaleDateString()));

          popupRef.current?.remove();
          popupRef.current = new mapboxgl.Popup({ offset: 14, closeButton: false })
            .setLngLat([point.coordinates[0], point.coordinates[1]])
            .setHTML(`
              <div style="background:#18181b;color:#fafafa;padding:12px;border-radius:12px;min-width:220px;font-family:system-ui,sans-serif;">
                <p style="font-size:13px;font-weight:500;margin-bottom:8px;line-height:1.3;">${question}</p>
                <div style="display:flex;gap:12px;font-size:12px;margin-bottom:6px;">
                  <span style="color:#34d399;">Yes ${yes}%</span>
                  <span style="color:#fb7185;">No ${no}%</span>
                </div>
                <div style="font-size:11px;color:#a1a1aa;">Pool ${pool} · Resolves ${deadline}</div>
              </div>
            `)
            .addTo(map);

          onMarkerClickRef.current?.(market);
        });

        map.on('mouseenter', CLUSTER_LAYER_ID, () => { map.getCanvas().style.cursor = 'pointer'; });
        map.on('mouseleave', CLUSTER_LAYER_ID, () => { map.getCanvas().style.cursor = ''; });
        map.on('mouseenter', POINT_LAYER_ID, () => { map.getCanvas().style.cursor = 'pointer'; });
        map.on('mouseleave', POINT_LAYER_ID, () => { map.getCanvas().style.cursor = ''; });

        setMapLoaded(true);
      });
    } catch {
      return;
    }

    return () => {
      popupRef.current?.remove();
      popupRef.current = null;
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    marketsByIdRef.current = new globalThis.Map(markets.map((m) => [m.id, m]));
    if (!mapLoaded || !mapRef.current) return;
    const source = mapRef.current.getSource(SOURCE_ID) as mapboxgl.GeoJSONSource | undefined;
    if (!source) return;
    source.setData(toFeatureCollection(markets));
  }, [mapLoaded, markets]);

  return (
    <>
      <style jsx global>{`
        .mapboxgl-popup-content {
          background: transparent !important;
          padding: 0 !important;
          box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4) !important;
          border-radius: 12px !important;
        }
        .mapboxgl-popup-tip {
          border-top-color: #18181b !important;
        }
      `}</style>
      {mapError ? (
        <div className="w-full h-full bg-zinc-950 text-zinc-100 flex items-center justify-center p-6 text-center">
          <div>
            <p className="font-semibold mb-2">Map configuration error</p>
            <p className="text-sm text-zinc-400">{mapError}</p>
          </div>
        </div>
      ) : (
        <div ref={mapContainer} className="w-full h-full" />
      )}
    </>
  );
}
