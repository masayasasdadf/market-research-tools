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

/**
 * next_page_tokenを使って全ページ取得する共通ヘルパー
 * Google Places APIは1ページ最大20件、最大3ページ(60件)まで返す
 */
async function fetchAllPages(initialUrl: string, apiKey: string): Promise<PlaceSearchResult[]> {
  const allResults: PlaceSearchResult[] = [];
  const seenPlaceIds = new Set<string>();
  let nextPageToken: string | undefined;
  let pageCount = 0;
  const maxPages = 3; // Google Places APIの上限

  const addUniqueResults = (results: PlaceSearchResult[]) => {
    for (const place of results) {
      if (!seenPlaceIds.has(place.place_id)) {
        seenPlaceIds.add(place.place_id);
        allResults.push(place);
      }
    }
  };

  // 最初のリクエスト
  const res = await fetch(initialUrl);
  if (!res.ok) throw new Error(`Places API error: ${res.status}`);
  const data = await res.json();
  addUniqueResults(data.results || []);
  nextPageToken = data.next_page_token;
  pageCount++;

  // next_page_tokenがある限り次のページを取得
  while (nextPageToken && pageCount < maxPages) {
    // Google Places APIはnext_page_tokenが有効になるまで少し待つ必要がある
    await new Promise(resolve => setTimeout(resolve, 2000));

    const pageUrl = new URL(initialUrl);
    pageUrl.searchParams.set('pagetoken', nextPageToken);
    const pageRes = await fetch(pageUrl.toString());
    if (!pageRes.ok) break;
    const pageData = await pageRes.json();
    addUniqueResults(pageData.results || []);
    nextPageToken = pageData.next_page_token;
    pageCount++;
  }

  return allResults;
}

export async function nearbySearch(params: NearbySearchParams): Promise<PlaceSearchResult[]> {
  const url = new URL(`${PLACES_BASE}/nearbysearch/json`);
  url.searchParams.set('key', params.apiKey);
  url.searchParams.set('location', `${params.lat},${params.lng}`);
  url.searchParams.set('radius', String(params.radius));
  url.searchParams.set('language', 'ja');
  if (params.keyword) url.searchParams.set('keyword', params.keyword);
  if (params.type) url.searchParams.set('type', params.type);

  return fetchAllPages(url.toString(), params.apiKey);
}

export async function textSearch(params: TextSearchParams): Promise<PlaceSearchResult[]> {
  const url = new URL(`${PLACES_BASE}/textsearch/json`);
  url.searchParams.set('key', params.apiKey);
  url.searchParams.set('query', params.query);
  url.searchParams.set('language', 'ja');
  if (params.region) url.searchParams.set('region', params.region);

  return fetchAllPages(url.toString(), params.apiKey);
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
