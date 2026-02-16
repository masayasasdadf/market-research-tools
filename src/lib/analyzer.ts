/**
 * 市場分析オーケストレーター
 * 各APIを組み合わせて総合的な分析を実行
 */

import { ApiKeys, AnalysisResult, LocationResult } from '@/types';
import { PREFECTURE_CODES, getPopulationByArea, getBusinessStats } from './estat';
import { textSearch, getAreaFacilities } from './google-places';
import { getKeywordMetrics } from './google-ads';
import {
  generateContent,
  buildStoreLocationPrompt,
  buildSignageLocationPrompt,
  buildGeneralResearchPrompt,
  extractJsonFromResponse,
  SYSTEM_INSTRUCTION,
} from './gemini';

interface AnalyzeParams {
  query: string;
  keys: ApiKeys;
}

type QueryType = 'store_location' | 'signage_location' | 'general';

/**
 * クエリから都道府県名を抽出
 */
function extractPrefecture(query: string): string | undefined {
  for (const pref of Object.keys(PREFECTURE_CODES)) {
    if (query.includes(pref)) return pref;
  }

  const shortMap: Record<string, string> = {
    '北海': '北海道', '青森': '青森県', '岩手': '岩手県', '宮城': '宮城県',
    '秋田': '秋田県', '山形': '山形県', '福島': '福島県', '茨城': '茨城県',
    '栃木': '栃木県', '群馬': '群馬県', '埼玉': '埼玉県', '千葉': '千葉県',
    '東京': '東京都', '神奈川': '神奈川県', '新潟': '新潟県', '富山': '富山県',
    '石川': '石川県', '福井': '福井県', '山梨': '山梨県', '長野': '長野県',
    '岐阜': '岐阜県', '静岡': '静岡県', '愛知': '愛知県', '三重': '三重県',
    '滋賀': '滋賀県', '京都': '京都府', '大阪': '大阪府', '兵庫': '兵庫県',
    '奈良': '奈良県', '和歌山': '和歌山県', '鳥取': '鳥取県', '島根': '島根県',
    '岡山': '岡山県', '広島': '広島県', '山口': '山口県', '徳島': '徳島県',
    '香川': '香川県', '愛媛': '愛媛県', '高知': '高知県', '福岡': '福岡県',
    '佐賀': '佐賀県', '長崎': '長崎県', '熊本': '熊本県', '大分': '大分県',
    '宮崎': '宮崎県', '鹿児島': '鹿児島県', '沖縄': '沖縄県',
  };

  for (const [short, full] of Object.entries(shortMap)) {
    if (query.includes(short)) return full;
  }
  return undefined;
}

/**
 * クエリの種別を判定
 */
function classifyQuery(query: string): QueryType {
  const trafficKeywords = ['交通量', '道路', '渋滞', '幹線', '交差点'];
  const populationKeywords = ['人口', '増減', '推移', '統計'];
  const signageKeywords = ['看板', 'サイン', '掲示', 'サイネージ', '屋外広告', 'ビルボード'];
  const storeKeywords = ['出店', '店舗', '開業', '開店', '競合', '立地', '候補地'];

  if (signageKeywords.some(k => query.includes(k))) return 'signage_location';
  if (storeKeywords.some(k => query.includes(k))) return 'store_location';
  if (trafficKeywords.some(k => query.includes(k)) || populationKeywords.some(k => query.includes(k))) return 'general';
  return 'general';
}

/**
 * クエリからビジネスキーワードを抽出
 */
function extractBusinessKeywords(query: string): string[] {
  const stopWords = ['で', 'の', 'に', 'を', 'が', 'は', 'と', 'も', 'から', 'まで', 'する',
    '出店', '適した', 'エリア', '場所', 'いくつか', '出して', 'ください', '需要', '高く',
    '競合', '少ない', '設置', '看板', 'ピックアップ', '複数', '教えて'];
  const words = query.split(/[\s、。・「」（）\n]+/).filter(w =>
    w.length >= 2 && !stopWords.some(s => w === s)
  );
  return words.length > 0 ? words : [query];
}

function buildSummary(parsed: any, fallback: string): string {
  const insightText = Array.isArray(parsed?.insights)
    ? parsed.insights.map((item: string) => `- ${item}`).join('\n')
    : '';

  return [parsed?.summary || fallback, insightText].filter(Boolean).join('\n\n');
}

function normalizeLocations(parsed: any, hasCompetitorData: boolean): LocationResult[] {
  if (!parsed || !Array.isArray(parsed.locations)) return [];

  return parsed.locations
    .map((loc: any) => ({
      name: loc.name || '',
      prefecture: loc.prefecture || '',
      city: loc.city || '',
      lat: typeof loc.lat === 'number' ? loc.lat : 0,
      lng: typeof loc.lng === 'number' ? loc.lng : 0,
      score: Number.isFinite(loc.score) ? Number(loc.score) : 0,
      reasons: Array.isArray(loc.reasons) ? loc.reasons : [],
      population: Number.isFinite(loc.population) ? Number(loc.population) : undefined,
      competitorCount: hasCompetitorData && Number.isFinite(loc.competitorCount)
        ? Number(loc.competitorCount)
        : undefined,
      searchDemand: Number.isFinite(loc.searchDemand) ? Number(loc.searchDemand) : undefined,
      trafficVolume: typeof loc.trafficVolume === 'string' ? loc.trafficVolume : undefined,
      additionalInfo: loc.additionalInfo && typeof loc.additionalInfo === 'object' ? loc.additionalInfo : {},
    }))
    .filter((loc: LocationResult) => loc.name || loc.reasons.length > 0 || (loc.lat !== 0 && loc.lng !== 0));
}

/**
 * メイン分析関数
 */
export async function analyzeQuery(params: AnalyzeParams): Promise<AnalysisResult> {
  const { query, keys } = params;
  const queryType = classifyQuery(query);
  const prefecture = extractPrefecture(query);
  const prefCode = prefecture ? PREFECTURE_CODES[prefecture] : undefined;
  const businessKeywords = extractBusinessKeywords(query);

  const dataPromises: Record<string, Promise<any>> = {};

  if (keys.estatAppId && prefCode) {
    dataPromises.population = getPopulationByArea(keys.estatAppId, prefCode);
    dataPromises.business = getBusinessStats(keys.estatAppId, prefCode);
  }

  if (keys.googlePlacesApiKey && prefecture) {
    dataPromises.competitors = textSearch({
      apiKey: keys.googlePlacesApiKey,
      query: `${businessKeywords.join(' ')} ${prefecture}`,
      region: 'jp',
    });
  }

  if (keys.googleAdsApiKey && keys.googleAdsDeveloperToken && keys.googleAdsCustomerId) {
    const searchKeywords = businessKeywords.map(k => prefecture ? `${k} ${prefecture}` : k);
    dataPromises.searchDemand = getKeywordMetrics(
      keys.googleAdsDeveloperToken,
      keys.googleAdsCustomerId,
      keys.googleAdsApiKey,
      searchKeywords,
    );
  }

  const results: Record<string, any> = {};
  for (const [key, promise] of Object.entries(dataPromises)) {
    try {
      results[key] = await promise;
    } catch (error) {
      console.error(`Data collection error (${key}):`, error);
      results[key] = null;
    }
  }

  if (!keys.geminiApiKey) {
    throw new Error('Gemini APIキーが設定されていません。設定ページからAPIキーを入力してください。');
  }

  const context = {
    query,
    prefecture,
    businessType: businessKeywords.join('、'),
    populationData: results.population,
    competitorData: results.competitors,
    searchDemandData: results.searchDemand,
    facilityData: results.business,
  };

  let prompt = buildGeneralResearchPrompt(context);
  if (queryType === 'signage_location') {
    prompt = buildSignageLocationPrompt(context);
  } else if (queryType === 'store_location') {
    prompt = buildStoreLocationPrompt(context);
  }

  const geminiResponse = await generateContent(keys.geminiApiKey, prompt, SYSTEM_INSTRUCTION);
  const parsed = extractJsonFromResponse(geminiResponse);

  if (!parsed) {
    return {
      query,
      type: queryType,
      summary: geminiResponse,
      locations: [],
      timestamp: new Date().toISOString(),
    };
  }

  const locations = normalizeLocations(parsed, Boolean(results.competitors));

  if (keys.googlePlacesApiKey && locations.length > 0) {
    for (const loc of locations) {
      if (!loc.lat || !loc.lng) continue;
      try {
        const facilities = await getAreaFacilities(keys.googlePlacesApiKey, loc.lat, loc.lng, 3000);
        if (facilities.stations.length > 0) {
          loc.additionalInfo = loc.additionalInfo || {};
          loc.additionalInfo['周辺駅'] = facilities.stations.slice(0, 3).map((s: any) => s.name).join('、');
        }
      } catch {
        // 補強データ取得失敗は無視
      }
    }
  }

  return {
    query,
    type: queryType,
    summary: buildSummary(parsed, geminiResponse),
    locations: queryType === 'general' ? [] : locations,
    timestamp: new Date().toISOString(),
  };
}
