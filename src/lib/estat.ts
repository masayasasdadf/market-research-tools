/**
 * e-Stat API integration
 * https://www.e-stat.go.jp/api/
 *
 * 人口統計、事業所統計、商業統計などを取得
 */

const ESTAT_BASE = 'https://api.e-stat.go.jp/rest/3.0/app/json';

interface EstatStatsListParams {
  appId: string;
  searchWord?: string;
  surveyYears?: string;
  statsField?: string;
  statsCode?: string;
}

interface EstatDataParams {
  appId: string;
  statsDataId: string;
  cdArea?: string;
  cdCat01?: string;
  limit?: number;
}

export async function searchStatsList(params: EstatStatsListParams) {
  const url = new URL(`${ESTAT_BASE}/getStatsList`);
  url.searchParams.set('appId', params.appId);
  if (params.searchWord) url.searchParams.set('searchWord', params.searchWord);
  if (params.surveyYears) url.searchParams.set('surveyYears', params.surveyYears);
  if (params.statsField) url.searchParams.set('statsField', params.statsField);
  if (params.statsCode) url.searchParams.set('statsCode', params.statsCode);

  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`e-Stat API error: ${res.status}`);
  return res.json();
}

export async function getStatsData(params: EstatDataParams) {
  const url = new URL(`${ESTAT_BASE}/getStatsData`);
  url.searchParams.set('appId', params.appId);
  url.searchParams.set('statsDataId', params.statsDataId);
  if (params.cdArea) url.searchParams.set('cdArea', params.cdArea);
  if (params.cdCat01) url.searchParams.set('cdCat01', params.cdCat01);
  if (params.limit) url.searchParams.set('limit', String(params.limit));

  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`e-Stat API error: ${res.status}`);
  return res.json();
}

// 都道府県コード一覧
export const PREFECTURE_CODES: Record<string, string> = {
  '北海道': '01', '青森県': '02', '岩手県': '03', '宮城県': '04',
  '秋田県': '05', '山形県': '06', '福島県': '07', '茨城県': '08',
  '栃木県': '09', '群馬県': '10', '埼玉県': '11', '千葉県': '12',
  '東京都': '13', '神奈川県': '14', '新潟県': '15', '富山県': '16',
  '石川県': '17', '福井県': '18', '山梨県': '19', '長野県': '20',
  '岐阜県': '21', '静岡県': '22', '愛知県': '23', '三重県': '24',
  '滋賀県': '25', '京都府': '26', '大阪府': '27', '兵庫県': '28',
  '奈良県': '29', '和歌山県': '30', '鳥取県': '31', '島根県': '32',
  '岡山県': '33', '広島県': '34', '山口県': '35', '徳島県': '36',
  '香川県': '37', '愛媛県': '38', '高知県': '39', '福岡県': '40',
  '佐賀県': '41', '長崎県': '42', '熊本県': '43', '大分県': '44',
  '宮崎県': '45', '鹿児島県': '46', '沖縄県': '47',
};

/**
 * 指定都道府県の市区町村別人口データを取得
 * 国勢調査データ (statsCode: 00200521)
 */
export async function getPopulationByArea(appId: string, prefCode: string) {
  try {
    // 国勢調査の人口データ
    const result = await getStatsData({
      appId,
      statsDataId: '0003448228', // 令和2年国勢調査 人口等基本集計
      cdArea: prefCode,
      limit: 1000,
    });
    return result;
  } catch (error) {
    console.error('e-Stat population data error:', error);
    return null;
  }
}

/**
 * 事業所統計データを取得
 */
export async function getBusinessStats(appId: string, prefCode: string) {
  try {
    const result = await getStatsData({
      appId,
      statsDataId: '0003455395', // 経済センサス
      cdArea: prefCode,
      limit: 1000,
    });
    return result;
  } catch (error) {
    console.error('e-Stat business data error:', error);
    return null;
  }
}
