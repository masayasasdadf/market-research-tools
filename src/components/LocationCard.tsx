'use client';

import { LocationResult } from '@/types';

interface LocationCardProps {
  location: LocationResult;
  index: number;
  isSelected: boolean;
  onClick: () => void;
}

export default function LocationCard({ location, index, isSelected, onClick }: LocationCardProps) {
  return (
    <div
      onClick={onClick}
      className={`p-4 rounded-lg border-2 cursor-pointer transition-all ${
        isSelected
          ? 'border-blue-500 bg-blue-50 shadow-md'
          : 'border-gray-200 bg-white hover:border-blue-300 hover:shadow-sm'
      }`}
    >
      <div className="flex items-start gap-3">
        <div
          className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-white font-bold text-sm ${
            isSelected ? 'bg-red-600' : 'bg-blue-600'
          }`}
        >
          {index + 1}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-1">
            <h3 className="font-bold text-gray-900 truncate">{location.name}</h3>
            <span className="flex-shrink-0 ml-2 px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 text-xs font-semibold">
              スコア: {location.score}
            </span>
          </div>

          <p className="text-sm text-gray-500 mb-2">
            {location.prefecture} {location.city}
          </p>

          {/* 推薦理由 */}
          <div className="mb-3">
            <h4 className="text-xs font-semibold text-gray-600 mb-1">推薦理由:</h4>
            <ul className="space-y-0.5">
              {location.reasons.map((reason, i) => (
                <li key={i} className="text-sm text-gray-700 flex items-start gap-1">
                  <span className="text-green-500 mt-0.5 flex-shrink-0">✓</span>
                  <span>{reason}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* 統計情報 */}
          <div className="grid grid-cols-2 gap-2 text-xs">
            {location.population && (
              <div className="bg-gray-50 rounded p-1.5">
                <span className="text-gray-500">人口: </span>
                <span className="font-semibold">{location.population.toLocaleString()}人</span>
              </div>
            )}
            {location.competitorCount !== undefined && location.competitorCount > 0 && (
              <div className="bg-gray-50 rounded p-1.5">
                <span className="text-gray-500">競合: </span>
                <span className="font-semibold">{location.competitorCount}件</span>
              </div>
            )}
            {location.searchDemand !== undefined && (
              <div className="bg-gray-50 rounded p-1.5">
                <span className="text-gray-500">検索需要: </span>
                <span className="font-semibold">{location.searchDemand.toLocaleString()}/月</span>
              </div>
            )}
            {location.trafficVolume && (
              <div className="bg-gray-50 rounded p-1.5">
                <span className="text-gray-500">交通量: </span>
                <span className="font-semibold">{location.trafficVolume}</span>
              </div>
            )}
          </div>

          {/* 追加情報 */}
          {Object.keys(location.additionalInfo).length > 0 && (
            <div className="mt-2 pt-2 border-t border-gray-100">
              <h4 className="text-xs font-semibold text-gray-600 mb-1">エリア情報:</h4>
              <div className="space-y-0.5">
                {Object.entries(location.additionalInfo).map(([key, value]) => (
                  <div key={key} className="text-xs text-gray-600">
                    <span className="font-medium">{key}: </span>
                    <span>{value}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
