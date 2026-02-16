'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import { AnalysisResult } from '@/types';
import LocationCard from './LocationCard';

const MapView = dynamic(() => import('./MapView'), { ssr: false });

interface AnalysisViewProps {
  analysis: AnalysisResult;
}

export default function AnalysisView({ analysis }: AnalysisViewProps) {
  const [selectedIndex, setSelectedIndex] = useState<number>(0);

  if (analysis.locations.length === 0) {
    return null;
  }

  return (
    <div className="mt-4 space-y-4">
      {/* Map */}
      <MapView
        locations={analysis.locations}
        selectedIndex={selectedIndex}
        onSelectLocation={setSelectedIndex}
      />

      {/* Location Cards */}
      <div className="space-y-3">
        {analysis.locations.map((location, index) => (
          <LocationCard
            key={index}
            location={location}
            index={index}
            isSelected={index === selectedIndex}
            onClick={() => setSelectedIndex(index)}
          />
        ))}
      </div>
    </div>
  );
}
