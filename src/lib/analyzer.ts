/**
 * 市場分析オーケストレーター
 * 各APIを組み合わせて総合的な分析を実行
 */

import { ApiKeys, AnalysisResult, LocationResult } from '@/types';
import { PREFECTURE_CODES, getPopulationByArea, getBusinessStats } from './estat';
import { textSearch, countCompetitors, getAreaFacilities } from './google-places';
import { getKeywordMetrics } from './google-ads';
import {
  generateContent,
  buildStoreLocationPrompt,
  buildSignageLocationPrompt,
  extractJsonFromResponse,
  SYSTEM_INSTRUCTION,
} from './gemini';

interface AnalyzeParams {
  query: string;
  keys: ApiKeys;
}

/**
 * クエリから都道府県名を抽出
 */
function extractPrefecture(query: string): string | undefined {
  for (const pref of Object.keys(PREFECTURE_CODES)) {
    if (query.includes(pref)) return pref;
  }
  // 短縮形対応
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
function classifyQuery(query: string): 'store_location' | 'signage_location' | 'general' {
  const signageKeywords = ['看板', 'サイン', '広告', '掲示', 'サイネージ', '屋外広告', 'ビルボード'];
  const storeKeywords = ['出店', '店舗', '開業', '開店', '需要', '競合', 'エリア', '立地', '候補地', '適した'];

  if (signageKeywords.some(k => query.includes(k))) return 'signage_location';
  if (storeKeywords.some(k => query.includes(k))) return 'store_location';
  return 'general';
}

/**
 * クエリからビジネスキーワードを抽出
 */
function extractBusinessKeywords(query: string): string[] {
  // 一般的なビジネス関連ワードを除外してキーワード抽出
  const stopWords = ['で', 'の', 'に', 'を', 'が', 'は', 'と', 'も', 'から', 'まで', 'する',
    '出店', '適した', 'エリア', '場所', 'いくつか', '出して', 'ください', '需要', '高く',
    '競合', '少ない', '設置', '看板', 'ピックアップ', '複数'];
  const words = query.split(/[\s、。・「」（）\n]+/).filter(w =>
    w.length >= 2 && !stopWords.some(s => w === s)
  );
  return words.length > 0 ? words : [query];
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

  // 並列でデータ収集
  const dataPromises: Record<string, Promise<any>> = {};

  // e-Stat: 人口・事業所データ
  if (keys.estatAppId && prefCode) {
    dataPromises.population = getPopulationByArea(keys.estatAppId, prefCode);
    dataPromises.business = getBusinessStats(keys.estatAppId, prefCode);
  }

  // Google Places: 競合・施設データ
  if (keys.googlePlacesApiKey && prefecture) {
    dataPromises.competitors = textSearch({
      apiKey: keys.googlePlacesApiKey,
      query: `${businessKeywords.join(' ')} ${prefecture}`,
      region: 'jp',
    });
  }

  // Google Ads: 検索需要
  if (keys.googleAdsApiKey && keys.googleAdsDeveloperToken && keys.googleAdsCustomerId) {
    const searchKeywords = businessKeywords.map(k =>
      prefecture ? `${k} ${prefecture}` : k
    );
    dataPromises.searchDemand = getKeywordMetrics(
      keys.googleAdsDeveloperToken,
      keys.googleAdsCustomerId,
      keys.googleAdsApiKey,
      searchKeywords
    );
  }

  // データ収集を待つ
  const results: Record<string, any> = {};
  for (const [key, promise] of Object.entries(dataPromises)) {
    try {
      results[key] = await promise;
    } catch (error) {
      console.error(`Data collection error (${key}):`, error);
      results[key] = null;
    }
  }

  // Gemini APIで分析
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

  const prompt = queryType === 'signage_location'
    ? buildSignageLocationPrompt(context)
    : buildStoreLocationPrompt(context);

  const geminiResponse = await generateContent(keys.geminiApiKey, prompt, SYSTEM_INSTRUCTION);
  const parsed = extractJsonFromResponse(geminiResponse);

  if (!parsed || !parsed.locations) {
    // JSONパース失敗時は、テキスト応答を返す
    return {
      query,
      type: queryType === 'general' ? 'store_location' : queryType,
      summary: geminiResponse,
      locations: [],
      timestamp: new Date().toISOString(),
    };
  }

  // Google Places で各候補地の詳細情報を補強
  if (keys.googlePlacesApiKey && parsed.locations.length > 0) {
    for (const loc of parsed.locations) {
      if (loc.lat && loc.lng) {
        try {
          const facilities = await getAreaFacilities(
            keys.googlePlacesApiKey,
            loc.lat,
            loc.lng,
            3000
          );
          if (facilities.stations.length > 0) {
            loc.additionalInfo = loc.additionalInfo || {};
            loc.additionalInfo['周辺駅'] = facilities.stations
              .slice(0, 3)
              .map((s: any) => s.name)
              .join('、');
          }
        } catch { /* 補強データ取得失敗は無視 */ }
      }
    }
  }

  const locations: LocationResult[] = parsed.locations.map((loc: any) => ({
    name: loc.name || '',
    prefecture: loc.prefecture || prefecture || '',
    city: loc.city || '',
    lat: loc.lat || 0,
    lng: loc.lng || 0,
    score: loc.score || 0,
    reasons: loc.reasons || [],
    population: loc.population,
    competitorCount: loc.competitorCount,
    searchDemand: loc.searchDemand,
    trafficVolume: loc.trafficVolume,
    additionalInfo: loc.additionalInfo || {},
  }));

  return {
    query,
    type: queryType === 'general' ? 'store_location' : queryType,
    summary: parsed.summary || '',
    locations,
    timestamp: new Date().toISOString(),
  };
}
