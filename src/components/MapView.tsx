'use client';

import { useEffect, useRef } from 'react';
import { LocationResult } from '@/types';

interface MapViewProps {
  locations: LocationResult[];
  selectedIndex?: number;
  onSelectLocation?: (index: number) => void;
}

export default function MapView({ locations, selectedIndex, onSelectLocation }: MapViewProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const markersRef = useRef<any[]>([]);

  useEffect(() => {
    if (!mapRef.current || typeof window === 'undefined') return;

    let isMounted = true;

    const initMap = async () => {
      const L = (await import('leaflet')).default;
      if (!isMounted || !mapRef.current) return;

      // Fix default marker icons
      delete (L.Icon.Default.prototype as any)._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
        iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
        shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
      });

      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
      }

      const defaultCenter: [number, number] = locations.length > 0
        ? [locations[0].lat, locations[0].lng]
        : [33.5902, 130.4017]; // Default: Fukuoka

      const map = L.map(mapRef.current, {
        center: defaultCenter,
        zoom: 11,
      });

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 19,
      }).addTo(map);

      mapInstanceRef.current = map;

      // Add markers
      markersRef.current = [];
      const bounds = L.latLngBounds([]);
      let validPointCount = 0;

      locations.forEach((loc, index) => {
        if (!loc.lat || !loc.lng) return;

        const isSelected = index === selectedIndex;
        const icon = L.divIcon({
          className: 'custom-marker',
          html: `<div style="
            background-color: ${isSelected ? '#dc2626' : '#2563eb'};
            color: white;
            width: 30px;
            height: 30px;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            font-weight: bold;
            font-size: 14px;
            border: 3px solid white;
            box-shadow: 0 2px 6px rgba(0,0,0,0.3);
          ">${index + 1}</div>`,
          iconSize: [30, 30],
          iconAnchor: [15, 15],
        });

        const marker = L.marker([loc.lat, loc.lng], { icon })
          .addTo(map)
          .bindPopup(`
            <div style="min-width: 200px;">
              <h3 style="font-weight: bold; margin-bottom: 4px;">${loc.name}</h3>
              <p style="color: #666; margin-bottom: 4px;">${loc.city}</p>
              <p style="margin-bottom: 4px;">適合スコア: <strong>${loc.score}/100</strong></p>
              ${loc.reasons.length > 0 ? `<ul style="padding-left: 16px; margin: 0;">${loc.reasons.slice(0, 2).map(r => `<li style="font-size: 12px;">${r}</li>`).join('')}</ul>` : ''}
            </div>
          `);

        marker.on('click', () => onSelectLocation?.(index));
        markersRef.current.push(marker);
        bounds.extend([loc.lat, loc.lng]);
        validPointCount += 1;
      });

      if (validPointCount > 0) {
        map.fitBounds(bounds, { padding: [50, 50] });
      }
    };

    initMap();

    return () => {
      isMounted = false;
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, [locations, selectedIndex, onSelectLocation]);

  return (
    <div
      ref={mapRef}
      className="w-full h-[400px] rounded-lg border border-gray-200 shadow-sm"
      style={{ zIndex: 0 }}
    />
  );
}
