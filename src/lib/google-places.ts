/**
 * Google Places API integration
 * 競合店の検索、周辺施設の情報取得
 */

const PLACES_BASE = 'https://maps.googleapis.com/maps/api/place';

interface PlaceSearchResult {
  name: string;
  vicinity: string;
  geometry: {
    location: { lat: number; lng: number };
  };
  rating?: number;
  user_ratings_total?: number;
  types: string[];
  business_status?: string;
  place_id: string;
}

interface NearbySearchParams {
  apiKey: string;
  lat: number;
  lng: number;
  radius: number;  // meters
  keyword?: string;
  type?: string;
}

interface TextSearchParams {
  apiKey: string;
  query: string;
  region?: string;
}

export async function nearbySearch(params: NearbySearchParams): Promise<PlaceSearchResult[]> {
  const url = new URL(`${PLACES_BASE}/nearbysearch/json`);
  url.searchParams.set('key', params.apiKey);
  url.searchParams.set('location', `${params.lat},${params.lng}`);
  url.searchParams.set('radius', String(params.radius));
  url.searchParams.set('language', 'ja');
  if (params.keyword) url.searchParams.set('keyword', params.keyword);
  if (params.type) url.searchParams.set('type', params.type);

  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`Places API error: ${res.status}`);
  const data = await res.json();
  return data.results || [];
}

export async function textSearch(params: TextSearchParams): Promise<PlaceSearchResult[]> {
  const url = new URL(`${PLACES_BASE}/textsearch/json`);
  url.searchParams.set('key', params.apiKey);
  url.searchParams.set('query', params.query);
  url.searchParams.set('language', 'ja');
  if (params.region) url.searchParams.set('region', params.region);

  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`Places API error: ${res.status}`);
  const data = await res.json();
  return data.results || [];
}

/**
 * 指定エリアの競合店数を調べる
 */
export async function countCompetitors(
  apiKey: string,
  lat: number,
  lng: number,
  businessKeyword: string,
  radiusKm: number = 5
): Promise<{ count: number; competitors: PlaceSearchResult[] }> {
  const results = await nearbySearch({
    apiKey,
    lat,
    lng,
    radius: radiusKm * 1000,
    keyword: businessKeyword,
  });

  return {
    count: results.length,
    competitors: results,
  };
}

/**
 * エリアの交通・施設情報を取得
 */
export async function getAreaFacilities(
  apiKey: string,
  lat: number,
  lng: number,
  radius: number = 2000
): Promise<{ stations: PlaceSearchResult[]; roads: PlaceSearchResult[] }> {
  const [stations, roads] = await Promise.all([
    nearbySearch({ apiKey, lat, lng, radius, type: 'train_station' }),
    nearbySearch({ apiKey, lat, lng, radius, keyword: '国道 交差点' }),
  ]);

  return { stations, roads };
}
